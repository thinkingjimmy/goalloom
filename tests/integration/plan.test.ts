import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Store } from '../../src/main/storage/store'
import { Repository } from '../../src/main/workspace/repository'
import { WorkspaceService } from '../../src/main/workspace/transfer/service'
import { exportDataset } from '../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../src/domain/import-validation'
import type { CommandInput, CommandResult, ParentRef } from '../../src/shared/contracts/commands'
import type { Dataset, DataReply } from '../../src/shared/contracts/transfer'
import type { ItemHorizon } from '../../src/shared/contracts/entities'

type Action<T = CommandInput> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
interface Draft { draftId: string; title: string; horizon?: ItemHorizon; parents?: ParentRef[]; flowColor?: number | null }
let repo: Repository, service: WorkspaceService, directory: string, now: string
const generation = () => repo.store.workspace().generation
const run = (command: Action, operationId = randomUUID()) => repo.execute({ ...command, operationId, generation: generation() })
const item = (id: string) => repo.store.item(id)
const create = (title: string, flowColor: number | null = null) => run({ type: 'create', title, horizon: 'later', flowColor }).itemId!
const existing = (id: string): ParentRef => ({ kind: 'existing', itemId: id, expectedVersion: item(id).version })
const draft = (draftId: string): ParentRef => ({ kind: 'draft', draftId })
const periodOf = (horizon: ItemHorizon) => horizon === 'later' ? null : repo.snapshot().periods.find(period => period.horizon === horizon)!.id
const planCommand = (drafts: Draft[]): Action => ({ type: 'createPlan', items: drafts.map(row => ({ draftId: row.draftId, title: row.title, description: '', dueDate: null, horizon: row.horizon ?? 'later', previewPeriodId: periodOf(row.horizon ?? 'later'), parentRefs: row.parents ?? [], flowColor: row.flowColor ?? null })) })
const plan = (drafts: Draft[]) => run(planCommand(drafts))
const undo = (result: CommandResult) => run({ type: 'undo', originalOperationId: result.operationId })
const exported = () => exportDataset(repo.store, now)
const valid = () => expect(() => validateImport(exported(), now)).not.toThrow()
const edgesOf = (childId: string) => repo.store.relations().filter(edge => edge.childId === childId)
function preview(reply: DataReply) { if (reply.type !== 'preview') throw new Error('expected preview'); return reply.preview }
async function restore(source: unknown): Promise<string> {
  const token = preview(service.previewImport(source, generation())).token
  await service.action({ type: 'prepare', generation: generation(), token })
  const reply = await service.action({ type: 'commit', generation: generation(), token, acknowledged: true })
  if (reply.type !== 'replaced') throw new Error('expected replacement')
  return reply.generation
}
const diamond = (goal: string) => plan([
  { draftId: 'A', title: 'A 方向', horizon: 'month', parents: [existing(goal)] },
  { draftId: 'D', title: 'D 汇合', horizon: 'day', parents: [draft('B'), draft('C')] },
  { draftId: 'B', title: 'B 分支', horizon: 'week', parents: [draft('A')] },
  { draftId: 'C', title: 'C 分支', parents: [draft('A')] },
])

beforeEach(async () => {
  now = '2026-09-23T02:00:00.000Z'
  directory = await mkdtemp(join(tmpdir(), 'Goalloom 计划测试 '))
  const db = openDatabase(join(directory, 'workspace.sqlite')); migrate(db)
  repo = new Repository(db, { now: () => now }); service = new WorkspaceService(repo, join(directory, 'backups'))
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-07-01', confirmed: true })
})
afterEach(async () => { vi.restoreAllMocks(); repo.db.close(); await rm(directory, { force: true, recursive: true }) })

