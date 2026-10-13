import type { SQLiteDatabase } from 'expo-sqlite'
import type { SqlDriver, SqlValue } from '@goalloom/local-store'

export function expoDriver(db: SQLiteDatabase): SqlDriver {
  return {
    exec(sql) { db.execSync(sql) },
    prepare(sql) {
      return {
        run(...params: SqlValue[]) {
          const result = db.runSync(sql, ...params)
          return { changes: Number(result.changes) }
        },
        get(...params: SqlValue[]) {
          const row = db.getFirstSync(sql, ...params)
          return (row ?? undefined) as Record<string, SqlValue> | undefined
        },
        all(...params: SqlValue[]) {
          return db.getAllSync(sql, ...params) as Record<string, SqlValue>[]
        },
      }
    },
    transaction(fn) {
      db.execSync('BEGIN IMMEDIATE')
      try {
        const result = fn()
        db.execSync('COMMIT')
        return result
      } catch (error) {
        db.execSync('ROLLBACK')
        throw error
      }
    },
  }
}
