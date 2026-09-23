/**
 * [INPUT]: 权威连接、注入时钟/工作区、主进程固定备份目录。
 * [OUTPUT]: 已校验副本与独立回执、按本地日去重、仅日常副本轮换。
 * [POS]: storage 的备份适配器；回执不在被替换的工作区数据库内。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, rm, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { workspaceDate } from '../../../domain/calendar'
import type { Workspace } from '../../../shared/contracts/entities'
import { backupRecordSchema, type BackupRecord, type BackupStatus } from '../../../shared/contracts/transfer'
import { consistentBackup } from './snapshot'
import { verifyDatabase } from '../database'
import { atomicJson } from '../atomic-json'

async function checksum(path: string): Promise<string> { return createHash('sha256').update(await readFile(path)).digest('hex') }
export class BackupManager {
  lastError: string | null = null
  constructor(readonly db: DatabaseSync, readonly directory: string) {}
  path(id: string): string { return join(this.directory, `${backupRecordSchema.shape.id.parse(id)}.sqlite`) }
  async records(): Promise<BackupRecord[]> {
    await mkdir(this.directory, { recursive: true })
    const records: BackupRecord[] = []
    for (const name of await readdir(this.directory)) {
      if (!/^[0-9a-f-]{36}\.json$/.test(name)) continue
      try {
        const record = backupRecordSchema.parse(JSON.parse(await readFile(join(this.directory, name), 'utf8')))
        if (name !== `${record.id}.json` || !(await stat(this.path(record.id))).isFile()) continue
        records.push(record)
      } catch { /* 损坏/外部文件不会作为可恢复回执，也不会参与轮换。 */ }
    }
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))
  }
  async status(): Promise<BackupStatus> {
    try { const saved = JSON.parse(await readFile(join(this.directory, 'last-result.json'), 'utf8')); this.lastError = typeof saved.error === 'string' ? saved.error : null } catch { /* 首次无结果。 */ }
    return { directory: this.directory, records: await this.records(), lastError: this.lastError }
  }
  async verify(record: BackupRecord): Promise<void> {
    const path = this.path(record.id)
    if ((await stat(path)).size !== record.size || await checksum(path) !== record.sha256) throw new Error('备份回执与文件不一致')
    const copy = new DatabaseSync(path, { readOnly: true })
    try { verifyDatabase(copy) } finally { copy.close() }
  }
  async create(kind: BackupRecord['kind'], workspace: Workspace, now: string): Promise<BackupRecord> {
    try {
      const path = await consistentBackup(this.db, this.directory)
      const record: BackupRecord = { id: basename(path, '.sqlite'), kind, createdAt: now, localDate: workspace.calendar ? workspaceDate(workspace.calendar.timezone, now) : null,
        generation: workspace.generation, revision: workspace.revision, size: (await stat(path)).size, sha256: await checksum(path) }
      await atomicJson(join(this.directory, `${record.id}.json`), record)
      this.lastError = null
      await atomicJson(join(this.directory, 'last-result.json'), { error: null })
      return record
    } catch (error) {
      this.lastError = '备份失败，原工作区和已有副本均保留；请检查磁盘空间和目录权限后重试。'
      await atomicJson(join(this.directory, 'last-result.json'), { error: this.lastError }).catch(() => undefined)
      throw error
    }
  }
  async daily(workspace: Workspace, now: string): Promise<void> {
    if (!workspace.backupEnabled || !workspace.calendar || !workspace.setupConfirmedAt) return
    try {
      const date = workspaceDate(workspace.calendar.timezone, now)
      const candidates = (await this.records()).filter(record => record.kind === 'daily' && record.generation === workspace.generation && record.localDate === date)
      let latest: BackupRecord | undefined
      for (const candidate of candidates) { try { await this.verify(candidate); latest = candidate; break } catch { /* 无效副本不阻止同日重试。 */ } }
      latest ??= await this.create('daily', workspace, now)
      const old = (await this.records()).filter(record => record.kind === 'daily' && record.id !== latest.id).slice(workspace.backupRetention - 1)
      for (const record of old) {
        await rm(this.path(record.id))
        await rm(join(this.directory, `${record.id}.json`))
      }
      this.lastError = null
      await atomicJson(join(this.directory, 'last-result.json'), { error: null })
    } catch (error) {
      this.lastError = '备份检查或轮换未完成，现有工作区保持可用；请检查磁盘空间和目录权限后重试。'
      await atomicJson(join(this.directory, 'last-result.json'), { error: this.lastError }).catch(() => undefined)
      throw error
    }
  }
}