it('菱形计划：每项一个 create、入边归下级、拓扑写入与逆拓扑撤销，同代次闭环可导出校验', () => {
  const goal = create('官网改版', 2)
  const created = diamond(goal)
  const operation = repo.store.operation(created.operationId)!
  const [a, b, c, d] = created.itemIds!
  expect(operation.effects.map(effect => effect.itemId)).toEqual([a, b, c, d])
  expect(operation.effects.every(effect => effect.kind === 'create')).toBe(true)
  expect(item(a!).title).toBe('A 方向'); expect(item(d!).title).toBe('D 汇合')
  expect(created).toMatchObject({ itemId: null, undoable: true, label: '创建 4 个事项' })
  const owned = operation.effects.map(effect => effect.kind === 'create' ? effect.initialRelations : [])
  expect(owned.map(ids => ids.length)).toEqual([1, 1, 1, 2])
  expect(owned.flat().every((id, _, all) => all.indexOf(id) === all.lastIndexOf(id))).toBe(true)
  expect(edgesOf(d!).map(edge => edge.parentId).sort()).toEqual([b, c].sort())
  expect(repo.store.events(a!)[0]).toMatchObject({ type: 'created', before: null })
  expect(item(d!).placement.horizon).toBe('day')
  valid()
  const undone = undo(created)
  expect(undone).toMatchObject({ outcome: 'committed', itemIds: [a, b, c, d], itemId: null, restoreSource: undone.operationId })
  expect([a, b, c, d].every(id => item(id!).deletedBy === undone.operationId)).toBe(true)
  expect(repo.store.relations().filter(edge => edge.childId !== goal && [a, b, c, d].includes(edge.childId))).toHaveLength(0)
  expect(item(goal).deletedAt).toBeNull()
  const markers = repo.db.prepare('SELECT effectIndex FROM undo_effects WHERE originalId=? ORDER BY effectIndex').all(created.operationId).map(row => Number(row.effectIndex))
  expect(markers).toEqual([0, 1, 2, 3])
  valid()
  // 先子后父：D 的入边在父仍删除时保持原失效来源；父还原后恢复。
  for (const id of [d, b]) run({ type: 'restoreItem', itemId: id!, expectedVersion: item(id!).version, deletionSource: undone.operationId })
  expect(edgesOf(d!)).toHaveLength(1)
  for (const id of [a, c]) run({ type: 'restoreItem', itemId: id!, expectedVersion: item(id!).version, deletionSource: undone.operationId })
  expect(edgesOf(d!)).toHaveLength(2)
  expect(edgesOf(b!)).toHaveLength(1); expect(edgesOf(c!)).toHaveLength(1); expect(edgesOf(a!)).toHaveLength(1)
  valid()
})

it('先父后子还原复用删除来源，重试另一端合法边', () => {
  const goal = create('目标')
  const created = diamond(goal), undone = undo(created)
  for (const id of created.itemIds!) run({ type: 'restoreItem', itemId: id, expectedVersion: item(id).version, deletionSource: undone.operationId })
  expect(edgesOf(created.itemIds![3]!)).toHaveLength(2)
  expect(edgesOf(created.itemIds![0]!).map(edge => edge.parentId)).toEqual([goal])
  valid()
})

it('多子项引用同一既有父：写入前去重验版本，自身 touch 不制造冲突；外部变化全批 stale', () => {
  const parent = create('同一上级'), version = item(parent).version
  const ok = plan([{ draftId: 'x', title: '子一', parents: [existing(parent)] }, { draftId: 'y', title: '子二', parents: [existing(parent)] }])
  expect(ok.itemIds).toHaveLength(2)
  expect(item(parent).version).toBe(version + 1)
  const before = repo.store.items('1').length
  const stale: ParentRef = { kind: 'existing', itemId: parent, expectedVersion: version }
  expect(() => plan([{ draftId: 'x', title: '过期', parents: [stale] }])).toThrow('条目已变化')
  expect(() => plan([{ draftId: 'x', title: '矛盾', parents: [existing(parent)] }, { draftId: 'y', title: '矛盾二', parents: [stale] }])).toThrow('版本依据不一致')
  expect(() => plan([{ draftId: 'x', title: '自环', parents: [draft('x')] }])).toThrow('自己')
  expect(() => plan([{ draftId: 'x', title: '环', parents: [draft('y')] }, { draftId: 'y', title: '环二', parents: [draft('x')] }])).toThrow('循环')
  expect(repo.store.items('1')).toHaveLength(before)
})

