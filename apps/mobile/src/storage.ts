import { deleteDatabaseSync, openDatabaseSync } from 'expo-sqlite'
import type { SqlDriver } from '@goalloom/local-store'
import { expoDriver } from './driver'

export async function openDatabase(name: string, reset: boolean): Promise<SqlDriver> {
  const file = `${name}.db`
  if (reset) {
    try { deleteDatabaseSync(file) } catch { /* a missing file is a fresh database */ }
  }
  return expoDriver(openDatabaseSync(file))
}
