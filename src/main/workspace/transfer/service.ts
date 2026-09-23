/**
 * [INPUT]: 串行 worker 请求、主进程选择的数据、注入时钟和 BackupManager。
 * [OUTPUT]: 可审阅预览→持续维护/保护副本→显式确认→原子替换；取消保留旧运行状态。
 * [POS]: workspace 的整库服务；所有危险动作只依赖本机生成令牌和已验证回执。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { randomUUID } from 'node:crypto'
import { validateImport } from '../../../domain/import-validation'
import { DomainError, type CommandResult } from '../../../shared/contracts/commands'
import { dataActionSchema, type DataReply, type Dataset, type TransferPreview } from '../../../shared/contracts/transfer'
import { BackupManager } from '../../storage/backup/manager'
import { emptyDataset, readSqliteDataset, replaceDataset } from './dataset'
import { reconcile } from '../reconcile'
import type { Repository } from '../repository'

interface Pending { preview: TransferPreview; source: Dataset | null; ready: boolean }
export class WorkspaceService {
  readonly backups: BackupManager
  private pending: Pending | null = null
  private completed = new Map<string, { originalGeneration: string; generation: string }>()
  constructor(readonly repository: Repository, directory: string) { this.backups = new BackupManager(repository.db, directory) }
  async reconcile(): Promise<CommandResult | null> {
    if (this.repository.maintenance) return null
    const now = this.repository.clock.now(), workspace = this.repository.store.workspace()
    try { await this.backups.daily(workspace, now) } catch { /* 日常失败显示状态，但不阻断正常编辑或核对。 */ }
    return reconcile(this.repository, now)
  }
  previewImport(source: unknown, generation: string): DataReply {
    this.guard(generation)
    if (this.repository.maintenance) throw new DomainError('maintenance', '请先完成或取消当前维护')
    let data: Dataset
    try { data = validateImport(source, this.repository.clock.now()) }
    catch (error) { throw new DomainError('invalid', `未导入：${error instanceof Error ? error.message.slice(0, 300) : '文件校验失败'}`) }
    const workspace = this.repository.store.workspace()
    const preview: TransferPreview = { token: randomUUID(), mode: 'restore', generation, revision: workspace.revision, items: data.items.length, relations: data.relations.length, periods: data.periods.length, events: data.events.length, operations: data.operations.length,
      sourceCalendar: data.workspace.calendar, warnings: data.historyMode === 'baseline' ? ['源数据没有历史，将以实际恢复时刻建立历史起点；不会猜测过去状态或完成日期。缺少策略时从恢复当天开始采用默认策略，更早积压仍手动安排。'] : [], backup: null, backupPath: null }
    this.pending = { preview, source: data, ready: false }
    return { type: 'preview', preview }
  }
  async action(input: unknown): Promise<DataReply> {
    const action = dataActionSchema.parse(input)
    if (action.type === 'backupStatus') return { type: 'status', status: await this.backups.status() }
    if (action.type === 'commit') {
      const completed = this.completed.get(action.token)
      if (completed && completed.originalGeneration === action.generation) return { type: 'replaced', generation: completed.generation }
    }
    this.guard(action.generation)
    if (action.type === 'cancel') { this.match(action.token); this.release(); return { type: 'cancelled' } }
    if (action.type === 'commit') return this.commit(action.token)
    if (this.repository.maintenance) throw new DomainError('maintenance', '请先完成或取消当前维护')
    switch (action.type) {
      case 'createBackup': {
        await this.backups.create('manual', this.repository.store.workspace(), this.repository.clock.now())
        return { type: 'status', status: await this.backups.status() }
      }
      case 'previewReset': return this.previewReset()
      case 'previewBackup': {
        const record = (await this.backups.records()).find(record => record.id === action.backupId)
        if (!record) throw new DomainError('invalid', '备份回执不存在')
        await this.backups.verify(record)
        return this.previewImport(await readSqliteDataset(this.backups.path(record.id), this.repository.clock.now()), action.generation)
      }
      case 'prepare': return this.prepare(action.token)
      default: throw new DomainError('invalid', '导入文件必须由原生文件选择器选择')
    }
  }
  private previewReset(): DataReply {
    const store = this.repository.store, workspace = store.workspace()
    const count = (table: string) => Number(store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n)
    const preview: TransferPreview = { token: randomUUID(), mode: 'reset', generation: workspace.generation, revision: workspace.revision,
      items: count('items'), relations: count('item_relations'), periods: count('planning_periods'), events: count('item_events'), operations: count('operations'), sourceCalendar: workspace.calendar, warnings: ['包括已归档和回收站内容；将替换全部周期、日历与工作区设置。现有备份文件保留。'], backup: null, backupPath: null }
    this.pending = { preview, source: null, ready: false }
    return { type: 'preview', preview }
  }
  private async prepare(token: string): Promise<DataReply> {
    const pending = this.match(token)
    // worker 已排空此前接受的写入；从这一刻开始，新业务写入和 reconcile 均被拒绝。
    this.repository.maintenance = true
    try {
      const workspace = this.repository.store.workspace()
      if (pending.preview.mode === 'reset') {
        const current = this.previewReset()
        if (current.type === 'preview') Object.assign(pending.preview, current.preview, { token })
        this.pending = pending
      }
      pending.preview.revision = workspace.revision
      const backup = await this.backups.create('protective', workspace, this.repository.clock.now())
      await this.backups.verify(backup)
      pending.preview.backup = backup
      pending.preview.backupPath = this.backups.path(backup.id)
      pending.ready = true
      return { type: 'preview', preview: pending.preview }
    } catch (error) { this.release(); throw error }
  }
  private async commit(token: string): Promise<DataReply> {
    const pending = this.match(token), current = this.repository.store.workspace()
    if (!pending.ready || !this.repository.maintenance || !pending.preview.backup) throw new DomainError('maintenance', '请先创建并验证保护备份')
    try {
      if (current.revision !== pending.preview.revision || current.generation !== pending.preview.generation) throw new DomainError('conflict', '保护备份后的数据已变化，原工作区保留')
      await this.backups.verify(pending.preview.backup)
      const now = this.repository.clock.now()
      const source = pending.source ?? emptyDataset(this.repository.store, now)
      validateImport(source, now)
      const generation = replaceDataset(this.repository.store, source, pending.preview.mode, now)
      this.completed.set(token, { originalGeneration: current.generation, generation })
      this.release()
      return { type: 'replaced', generation }
    } catch (error) { this.release(); throw error }
  }
  private match(token: string): Pending {
    if (!this.pending || this.pending.preview.token !== token) throw new DomainError('conflict', '预览已失效，请重新开始')
    return this.pending
  }
  private guard(generation: string): void {
    if (generation !== this.repository.store.workspace().generation) throw new DomainError('generation', '工作区已更换，请刷新')
  }
  private release(): void { this.pending = null; this.repository.maintenance = false }
}
