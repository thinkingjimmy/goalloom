/**
 * [INPUT]: Main-owned profile paths and a drained storage connection.
 * [OUTPUT]: A fresh verified database, removal of local task copies and crash-safe file handoff.
 * [POS]: Explicit sign-out cleanup. It does not reset cloud data or remove independent AI credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { access, mkdir, readFile, readdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { openDatabase, verifyDatabase } from './database'
import { migrate } from './schema'
import { atomicJson } from './atomic-json'

const receiptName = 'sync-clear.json'
const receiptSchema = z.strictObject({
  stage: z.string().regex(/^sync-clear-[0-9a-f-]{36}$/),
  files: z.array(z.string().regex(/^(workspace\.sqlite(?:-wal|-shm)?|backups|sync-vault\.bin(?:\.tmp)?|sync-send-[a-f0-9]{64}\.bin(?:\.tmp)?)$/)),
  committed: z.boolean(),
})
type Receipt = z.infer<typeof receiptSchema>
const missing = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'

async function save(directory: string, receipt: Receipt): Promise<void> {
  await atomicJson(join(directory, receiptName), receipt)
}

/** Before opening SQLite, finish committed cleanup or restore an interrupted handoff. */
export async function recoverLocalClear(directory: string): Promise<void> {
  let receipt: Receipt
  try { receipt = receiptSchema.parse(JSON.parse(await readFile(join(directory, receiptName), 'utf8'))) }
  catch (error) { if (missing(error)) return; throw error }
  const stage = join(directory, receipt.stage)
  if (!receipt.committed) {
    for (const file of [...receipt.files].reverse()) {
      const saved = join(stage, file)
      try {
        await access(saved)
        // A fresh replacement may exist if the process stopped before committing the receipt.
        if (file === 'workspace.sqlite') await rm(join(directory, file), { force: true })
        await rename(saved, join(directory, file))
      } catch (error) { if (!missing(error)) throw error }
    }
  }
  await rm(stage, { recursive: true, force: true })
  await rm(join(directory, receiptName), { force: true })
}

export async function clearLocalFiles(input: {
  databasePath: string; backupDirectory: string; close: () => void; reopen: () => void
}): Promise<{ cleanupPending: boolean }> {
  const directory = dirname(input.databasePath)
  if (basename(input.databasePath) !== 'workspace.sqlite' || input.backupDirectory !== join(directory, 'backups')) throw Error('Invalid local cleanup paths')
  await recoverLocalClear(directory)
  const stageName = `sync-clear-${randomUUID()}`
  const stage = join(directory, stageName)
  await mkdir(stage, { mode: 0o700 })
  const replacement = join(stage, 'empty.sqlite')
  const blank = openDatabase(replacement)
  try { migrate(blank); verifyDatabase(blank); blank.exec('PRAGMA wal_checkpoint(TRUNCATE)') }
  finally { blank.close() }
  const files = (await readdir(directory)).filter(file => receiptSchema.shape.files.element.safeParse(file).success)
  const receipt: Receipt = { stage: stageName, files, committed: false }
  await save(directory, receipt)
  let closed = false
  try {
    input.close(); closed = true
    for (const file of files) {
      try { await rename(join(directory, file), join(stage, file)) }
      catch (error) { if (!missing(error)) throw error }
    }
    await rename(replacement, input.databasePath)
    input.reopen()
    await save(directory, { ...receipt, committed: true })
  } catch (error) {
    if (closed) input.close()
    await recoverLocalClear(directory)
    if (closed) input.reopen()
    throw error
  }
  // The committed empty board must not resume the old account if a platform locks a cleanup file.
  // The durable receipt blocks startup until the remaining files can be removed.
  try { await recoverLocalClear(directory); return { cleanupPending: false } }
  catch { return { cleanupPending: true } }
}
