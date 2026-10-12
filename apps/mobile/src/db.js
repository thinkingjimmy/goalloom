import * as SQLite from 'expo-sqlite'
import { nestingMigrationSql, shadowStatements, v8Ddl, v9HistoryRewrite, v9SyncDdl } from '@goalloom/schema'

export function openFresh(name) {
  try {
    SQLite.deleteDatabaseSync(name)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!message.includes('DatabaseNotFound') && !/not found/i.test(message)) throw error
  }
  const db = SQLite.openDatabaseSync(name)
  db.execSync('PRAGMA foreign_keys = ON')
  return db
}

export function installV9(db, deviceId, at) {
  db.execSync(v8Ddl.replace('CHECK(effectsVersion IN (1,2))', 'CHECK(effectsVersion IN (1,2,3))'))
  db.execSync(nestingMigrationSql(''))
  db.execSync(v9HistoryRewrite)
  db.execSync(v9SyncDdl)
  db.runSync('INSERT INTO workspace (id, generation) VALUES (1, ?)', deviceId)
  const master = db.getAllSync("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'")
  for (const statement of shadowStatements(master)) db.execSync(statement)
  db.execSync('INSERT INTO base_workspace SELECT * FROM workspace')
  db.execSync('INSERT INTO base_planning_periods SELECT * FROM planning_periods')
  db.execSync('INSERT INTO base_items SELECT * FROM items')
  db.execSync('INSERT INTO base_item_placements SELECT * FROM item_placements')
  db.execSync('INSERT INTO base_item_relations SELECT * FROM item_relations')
  db.execSync('INSERT INTO base_rollover_policies SELECT * FROM rollover_policies')
  db.execSync('INSERT INTO base_item_guidance SELECT * FROM item_guidance')
  db.runSync('INSERT INTO sync_state (id, deviceId, lastAppliedSeq, lastUploadedSeq, protocolVersion, updatedAt) VALUES (1, ?, 0, 0, 1, ?)', deviceId, at)
}

export function expoDriver(db) {
  return {
    exec(sql) { db.execSync(sql) },
    prepare(sql) {
      return {
        run(...params) {
          const result = db.runSync(sql, ...params)
          return { changes: Number(result.changes) }
        },
        get(...params) {
          const row = db.getFirstSync(sql, ...params)
          return row ?? undefined
        },
        all(...params) { return db.getAllSync(sql, ...params) },
      }
    },
    transaction(fn) {
      db.execSync('BEGIN IMMEDIATE')
      try {
        const result = fn()
        if (result instanceof Promise) throw new Error('事务函数必须同步完成')
        db.execSync('COMMIT')
        return result
      } catch (error) {
        db.execSync('ROLLBACK')
        throw error
      }
    },
  }
}

export const host = {
  materializePeriod(horizon, startDate) {
    return { id: `${horizon}:${startDate}`, horizon, startDate, endDate: '2099-01-01', startAt: `${startDate}T00:00:00.000Z`, endAt: '2099-01-01T00:00:00.000Z' }
  },
}
