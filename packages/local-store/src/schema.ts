/**
 * [INPUT]: An empty SQL driver or the current mobile v10 database.
 * [OUTPUT]: Mobile schema v10 with live/base macos appearance constraints from the shared desktop DDL chain.
 * [POS]: Shared offline install; current mobile appearance widening runs in one transaction. Desktop owns desktop versions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { nestingMigrationSql, shadowStatements, v8Ddl, v9HistoryRewrite, v9SyncDdl, widenWorkspaceStyles } from '@goalloom/schema'
import type { SqlDriver } from './types'

export function userVersion(driver: SqlDriver): number {
  const row = driver.prepare('PRAGMA user_version').get()
  return Number(row?.user_version ?? 0)
}

export function installSchema(driver: SqlDriver, deviceId: string, at: string): void {
  const version = userVersion(driver)
  if (version === 10) { driver.transaction(() => widenWorkspaceStyles(driver)); return }
  if (version !== 0) throw new Error('unsupported database')
  driver.transaction(() => {
    driver.exec(v8Ddl.replace('CHECK(effectsVersion IN (1,2))', 'CHECK(effectsVersion IN (1,2,3))'))
    driver.prepare('INSERT INTO workspace (id, generation) VALUES (1, ?)').run(deviceId)
    driver.exec(nestingMigrationSql(''))
    driver.exec(v9HistoryRewrite)
    driver.exec(v9SyncDdl)
    const master = driver.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'").all().map(row => ({
      type: String(row.type), name: String(row.name), tbl_name: String(row.tbl_name), sql: row.sql === null ? null : String(row.sql),
    }))
    for (const statement of shadowStatements(master)) driver.exec(statement)
    driver.exec('INSERT INTO base_workspace SELECT * FROM workspace')
    driver.exec('INSERT INTO base_planning_periods SELECT * FROM planning_periods')
    driver.exec('INSERT INTO base_items SELECT * FROM items')
    driver.exec('INSERT INTO base_item_placements SELECT * FROM item_placements')
    driver.exec('INSERT INTO base_item_relations SELECT * FROM item_relations')
    driver.exec('INSERT INTO base_rollover_policies SELECT * FROM rollover_policies')
    driver.exec('INSERT INTO base_item_guidance SELECT * FROM item_guidance')
    driver.prepare('INSERT INTO sync_state (id, deviceId, lastAppliedSeq, lastUploadedSeq, protocolVersion, updatedAt) VALUES (1, ?, 0, 0, 1, ?)').run(deviceId, at)
    driver.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(10, at)
    widenWorkspaceStyles(driver)
    driver.exec('PRAGMA user_version = 10')
    const integrity = driver.prepare('PRAGMA integrity_check').all()
    if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') throw new Error('integrity')
    if (driver.prepare('PRAGMA foreign_key_check').all().length) throw new Error('foreign key')
  })
}

export function installDevice(driver: SqlDriver): void {
  driver.exec('CREATE TABLE IF NOT EXISTS prefs (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
}