it('手动新流程：色互斥、有上级不能设色、提交时已被占用拒绝；无色计划仍可见', () => {
  create('已有流程', 1)
  const coloured = plan([{ draftId: 'r', title: '新流程', flowColor: 3 }, { draftId: 'k', title: '下级', parents: [draft('r')] }])
  expect(item(coloured.itemIds![0]!).flowColor).toBe(3)
  expect(repo.snapshot().flows.map(flow => flow.flowColor)).toEqual([1, 3])
  const before = repo.store.items('1').length
  expect(() => plan([{ draftId: 'a', title: '抢色', flowColor: 1 }])).toThrow('已被「已有流程」使用')
  expect(() => plan([{ draftId: 'a', title: '一', flowColor: 5 }, { draftId: 'b', title: '二', flowColor: 5 }])).toThrow('不能重复')
  expect(() => plan([{ draftId: 'a', title: '根' }, { draftId: 'b', title: '有上级', parents: [draft('a')], flowColor: 6 }])).toThrow('跟随上级')
  expect(repo.store.items('1')).toHaveLength(before)
  const plain = plan([{ draftId: 'p', title: '无色', horizon: 'day' }])
  expect(repo.snapshot().items.some(row => row.id === plain.itemIds![0])).toBe(true)
  expect(plain).toMatchObject({ itemId: plain.itemIds![0], label: '创建事项' })
})

it('同 ID 重试复用回执只生成一份计划；同 ID 异请求冲突', () => {
  const id = randomUUID(), command = planCommand([{ draftId: 'a', title: '一次' }, { draftId: 'b', title: '两次' }])
  const first = run(command, id), second = run(command, id)
  expect(second).toEqual(first)
  expect(repo.store.items("i.title IN ('一次','两次')")).toHaveLength(2)
  expect(() => run(planCommand([{ draftId: 'a', title: '别的' }]), id)).toThrow('已被其他请求使用')
})

it('外部新下级阻断整批撤销：无任何删除、不写 marker、itemIds 为空', () => {
  const created = plan([{ draftId: 'a', title: '父' }, { draftId: 'b', title: '子', parents: [draft('a')] }])
  const outside = create('外部下级')
  run({ type: 'link', parentId: created.itemIds![1]!, childId: outside, expectedParentVersion: item(created.itemIds![1]!).version, expectedChildVersion: item(outside).version })
  const items = repo.store.items('1')
  const result = undo(created)
  expect(result).toMatchObject({ outcome: 'conflict_skipped', itemIds: [], itemId: null, restoreSource: null })
  expect(repo.store.items('1')).toEqual(items)
  expect(repo.db.prepare('SELECT count(*) AS n FROM undo_effects').get()!.n).toBe(0)
  valid()
})

it('跨期或中途写入失败时整批回滚，含事件、回执与颜色占用', () => {
  const command = planCommand([{ draftId: 'a', title: '今天', horizon: 'day', flowColor: 4 }, { draftId: 'b', title: '子', parents: [draft('a')] }])
  now = '2026-09-24T02:00:00.000Z'
  expect(() => run(command)).toThrow('周期已变化')
  now = '2026-09-23T02:00:00.000Z'
  const spy = vi.spyOn(Store.prototype, 'saveRelation').mockImplementationOnce(() => { throw new Error('disk full') })
  const counts = () => ['items', 'item_relations', 'item_events', 'operations'].map(table => Number(repo.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()!.n))
  const before = counts()
  expect(() => run(command)).toThrow('disk full')
  expect(counts()).toEqual(before)
  spy.mockRestore()
  expect(run(command).itemIds).toHaveLength(2)
})

