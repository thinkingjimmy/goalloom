/**
 * [INPUT]: An empty SQLite database or the exact current desktop format.
 * [OUTPUT]: Direct schema v15 with shared business/sync structures and immutable receipt ownership.
 * [POS]: Desktop schema authority. Unsupported files are rejected before any write.
 */
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { businessDdl, syncDdl, shadowStatements, syncSettingsDdl, syncBaselineDdl, type MasterRow } from '@goalloom/schema'
import { transaction, verifyDatabase } from './database'
import { serverText } from '../../shared/i18n/server'

export const schemaVersion = 15
export const requiredTables = ['workspace', 'items', 'item_placements', 'planning_periods', 'item_relations', 'rollover_policies', 'operations', 'item_events', 'undo_effects', 'schema_migrations',
  'sync_ops', 'sync_state', 'sync_conflicts', 'canon_ops', 'canon_changes', 'sync_settings', 'sync_active_binding', 'sync_binding_transitions', 'sync_retired_rows', 'sync_seed_state', 'sync_initialization_ack', 'sync_binding_epoch_receipts',
  'base_workspace', 'base_items', 'base_item_placements', 'base_planning_periods', 'base_item_relations', 'base_rollover_policies']
export function userVersion(db: DatabaseSync): number { return Number(db.prepare('PRAGMA user_version').get()?.user_version) }

export function initializeSchema(db: DatabaseSync): void {
  const version = userVersion(db)
  if (version === schemaVersion) { verifyDatabase(db);return }
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
  if (version !== 0 || tables.length) throw new Error(serverText().storage.unsupportedDatabase)
  transaction(db, () => {
    db.exec(businessDdl)
    db.prepare('INSERT INTO workspace (id, generation) VALUES (1, ?)').run(randomUUID())
    db.exec(syncDdl)
    const master = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all() as unknown as MasterRow[]
    for (const statement of shadowStatements(master)) db.exec(statement)
    for (const table of ['workspace', 'planning_periods', 'items', 'item_placements', 'item_relations', 'rollover_policies']) db.exec(`INSERT INTO base_${table} SELECT * FROM ${table}`)
    db.exec(syncSettingsDdl)
    db.exec(syncBaselineDdl)
    db.exec('CREATE TABLE sync_initialization_ack(bindingToken TEXT PRIMARY KEY, requestId TEXT NOT NULL, receipt TEXT NOT NULL CHECK(json_valid(receipt))) STRICT')
    const at = new Date().toISOString()
    db.prepare('INSERT INTO sync_state (id,deviceId,lastAppliedSeq,lastUploadedSeq,protocolVersion,updatedAt) VALUES (1,?,0,0,2,?)').run(randomUUID(), at)
    db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(schemaVersion, at)
    db.exec(`PRAGMA user_version=${schemaVersion}`)
    verifyDatabase(db)
  })
}
