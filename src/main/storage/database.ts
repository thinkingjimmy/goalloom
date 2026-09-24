/**
 * [INPUT]: main 控制的数据库路径、同步事务函数；node:sqlite。
 * [OUTPUT]: 开启外键/WAL 的连接与全成全败事务，不接受 renderer SQL。
 * [POS]: storage 的连接与事务基础库；生产迁移由 schema.ts 管理。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { DatabaseSync } from 'node:sqlite'
import { serverText } from '../../shared/i18n/server'

export function openDatabase(path: string): DatabaseSync {
  const db = new DatabaseSync(path, { enableForeignKeyConstraints: true })
  try {
    db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL; PRAGMA busy_timeout = 5000;')
    return db
  } catch (error) {
    db.close()
    throw error
  }
}

export function transaction<T>(db: DatabaseSync, write: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = write()
    if (result instanceof Promise) throw new Error('事务函数必须同步完成')
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function verifyDatabase(db: DatabaseSync): void {
  const integrity = db.prepare('PRAGMA integrity_check').all()
  if (integrity.length !== 1 || integrity[0]?.integrity_check !== 'ok') {
    throw new Error(serverText().storage.integrityFailed)
  }
  if (db.prepare('PRAGMA foreign_key_check').all().length !== 0) {
    throw new Error(serverText().storage.danglingReferences)
  }
}
