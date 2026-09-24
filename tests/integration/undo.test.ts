import { randomUUID } from 'node:crypto'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import type { CommandInput, CommandResult } from '../../src/shared/contracts/commands'
type Action<T = CommandInput> = T extends unknown ? Omit<T, 'generation' | 'operationId'> : never
let repo: Repository, now: string
const run = (action: Action) => repo.execute({ ...action, generation: repo.store.workspace().generation, operationId: randomUUID() })
const item = (id: string) => repo.store.item(id)
const create = (title = '事项', horizon: 'later' | 'cycle' | 'month' | 'week' | 'day' = 'later') => run({ type: 'create', title, horizon })
const status = (id: string, state: 'todo' | 'done' | 'cancelled') => run({ type: 'status', itemId: id, expectedVersion: item(id).version, status: state })
const move = (id: string, horizon: 'later' | 'cycle' | 'month' | 'week' | 'day', beforeId: string | null = null) => run({ type: 'move', itemId: id, expectedVersion: item(id).version, expectedPlacementVersion: item(id).placement.version, horizon, beforeId })
const undo = (result: CommandResult) => run({ type: 'undo', originalOperationId: result.operationId })
const link = (parentId: string, childId: string) => run({ type: 'link', parentId, childId, expectedParentVersion: item(parentId).version, expectedChildVersion: item(childId).version })
const remove = (id: string) => run({ type: 'delete', itemId: id, expectedVersion: item(id).version })
const restore = (id: string, deletionSource: string | null = null) => run({ type: 'restoreItem', itemId: id, expectedVersion: item(id).version, deletionSource })
beforeEach(() => {
  now = '2026-09-23T02:00:00.000Z'
  const db = openDatabase(':memory:'); migrate(db)
  repo = new Repository(db, { now: () => now })
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-01-31', confirmed: true })
})
afterEach(() => repo.db.close())

