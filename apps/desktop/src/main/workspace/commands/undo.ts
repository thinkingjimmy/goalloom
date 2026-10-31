/**
 * [INPUT]: Immutable original effects, current state, indexed neighbors and injected time.
 * [OUTPUT]: Atomic owned-field inverses, guarded nesting/group and flow reversal, and persisted expiry holds.
 * [POS]: Undo transaction rules; Repository handles SAVEPOINT conflict rollback.
 */
import { effectProblem, insertionProblem, inverseEdges, undoEffectOrder } from '../../../domain/undo'
import { undoHold } from '../../../domain/rollover'
import { validateDag } from '../../../domain/relations'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { Effect } from '../../../shared/contracts/effects'
import type { Item, Relation } from '../../../shared/contracts/entities'
import { flowColorOwner, hasActiveParent, nextSortKey, targetPeriod, touch, type Context } from '../context'
import { invalidateEdges, writeEdges } from './lifecycle'
import { serverText } from '../../../shared/i18n/server'
import { assistanceServerText } from '../../../shared/i18n/assistance'
import { nestingTargets } from '../../../domain/nesting'
import { guidanceIdentity } from './assistance'
import { creationCompletions, creationEffects } from '../../../domain/creation'

function conflict(message: string): never { throw new DomainError('conflict', message) }
export function undoOperation(context: Context, command: CommandOf<'undo'>): boolean {
  const original = context.store.operation(command.originalOperationId)
  if (!original || original.generation !== command.generation || !original.result.undoable || original.source !== 'user') return conflict(serverText().undo.notUndoable)
  if (context.store.db.prepare('SELECT 1 FROM undo_effects WHERE originalId=? LIMIT 1').get(original.id)) return conflict(serverText().undo.alreadyUndone)
  context.label = original.result.label
  context.itemId = original.result.itemId
  if (original.result.itemIds) context.itemIds = original.result.itemIds
  const completions = ['create', 'createPlan'].includes(original.kind) ? creationCompletions(original,
    context.store.prepare("SELECT id FROM operations WHERE kind='completeCreation' AND json_extract(result,'$.creationOperationId')=? ORDER BY rowid").all(original.id).map(row => context.store.operation(String(row.id))!)) : []
  for (const completion of completions) if (context.store.db.prepare('SELECT 1 FROM undo_effects WHERE originalId=? LIMIT 1').get(completion.id)) conflict(serverText().undo.alreadyUndone)
  const effects = creationEffects(original, completions)
  const checked = new Set<Effect>()
  for (const effect of effects) if (effect.kind === 'nesting' && !effects.some(other => other.kind === 'position' && other.itemId === effect.itemId)) {
    const item = context.store.item(effect.itemId)
    const problem = effectProblem(effect, item, context.store.relations(false), context.store.position(item))
    if (problem) conflict(problem)
    checked.add(effect)
  }
  // Restore the root's position first. Otherwise its returning children temporarily become
  // independent rows in the source period and invalidate the root's saved neighbors.
  for (const effect of effects.filter(effect => effect.kind === 'groupPlacement')) {
    const item = context.store.item(effect.itemId)
    const problem = effectProblem(effect, item, [], context.store.position(item))
    if (problem) conflict(problem)
  }
  for (const index of undoEffectOrder(effects)) {
    const effect = effects[index]!
    reverseEffect(context, effect, original.id, checked.has(effect))
  }
  context.undone = [original, ...completions].flatMap(operation => operation.effects.map((_, index) => ({ originalId: operation.id, index })))
  return true
}
export function reverseEffect(context: Context, effect: Effect, originalId: string, prechecked = false): void {
  const item = context.store.item(effect.itemId)
  const before = structuredClone(item)
  const allEdges = ['create', 'visibility', 'relations', 'nesting'].includes(effect.kind) ? context.store.relations(false) : []
  const problem = effectProblem(effect, item, allEdges, prechecked && effect.kind === 'nesting' ? effect.after : context.store.position(item))
  if (problem) conflict(problem)
  if (effect.kind === 'description') {
    item.description = effect.before
    touch(context, item)
    context.store.event(context.command.operationId, context.now, 'undo', before, item, originalId)
    return
  }
  if (effect.kind === 'guidance') {
    const head = context.store.guidance(item.id)
    if (!head || JSON.stringify(head.value) !== JSON.stringify(effect.after.value) || guidanceIdentity(context.store, head) !== effect.after.operationId) conflict(assistanceServerText().guidanceChanged)
    context.store.saveGuidance({ itemId: item.id, revision: head.revision + 1, value: effect.before.value, updatedAt: context.now, operationId: context.command.operationId })
    touch(context, item)
    context.store.event(context.command.operationId, context.now, 'undo', before, item, originalId)
    return
  }
  switch (effect.kind) {
    case 'nesting': {
      if (item.placement.nestingParentId) {
        const version = item.placement.version
        item.placement.nestingParentId = null; item.placement.version++
        context.store.savePlacement(item.placement, version)
      }
      reverseRelations(context, inverseEdges(effect.edges, context.command.operationId, context.now), item)
      const p = effect.before
      if (p.nestingParentId) {
        if (item.flowColor !== null || hasActiveParent(context, item.id) || context.store.hasNestedChildren(item.id)) conflict(serverText().undo.relationUnsafe)
        const parent = context.store.item(p.nestingParentId)
        if (parent.deletedAt || parent.placement.nestingParentId || (parent.placement.horizon === 'later') !== (p.horizon === 'later')
          || !nestingTargets(item.id, context.store.relations(), context.store.nestingLinks())(parent.id)) conflict(serverText().undo.relationUnsafe)
      }
      const neighbors = context.store.insertion(p.horizon, p.periodId, p.nextId, item.id, p.nestingParentId)
      if ((neighbors.previous?.itemId ?? null) !== p.previousId) conflict(serverText().undo.orderUnsafe)
      const key = nextSortKey(context, p.horizon, p.periodId, p.nextId, item.id, p.nestingParentId)
      const version = item.placement.version
      Object.assign(item.placement, { horizon: p.horizon, periodId: p.periodId, sortKey: key, nestingParentId: p.nestingParentId, version: version + 1 })
      context.store.savePlacement(item.placement, version)
      if (effect.flowColor) {
        if (flowColorOwner(context, effect.flowColor.before, item.id) !== null) conflict(serverText().undo.colorTaken)
        item.flowColor = effect.flowColor.before
      }
      break
    }
    case 'groupPlacement': {
      const version = item.placement.version
      Object.assign(item.placement, { horizon: effect.before.horizon, periodId: effect.before.periodId, version: version + 1 })
      context.store.savePlacement(item.placement, version)
      break
    }
    case 'status': Object.assign(item, effect.before); break
    case 'archive': item.archivedAt = effect.before; break
    case 'position': reversePosition(context, item, effect); break
    case 'create': {
      if (item.placement.nestingParentId || context.store.hasNestedChildren(item.id)) conflict(serverText().undo.createdRelationsChanged)
      const edges = invalidateEdges(context, item.id)
      writeEdges(context, edges.map(delta => delta.after), item.id)
      Object.assign(item, { deletedAt: context.now, deletedBy: context.command.operationId })
      context.restoreSource = context.command.operationId
      break
    }
    case 'visibility': {
      const edges = inverseEdges(effect.edges, context.command.operationId, context.now)
      if (effect.before.deletedAt && allEdges.some(edge => !edge.invalidatedAt && (edge.parentId === item.id || edge.childId === item.id) && !edges.some(target => target.id === edge.id && target.invalidatedAt))) conflict(serverText().undo.relationsAdded)
      if (!effect.before.deletedAt && item.flowColor !== null && flowColorOwner(context, item.flowColor, item.id) !== null) conflict(serverText().undo.colorTaken)
      Object.assign(item, effect.before)
      // 端点恢复先落盘，DAG 触发器才能接受其合法关系。
      touch(context, item)
      reverseRelations(context, edges, item)
      break
    }
    case 'relations': {
      const transfer = effect.flowColor?.transferredTo
      if (transfer) {
        const parent = context.store.item(transfer)
        if (parent.flowColor !== effect.flowColor!.before) conflict(serverText().undo.flowColorChanged)
        if (allEdges.some(edge => !edge.invalidatedAt && edge.parentId === transfer && edge.childId !== item.id)) conflict(serverText().undo.promotionBranchesChanged)
      }
      reverseRelations(context, inverseEdges(effect.edges, context.command.operationId, context.now), item)
      if (effect.flowColor) {
        if (hasActiveParent(context, item.id)) conflict(serverText().undo.adoptionParentsChanged)
        if (transfer) {
          const parent = context.store.item(transfer)
          parent.flowColor = null
          touch(context, parent)
        }
        if (flowColorOwner(context, effect.flowColor.before, item.id) !== null) conflict(serverText().undo.colorTaken)
        item.flowColor = effect.flowColor.before
      }
      break
    }
  }
  applyHold(context, item)
  touch(context, item)
  const samePeriod = before.placement.horizon === item.placement.horizon && before.placement.periodId === item.placement.periodId
  if (effect.kind !== 'relations' && !(effect.kind === 'position' && samePeriod)) context.store.event(context.command.operationId, context.now, 'undo', before, item, originalId)
}
function reversePosition(context: Context, item: Item, effect: Extract<Effect, { kind: 'position' }>): void {
  let neighbors
  try { neighbors = context.store.insertion(effect.before.horizon, effect.before.periodId, effect.before.nextId, item.id, effect.before.nestingParentId ?? null) }
  catch (error) { if (error instanceof DomainError && error.code === 'conflict') conflict(serverText().undo.orderUnsafe); throw error }
  const ids = [neighbors.previous?.itemId, neighbors.next?.itemId].filter((id): id is string => id !== undefined)
  const problem = insertionProblem(effect.before, ids)
  if (problem) conflict(problem)
  const key = nextSortKey(context, effect.before.horizon, effect.before.periodId, effect.before.nextId, item.id, effect.before.nestingParentId ?? null)
  const version = item.placement.version
  Object.assign(item.placement, { horizon: effect.before.horizon, periodId: effect.before.periodId, sortKey: key, version: version + 1 })
  context.store.savePlacement(item.placement, version)
}
function reverseRelations(context: Context, reversed: Relation[], item: Item): void {
  const replacements = new Map(reversed.map(edge => [edge.id, edge]))
  const graph = context.store.relations(false).map(edge => replacements.get(edge.id) ?? edge)
  const items = context.store.db.prepare('SELECT id,deletedAt FROM items').all()
  const topology: Relation[] = [...graph.map(edge => ({ ...edge, id: `goal:${edge.id}` })), ...context.store.nestingLinks().map(link => ({ ...link, id: `nest:${link.childId}`, createdAt: context.now, invalidatedAt: null, invalidatedBy: null, reason: null }))]
  try { validateDag(new Set(items.map(row => String(row.id))), topology, new Set(items.filter(row => row.deletedAt).map(row => String(row.id)))) }
  catch (error) { conflict(error instanceof Error ? error.message : serverText().undo.relationUnsafe) }
  for (const edge of reversed) {
    if (!edge.invalidatedAt && context.store.item(edge.childId).flowColor !== null) conflict(serverText().undo.childIsFlow)
    if (context.store.item(edge.parentId).deletedAt || context.store.item(edge.childId).deletedAt) {
      // 撤销还原可以使本项回到回收站，但不得操作其他已删除端点。
      if (!item.deletedAt || (edge.parentId !== item.id && edge.childId !== item.id) || !edge.invalidatedAt) conflict(serverText().undo.endpointDeleted)
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
