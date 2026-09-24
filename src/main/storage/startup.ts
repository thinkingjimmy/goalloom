/**
 * [INPUT]: main 控制的工作区路径与既有固定备份目录、注入时刻；node:sqlite 只读连接与现有 BackupManager。
 * [OUTPUT]: openWorkspace：已就绪的受控连接及可选 protective 回执；StartupError 携带副本位置，失败时不运行迁移、不开放业务。
 * [POS]: storage 启动编排——只读探测源 user_version/schema，读取旧工作区，复用 BackupManager create(protective)+verify 并核对副本版本，再以正常连接复核后调用 migrate 原子升级。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { existsSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import type { Workspace } from '../../shared/contracts/entities'
import type { BackupRecord } from '../../shared/contracts/transfer'
import { BackupManager } from './backup/manager'
import { openDatabase } from './database'
import { migrate, requiredTables, schemaVersion, upgradableVersions, userVersion } from './schema'
import { Store } from './store'
import { serverText } from '../../shared/i18n/server'

export class StartupError extends Error {
  constructor(message: string, readonly backupPath: string | null = null) { super(message) }
}
export interface OpenedWorkspace { db: DatabaseSync; protective: BackupRecord | null }

type Probe = { kind: 'new' } | { kind: 'current' } | { kind: 'upgrade'; version: number }

export async function openWorkspace(path: string, backupDirectory: string, now: () => string): Promise<OpenedWorkspace> {
  const probe = probeSource(path)
  if (probe.kind !== 'upgrade') return { db: ready(path), protective: null }
  // --- Protect before any write-capable connection: the read-only source feeds the existing backup engine. ---
  const source = readOnly(path)
  let record: BackupRecord, workspace: Workspace, manager: BackupManager
  try {
    workspace = sourceWorkspace(source)
    manager = new BackupManager(source, backupDirectory)
    try { record = await manager.create('protective', workspace, now()) }
    catch { throw new StartupError(serverText().storage.backupBeforeUpgradeFailed) }
    const copyPath = manager.path(record.id)
    try {
      await manager.verify(record)
      const copy = readOnly(copyPath)
      try { if (userVersion(copy) !== probe.version) throw new Error('副本版本不符') } finally { copy.close() }
    } catch { throw new StartupError(serverText().storage.upgradeCheckFailed, copyPath) }
  } finally { source.close() }
  const backupPath = manager.path(record.id)
  const db = openDatabase(path)
  try {
    // --- Nothing may have written between protection and migration; a changed source needs a fresh copy. ---
    const current = new Store(db).workspace()
    if (userVersion(db) !== probe.version || current.generation !== workspace.generation || current.revision !== workspace.revision) throw new StartupError(serverText().storage.changedAfterBackup, backupPath)
    try { migrate(db) } catch { throw new StartupError(serverText().storage.upgradeFailed, backupPath) }
    return { db, protective: record }
  } catch (error) { db.close(); throw error }
}

export function probeSource(path: string): Probe {
  if (path === ':memory:' || !existsSync(path)) return { kind: 'new' }
  let db: DatabaseSync
  try { db = readOnly(path) }
  catch { throw new StartupError(serverText().storage.readOnlyFailed) }
  try {
    const version = userVersion(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => String(row.name))
    if (version === 0 && !tables.length) return { kind: 'new' }
    if (version === schemaVersion) return { kind: 'current' }
    if (!upgradableVersions.includes(version)) throw new StartupError(version > schemaVersion ? serverText().storage.newerVersion : serverText().storage.unsupportedVersion)
    if (requiredTables.some(name => !tables.includes(name))) throw new StartupError(serverText().storage.incompleteSchema)
    return { kind: 'upgrade', version }
  } catch (error) { throw error instanceof StartupError ? error : new StartupError(serverText().storage.unreadable) }
  finally { db.close() }
}

function readOnly(path: string): DatabaseSync { return new DatabaseSync(path, { readOnly: true, allowExtension: false }) }
function sourceWorkspace(db: DatabaseSync): Workspace {
  // Store.workspace defaults columns later versions added; a missing or corrupt row stops before any backup is invented.
  try { return new Store(db).workspace() }
  catch { throw new StartupError(serverText().storage.corruptRecords) }
}
function ready(path: string): DatabaseSync {
  const db = openDatabase(path)
  try { migrate(db); return db } catch (error) { db.close(); throw new StartupError(error instanceof Error ? error.message : serverText().storage.initFailed) }
}