it('文字编辑不影响状态和非栈顶位置撤销，事件取真实当前状态', () => {
  const id = create().itemId!
  const moved = move(id, 'day'), done = status(id, 'done')
  run({ type: 'edit', itemId: id, expectedVersion: item(id).version, title: '新标题', description: '保留说明', dueDate: '2027-01-01' })
  expect(undo(moved).outcome).toBe('committed')
  const reversed = repo.store.events(id).at(-1)!
  expect(reversed.before?.status).toBe('done'); expect(reversed.after.status).toBe('done')
  expect(item(id).placement.horizon).toBe('later')
  expect(undo(done).outcome).toBe('committed')
  expect(item(id)).toMatchObject({ title: '新标题', description: '保留说明', dueDate: '2027-01-01', status: 'todo' })
})
it('创建→移动→完成可连续逆转，保留不可变回执且版本递增', () => {
  const created = create(), id = created.itemId!
  const moved = move(id, 'day'), completed = status(id, 'done')
  const receipt = repo.store.operation(created.operationId), version = item(id).version
  for (const op of [completed, moved, created]) expect(undo(op).outcome).toBe('committed')
  expect(item(id).deletedAt).not.toBeNull()
  expect(item(id).version).toBeGreaterThan(version)
  expect(repo.store.operation(created.operationId)).toEqual(receipt)
  expect(undo(created).outcome).toBe('conflict_skipped')
})
it('撤销拆解软删除最新文本，定向还原同 ID 和本次初始关系', () => {
  const parent = create('方向', 'month').itemId!
  const created = run({ type: 'create', title: '下一步', horizon: 'week', parentId: parent, expectedParentVersion: item(parent).version })
  const id = created.itemId!
  run({ type: 'edit', itemId: id, expectedVersion: item(id).version, title: '补充后', description: '新增说明', dueDate: null })
  const undone = undo(created)
  expect(undone.restoreSource).toBe(undone.operationId)
  expect(repo.store.relations()).toHaveLength(0)
  expect(restore(id, undone.restoreSource).outcome).toBe('committed')
  expect(item(id)).toMatchObject({ title: '补充后', description: '新增说明', deletedAt: null })
  expect(repo.store.relations()).toHaveLength(1)
  expect(item(parent).deletedAt).toBeNull()
  expect(repo.store.workspace().pausedAfterRestore).toBe(false)
  remove(id)
  expect(() => restore(id, undone.restoreSource)).toThrow('这次删除已失效')
})
it('新增依赖阻止撤销创建；确定冲突无业务改变且不标记已撤销', () => {
  const a = create('A', 'month'), b = create('B', 'day')
  link(a.itemId!, b.itemId!)
  const before = repo.store.items('1'), events = repo.store.events(a.itemId!)
  expect(undo(a).outcome).toBe('conflict_skipped')
  expect(repo.store.items('1')).toEqual(before)
  expect(repo.store.events(a.itemId!)).toEqual(events)
  expect(repo.db.prepare('SELECT * FROM undo_effects WHERE originalId=?').all(a.operationId)).toHaveLength(0)
})
it('归档端点可关联，所有状态独立；解除边不随删除还原复活', () => {
  const a = create('A', 'month').itemId!, b = create('B', 'month').itemId!, c = create('C', 'day').itemId!
  run({ type: 'archive', itemId: a, expectedVersion: item(a).version, archived: true })
  link(a, c); link(b, c)
  status(a, 'done')
  expect(item(c).status).toBe('todo'); expect(item(a).archivedAt).not.toBeNull()
  const edge = repo.store.relations().find(edge => edge.parentId === a)!
  run({ type: 'unlink', relationId: edge.id, expectedParentVersion: item(a).version, expectedChildVersion: item(c).version })
  remove(c); restore(c)
  expect(repo.store.relations().map(edge => edge.parentId)).toEqual([b])
})
it('关联撤销保留无关正文与其他父边，循环冲突整体不写', () => {
  const a = create('A', 'month').itemId!, b = create('B', 'month').itemId!, c = create('C', 'day').itemId!
  const first = link(a, c); link(b, c)
  expect(undo(first).outcome).toBe('committed')
  expect(repo.store.relations().map(edge => edge.parentId)).toEqual([b])
  const edge = repo.store.relations()[0]!
  const unlink = run({ type: 'unlink', relationId: edge.id, expectedParentVersion: item(b).version, expectedChildVersion: item(c).version })
  // Moves are exempt from the horizon rule, so lifting c above b lets the reverse edge close the would-be cycle.
  move(c, 'cycle'); link(c, b)
  const before = repo.store.items('1')
  const conflicted = undo(unlink)
  expect(conflicted).toMatchObject({ outcome: 'conflict_skipped', warnings: ['此关联会形成循环'] })
  expect(repo.store.items('1')).toEqual(before)
})
it('删除和还原可逆，但还原后新增关联阻止逆向删除', () => {
  const a = create('A', 'month').itemId!, b = create('B', 'day').itemId!
  link(a, b)
  const deleted = remove(b)
  expect(undo(deleted).outcome).toBe('committed')
  expect(repo.store.relations()).toHaveLength(1)
  remove(b)
  const restored = restore(b), c = create('C', 'week').itemId!
  link(c, b)
  expect(undo(restored).outcome).toBe('conflict_skipped')
  expect(item(b).deletedAt).toBeNull()
})
it('再次删除来源不同，即使时间相同也不能撤销原删除', () => {
  const id = create().itemId!, first = remove(id)
  restore(id); remove(id)
  expect(undo(first).outcome).toBe('conflict_skipped')
})
it('重开撤销还原真实完成/取消时间，重新取消用新时间', () => {
  const id = create().itemId!
  status(id, 'cancelled'); const cancelledAt = item(id).cancelledAt
  now = '2026-09-24T02:00:00.000Z'
  const reopened = status(id, 'todo')
  undo(reopened)
  expect(item(id).cancelledAt).toBe(cancelledAt)
  status(id, 'todo'); status(id, 'cancelled')
  expect(item(id).cancelledAt).toBe(now)
})
it('任意撤销返回过期 todo 都持久化当前期 hold，manual 也一样', () => {
  const id = create('月计划', 'month').itemId!
  const completed = status(id, 'done')
  now = '2026-10-01T02:00:00.000Z'
  undo(completed)
  expect(item(id).placement.holdPeriodId).toContain('month:2026-10-01')
  expect(repo.snapshot().backlog.month).toBe(1)
  move(id, 'month')
  expect(item(id).placement.holdPeriodId).toBeNull()
})
it('数值排序键压缩不构成冲突，后续依赖顺序改变则拒绝', () => {
  const a = create('A').itemId!, b = create('B').itemId!, c = create('C').itemId!
  const sorted = move(c, 'later', a)
  repo.db.exec('UPDATE item_placements SET sortKey=sortKey*2,version=version+1')
  expect(undo(sorted).outcome).toBe('committed')
  expect(repo.store.order('later', null).map(row => row.id)).toEqual([a, b, c])
  const again = move(c, 'later', a)
  move(b, 'later', a)
  expect(undo(again).outcome).toBe('conflict_skipped')
})
it('撤销响应重试只写一次；磁盘故障回滚且原效果仍可逆', () => {
  const created = create(), id = created.itemId!
  const cmd = { type: 'undo', originalOperationId: created.operationId, operationId: randomUUID(), generation: repo.store.workspace().generation }
  repo.db.exec("CREATE TRIGGER simulate_full BEFORE UPDATE ON items BEGIN SELECT RAISE(ABORT,'disk full'); END")
  expect(() => repo.execute(cmd)).toThrow('disk full')
  expect(item(id).deletedAt).toBeNull()
  repo.db.exec('DROP TRIGGER simulate_full')
  const first = repo.execute(cmd)
  expect(repo.execute(cmd)).toEqual(first)
  expect(repo.store.events(id).filter(event => event.type === 'undo')).toHaveLength(1)
})
