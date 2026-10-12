/**
 * [INPUT]: base_* rows and canon rows at or below uptoSeq.
 * [OUTPUT]: A JSON snapshot body. Encryption is C4 in @goalloom/crypto; this module does not compress.
 * [POS]: Reference snapshot install. It keeps workspace generation and does not call replaceDataset.
 */
import type { SqlDriver, SqlValue } from './driver'
import { SyncApplyError } from './driver'

const tables = ['workspace', 'planning_periods', 'items', 'item_placements', 'item_relations', 'rollover_policies', 'item_guidance'] as const

export interface SnapshotBody {
  formatVersion: 1; protocolVersion: 1; workspaceId: string | null; generation: string
  uptoSeq: number; keyEpoch: number; tables: Record<string, Record<string, SqlValue>[]>; canonOps: Record<string, SqlValue>[]; canonChanges: Record<string, SqlValue>[]
}

export function exportCanonicalSnapshot(driver: SqlDriver, input: { workspaceId: string | null; uptoSeq: number; keyEpoch: number }): SnapshotBody {
  const generation = String(driver.prepare('SELECT generation FROM base_workspace WHERE id=1').get()?.generation ?? '')
  const tablesOut: SnapshotBody['tables'] = {}
  for (const table of tables) tablesOut[table] = driver.prepare(`SELECT * FROM base_${table}`).all()
  return {
    formatVersion: 1, protocolVersion: 1, workspaceId: input.workspaceId, generation, uptoSeq: input.uptoSeq, keyEpoch: input.keyEpoch, tables: tablesOut,
    canonOps: driver.prepare('SELECT * FROM canon_ops WHERE seq<=? ORDER BY seq').all(input.uptoSeq),
    canonChanges: driver.prepare('SELECT * FROM canon_changes WHERE seq<=? ORDER BY seq, idx').all(input.uptoSeq),
  }
}

export function installCanonicalSnapshot(driver: SqlDriver, body: SnapshotBody, at: string): void {
  if (body.formatVersion !== 1) throw new SyncApplyError('unsupported_version')
  driver.transaction(() => {
    driver.exec(`DELETE FROM item_guidance; DELETE FROM item_relations; DELETE FROM item_placements; DELETE FROM rollover_policies; DELETE FROM items; DELETE FROM planning_periods; DELETE FROM workspace;
      DELETE FROM base_item_guidance; DELETE FROM base_item_relations; DELETE FROM base_item_placements; DELETE FROM base_rollover_policies; DELETE FROM base_items; DELETE FROM base_planning_periods; DELETE FROM base_workspace;
      DELETE FROM sync_conflicts; DELETE FROM canon_changes; DELETE FROM canon_ops; DELETE FROM sync_ops;`)
    for (const table of ['workspace', 'planning_periods', 'items', 'item_placements', 'item_relations', 'rollover_policies', 'item_guidance']) {
      const rows = body.tables[table] ?? []
      for (const row of rows) insertRow(driver, table, row), insertRow(driver, `base_${table}`, row)
    }
    for (const row of body.canonOps) insertRow(driver, 'canon_ops', row)
    for (const row of body.canonChanges) insertRow(driver, 'canon_changes', row)
    driver.prepare(`UPDATE sync_state SET workspaceId=?, lastAppliedSeq=?, keyEpoch=?, paused=NULL, updatedAt=? WHERE id=1`).run(body.workspaceId, body.uptoSeq, body.keyEpoch, at)
    const generation = driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation
    if (String(generation) !== body.generation) throw new SyncApplyError('generation')
  })
}

function insertRow(driver: SqlDriver, table: string, row: Record<string, SqlValue>): void {
  const keys = Object.keys(row)
  driver.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...keys.map(key => row[key] ?? null))
}
