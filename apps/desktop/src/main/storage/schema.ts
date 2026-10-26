/**
 * [INPUT]: A new/current SQLite database, or a v8-v13 source with a verified protective backup. Older files require confirmed recovery.
 * [OUTPUT]: Atomic schema v14, retaining sync/nesting/receipt ownership, guidance observations and same-binding epoch receipts.
 * [POS]: Sole production DDL owner. Statements come from @goalloom/schema so they do not depend on node:sqlite types.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { nestingMigrationSql, shadowStatements, syncSettingsDdl, syncBaselineDdl, v8Ddl, v9HistoryRewrite, v9SyncDdl, widenWorkspaceStyles, type MasterRow } from '@goalloom/schema'
import { scrubSecretMaterial } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { transaction } from './database'
import { serverText } from '../../shared/i18n/server'

export const schemaVersion = 14
export const supportedVersions = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
export const upgradableVersions = [8, 9, 10, 11, 12, 13]
export const requiredTables = ['workspace', 'items', 'item_placements', 'planning_periods', 'item_relations', 'rollover_policies', 'operations', 'item_events', 'undo_effects', 'schema_migrations']
const syncTables = ['sync_ops', 'sync_state', 'sync_conflicts', 'canon_ops', 'canon_changes']
export function sourceTables(version: number, present?: readonly string[]): string[] {
  const tables = version >= 8 ? [...requiredTables, 'item_guidance'] : [...requiredTables]
  // Phase 0 v9 has sync tables. A WIP nesting database at user_version 9 does not; callers that can see sqlite_master pass the names.
  const sync = version >= 10 || version === 9 && (!present || present.includes('sync_state'))
  const baseline = version >= 13 ? ['sync_active_binding', 'sync_binding_transitions', 'sync_retired_rows', 'sync_seed_state', 'sync_initialization_ack', 'guidance_baselines'] : []
  return sync ? [...tables, ...syncTables, ...baseline, ...(version >= 14 ? ['sync_binding_epoch_receipts'] : [])] : tables
}
export function userVersion(db: DatabaseSync): number { return Number(db.prepare('PRAGMA user_version').get()?.user_version) }

export function ensureSyncSettings(db: DatabaseSync): void {
  db.exec(syncSettingsDdl)
  db.exec(syncBaselineDdl)
  db.exec(`CREATE TABLE IF NOT EXISTS guidance_baselines(position INTEGER PRIMARY KEY CHECK(position>0), id TEXT NOT NULL UNIQUE, record TEXT NOT NULL CHECK(json_valid(record) AND json_extract(record,'$.order')=position AND json_extract(record,'$.id')=id)) STRICT`)
  db.exec(`CREATE TRIGGER IF NOT EXISTS guidance_checkpoint_immutable BEFORE UPDATE ON guidance_baselines BEGIN SELECT RAISE(ABORT,'guidance_checkpoint_immutable'); END`)
  db.exec('CREATE TABLE IF NOT EXISTS sync_initialization_ack(bindingToken TEXT PRIMARY KEY, requestId TEXT NOT NULL, receipt TEXT NOT NULL CHECK(json_valid(receipt))) STRICT')
}

export function migrate(db: DatabaseSync): void {
  const version = userVersion(db)
  if (version === schemaVersion) { ensureSyncSettings(db); scrubSecretMaterial(nodeSqlDriver(db)); return }
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()
  if (version === 0) {
    if (tables.length) throw new Error(serverText().storage.unsupportedDatabase)
    transaction(db, () => installCurrent(db, true))
    return
  }
  if (version === 8) {
    transaction(db, () => installCurrent(db, false))
    return
  }
  if (version === 9) {
    transaction(db, () => installFromV9(db))
    return
  }
  if (version === 10 || version === 11 || version === 12 || version === 13) { transaction(db, () => finish(db)); return }
  throw new Error(serverText().storage.unsupportedDatabase)
}

function installCurrent(db: DatabaseSync, fresh: boolean): void {
  if (fresh) {
    db.exec(v8Ddl.replace('CHECK(effectsVersion IN (1,2))', 'CHECK(effectsVersion IN (1,2,3))'))
    db.prepare('INSERT INTO workspace (id, generation) VALUES (1, ?)').run(randomUUID())
  }
  db.exec(nestingMigrationSql(''))
  db.exec(v9HistoryRewrite)
  if (!fresh) widenEffectsVersion(db)
  db.exec(v9SyncDdl)
  cloneShadows(db)
  db.prepare('INSERT INTO sync_state (id, deviceId, lastAppliedSeq, lastUploadedSeq, protocolVersion, updatedAt) VALUES (1, ?, 0, 0, 1, ?)').run(randomUUID(), new Date().toISOString())
  finish(db)
}

/** Phase 0 v9 has sync shadows and no nesting column. A WIP nesting v9 has the column and no sync tables. */
function installFromV9(db: DatabaseSync): void {
  const sync = tableExists(db, 'sync_state')
  const nesting = columnExists(db, 'item_placements', 'nestingParentId')
  if (sync && !nesting) {
    widenEffectsVersion(db)
    db.exec(nestingMigrationSql(''))
    db.exec(nestingMigrationSql('base_'))
  } else if (!sync && nesting) {
    db.exec(v9HistoryRewrite)
    db.exec(v9SyncDdl)
    cloneShadows(db)
    db.prepare('INSERT INTO sync_state (id, deviceId, lastAppliedSeq, lastUploadedSeq, protocolVersion, updatedAt) VALUES (1, ?, 0, 0, 1, ?)').run(randomUUID(), new Date().toISOString())
  } else throw new Error(serverText().storage.unsupportedDatabase)
  finish(db)
}

