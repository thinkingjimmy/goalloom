/**
 * [INPUT]: base_* rows and canon rows at or below uptoSeq.
 * [OUTPUT]: A JSON snapshot body of every business table (period focus included). Encryption is C4 in @goalloom/crypto; this module does not compress.
 * [POS]: Reference snapshot install. It keeps workspace generation and does not call replaceDataset.
 */
import type { SqlDriver, SqlValue } from './driver'
import { SyncApplyError } from './driver'
import { clearSyncSettings, readSettings, writeSetting } from './settings'
import { isSecretSettingKey, parseSetting } from '@goalloom/contracts'
import { businessTables as tables } from '@goalloom/schema'

export interface SnapshotBody {
  formatVersion: 2; protocolVersion: 2; workspaceId: string | null; generation: string
  uptoSeq: number; keyEpoch: number; tables: Record<string, Record<string, SqlValue>[]>; canonOps: Record<string, SqlValue>[]; canonChanges: Record<string, SqlValue>[]
  settings: { key: string; value: string | null; updatedAt: string; opId: string }[]
}

export function exportCanonicalSnapshot(driver: SqlDriver, input: { workspaceId: string | null; uptoSeq: number; keyEpoch: number }): SnapshotBody {
  const generation = String(driver.prepare('SELECT generation FROM base_workspace WHERE id=1').get()?.generation ?? '')
  const tablesOut: SnapshotBody['tables'] = {}
  for (const table of tables) tablesOut[table] = driver.prepare(`SELECT * FROM base_${table}`).all()
  return {
    formatVersion: 2, protocolVersion: 2, workspaceId: input.workspaceId, generation, uptoSeq: input.uptoSeq, keyEpoch: input.keyEpoch, tables: tablesOut,
    canonOps: driver.prepare('SELECT * FROM canon_ops WHERE seq<=? ORDER BY seq').all(input.uptoSeq),
    canonChanges: driver.prepare('SELECT * FROM canon_changes WHERE seq<=? ORDER BY seq, idx').all(input.uptoSeq),
    settings: readSettings(driver).filter(row => !isSecretSettingKey(row.key)).map(row => ({ key: row.key, value: row.value === null ? null : JSON.stringify(row.value), updatedAt: row.updatedAt, opId: row.opId })),
  }
}

export function installCanonicalSnapshot(driver: SqlDriver, body: SnapshotBody, at: string): void {
  if (body.formatVersion !== 2 || body.protocolVersion !== 2) throw new SyncApplyError('unsupported_version')
  driver.transaction(() => {
    for (const table of [...tables].reverse()) driver.exec(`DELETE FROM ${table}; DELETE FROM base_${table};`)
    driver.exec('DELETE FROM sync_conflicts; DELETE FROM canon_changes; DELETE FROM canon_ops; DELETE FROM sync_ops;')
    for (const table of tables) {
      // Bodies written before period focus have no focus table.
      const rows = body.tables[table] ?? []
      for (const row of rows) insertRow(driver, table, row), insertRow(driver, `base_${table}`, row)
    }
    for (const row of body.canonOps) insertRow(driver, 'canon_ops', row)
    for (const row of body.canonChanges) insertRow(driver, 'canon_changes', row)
    driver.prepare(`UPDATE sync_state SET workspaceId=?, lastAppliedSeq=?, keyEpoch=?, paused=NULL, updatedAt=? WHERE id=1`).run(body.workspaceId, body.uptoSeq, body.keyEpoch, at)
    {
      clearSyncSettings(driver)
      for (const row of body.settings) {
        try {
          const value = row.value === null ? null : JSON.parse(row.value) as unknown
          const setting = parseSetting(row.key, value)
          writeSetting(driver, setting.key, setting.value, row.updatedAt, row.opId)
        } catch { /* An unknown key never becomes a local setting. */ }
      }
    }
    const generation = driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation
    if (String(generation) !== body.generation) throw new SyncApplyError('generation')
  })
}

function insertRow(driver: SqlDriver, table: string, row: Record<string, SqlValue>): void {
  const keys = Object.keys(row)
  driver.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(key => row[key] ?? null))
}
