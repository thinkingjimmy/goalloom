/**
 * [INPUT]: A new or current-version SQLite database; v8 files upgrade in place after the caller has taken a backup.
 * [OUTPUT]: Atomic schema v9: v8 projection, history tables that do not pin projection rows, sync tables and base_* shadow.
 * [POS]: Sole production DDL owner. Statements come from @goalloom/schema so they do not depend on node:sqlite types.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { shadowStatements, v8Ddl, v9HistoryRewrite, v9SyncDdl, type MasterRow } from '@goalloom/schema'
import { transaction } from './database'
import { serverText } from '../../shared/i18n/server'

export const schemaVersion = 9
export const supportedVersions = [1, 2, 3, 4, 5, 6, 7, 8, 9]
export const upgradableVersions = [8]
export const requiredTables = ['workspace', 'items', 'item_placements', 'planning_periods', 'item_relations', 'rollover_policies', 'operations', 'item_events', 'undo_effects', 'schema_migrations']
const syncTables = ['sync_ops', 'sync_state', 'sync_conflicts', 'canon_ops', 'canon_changes']
export function sourceTables(version: number): string[] {
  const tables = version >= 8 ? [...requiredTables, 'item_guidance'] : [...requiredTables]
  return version >= 9 ? [...tables, ...syncTables] : tables
}
export function userVersion(db: DatabaseSync): number { return Number(db.prepare('PRAGMA user_version').get()?.user_version) }

export function migrate(db: DatabaseSync): void {
  const version = userVersion(db)
  if (version === schemaVersion) return
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
  if (version === 0) {
    if (tables.length) throw new Error(serverText().storage.unsupportedDatabase)
    transaction(db, () => installV9(db, true))
    return
  }
  if (version === 8) {
    transaction(db, () => installV9(db, false))
    return
  }
  throw new Error(serverText().storage.unsupportedDatabase)
}

function installV9(db: DatabaseSync, fresh: boolean): void {
  if (fresh) db.exec(v8Ddl)
  db.exec(v9HistoryRewrite)
  db.exec(v9SyncDdl)
  if (fresh) {
    db.prepare('INSERT INTO workspace (id, generation) VALUES (1, ?)').run(randomUUID())
  }
  const master = db.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`).all() as unknown as MasterRow[]
  for (const statement of shadowStatements(master)) db.exec(statement)
  db.exec(`INSERT INTO base_workspace SELECT * FROM workspace`)
  db.exec(`INSERT INTO base_planning_periods SELECT * FROM planning_periods`)
  db.exec(`INSERT INTO base_items SELECT * FROM items`)
  db.exec(`INSERT INTO base_item_placements SELECT * FROM item_placements`)
  db.exec(`INSERT INTO base_item_relations SELECT * FROM item_relations`)
  db.exec(`INSERT INTO base_rollover_policies SELECT * FROM rollover_policies`)
  db.exec(`INSERT INTO base_item_guidance SELECT * FROM item_guidance`)
  const sequence = db.prepare("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").get()
  if (sequence) {
    db.exec(`UPDATE sqlite_sequence SET name='item_events' WHERE name='item_events_v9'`)
    db.exec(`UPDATE sqlite_sequence SET seq=(SELECT COALESCE(MAX(seq),0) FROM item_events) WHERE name='item_events'`)
  }
  db.prepare('INSERT INTO sync_state (id, deviceId, lastAppliedSeq, lastUploadedSeq, protocolVersion, updatedAt) VALUES (1, ?, 0, 0, 1, ?)').run(randomUUID(), new Date().toISOString())
  db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(schemaVersion, new Date().toISOString())
  db.exec(`PRAGMA user_version = ${schemaVersion}`)
  const integrity = db.prepare('PRAGMA integrity_check').all()
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error(serverText().storage.integrityFailed)
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error(serverText().storage.danglingReferences)
}

export { v8Ddl }
