/**
 * [INPUT]: A main-owned workspace path, the backup directory, an injected clock and the current schema contract.
 * [OUTPUT]: A new/current connection, a v15 upgrade after a verified protective backup, or a read-only unsupported/corrupt-file refusal.
 * [POS]: Startup boundary. The only in-place upgrade (v15 -> v16) writes nothing before its protective copy is verified.
 */
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { BackupManager } from './backup/manager'
import { openDatabase, verifyDatabase } from './database'
import { initializeSchema, schemaVersion, tablesFor, upgradableVersion, userVersion } from './schema'
import { Store } from './store'
import { serverText } from '../../shared/i18n/server'

export class StartupError extends Error {}
export interface OpenedWorkspace { db: DatabaseSync }
export interface StartupProtection { backupDirectory: string; now: () => string }

export async function openWorkspace(path: string, protection?: StartupProtection): Promise<OpenedWorkspace> {
  const probe = probeSource(path)
  const expected = probe.kind === 'upgrade' ? await protectUpgrade(path, protection) : null
  const db = openDatabase(path)
  try {
    // Nothing may write between the protective copy and the upgrade; a changed source needs a fresh copy.
    if (expected && (userVersion(db) !== upgradableVersion || revision(db) !== expected)) throw new StartupError(serverText().errors.changedAfterBackup)
    initializeSchema(db)
    return { db }
  } catch (error) {
    db.close()
    if (error instanceof StartupError) throw error
    throw new StartupError(error instanceof Error ? error.message : serverText().storage.initFailed)
  }
}
export function probeSource(path: string): { kind: 'new' | 'current' | 'upgrade' } {
  if (path === ':memory:' || !existsSync(path)) return { kind: 'new' }
  let db: DatabaseSync
  try { db = readOnly(path) }
  catch { throw new StartupError(serverText().storage.readOnlyFailed) }
  try {
    const version = userVersion(db)
    const names = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => String(row.name))
    if (version === 0 && !names.length) return { kind: 'new' }
    if (version !== schemaVersion && version !== upgradableVersion) throw new StartupError(version > schemaVersion ? serverText().storage.newerVersion : serverText().storage.unsupportedVersion)
    if (tablesFor(version).some(name => !names.includes(name))) throw new StartupError(serverText().storage.incompleteSchema)
    verifyDatabase(db)
    return { kind: version === schemaVersion ? 'current' : 'upgrade' }
  } catch (error) { throw error instanceof StartupError ? error : new StartupError(serverText().storage.unreadable) }
  finally { db.close() }
}

/** Copies the read-only source through the regular backup engine and proves the copy is still the old format. */
async function protectUpgrade(path: string, protection: StartupProtection | undefined): Promise<string> {
  if (!protection) throw new StartupError(serverText().storage.unsupportedVersion)
  const source = readOnly(path)
  try {
    const workspace = new Store(source).workspace()
    const manager = new BackupManager(source, protection.backupDirectory)
    const record = await manager.create('protective', workspace, protection.now())
    await manager.verify(record)
    const copy = readOnly(manager.path(record.id))
    try { if (userVersion(copy) !== upgradableVersion) throw new Error('protective copy version') } finally { copy.close() }
    return `${workspace.generation}:${workspace.revision}`
  } catch (error) {
    if (error instanceof StartupError) throw error
    throw new StartupError(serverText().storage.backupFailed)
  } finally { source.close() }
}
function readOnly(path: string): DatabaseSync { return new DatabaseSync(path, { readOnly: true, allowExtension: false }) }
function revision(db: DatabaseSync): string {
  const row = db.prepare('SELECT generation,revision FROM workspace WHERE id=1').get()
  return `${String(row?.generation)}:${Number(row?.revision)}`
}
