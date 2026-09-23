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
    catch { throw new StartupError('升级前保护备份失败，工作区保持旧版本未修改。请检查磁盘空间与目录权限后重试。') }
    const copyPath = manager.path(record.id)
    try {
      await manager.verify(record)
      const copy = readOnly(copyPath)
      try { if (userVersion(copy) !== probe.version) throw new Error('副本版本不符') } finally { copy.close() }
    } catch { throw new StartupError('升级保护校验失败，工作区保持旧版本未修改。', copyPath) }
  } finally { source.close() }
  const backupPath = manager.path(record.id)
  const db = openDatabase(path)
  try {
    // --- Nothing may have written between protection and migration; a changed source needs a fresh copy. ---
    const current = new Store(db).workspace()
    if (userVersion(db) !== probe.version || current.generation !== workspace.generation || current.revision !== workspace.revision) throw new StartupError('保护备份后工作区被外部修改，已停止升级；重新打开应用会重新备份。', backupPath)
    try { migrate(db) } catch { throw new StartupError('工作区升级失败，原数据保持旧版本未修改。', backupPath) }
    return { db, protective: record }
  } catch (error) { db.close(); throw error }
}

export function probeSource(path: string): Probe {
  if (path === ':memory:' || !existsSync(path)) return { kind: 'new' }
  let db: DatabaseSync
  try { db = readOnly(path) }
  catch { throw new StartupError('无法以只读方式打开工作区文件，未做任何修改。请检查文件权限后重试。') }
  try {
    const version = userVersion(db)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row => String(row.name))
    if (version === 0 && !tables.length) return { kind: 'new' }
    if (version === schemaVersion) return { kind: 'current' }
    if (!upgradableVersions.includes(version)) throw new StartupError(version > schemaVersion ? '工作区由更新版本的 Goalloom 创建，请使用新版本打开；原文件未修改。' : '不支持的工作区版本，原文件未修改。')
    if (requiredTables.some(name => !tables.includes(name))) throw new StartupError('旧工作区结构不完整，已停止升级；原文件未修改。')
    return { kind: 'upgrade', version }
  } catch (error) { throw error instanceof StartupError ? error : new StartupError('工作区文件无法读取，未做任何修改。') }
  finally { db.close() }
}

function readOnly(path: string): DatabaseSync { return new DatabaseSync(path, { readOnly: true, allowExtension: false }) }
function sourceWorkspace(db: DatabaseSync): Workspace {
  // Store.workspace only reads columns shared by v1/v2; a missing or corrupt row stops before any backup is invented.
  try { return new Store(db).workspace() }
  catch { throw new StartupError('旧工作区记录损坏，已停止升级；原文件未修改。') }
}
function ready(path: string): DatabaseSync {
  const db = openDatabase(path)
  try { migrate(db); return db } catch (error) { db.close(); throw new StartupError(error instanceof Error ? error.message : '工作区初始化失败') }
}