function cloneShadows(db: DatabaseSync): void {
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
}

function widenEffectsVersion(db: DatabaseSync): void {
  const sql = String(db.prepare("SELECT sql FROM sqlite_master WHERE name='operations'").get()?.sql ?? '')
  if (sql.includes('(1,2,3)')) return
  db.exec('PRAGMA defer_foreign_keys=ON')
  db.exec(`
CREATE TABLE operations_v10 (
  id TEXT PRIMARY KEY, generation TEXT NOT NULL, requestHash TEXT NOT NULL, kind TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('user','system')), at TEXT NOT NULL, effectsVersion INTEGER NOT NULL CHECK(effectsVersion IN (1,2,3)),
  effects TEXT NOT NULL CHECK(json_valid(effects)), result TEXT NOT NULL CHECK(json_valid(result))
) STRICT;
INSERT INTO operations_v10 (id,generation,requestHash,kind,source,at,effectsVersion,effects,result)
  SELECT id,generation,requestHash,kind,source,at,effectsVersion,effects,result FROM operations;
CREATE TABLE undo_effects_v10 (
  originalId TEXT NOT NULL REFERENCES operations_v10(id), effectIndex INTEGER NOT NULL, undoId TEXT NOT NULL REFERENCES operations_v10(id),
  PRIMARY KEY(originalId,effectIndex)
) STRICT;
INSERT INTO undo_effects_v10 (originalId,effectIndex,undoId) SELECT originalId,effectIndex,undoId FROM undo_effects;
CREATE TABLE item_events_v10 (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, operationId TEXT NOT NULL REFERENCES operations_v10(id) DEFERRABLE INITIALLY DEFERRED,
  eventIndex INTEGER NOT NULL, itemId TEXT NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL,
  beforeState TEXT CHECK(beforeState IS NULL OR json_valid(beforeState)), afterState TEXT NOT NULL CHECK(json_valid(afterState)),
  fromPeriodId TEXT, toPeriodId TEXT, undoOf TEXT REFERENCES operations_v10(id), UNIQUE(operationId,eventIndex)
) STRICT;
INSERT INTO item_events_v10 (seq,id,operationId,eventIndex,itemId,at,type,beforeState,afterState,fromPeriodId,toPeriodId,undoOf)
  SELECT seq,id,operationId,eventIndex,itemId,at,type,beforeState,afterState,fromPeriodId,toPeriodId,undoOf FROM item_events;
DROP TABLE undo_effects;
DROP TABLE item_events;
DROP TABLE operations;
ALTER TABLE operations_v10 RENAME TO operations;
ALTER TABLE undo_effects_v10 RENAME TO undo_effects;
ALTER TABLE item_events_v10 RENAME TO item_events;
CREATE INDEX operations_recent ON operations(at,id);
CREATE INDEX events_item_seq ON item_events(itemId,seq);
CREATE INDEX events_from_period ON item_events(fromPeriodId,itemId,seq);
CREATE INDEX events_to_period ON item_events(toPeriodId,itemId,seq);
`)
  const sequence = db.prepare("SELECT name FROM sqlite_master WHERE name='sqlite_sequence'").get()
  if (sequence) {
    db.exec(`UPDATE sqlite_sequence SET name='item_events' WHERE name='item_events_v10'`)
    db.exec(`UPDATE sqlite_sequence SET seq=(SELECT COALESCE(MAX(seq),0) FROM item_events) WHERE name='item_events'`)
  }
}

function finish(db: DatabaseSync): void {
  widenWorkspaceStyles(db)
  ensureSyncSettings(db)
  db.exec("CREATE INDEX IF NOT EXISTS operations_creation_completion ON operations(json_extract(result,'$.creationOperationId')) WHERE kind='completeCreation'")
  db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(schemaVersion, new Date().toISOString())
  db.exec(`PRAGMA user_version = ${schemaVersion}`)
  const integrity = db.prepare('PRAGMA integrity_check').all()
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error(serverText().storage.integrityFailed)
  if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error(serverText().storage.danglingReferences)
}

function tableExists(db: DatabaseSync, name: string): boolean {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)
}
function columnExists(db: DatabaseSync, table: string, column: string): boolean {
  return db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column)
}

export { v8Ddl }
