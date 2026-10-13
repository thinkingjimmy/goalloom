import initSqlJs from 'sql.js'
import type { SqlDriver, SqlValue } from '@goalloom/local-store'
import wasmUrl from '../assets/sql-wasm.wasm'

let factory: Awaited<ReturnType<typeof initSqlJs>> | null = null

async function sqlFactory() {
  if (factory) return factory
  const bytes = await fetch(wasmUrl).then(response => response.arrayBuffer())
  factory = await initSqlJs({ wasmBinary: bytes })
  return factory
}

function encode(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000))
  }
  return btoa(binary)
}

function decode(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export async function openDatabase(name: string, reset: boolean): Promise<SqlDriver> {
  const key = `goalloom-web:${name}`
  const SQL = await sqlFactory()
  const saved = reset ? null : localStorage.getItem(key)
  const db = new SQL.Database(saved ? decode(saved) : null)
  db.run('PRAGMA foreign_keys = ON')
  let depth = 0
  const persist = () => {
    if (depth === 0) localStorage.setItem(key, encode(db.export()))
  }
  return {
    exec(sql) { db.exec(sql); persist() },
    prepare(sql) {
      return {
        run(...params: SqlValue[]) {
          const statement = db.prepare(sql)
          statement.bind(params)
          statement.step()
          statement.free()
          const changes = db.getRowsModified()
          persist()
          return { changes }
        },
        get(...params: SqlValue[]) {
          const statement = db.prepare(sql)
          statement.bind(params)
          const row = statement.step() ? statement.getAsObject() : undefined
          statement.free()
          return row as Record<string, SqlValue> | undefined
        },
        all(...params: SqlValue[]) {
          const statement = db.prepare(sql)
          statement.bind(params)
          const rows: Record<string, SqlValue>[] = []
          while (statement.step()) rows.push(statement.getAsObject() as Record<string, SqlValue>)
          statement.free()
          return rows
        },
      }
    },
    transaction(fn) {
      depth += 1
      db.exec('BEGIN IMMEDIATE')
      try {
        const result = fn()
        db.exec('COMMIT')
        depth -= 1
        persist()
        return result
      } catch (error) {
        db.exec('ROLLBACK')
        depth -= 1
        throw error
      }
    },
  }
}
