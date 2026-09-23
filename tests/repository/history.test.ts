import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { Repository } from '../../src/main/storage/repository'
import { migrate } from '../../src/main/storage/schema'
import { readHistory, readActivity } from '../../src/main/storage/history'
import type { CommandInput } from '../../src/shared/contracts/commands'
type Action<T = CommandInput> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
let repo: Repository, now: string
const run = (command: Action) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation })
const create = (horizon: 'month' | 'day' | 'later' = 'month') => run({ type: 'create', title: '旧计划', horizon }).itemId!
const state = (id: string, status: 'todo' | 'done' | 'cancelled') => run({ type: 'status', itemId: id, expectedVersion: repo.store.item(id).version, status })
const move = (id: string, horizon: 'month' | 'day' | 'later') => { const item = repo.store.item(id); return run({ type: 'move', itemId: id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon }) }
const month = (startDate: string) => readHistory(repo.store, { type: 'history', horizon: 'month', startDate, offset: 0, limit: 50 }, now)
beforeEach(() => {
  now = '2026-09-10T02:00:00Z'
  const db = openDatabase(':memory:'); migrate(db); repo = new Repository(db, { now: () => now })
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-01-31', confirmed: true })
})
afterEach(() => repo.db.close())
it('9 月计划在 10 月顺延并完成：期末未完、后来结果和真实 10 月成员分开', () => {
  const id = create()
  now = '2026-10-03T02:00:00Z'; move(id, 'month'); state(id, 'done')
  const history = month('2026-09-01')
  expect(history.total).toBe(1)
  expect(history.rows[0]!.endState?.status).toBe('todo')
  expect(history.rows[0]!.later.map(event => event.type)).toEqual(['rolled_over', 'status_changed'])
  now = '2026-11-01T02:00:00Z'
  expect(month('2026-10-01').rows[0]!.endState?.status).toBe('done')
})
it('旧项直接完成不制造新月计划，日项不隐式属于月历史', () => {
  const id = create(); create('day')
  now = '2026-10-02T02:00:00Z'; state(id, 'done')
  expect(month('2026-09-01').total).toBe(1)
  expect(month('2026-09-01').rows[0]!.endState?.status).toBe('todo')
  now = '2026-11-01T02:00:00Z'
  expect(month('2026-10-01').total).toBe(0)
})
it('9 月完成 10 月重开、取消后重开再取消保留真实期末与原事件', () => {
  const done = create(), cancelled = create()
  state(done, 'done'); state(cancelled, 'cancelled')
  const cancelledAt = repo.store.item(cancelled).cancelledAt
  now = '2026-10-01T00:00:00Z'
  state(done, 'todo'); state(cancelled, 'todo'); state(cancelled, 'cancelled')
  const rows = month('2026-09-01').rows
  expect(rows.find(row => row.item.id === done)!.endState?.status).toBe('done')
  expect(rows.find(row => row.item.id === cancelled)!.endState?.cancelledAt).toBe(cancelledAt)
  expect(repo.store.item(cancelled).cancelledAt).toBe(now)
})
it('同周期往返成员去重，后来归档/删除/还原/撤销不覆盖期末', () => {
  const id = create(); move(id, 'later'); move(id, 'month')
  now = '2026-10-01T02:00:00Z'
  run({ type: 'archive', itemId: id, expectedVersion: repo.store.item(id).version, archived: true })
  const deleted = run({ type: 'delete', itemId: id, expectedVersion: repo.store.item(id).version })
  run({ type: 'undo', originalOperationId: deleted.operationId })
  const history = month('2026-09-01')
  expect(history.total).toBe(1)
  expect(history.rows[0]!.endState).toMatchObject({ status: 'todo', archivedAt: null, deletedAt: null })
})
it('边界时刻归下一周期；空周期/起点读取不写库，不允许未来', () => {
  const id = create()
  now = '2026-09-30T16:00:00Z'; state(id, 'done')
  expect(month('2026-09-01').rows[0]!.endState?.status).toBe('todo')
  const periods = repo.store.periods(), revision = repo.store.workspace().revision
  expect(month('2026-08-01').total).toBe(0)
  expect(repo.store.periods()).toEqual(periods); expect(repo.store.workspace().revision).toBe(revision)
  expect(() => month('2026-10-01')).toThrow('已结束')
  const first = readHistory(repo.store, { type: 'history', horizon: 'cycle', startDate: '2026-01-31', offset: 0, limit: 50 }, now)
  expect(first.previous).toBeNull()
})
it('时钟回拨不虚构期末，活动同一时刻以 seq 为序可分页', () => {
  const id = create(); state(id, 'done')
  now = '2026-09-09T02:00:00Z'; state(id, 'todo')
  expect(repo.store.workspace().clockAnomaly).toBe(true)
  now = '2026-10-02T02:00:00Z'
  expect(month('2026-09-01').rows[0]!.endState).toBeNull()
  const page = readActivity(repo.store, { type: 'activity', itemId: id, limit: 2 })
  expect(page.more).toBe(true); expect(page.events[0]!.seq).toBeGreaterThan(page.events[1]!.seq)
  expect(readActivity(repo.store, { type: 'activity', itemId: id, beforeSeq: page.events.at(-1)!.seq, limit: 2 }).events).toHaveLength(1)
})
it('往期入口独立于策略，批量安排当前或 Later 可整步撤销并保留 hold', () => {
  const a = create(), b = create(); const excluded = create(); state(excluded, 'cancelled')
  now = '2026-10-05T02:00:00Z'
  expect(repo.snapshot().backlog.month).toBe(2)
  const items = [a, b].map(id => { const item = repo.store.item(id); return { itemId: id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version } })
  const arranged = run({ type: 'arrangeBacklog', horizon: 'later', items })
  expect(repo.snapshot().backlog.month).toBeUndefined()
  expect(run({ type: 'undo', originalOperationId: arranged.operationId }).outcome).toBe('committed')
  expect(repo.snapshot().backlog.month).toBe(2)
  expect(repo.store.item(a).placement.holdPeriodId).toContain('month:2026-10-01')
  expect(repo.store.item(b).placement.holdPeriodId).toContain('month:2026-10-01')
})
it('批量安排遇到陈旧或不属于往期的项整体回滚', () => {
  const a = create(), b = create()
  now = '2026-10-05T02:00:00Z'
  const selected = [a, b].map(id => ({ itemId: id, expectedVersion: 1, expectedPlacementVersion: 1 }))
  state(b, 'done')
  expect(() => run({ type: 'arrangeBacklog', horizon: 'month', items: selected })).toThrow('条目已变化')
  expect(repo.store.item(a).placement.periodId).toContain('2026-09-01')
})
