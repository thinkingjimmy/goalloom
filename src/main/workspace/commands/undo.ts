/**
 * [INPUT]: 不可变原操作、事务最新状态、纯效果匹配规则与注入时钟。
 * [OUTPUT]: 全成全败的字段逆转、最新状态形成的反向事件和持久化 hold。
 * [POS]: 用户撤销事务库；SAVEPOINT 冲突回滚由 repository 统一处理。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { effectProblem, insertionProblem, inverseEdges } from '../../../domain/undo'
import { undoHold } from '../../../domain/rollover'
import { validateDag } from '../../../domain/relations'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { Effect } from '../../../shared/contracts/effects'
import type { Item, Relation } from '../../../shared/contracts/entities'
import { flowColorOwner, nextSortKey, targetPeriod, touch, type Context } from '../context'
import { invalidateEdges, writeEdges } from './lifecycle'

function conflict(message: string): never { throw new DomainError('conflict', message) }
export function undoOperation(context: Context, command: CommandOf<'undo'>): boolean {
  const original = context.store.operation(command.originalOperationId)
  if (!original || original.generation !== command.generation || !original.result.undoable || original.source !== 'user') return conflict('原操作不可撤销')
  if (context.store.db.prepare('SELECT 1 FROM undo_effects WHERE originalId=? LIMIT 1').get(original.id)) return conflict('原操作已撤销')
  context.label = original.result.label
  context.itemId = original.result.itemId
  if (original.result.itemIds) context.itemIds = original.result.itemIds
  for (const effect of [...original.effects].reverse()) reverseEffect(context, effect, original.id)
  context.undone = original.effects.map((_, index) => ({ originalId: original.id, index }))
  return true
}
export function reverseEffect(context: Context, effect: Effect, originalId: string): void {
  const item = context.store.item(effect.itemId)
  const before = structuredClone(item)
  const allEdges = context.store.relations(false)
  const problem = effectProblem(effect, item, allEdges, context.store.position(item))
  if (problem) conflict(problem)
  switch (effect.kind) {
    case 'status': Object.assign(item, effect.before); break
    case 'archive': item.archivedAt = effect.before; break
    case 'position': reversePosition(context, item, effect); break
    case 'create': {
      const edges = invalidateEdges(context, item.id)
      writeEdges(context, edges.map(delta => delta.after), item.id)
      Object.assign(item, { deletedAt: context.now, deletedBy: context.command.operationId })
      context.restoreSource = context.command.operationId
      break
    }
    case 'visibility': {
      const edges = inverseEdges(effect.edges, context.command.operationId, context.now)
      if (effect.before.deletedAt && allEdges.some(edge => !edge.invalidatedAt && (edge.parentId === item.id || edge.childId === item.id) && !edges.some(target => target.id === edge.id && target.invalidatedAt))) conflict('还原后新增了关联，不能安全撤销还原')
      if (!effect.before.deletedAt && item.flowColor !== null && flowColorOwner(context, item.flowColor, item.id) !== null) conflict('流程颜色已被其他流程使用')
      Object.assign(item, effect.before)
      // 端点恢复先落盘，DAG 触发器才能接受其合法关系。
      touch(context, item)
      reverseRelations(context, edges, item)
      break
    }
    case 'relations': reverseRelations(context, inverseEdges(effect.edges, context.command.operationId, context.now), item); break
  }
  applyHold(context, item)
  touch(context, item)
  const samePeriod = before.placement.horizon === item.placement.horizon && before.placement.periodId === item.placement.periodId
  if (effect.kind !== 'relations' && !(effect.kind === 'position' && samePeriod)) context.store.event(context.command.operationId, context.now, 'undo', before, item, originalId)
}
function reversePosition(context: Context, item: Item, effect: Extract<Effect, { kind: 'position' }>): void {
  const ids = context.store.order(effect.before.horizon, effect.before.periodId).filter(row => row.id !== item.id).map(row => row.id)
  const problem = insertionProblem(effect.before, ids)
  if (problem) conflict(problem)
  const key = nextSortKey(context, effect.before.horizon, effect.before.periodId, effect.before.nextId, item.id)
  const version = item.placement.version
  Object.assign(item.placement, { horizon: effect.before.horizon, periodId: effect.before.periodId, sortKey: key, version: version + 1 })
  context.store.savePlacement(item.placement, version)
}
function reverseRelations(context: Context, reversed: Relation[], item: Item): void {
  const replacements = new Map(reversed.map(edge => [edge.id, edge]))
  const graph = context.store.relations(false).map(edge => replacements.get(edge.id) ?? edge)
  const items = context.store.items('1')
  try { validateDag(new Set(items.map(row => row.id)), graph, new Set(items.filter(row => row.deletedAt).map(row => row.id))) }
  catch (error) { conflict(error instanceof Error ? error.message : '关联无法安全还原') }
  for (const edge of reversed) {
    if (!edge.invalidatedAt && context.store.item(edge.childId).flowColor !== null) conflict('下级已设为流程，不能恢复这条关联')
    if (context.store.item(edge.parentId).deletedAt || context.store.item(edge.childId).deletedAt) {
      // 撤销还原可以使本项回到回收站，但不得操作其他已删除端点。
      if (!item.deletedAt || (edge.parentId !== item.id && edge.childId !== item.id) || !edge.invalidatedAt) conflict('关联端点已删除')
    }
  }
  writeEdges(context, reversed, item.id)
}
export function applyHold(context: Context, item: Item): void {
  const period = item.placement.periodId ? context.store.period(item.placement.periodId) : null
  const current = targetPeriod(context, item.placement.horizon)
  const hold = current ? undoHold({ ...item, period, holdPeriodId: item.placement.holdPeriodId }, current, context.now) : null
  if (hold === item.placement.holdPeriodId) return
  const version = item.placement.version
  item.placement.holdPeriodId = hold
  item.placement.version++
  context.store.savePlacement(item.placement, version)
}
