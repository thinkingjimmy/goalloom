import { deleteDatabaseSync, openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite'
import type { SqlDriver } from '@goalloom/local-store'
import { expoDriver } from './driver'

const open = new Map<string, SQLiteDatabase>()

export async function openDatabase(name: string, reset: boolean): Promise<SqlDriver> {
  const file = `${name}.db`
  const previous = open.get(file)
  if (previous && !reset) return expoDriver(previous)
  if (previous) {
    try { previous.closeSync() } catch { /* already closed */ }
    open.delete(file)
  }
  if (reset) {
    try { deleteDatabaseSync(file) } catch { /* a missing file is a fresh database */ }
  }
  const db = openDatabaseSync(file)
  open.set(file, db)
  return expoDriver(db)
}
