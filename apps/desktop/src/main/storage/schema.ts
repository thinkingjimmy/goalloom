/**
 * [INPUT]: An empty SQLite database, the exact current desktop format, or v15 after the caller protected it.
 * [OUTPUT]: Direct schema v16 (period focus) with shared business/sync structures and immutable receipt ownership; atomic v15 upgrade.
 * [POS]: Desktop schema authority. Unsupported files are rejected before any write; startup owns the protective backup.
 */
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { businessDdl, businessTables, focusMigrationSql, syncDdl, shadowStatements, syncSettingsDdl, syncBaselineDdl, type MasterRow } from '@goalloom/schema'
import { transaction, verifyDatabase } from './database'
import { serverText } from '../../shared/i18n/server'

export const schemaVersion = 16
/** The only older format opened in place, after startup creates and verifies a protective backup. */
export const upgradableVersion = 15
const focusTables = ['period_focus', 'base_period_focus']
export const requiredTables = ['workspace', 'items', 'item_placements', 'planning_periods', 'item_relations', 'rollover_policies', 'operations', 'item_events', 'undo_effects', 'schema_migrations',
  'sync_ops', 'sync_state', 'sync_conflicts', 'canon_ops', 'canon_changes', 'sync_settings', 'sync_active_binding', 'sync_binding_transitions', 'sync_retired_rows', 'sync_seed_state', 'sync_initialization_ack', 'sync_binding_epoch_receipts',
  'base_workspace', 'base_items', 'base_item_placements', 'base_planning_periods', 'base_item_relations', 'base_rollover_policies', ...focusTables]
export function tablesFor(version: number): string[] { return version === upgradableVersion ? requiredTables.filter(name => !focusTables.includes(name)) : requiredTables }
export function userVersion(db: DatabaseSync): number { return Number(db.prepare('PRAGMA user_version').get()?.user_version) }

export function initializeSchema(db: DatabaseSync): void {
  const version = userVersion(db)
  if (version === schemaVersion) { verifyDatabase(db);return }
  if (version === upgradableVersion) {
    transaction(db, () => {
      db.exec(focusMigrationSql())
      finish(db, new Date().toISOString())
    })
    return
  }
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
  if (version !== 0 || tables.length) throw new Error(serverText().storage.unsupportedDatabase)
  transaction(db, () => {
    db.exec(businessDdl)
    db.prepare('INSERT INTO workspace (id, generation) VALUES (1, ?)').run(randomUUID())
    db.exec(syncDdl)
    const master = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all() as unknown as MasterRow[]
    for (const statement of shadowStatements(master)) db.exec(statement)
    for (const table of businessTables) db.exec(`INSERT INTO base_${table} SELECT * FROM ${table}`)
    db.exec(syncSettingsDdl)
    db.exec(syncBaselineDdl)
    db.exec('CREATE TABLE sync_initialization_ack(bindingToken TEXT PRIMARY KEY, requestId TEXT NOT NULL, receipt TEXT NOT NULL CHECK(json_valid(receipt))) STRICT')
    const at = new Date().toISOString()
    db.prepare('INSERT INTO sync_state (id,deviceId,lastAppliedSeq,lastUploadedSeq,protocolVersion,updatedAt) VALUES (1,?,0,0,2,?)').run(randomUUID(), at)
    finish(db, at)
  })
}
function finish(db: DatabaseSync, at: string): void {
  db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(schemaVersion, at)
  db.exec(`PRAGMA user_version=${schemaVersion}`)
  verifyDatabase(db)
}