it('导入拒绝伪造的计划：同项多效果/缺事件/错 IDs/重复归属/非拓扑/缺 marker/半撤销/旧版本', () => {
  const goal = create('目标')
  const created = diamond(goal), undone = undo(created)
  const source = exported()
  const op = (data: Dataset) => data.operations.find(row => row.id === created.operationId)!
  const variants: [string, (data: Dataset) => void][] = [
    ['dup-effect', data => { op(data).effects.push(structuredClone(op(data).effects[0]!)) }],
    ['missing-event', data => { data.events = data.events.filter(event => !(event.operationId === created.operationId && event.eventIndex === 3)) }],
    ['wrong-ids', data => { op(data).result.itemIds = [...op(data).result.itemIds!].reverse() }],
    ['scalar-id', data => { op(data).result.itemId = op(data).result.itemIds![0]! }],
    ['double-owned', data => { const effects = op(data).effects; if (effects[0]!.kind === 'create' && effects[1]!.kind === 'create') effects[0]!.initialRelations.push(effects[1]!.initialRelations[0]!) }],
    ['non-topological', data => { op(data).effects.reverse(); op(data).result.itemIds!.reverse() }],
    ['missing-marker', data => { data.undoEffects = data.undoEffects.filter(marker => !(marker.originalId === created.operationId && marker.effectIndex === 0)) }],
    ['half-undo', data => { data.undoEffects = data.undoEffects.filter(marker => marker.originalId !== created.operationId || marker.effectIndex > 1) }],
    ['undo-ids', data => { data.operations.find(row => row.id === undone.operationId)!.result.itemIds = [] }],
    ['old-version', data => { data.schemaVersion = 2 }],
    ['stray-ids', data => { data.operations.find(row => row.kind === 'confirmSetup')!.result.itemIds = [] }],
  ]
  expect(() => validateImport(source, now)).not.toThrow()
  for (const [name, mutate] of variants) {
    const data = structuredClone(source); mutate(data)
    expect(() => validateImport(data, now), name).toThrow()
  }
})

it('跨代次 JSON/SQLite 恢复：快照都可恢复并再导出；旧计划不可撤销，新代次计划可撤', async () => {
  const goal = create('目标', 0)
  const created = diamond(goal)
  const fresh = exported()
  const undone = undo(created)
  const afterUndo = exported()
  run({ type: 'restoreItem', itemId: created.itemIds![0]!, expectedVersion: item(created.itemIds![0]!).version, deletionSource: undone.operationId })
  const partial = exported()
  for (const snapshot of [fresh, afterUndo, partial]) {
    const old = generation(), next = await restore(JSON.parse(JSON.stringify(snapshot)))
    expect(next).not.toBe(old)
    expect(repo.store.workspace()).toMatchObject({ generation: next, pausedAfterRestore: true })
    expect(repo.store.operation(created.operationId)!.generation).toBe(snapshot.workspace.generation)
    valid()
    expect(undo(created)).toMatchObject({ outcome: 'conflict_skipped', itemIds: [] })
    expect(repo.store.operation(created.operationId)!.result).toEqual(snapshot.operations.find(row => row.id === created.operationId)!.result)
  }
  const later = plan([{ draftId: 'n', title: '新代次计划' }, { draftId: 'm', title: '新代次下级', parents: [draft('n')] }])
  expect(undo(later)).toMatchObject({ outcome: 'committed', itemIds: later.itemIds })
  // SQLite 路径：现有备份回执 → 预览 → 替换，源版本保持 v3。
  const record = await service.backups.create('manual', repo.store.workspace(), now)
  const token = preview(await service.action({ type: 'previewBackup', generation: generation(), backupId: record.id })).token
  await service.action({ type: 'prepare', generation: generation(), token })
  expect((await service.action({ type: 'commit', generation: generation(), token, acknowledged: true })).type).toBe('replaced')
  valid()
  expect(undo(later).outcome).toBe('conflict_skipped')
})
