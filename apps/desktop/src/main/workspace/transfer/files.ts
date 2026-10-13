/**
 * [INPUT]: Main-owned native-picker paths and the serial worker's Store.
 * [OUTPUT]: Atomic, bounded-buffer JSON exports and size-limited external JSON reads.
 * [POS]: Worker-only file transfer; main and renderer never receive a full dataset or JSON body.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { open } from 'node:fs/promises'
import { DomainError } from '../../../shared/contracts/commands'
import { serverText } from '../../../shared/i18n/server'
import { atomicFile } from '../../storage/atomic-json'
import { schemaVersion } from '../../storage/schema'
import type { Store } from '../../storage/store'
import { datasetHeader, datasetRows, datasetTables } from './rows'

export async function readJson(path: string): Promise<unknown> {
  const file = await open(path, 'r')
  try {
    const limit = 100 * 1024 * 1024
    const before = await file.stat()
    if (before.size > limit) throw new DomainError('invalid', serverText().errors.fileTooLarge)
    // One buffer, including an extra byte to detect growth, instead of retaining chunks plus their concatenation.
    const buffer = Buffer.allocUnsafe(before.size + 1)
    let size = 0
    while (size < buffer.length) {
      const { bytesRead } = await file.read(buffer, size, buffer.length - size)
      if (!bytesRead) break
      size += bytesRead
    }
    const after = await file.stat()
    if (size !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new DomainError('invalid', serverText().errors.fileCheckFailed)
    return JSON.parse(buffer.toString('utf8', 0, size))
  } finally { await file.close() }
}

export async function writeDataset(store: Store, path: string, now: string): Promise<void> {
  await atomicFile(path, async file => {
    store.db.exec('BEGIN')
    try {
      let pieces: string[] = [], size = 0
      const write = async (piece: string) => {
        pieces.push(piece); size += Buffer.byteLength(piece)
        if (size >= 64 * 1024) { await file.writeFile(pieces.join('')); pieces = []; size = 0 }
      }
      await write(JSON.stringify(datasetHeader(store, now, schemaVersion)).slice(0, -1))
      for (const table of datasetTables) {
        await write(`,"${table}":[`)
        let first = true
        for (const row of datasetRows(store, table)) { await write(`${first ? '' : ','}${JSON.stringify(row)}`); first = false }
        await write(']')
      }
      await write('}')
      if (size) await file.writeFile(pieces.join(''))
      store.db.exec('COMMIT')
    } catch (error) { store.db.exec('ROLLBACK'); throw error }
  })
}
