/**
 * [INPUT]: Authoritative SQLite connection and a main-owned backup directory.
 * [OUTPUT]: Verified committed-WAL copies without protected binding/epoch evidence or secret freelist bytes; failure cleans only this attempt.
 * [POS]: Shared protective/daily backup primitive, with secure portable-copy sanitation.
 */
import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, open } from 'node:fs/promises'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { isSecretSettingKey, syncOpPayload, type SyncOp } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import { verifyDatabase } from '../database'

export async function consistentBackup(db: DatabaseSync, directory: string): Promise<string> {
  await mkdir(directory, { recursive: true })
  const destination = join(directory, `${randomUUID()}.sqlite`)
  const temporary = `${destination}.tmp`
  try {
    await backup(db, temporary)
    const copy = new DatabaseSync(temporary)
    try {
      stripSecretMaterial(copy)
      // --- 导出的独立副本不依赖任何 WAL/SHM 配套文件。 ---
      copy.exec('PRAGMA journal_mode = DELETE')
      verifyDatabase(copy)
    } finally { copy.close() }
    const handle = await open(temporary, 'r+')
    try { await handle.sync() } finally { await handle.close() }
    await rename(temporary, destination)
    return destination
  } catch (error) {
    await Promise.all([temporary, `${temporary}-wal`, `${temporary}-shm`].map(path => rm(path, { force: true }).catch(() => undefined)))
    throw error
  }
}

/** Deletes secret rows and secret actions, then VACUUMs so freelist pages do not keep the key bytes. */
function stripSecretMaterial(copy: DatabaseSync): void {
  const settings = copy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_settings'").get()
  const ops = copy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_ops'").get()
  copy.exec('PRAGMA secure_delete = ON')
  for (const table of ['sync_binding_epoch_receipts', 'sync_initialization_ack', 'sync_retired_rows', 'sync_active_binding', 'sync_binding_transitions', 'sync_seed_state']) {
    if (copy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table)) copy.exec(`DELETE FROM ${table}`)
  }
  if (settings) copy.exec(`DELETE FROM sync_settings WHERE key IN ('ai.key.openrouter', 'ai.key.vercel-gateway')`)
  if (ops) {
    const rows = copy.prepare(`SELECT opId, payload FROM sync_ops WHERE instr(payload, '"ai.key.') > 0`).all()
    for (const row of rows) {
      const opId = String(row.opId)
      let op: SyncOp
      try { op = JSON.parse(String(row.payload)) as SyncOp } catch { dropOp(copy, opId); continue }
      if (!Array.isArray(op.actions)) { dropOp(copy, opId); continue }
      const actions = op.actions.filter(action => !(action.t === 'pref.set' && isSecretSettingKey(action.key)))
      if (!actions.length) { dropOp(copy, opId); continue }
      const payload = syncOpPayload({ ...op, actions })
      copy.prepare('UPDATE sync_ops SET payload=?, payloadHash=? WHERE opId=?').run(payload, sha256Hex(payload), opId)
    }
  }
  copy.exec('VACUUM')
}

function dropOp(copy: DatabaseSync, opId: string): void {
  if (copy.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_conflicts'").get()) {
    copy.prepare('DELETE FROM sync_conflicts WHERE opId=?').run(opId)
  }
  copy.prepare('DELETE FROM sync_ops WHERE opId=?').run(opId)
}
