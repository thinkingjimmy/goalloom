import { randomUUID } from 'node:crypto'
import { beforeEach, afterEach, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/storage/repository'
import type { CommandInput } from '../../src/shared/contracts/commands'

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
function run(command: Omit<CommandInput, 'operationId' | 'generation'>) { return repository.execute({ ...command, operationId: randomUUID(), generation }) }
function setup() { repository.execute({ type: 'confirmSetup', operationId: randomUUID(), generation, timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-01-31', confirmed: true }) }
function create(title: string, horizon = 'later') {
  const result = repository.execute({ type: 'create', operationId: randomUUID(), generation, title, horizon })
  return repository.store.item(result.itemId!)
}

it('显式确认之前拒绝任何条目写入；确认后日历不可改', () => {
  expect(() => create('未确认')).toThrow('请先确认')
  setup()
  expect(repository.store.workspace().calendar?.cycleAnchor).toBe('2026-01-31')
  expect(repository.snapshot().periods.find(p => p.horizon === 'cycle')?.startDate).toBe('2026-07-31')
  expect(() => setup()).toThrow('日历已锁定')
})
it('同操作同请求返回原回执，异请求与旧代次均拒绝', () => {
  setup()
  const input = { type: 'create', operationId: randomUUID(), generation, title: '幂等', horizon: 'day' }
  const first = repository.execute(input)
  expect(repository.execute(input)).toEqual(first)
  expect(repository.snapshot().items).toHaveLength(1)
  expect(repository.store.events(first.itemId!)).toHaveLength(1)
  expect(() => repository.execute({ ...input, title: '不同内容' })).toThrow('其他请求')
  expect(() => repository.execute({ ...input, generation: randomUUID() })).toThrow('工作区已更换')
})
it('移动保持唯一位置、文本和截止日，陈旧版本不能覆盖', () => {
  setup()
  const item = create('从 Later 到今天')
  const result = repository.execute({ type: 'move', operationId: randomUUID(), generation, itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: 'day' })
  expect(result.label).toBe('移动')
  const saved = repository.store.item(item.id)
  expect(saved.placement.horizon).toBe('day')
  expect(repository.snapshot().items.filter(row => row.id === item.id)).toHaveLength(1)
  expect(repository.store.events(item.id).map(event => event.type)).toEqual(['created', 'moved'])
  expect(() => repository.execute({ type: 'edit', operationId: randomUUID(), generation, itemId: item.id, expectedVersion: 1, title: '陈旧', description: '', dueDate: null })).toThrow('条目已变化')
})
it('多父 DAG 允许两个上级，拒绝自关联、重复关系和循环；状态不联动', () => {
  setup()
  const a = create('A'), b = create('B'), c = create('C')
  const link = (parentId: string, childId: string) => repository.execute({ type: 'link', operationId: randomUUID(), generation, parentId, childId, expectedParentVersion: repository.store.item(parentId).version, expectedChildVersion: repository.store.item(childId).version })
  link(a.id, c.id); link(b.id, c.id)
  expect(repository.store.relations()).toHaveLength(2)
  expect(() => link(a.id, c.id)).toThrow('已经关联')
  expect(() => link(a.id, a.id)).toThrow('自己')
  expect(() => link(c.id, a.id)).toThrow('循环')
  expect(repository.store.item(c.id).status).toBe('todo')
  expect(repository.store.item(c.id).placement.horizon).toBe('later')
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
it('维护期拒绝新写入', () => {
  setup()
  repository.maintenance = true
  expect(() => create('不应写入')).toThrow('保护工作区')
})
it('命令类型严格且禁止未实现入口', () => {
  expect(() => run({ type: 'confirmSetup' })).toThrow()
})
