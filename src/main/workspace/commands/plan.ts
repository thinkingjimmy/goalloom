/**
 * [INPUT]: Validated createPlan entries, versioned parent references and current transaction context.
 * [OUTPUT]: Revalidated periods/parents/colors and the new-link horizon rule, topological creation effects, events and ordered item IDs.
 * [POS]: Atomic batch creation sharing single-item primitives; stale previews have a stable error code.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { planOrder, planProblem } from '../../../domain/plan'
import { horizonProblem } from '../../../domain/relations'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { Item } from '../../../shared/contracts/entities'
import { statusGroup } from '../../../shared/contracts/effects'
import { assertAvailable, assertFlowColorFree, nextSortKey, targetPeriod, touch, type Context } from '../context'
import { newRelation } from './items'
import { serverText } from '../../../shared/i18n/server'

export function createPlan(context: Context, command: CommandOf<'createPlan'>): boolean {
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
    const period = targetPeriod(context, item.horizon)
    if ((period?.id ?? null) !== item.previewPeriodId) throw new DomainError('stale_preview', serverText().errors.planPeriodChanged)
    if (item.flowColor !== null) assertFlowColorFree(context, item.flowColor, null)
  }
  const ids = new Map<string, string>()
  for (const draft of planOrder(command.items)!) {
    const id = randomUUID()
    ids.set(draft.draftId, id)
    const period = targetPeriod(context, draft.horizon)
    const item: Item = { id, title: draft.title, description: draft.description, dueDate: draft.dueDate,
      status: 'todo', completedAt: null, cancelledAt: null, archivedAt: null, deletedAt: null, deletedBy: null,
      createdAt: context.now, updatedAt: context.now, version: 1, flowColor: draft.flowColor,
      placement: { itemId: id, horizon: draft.horizon, periodId: period?.id ?? null, sortKey: nextSortKey(context, draft.horizon, period?.id ?? null, null), version: 1, holdPeriodId: null } }
    context.store.insertItem(item)
    const edges = draft.parentRefs.map(ref => newRelation(ref.kind === 'existing' ? ref.itemId : ids.get(ref.draftId)!, id, context.now))
    for (const edge of edges) context.store.saveRelation(edge)
    context.effects.push({ kind: 'create', itemId: id, status: statusGroup(item), horizon: draft.horizon, periodId: period?.id ?? null, initialRelations: edges.map(edge => edge.id) })
    context.store.event(command.operationId, context.now, 'created', null, item)
  }
  for (const parent of parents.values()) touch(context, context.store.item(parent.id))
  context.itemIds = context.effects.map(effect => effect.itemId)
  context.itemId = context.itemIds.length === 1 ? context.itemIds[0]! : null
  context.label = serverText().labels.createPlan(context.itemIds.length)
  return true
}
