/**
 * [INPUT]: A main-owned workspace path and the current schema contract.
 * [OUTPUT]: A new/current connection or a read-only unsupported/corrupt-file refusal.
 * [POS]: Startup boundary. It never upgrades, converts or replaces an existing file.
 */
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { openDatabase, verifyDatabase } from './database'
import { initializeSchema, requiredTables, schemaVersion, userVersion } from './schema'
import { serverText } from '../../shared/i18n/server'

export class StartupError extends Error {}
export interface OpenedWorkspace { db: DatabaseSync }

export async function openWorkspace(path: string): Promise<OpenedWorkspace> {
  probeSource(path)
  const db = openDatabase(path)
  try { initializeSchema(db);return { db } }
  catch (error) { db.close();throw new StartupError(error instanceof Error ? error.message : serverText().storage.initFailed) }
}
export function probeSource(path: string): { kind: 'new' | 'current' } {
  if (path === ':memory:' || !existsSync(path)) return { kind: 'new' }
  let db: DatabaseSync
  try { db = new DatabaseSync(path, { readOnly: true, allowExtension: false }) }
  catch { throw new StartupError(serverText().storage.readOnlyFailed) }
  try {
    const version = userVersion(db)
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => String(row.name))
    if (version === 0 && !names.length) return { kind: 'new' }
    if (version !== schemaVersion) throw new StartupError(version > schemaVersion ? serverText().storage.newerVersion : serverText().storage.unsupportedVersion)
    if (requiredTables.some(name => !names.includes(name))) throw new StartupError(serverText().storage.incompleteSchema)
    verifyDatabase(db)
    return { kind: 'current' }
  } catch (error) { throw error instanceof StartupError ? error : new StartupError(serverText().storage.unreadable) }
  finally { db.close() }
}
