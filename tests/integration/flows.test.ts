import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { openDatabase } from '../../src/main/storage/database'
import { migrate, schemaVersion } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { exportDataset } from '../../src/main/workspace/transfer/dataset'
import { validateImport } from '../../src/domain/import-validation'
import type { CommandInput } from '../../src/shared/contracts/commands'

type Action<T = CommandInput> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
let repo: Repository
const now = '2026-09-23T02:00:00.000Z'
const generation = () => repo.store.workspace().generation
const run = (command: Action) => repo.execute({ ...command, operationId: randomUUID(), generation: generation() })
const create = (title: string, flowColor: number | null = null) => repo.store.item(run({ type: 'create', title, horizon: 'later', flowColor }).itemId!)
const fresh = (id: string) => repo.store.item(id)
beforeEach(() => {
  const db = openDatabase(':memory:'); migrate(db)
  repo = new Repository(db, { now: () => now })
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-09-21', confirmed: true })
})
afterEach(() => repo.db.close())

it('流程颜色在未删除条目中唯一，快照列出全部流程根', () => {
  const goal = create('上线内测', 1)
  expect(goal.flowColor).toBe(1)
  expect(() => create('另一个目标', 1)).toThrow('已被「上线内测」使用')
  const other = create('写长文')
  run({ type: 'flowColor', itemId: other.id, expectedVersion: other.version, flowColor: 2 })
  expect(repo.snapshot().flows.map(flow => [flow.title, flow.flowColor])).toEqual([['上线内测', 1], ['写长文', 2]])
  expect(() => run({ type: 'flowColor', itemId: other.id, expectedVersion: fresh(other.id).version, flowColor: 1 })).toThrow('已被')
  const cleared = run({ type: 'flowColor', itemId: other.id, expectedVersion: fresh(other.id).version, flowColor: null })
  expect(cleared.changed && !cleared.undoable).toBe(true)
  expect(fresh(other.id).flowColor).toBeNull()
})

it('有上级的条目不能设颜色；流程根不能被关联为下级', () => {
  const goal = create('目标', 3), task = create('任务')
  run({ type: 'link', parentId: goal.id, childId: task.id, expectedParentVersion: goal.version, expectedChildVersion: task.version })
  expect(() => run({ type: 'flowColor', itemId: task.id, expectedVersion: fresh(task.id).version, flowColor: 4 })).toThrow('跟随上级流程')
  expect(() => run({ type: 'create', title: '拆解', horizon: 'day', parentId: goal.id, expectedParentVersion: fresh(goal.id).version, flowColor: 5 })).toThrow('跟随上级流程')
  const other = create('另一流程', 6)
  expect(() => run({ type: 'link', parentId: goal.id, childId: other.id, expectedParentVersion: fresh(goal.id).version, expectedChildVersion: other.version })).toThrow('请先移除它的流程颜色')
  // Storage triggers hold the same invariant if a caller bypasses the command layer.
  expect(() => repo.db.prepare('UPDATE items SET flowColor=7 WHERE id=?').run(task.id)).toThrow('flow root has parent')
})

it('删除释放颜色；还原时颜色已被占用则移除并提示，撤销删除则跳过', () => {
  const goal = create('旧流程', 0)
  const deleted = run({ type: 'delete', itemId: goal.id, expectedVersion: goal.version })
  create('新流程', 0)
  const undo = run({ type: 'undo', originalOperationId: deleted.operationId })
  expect(undo.outcome).toBe('conflict_skipped')
  expect(undo.warnings).toEqual(['流程颜色已被其他流程使用'])
  const restored = run({ type: 'restoreItem', itemId: goal.id, expectedVersion: fresh(goal.id).version })
  expect(restored.warnings[0]).toContain('已移除本条目的流程颜色')
  expect(fresh(goal.id).flowColor).toBeNull()
})

it('解除关联后下级成为流程时，撤销解除不会恢复这条边', () => {
  const goal = create('目标', 1), task = create('任务')
  run({ type: 'link', parentId: goal.id, childId: task.id, expectedParentVersion: goal.version, expectedChildVersion: task.version })
  const edge = repo.store.relations()[0]!
  const unlinked = run({ type: 'unlink', relationId: edge.id, expectedParentVersion: fresh(goal.id).version, expectedChildVersion: fresh(task.id).version })
  run({ type: 'flowColor', itemId: task.id, expectedVersion: fresh(task.id).version, flowColor: 2 })
  const undo = run({ type: 'undo', originalOperationId: unlinked.operationId })
  expect(undo.outcome).toBe('conflict_skipped')
  expect(repo.store.relations()).toHaveLength(0)
})

it('导入校验流程颜色唯一与根约束，并接受没有颜色字段的 v1 数据', () => {
  const goal = create('目标', 1), task = create('任务')
  run({ type: 'link', parentId: goal.id, childId: task.id, expectedParentVersion: goal.version, expectedChildVersion: task.version })
  const source = exportDataset(repo.store, now)
  expect(source.schemaVersion).toBe(schemaVersion)
  expect(() => validateImport(source, now)).not.toThrow()
  const duplicate = structuredClone(source)
  duplicate.items.find(item => item.id === task.id)!.flowColor = 1
  expect(() => validateImport(duplicate, now)).toThrow('流程颜色重复')
  const colouredChild = structuredClone(source)
  colouredChild.items.find(item => item.id === task.id)!.flowColor = 2
  expect(() => validateImport(colouredChild, now)).toThrow('流程根不能有上级')
  const legacy = JSON.parse(JSON.stringify({ ...source, schemaVersion: 1, items: source.items.map(({ flowColor: _flowColor, ...item }) => item) }))
  expect(validateImport(legacy, now).items.every(item => item.flowColor === null)).toBe(true)
})

it('v1 数据库原子升级到 v2，保留条目并启用流程约束', () => {
  const kept = create('升级前的条目')
  // Rebuild the v1 shape in place: drop the v2 objects and column.
  repo.db.exec(`DROP INDEX unique_flow_color; DROP TRIGGER flow_root_color; DROP TRIGGER flow_root_edge_insert; DROP TRIGGER flow_root_edge_update;
    ALTER TABLE items DROP COLUMN flowColor; DELETE FROM schema_migrations WHERE version=2; PRAGMA user_version = 1;`)
  migrate(repo.db)
  expect(Number(repo.db.prepare('PRAGMA user_version').get()!.user_version)).toBe(2)
  expect(fresh(kept.id)).toMatchObject({ title: '升级前的条目', flowColor: null })
  create('升级后的流程', 4)
  expect(() => create('重复', 4)).toThrow('已被')
})
