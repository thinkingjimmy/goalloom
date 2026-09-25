import { randomUUID } from 'node:crypto'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'

let repository: Repository
let generation: string
let now = '2026-09-23T02:00:00.000Z'
beforeEach(() => {
  const db = openDatabase(':memory:')
  migrate(db)
  repository = new Repository(db, { now: () => now })
  generation = repository.store.workspace().generation
})
afterEach(() => repository.db.close())
function setup() { repository.execute({ type: 'confirmSetup', operationId: randomUUID(), generation, timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-01-31', confirmed: true }) }
function create(title: string, horizon = 'later') {
  const result = repository.execute({ type: 'create', operationId: randomUUID(), generation, title, horizon })
  return repository.store.item(result.itemId!)
}
function link(parentId: string, childId: string) { return repository.execute({ type: 'link', operationId: randomUUID(), generation, parentId, childId, expectedParentVersion: repository.store.item(parentId).version, expectedChildVersion: repository.store.item(childId).version }) }

it('显式确认之前拒绝任何条目写入；确认后日历不可改', () => {
  expect(() => create('未确认')).toThrow('请先确认')
  setup()
  expect(repository.store.workspace().calendar?.cycleAnchor).toBe('2026-01-31')
  expect(repository.snapshot().periods.find(p => p.horizon === 'cycle')?.startDate).toBe('2026-07-31')
  expect(() => setup()).toThrow('日历已锁定')
})
it('多父 DAG 允许两个上级，拒绝自关联、重复关系和循环；状态不联动', () => {
  setup()
  const a = create('A', 'cycle'), b = create('B', 'month'), c = create('C', 'day')
  link(a.id, c.id); link(b.id, c.id)
  expect(repository.store.relations()).toHaveLength(2)
  expect(() => link(a.id, c.id)).toThrow('已经关联')
  // Horizon rule runs first: a self-link is same-horizon and a new cycle needs a reverse-horizon edge.
  expect(() => link(a.id, a.id)).toThrow('周期更长')
  expect(() => link(c.id, a.id)).toThrow('周期更长')
  expect(repository.store.relations()).toHaveLength(2)
  expect(repository.store.item(c.id).status).toBe('todo')
  expect(repository.store.item(c.id).placement.horizon).toBe('day')
})
it('新建关联：Later 端点与同列/反向周期均拒绝；已有关联随移动保留', () => {
  setup()
  const later = create('暂存'), month = create('月目标', 'month'), week = create('周任务', 'week'), day = create('今日', 'day'), sibling = create('另一日', 'day')
  expect(() => link(later.id, day.id)).toThrow('Later 是暂存区')
  expect(() => link(month.id, later.id)).toThrow('Later 是暂存区')
  expect(() => link(day.id, sibling.id)).toThrow('周期更长')
  expect(() => link(day.id, week.id)).toThrow('周期更长')
  expect(repository.store.relations()).toHaveLength(0)
  link(month.id, day.id)
  const parent = repository.store.item(month.id)
  repository.execute({ type: 'move', operationId: randomUUID(), generation, itemId: parent.id, expectedVersion: parent.version, expectedPlacementVersion: parent.placement.version, horizon: 'later' })
  expect(repository.store.item(month.id).placement.horizon).toBe('later')
  expect(repository.store.relations().filter(edge => edge.invalidatedAt === null).map(edge => [edge.parentId, edge.childId])).toEqual([[month.id, day.id]])
})
it('拆解、流程颜色与计划同样遵守周期规则：同列上级与 Later 流程根均拒绝且不写入', () => {
  setup()
  const month = create('月目标', 'month'), later = create('暂存')
  const count = () => repository.store.items('1').length, before = count()
  expect(() => repository.execute({ type: 'create', operationId: randomUUID(), generation, title: '同列拆解', horizon: 'month', parentId: month.id, expectedParentVersion: month.version })).toThrow('周期更长')
  expect(() => repository.execute({ type: 'create', operationId: randomUUID(), generation, title: 'Later 流程', horizon: 'later', flowColor: 1 })).toThrow('暂存区')
  expect(() => repository.execute({ type: 'flowColor', operationId: randomUUID(), generation, itemId: later.id, expectedVersion: later.version, flowColor: 1 })).toThrow('暂存区')
  const monthPeriod = repository.snapshot().periods.find(period => period.horizon === 'month')!.id
  const draft = (title: string, parentRefs: { kind: 'existing', itemId: string, expectedVersion: number }[]) => ({ draftId: 'a', title, description: '', dueDate: null, horizon: 'month' as const, previewPeriodId: monthPeriod, parentRefs, flowColor: null })
  expect(() => repository.execute({ type: 'createPlan', operationId: randomUUID(), generation, items: [draft('同列计划', [{ kind: 'existing', itemId: month.id, expectedVersion: month.version }])] })).toThrow('周期更长')
  expect(count()).toBe(before)
  expect(repository.store.relations()).toHaveLength(0)
  expect(repository.store.item(later.id).flowColor).toBeNull()
})
it('数据库约束独立防环和重复有效父子对', () => {
  setup()
  const a = create('A'), b = create('B')
  const edge = { id: randomUUID(), parentId: a.id, childId: b.id, invalidatedAt: null, invalidatedBy: null, reason: null, createdAt: now }
  repository.store.saveRelation(edge)
  expect(() => repository.store.saveRelation({ ...edge, id: randomUUID() })).toThrow()
  expect(() => repository.store.saveRelation({ ...edge, id: randomUUID(), parentId: b.id, childId: a.id })).toThrow('relation cycle')
})
it('中文短词和 %/_ 按字面搜索，不展示删除项', () => {
  setup()
  create('复盘 100%_完成')
  create('1000完成')
  const list = (query: string) => repository.list({ type: 'list', view: 'search', query, offset: 0, limit: 50 })
  expect(list('复').total).toBe(1)
  expect(list('复盘').total).toBe(1)
  expect(list('%_').total).toBe(1)
  expect(list('').total).toBe(0)
})
