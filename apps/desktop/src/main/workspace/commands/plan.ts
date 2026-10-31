/**
 * [INPUT]: Validated createPlan entries, versioned parent references and current transaction context.
 * [OUTPUT]: Revalidated periods/parents/colors, single nested creation or topological batch creation with ordered item IDs.
 * [POS]: Atomic batch creation sharing single-item primitives; stale previews have a stable error code.
 */
import { randomUUID } from 'node:crypto'
import { planOrder, planProblem } from '../../../domain/plan'
import { horizonProblem } from '../../../domain/relations'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { Item } from '../../../shared/contracts/entities'
import { statusGroup } from '../../../shared/contracts/effects'
import { assertAvailable, assertFlowColorFree, nextSortKey, targetPeriod, touch, type Context } from '../context'
import { createItem, newRelation } from './items'
import { serverText } from '../../../shared/i18n/server'
import { placeByParent } from './ordering'

export function createPlan(context: Context, command: CommandOf<'createPlan'>): boolean {
  if (command.items.some(item => item.nesting)) {
    const item = command.items[0]!
    if (command.items.length !== 1 || item.parentRefs.length || command.smartCapture) throw new DomainError('invalid', serverText().errors.planPeriodChanged)
    const period = targetPeriod(context, item.horizon, item.period)
    if ((period?.id ?? null) !== item.previewPeriodId) throw new DomainError('stale_preview', serverText().errors.planPeriodChanged)
    const changed = createItem(context, { ...item, type: 'create', operationId: command.operationId, generation: command.generation,
      parentId: null, expectedParentVersion: null, parentRefs: item.parentRefs.filter(ref => ref.kind === 'existing') })
    context.itemIds = [context.itemId!]
    return changed
  }
  // Optional model suggestions must never make an otherwise valid capture fail.
  command = { ...command, items: command.items.map(item => ({ ...item, parentRefs: item.parentRefs.filter(ref => {
    if (ref.kind !== 'existing' || !ref.automatic) return true
    if (!context.store.db.prepare('SELECT 1 FROM items WHERE id=?').get(ref.itemId)) return false
    const parent = context.store.item(ref.itemId)
    return parent.version === ref.expectedVersion && !parent.deletedAt && !parent.archivedAt && parent.status === 'todo' && !horizonProblem(parent.placement.horizon, item.horizon)
  }) })) }
  const problem = planProblem(command.items)
  if (problem) throw new DomainError('invalid', problem)
  // --- Every guard runs before the first write, so a parent touched by child one never looks stale to child two. ---
  const parents = new Map<string, Item>()
  for (const ref of command.items.flatMap(item => item.parentRefs)) {
    if (ref.kind !== 'existing' || parents.has(ref.itemId)) continue
    const parent = context.store.item(ref.itemId, ref.expectedVersion)
    assertAvailable(parent)
    parents.set(parent.id, parent)
  }
  // New plan links follow the same horizon rule as `link`: a longer-horizon parent, never Later, and no Later flow roots.
  const horizonOf = new Map(command.items.map(item => [item.draftId, item.horizon]))
  for (const item of command.items) {
    const issue = item.flowColor !== null && item.horizon === 'later' ? serverText().relations.laterEndpoint
      : item.parentRefs.map(ref => horizonProblem(ref.kind === 'existing' ? parents.get(ref.itemId)!.placement.horizon : horizonOf.get(ref.draftId)!, item.horizon)).find(Boolean)
    if (issue) throw new DomainError('conflict', issue)
  }
  for (const item of command.items) {
    const period = targetPeriod(context, item.horizon, item.period)
    if ((period?.id ?? null) !== item.previewPeriodId) throw new DomainError('stale_preview', serverText().errors.planPeriodChanged)
    if (item.flowColor !== null) assertFlowColorFree(context, item.flowColor, null)
  }
  const ids = new Map<string, string>()
  for (const draft of planOrder(command.items)!) {
    const id = randomUUID()
    ids.set(draft.draftId, id)
    const period = targetPeriod(context, draft.horizon, draft.period)
    const item: Item = { id, title: draft.title, description: draft.description, dueDate: draft.dueDate,
      status: 'todo', completedAt: null, cancelledAt: null, archivedAt: null, deletedAt: null, deletedBy: null,
      createdAt: context.now, updatedAt: context.now, version: 1, flowColor: draft.flowColor,
      placement: { itemId: id, horizon: draft.horizon, periodId: period?.id ?? null, sortKey: nextSortKey(context, draft.horizon, period?.id ?? null, null), version: 1, holdPeriodId: null } }
    context.store.insertItem(item)
    const edges = draft.parentRefs.map(ref => newRelation(ref.kind === 'existing' ? ref.itemId : ids.get(ref.draftId)!, id, context.now))
    for (const edge of edges) context.store.saveRelation(edge)
    if (command.autoPlace) placeByParent(context, item, false)
    context.effects.push({ kind: 'create', itemId: id, status: statusGroup(item), horizon: draft.horizon, periodId: period?.id ?? null, initialRelations: edges.map(edge => edge.id) })
    context.store.event(command.operationId, context.now, 'created', null, item)
  }
  for (const parent of parents.values()) touch(context, context.store.item(parent.id))
  context.itemIds = context.effects.map(effect => effect.itemId)
  context.itemId = context.itemIds.length === 1 ? context.itemIds[0]! : null
  context.label = serverText().labels.createPlan(context.itemIds.length)
  return true
}
