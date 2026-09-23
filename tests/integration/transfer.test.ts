import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { WorkspaceService } from '../../src/main/workspace/transfer/service'
import { exportDataset, readSqliteDataset } from '../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../src/domain/import-validation'
import type { CommandInput } from '../../src/shared/contracts/commands'
import type { DataReply } from '../../src/shared/contracts/transfer'

type Action<T = CommandInput> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
let repo: Repository, service: WorkspaceService, directory: string, now: string
const generation = () => repo.store.workspace().generation
const run = (command: Action) => repo.execute({ ...command, operationId: randomUUID(), generation: generation() })
const create = (title = '恢复数据') => run({ type: 'create', title, horizon: 'later' })
function preview(reply: DataReply) { if (reply.type !== 'preview') throw new Error('expected preview'); return reply.preview }
const resetPreview = async () => preview(await service.action({ type: 'previewReset', generation: generation() }))
const prepare = (token: string) => service.action({ type: 'prepare', generation: generation(), token })
const commit = (token: string) => service.action({ type: 'commit', generation: generation(), token, acknowledged: true })
beforeEach(async () => {
  now = '2026-09-23T02:00:00.000Z'
  directory = await mkdtemp(join(tmpdir(), 'Goalloom 恢复测试 '))
  const db = openDatabase(join(directory, 'workspace.sqlite')); migrate(db)
  repo = new Repository(db, { now: () => now }); service = new WorkspaceService(repo, join(directory, 'backups'))
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-01-31', confirmed: true })
})
afterEach(async () => { vi.restoreAllMocks(); repo.db.close(); await rm(directory, { force: true, recursive: true }) })
it('完整 JSON 校验允许无关编辑/关系/排序版本跳号与非栈顶撤销后的真实链', () => {
  const a = create('A'), b = create('B')
  run({ type: 'link', parentId: a.itemId!, childId: b.itemId!, expectedParentVersion: 1, expectedChildVersion: 1 })
  const item = repo.store.item(b.itemId!)
  const moved = run({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: 'day' })
  run({ type: 'status', itemId: item.id, expectedVersion: repo.store.item(item.id).version, status: 'done' })
  run({ type: 'edit', itemId: item.id, expectedVersion: repo.store.item(item.id).version, title: '后来编辑', description: '文本保留', dueDate: null })
  run({ type: 'undo', originalOperationId: moved.operationId })
  expect(() => validateImport(exportDataset(repo.store, now), now)).not.toThrow()
})
it('拒绝未知 schema、额外路径、非法日期/图/重复引用和断裂业务链', () => {
  const a = create('A'), b = create('B')
  run({ type: 'status', itemId: a.itemId!, expectedVersion: 1, status: 'cancelled' })
  const source = exportDataset(repo.store, now)
  const variants: unknown[] = [
    { ...source, schemaVersion: 999 }, { ...source, backupDirectory: '/arbitrary' },
    { ...source, placements: [...source.placements, source.placements[0]] },
    { ...source, periods: source.periods.map((p, i) => i ? p : { ...p, endDate: '2026-02-30' }) },
    { ...source, events: source.events.map((event, index) => index === 2 ? { ...event, before: { ...event.before!, cancelledAt: now } } : event) },
    { ...source, relations: [{ id: randomUUID(), parentId: a.itemId, childId: b.itemId, invalidatedAt: null, invalidatedBy: null, reason: null, createdAt: now }, { id: randomUUID(), parentId: b.itemId, childId: a.itemId, invalidatedAt: null, invalidatedBy: null, reason: null, createdAt: now }] },
  ]
  for (const variant of variants) expect(() => validateImport(variant, now)).toThrow()
  expect(repo.store.items('1')).toHaveLength(2)
})
it('重置从准备起维护，必须主动确认；取消恢复原运行/暂停状态且保留保护副本', async () => {
  create()
  const workspace = repo.store.workspace(); workspace.pausedAfterRestore = true; repo.store.saveWorkspace(workspace)
  const initial = await resetPreview(), prepared = preview(await prepare(initial.token))
  expect(prepared.backup).not.toBeNull(); expect(repo.maintenance).toBe(true)
  expect(() => create('被阻止')).toThrow('保护工作区')
  expect(await service.reconcile()).toBeNull()
  await expect(service.action({ type: 'commit', generation: generation(), token: initial.token, acknowledged: false })).rejects.toThrow()
  expect(repo.store.items('1')).toHaveLength(1)
  await service.action({ type: 'cancel', generation: generation(), token: initial.token })
  expect(repo.maintenance).toBe(false); expect(repo.store.workspace().pausedAfterRestore).toBe(true)
  expect(await service.backups.records()).toHaveLength(1)
})
it('重置成功原子回配置、保留主题/备份、拒绝旧代次，重复提交返回同一结果', async () => {
  create(); run({ type: 'preferences', theme: 'dark' })
  const old = generation(), initial = await resetPreview()
  await prepare(initial.token)
  const result = await commit(initial.token)
  expect(generation()).not.toBe(old)
  expect(repo.store.workspace()).toMatchObject({ calendar: null, setupConfirmedAt: null, pausedAfterRestore: false, theme: 'dark' })
  expect(repo.store.items('1')).toHaveLength(0)
  expect(await service.backups.records()).toHaveLength(1)
  expect(() => repo.execute({ type: 'create', title: '旧请求', horizon: 'later', generation: old, operationId: randomUUID() })).toThrow('工作区已更换')
  expect(await service.action({ type: 'commit', generation: old, token: initial.token, acknowledged: true })).toEqual(result)
  expect(() => create()).toThrow('请先确认')
})
it('恢复采用源日历/身份/历史并设置暂停；旧源代次不复用，条目还原不清暂停', async () => {
  const created = create(), id = created.itemId!
  run({ type: 'delete', itemId: id, expectedVersion: 1 })
  const source = exportDataset(repo.store, now), old = generation()
  create('后来数据')
  const initial = preview(service.previewImport(source, generation()))
  await prepare(initial.token); await commit(initial.token)
  expect(generation()).not.toBe(old)
  expect(repo.store.items('1')).toHaveLength(1)
  expect(repo.store.workspace().calendar).toEqual(source.workspace.calendar)
  expect(repo.store.workspace().pausedAfterRestore).toBe(true)
  run({ type: 'restoreItem', itemId: id, expectedVersion: repo.store.item(id).version })
  expect(repo.store.workspace().pausedAfterRestore).toBe(true)
  expect(() => validateImport(exportDataset(repo.store, now), now)).not.toThrow()
})
it('保护备份失败不进入最终确认，原工作区不替换且退出维护', async () => {
  create(); const before = exportDataset(repo.store, now), initial = await resetPreview()
  vi.spyOn(service.backups, 'create').mockRejectedValueOnce(new Error('disk full'))
  await expect(prepare(initial.token)).rejects.toThrow('disk full')
  expect(repo.maintenance).toBe(false)
  expect(exportDataset(repo.store, now)).toEqual(before)
  await expect(commit(initial.token)).rejects.toThrow('预览已失效')
})
it('保护副本被破坏或数据库替换失败，旧数据和设置完整回滚', async () => {
  create(); const source = exportDataset(repo.store, now), before = exportDataset(repo.store, now)
  let initial = preview(service.previewImport(source, generation()))
  const ready = preview(await prepare(initial.token))
  await writeFile(ready.backupPath!, 'corrupt')
  await expect(commit(initial.token)).rejects.toThrow('不一致')
  expect(exportDataset(repo.store, now)).toEqual(before)
  expect(repo.maintenance).toBe(false)
  initial = preview(service.previewImport(source, generation())); await prepare(initial.token)
  repo.db.exec("CREATE TRIGGER fail_replace BEFORE INSERT ON items BEGIN SELECT RAISE(ABORT,'disk write failed'); END")
  await expect(commit(initial.token)).rejects.toThrow('disk write failed')
  expect(exportDataset(repo.store, now)).toEqual(before)
  expect(repo.maintenance).toBe(false)
})
it('SQLite 备份实际恢复完整业务；保护回执在重置后仍可检索', async () => {
  const id = create().itemId!
  const initial = await resetPreview(), ready = preview(await prepare(initial.token))
  const loaded = await readSqliteDataset(ready.backupPath!, now)
  expect(loaded.items[0]!.id).toBe(id)
  await commit(initial.token)
  const restoring = preview(await service.action({ type: 'previewBackup', generation: generation(), backupId: ready.backup!.id }))
  await prepare(restoring.token); await commit(restoring.token)
  expect(repo.store.item(id).title).toBe('恢复数据')
  expect(repo.store.workspace().pausedAfterRestore).toBe(true)
  expect((await service.backups.records()).filter(record => record.kind === 'protective')).toHaveLength(2)
})
it('日常备份同日去重、跨日先新副本后轮换，只轮换日常文件', async () => {
  create()
  const workspace = repo.store.workspace(); workspace.backupRetention = 2; repo.store.saveWorkspace(workspace)
  await service.backups.create('protective', workspace, now)
  await service.backups.create('manual', workspace, now)
  await service.backups.daily(workspace, now); await service.backups.daily(workspace, now)
  expect(await service.backups.records()).toHaveLength(3)
  for (const date of ['2026-09-24T02:00:00Z', '2026-09-25T02:00:00Z']) await service.backups.daily(workspace, date)
  const records = await service.backups.records()
  expect(records.filter(record => record.kind === 'daily')).toHaveLength(2)
  expect(records.filter(record => record.kind !== 'daily')).toHaveLength(2)
  for (const record of records) await expect(service.backups.verify(record)).resolves.toBeUndefined()
})
it('无历史旧数据只建真实导入时刻 baseline，未知日期保持未知', async () => {
  create()
  const source = exportDataset(repo.store, now)
  source.historyMode = 'baseline'; source.events = []; source.operations = []; source.undoEffects = []
  source.items[0]!.status = 'done'; source.items[0]!.completedAt = null
  const initial = preview(service.previewImport(source, generation()))
  expect(initial.warnings).toHaveLength(1)
  await prepare(initial.token); await commit(initial.token)
  const item = repo.store.items('1')[0]!, events = repo.store.events(item.id)
  expect(events).toHaveLength(1); expect(events[0]).toMatchObject({ at: now, type: 'baseline', before: null })
  expect(item.completedAt).toBeNull()
  expect(() => validateImport(exportDataset(repo.store, now), now)).not.toThrow()
})
it('无历史旧数据缺策略时只从恢复当前周期开始，不清更早积压', async () => {
  run({ type: 'create', title: '旧日事项', horizon: 'day' })
  const source = exportDataset(repo.store, now)
  source.historyMode = 'baseline'; source.events = []; source.operations = []; source.undoEffects = []; source.policies = []
  now = '2026-09-25T02:00:00.000Z'
  const initial = preview(service.previewImport(source, generation()))
  await prepare(initial.token); await commit(initial.token)
  run({ type: 'confirmRollover', confirmed: true })
  expect(await service.reconcile()).toBeNull()
  expect(repo.snapshot().backlog.day).toBe(1)
  expect(repo.store.policies().find(policy => policy.horizon === 'day')!.effectiveFromPeriodId).toContain('2026-09-25')
})
it('日常备份失败仍可编辑和核对，损坏副本不会禁止同日重试', async () => {
  const workspace = repo.store.workspace()
  await service.backups.daily(workspace, now)
  const first = (await service.backups.records())[0]!
  await writeFile(service.backups.path(first.id), 'broken')
  await service.backups.daily(workspace, now)
  expect(await service.backups.records()).toHaveLength(2)
  now = '2026-09-24T02:00:00.000Z'
  vi.spyOn(service.backups, 'create').mockRejectedValueOnce(new Error('disk full'))
  await expect(service.reconcile()).resolves.toBeNull()
  expect(service.backups.lastError).toContain('保持可用')
  expect(create().changed).toBe(true)
})
