import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { reconcile } from '../../src/main/workspace/reconcile'
import { exportDataset } from '../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../src/domain/import-validation'
import type { CommandInput } from '../../src/shared/contracts/commands'
type Action<T = CommandInput> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
let repo: Repository, now: string
const run = (action: Action) => repo.execute({ ...action, operationId: randomUUID(), generation: repo.store.workspace().generation })
const create = (title = '自动事项', horizon: 'day' | 'month' | 'cycle' | 'later' = 'day') => run({ type: 'create', title, horizon, dueDate: '2026-09-30' }).itemId!
const policy = (horizon: 'day' | 'month' | 'cycle', mode: 'manual' | 'auto') => run({ type: 'policy', horizon, mode, expectedVersion: repo.store.policies().find(p => p.horizon === horizon)!.version })
beforeEach(() => {
  now = '2026-09-10T02:00:00Z'
  const db = openDatabase(':memory:'); migrate(db); repo = new Repository(db, { now: () => now })
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-01-31', confirmed: true })
})
afterEach(() => repo.db.close())
it('长期离线只作一次真实顺延，不改状态/截止/关联，重试不重复', () => {
  const parent = create('目标', 'cycle'), child = create()
  run({ type: 'link', parentId: parent, childId: child, expectedParentVersion: 1, expectedChildVersion: 1 })
  now = '2026-11-03T02:00:00Z'
  const batch = reconcile(repo)!
  expect(batch.undoable).toBe(false)
  expect(repo.store.operation(batch.operationId)!.source).toBe('system')
  expect(repo.store.item(child)).toMatchObject({ dueDate: '2026-09-30', status: 'todo' })
  expect(repo.store.events(child).filter(event => event.type === 'rolled_over')).toHaveLength(1)
  expect(repo.snapshot().rolloverSources[child]).toBe('2026-09-10')
  expect(repo.store.relations()).toHaveLength(1)
  expect(repo.store.item(parent).placement.periodId).toContain('2026-07-31')
  expect(reconcile(repo)).toBeNull()
})
it('开启从当前源周期生效，不清旧积压；再启用记录新边界', () => {
  const old = create('9月旧项', 'month')
  now = '2026-10-15T02:00:00Z'; policy('month', 'auto')
  const current = create('10月', 'month')
  expect(reconcile(repo)).toBeNull()
  now = '2026-11-01T02:00:00Z'; reconcile(repo)
  expect(repo.store.item(old).placement.periodId).toContain('2026-09-01')
  expect(repo.store.item(current).placement.periodId).toContain('2026-11-01')
  expect(repo.snapshot().backlog.month).toBe(1)
  policy('month', 'manual'); policy('month', 'auto')
  expect(repo.store.policies().find(p => p.horizon === 'month')!.effectiveFromPeriodId).toContain('2026-11-01')
  expect(() => policy('cycle', 'auto')).toThrow('固定')
})
it('完成、取消、归档、删除、Later 与 cycle 不自动移动', () => {
  const done = create(), cancelled = create(), archived = create(), deleted = create()
  run({ type: 'status', itemId: done, expectedVersion: 1, status: 'done' }); run({ type: 'status', itemId: cancelled, expectedVersion: 1, status: 'cancelled' })
  run({ type: 'archive', itemId: archived, expectedVersion: 1, archived: true }); run({ type: 'delete', itemId: deleted, expectedVersion: 1 })
  create('稍后', 'later'); create('方向', 'cycle')
  now = '2026-12-10T02:00:00Z'
  expect(reconcile(repo)).toBeNull()
  expect(repo.store.item(done).placement.periodId).toContain('2026-09-10')
})
it('批次在既有当前项后稳定追加，近来源在前；独立撤销保留无关文本和完成状态', () => {
  const older = create('旧')
  now = '2026-09-11T02:00:00Z'; const nearer = create('近')
  now = '2026-09-12T02:00:00Z'; const current = create('当前')
  const batch = reconcile(repo)!
  const target = repo.store.item(current).placement.periodId!
  expect(repo.store.order('day', target).map(item => item.id)).toEqual([current, nearer, older])
  const changed = repo.store.item(older)
  run({ type: 'edit', itemId: older, expectedVersion: changed.version, title: '最新文字', description: '不覆盖', dueDate: changed.dueDate })
  run({ type: 'status', itemId: older, expectedVersion: repo.store.item(older).version, status: 'done' })
  const undone = run({ type: 'undoBatch', originalOperationId: batch.operationId })
  expect(undone.label).toContain('2 项已撤销，0 项跳过')
  expect(repo.store.item(older)).toMatchObject({ title: '最新文字', description: '不覆盖', status: 'done' })
  expect(repo.store.events(older).at(-1)!.before?.status).toBe('done')
  expect(repo.store.events(older).at(-1)!.after.status).toBe('done')
  expect(repo.store.item(nearer).placement.holdPeriodId).toBe(target)
  expect(reconcile(repo)).toBeNull()
  now = '2026-09-13T02:00:00Z'
  expect(reconcile(repo)).not.toBeNull()
})
it('批次部分跳过、不标记失败效果、零成功不伪报完成', () => {
  const a = create('A'), b = create('B', 'month')
  policy('month', 'auto')
  now = '2026-10-11T02:00:00Z'; const batch = reconcile(repo)!
  const item = repo.store.item(b)
  run({ type: 'move', itemId: b, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: 'later' })
  const result = run({ type: 'undoBatch', originalOperationId: batch.operationId })
  expect(result.label).toContain('1 项已撤销，1 项跳过')
  expect(repo.store.item(a).placement.periodId).toContain('2026-09-10')
  expect(repo.store.item(b).placement.horizon).toBe('later')
  const again = run({ type: 'undoBatch', originalOperationId: batch.operationId })
  expect(again.changed).toBe(false); expect(again.warnings).toHaveLength(1)
  expect(repo.db.prepare('SELECT * FROM undo_effects WHERE originalId=?').all(batch.operationId)).toHaveLength(1)
})
it('同日新候选仍会处理；条目还原不解除整库暂停', () => {
  const id = create(); run({ type: 'delete', itemId: id, expectedVersion: 1 })
  now = '2026-09-11T02:00:00Z'; expect(reconcile(repo)).toBeNull()
  const workspace = repo.store.workspace(); workspace.pausedAfterRestore = true; repo.store.saveWorkspace(workspace)
  run({ type: 'restoreItem', itemId: id, expectedVersion: repo.store.item(id).version })
  expect(repo.store.workspace().pausedAfterRestore).toBe(true)
  expect(reconcile(repo)).toBeNull()
  run({ type: 'confirmRollover', confirmed: true })
  expect(reconcile(repo)).not.toBeNull()
})
it('维护与时钟回拨暂停自动处理；人工复核才恢复', () => {
  create()
  now = '2026-09-09T02:00:00Z'; expect(reconcile(repo)).toBeNull()
  expect(repo.store.workspace().clockAnomaly).toBe(true)
  now = '2026-09-11T02:00:00Z'; expect(reconcile(repo)).toBeNull()
  run({ type: 'confirmClock', confirmed: true })
  repo.maintenance = true; expect(reconcile(repo)).toBeNull()
  repo.maintenance = false; expect(reconcile(repo)).not.toBeNull()
})
it('时钟回到日历起点前仍可读取工作区，拒绝错误复核，修正后可继续', () => {
  create()
  now = '2025-12-01T02:00:00Z'; reconcile(repo)
  expect(repo.snapshot().workspace.clockAnomaly).toBe(true)
  expect(repo.snapshot().periods).toHaveLength(4)
  expect(() => run({ type: 'confirmClock', confirmed: true })).toThrow('起点')
  now = '2026-09-09T02:00:00Z'
  const id = create('回拨时仍可手动编辑', 'later')
  now = '2026-09-08T02:00:00Z'
  run({ type: 'status', itemId: id, expectedVersion: 1, status: 'done' })
  run({ type: 'confirmClock', confirmed: true })
  expect(repo.store.workspace().clockAnomaly).toBe(false)
  expect(() => validateImport(exportDataset(repo.store, now), now)).not.toThrow()
})
