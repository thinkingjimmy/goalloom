import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import type { SqlDriver, SqlStatement, SqlValue } from './driver'

function bind(value: SqlValue): SQLInputValue {
  return value as SQLInputValue
}

/** node:sqlite adapter. Import from `@goalloom/store-core/node`, not the package root. */
export function nodeSqlDriver(db: DatabaseSync): SqlDriver {
  return {
    exec: sql => db.exec(sql),
    prepare(sql: string): SqlStatement {
      const statement = db.prepare(sql)
      return {
        run: (...params) => { const result = statement.run(...params.map(bind)); return { changes: Number(result.changes) } },
        get: (...params) => statement.get(...params.map(bind)) as Record<string, SqlValue> | undefined,
        all: (...params) => statement.all(...params.map(bind)) as Record<string, SqlValue>[],
      }
    },
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = fn()
        if (result instanceof Promise) throw new Error('事务函数必须同步完成')
        db.exec('COMMIT')
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
  }
}
