/**
 * [INPUT]: A main-owned completion, immutable creation guard and current transactional task/goal state.
 * [OUTPUT]: Optional immediate enrichment, version-bound late placement/parents and creation-owned system effects.
 * [POS]: Authoritative automatic-capture rules; user edits invalidate pending work, not creation undo.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Command, CommandOf } from '../../../shared/contracts/commands'
import type { CaptureGuard, CreationSelection, SemanticParent } from '../../../shared/contracts/capture'
import type { Item } from '../../../shared/contracts/entities'
import { independentParentIds, mayParent, relationProblem } from '../../../domain/relations'
import { compareInstants, currentPeriod } from '../../../domain/calendar'
import { serverText } from '../../../shared/i18n/server'
import { nextSortKey, targetPeriod, touch, type Context } from '../context'
import { newRelation } from './items'
import { writeEdges } from './lifecycle'
import { placeByParent } from './ordering'

type CreationCommand = CommandOf<'create'> | CommandOf<'createPlan'>
export function isCapture(command: Command): command is CreationCommand & { smartCapture: NonNullable<CreationCommand['smartCapture']> } {
  return (command.type === 'create' || command.type === 'createPlan') && !!command.smartCapture
}
function validParents(context: Context, parents: SemanticParent[], horizon: Item['placement']['horizon']): Item[] {
  const effective = [...context.store.effectiveRelations(), ...context.store.nestingLinks()]
  const valid = parents.flatMap(candidate => {
    const summary = context.store.db.prepare('SELECT 1 FROM items WHERE id=?').get(candidate.itemId)
    if (!summary) return []
    const item = context.store.item(candidate.itemId)
    if (candidate.periodId !== undefined && item.placement.periodId !== candidate.periodId
      || !candidate.explicit && item.placement.periodId && compareInstants(context.store.period(item.placement.periodId).endAt, context.now) <= 0) return []
    const parentIds = effective.filter(edge => edge.childId === item.id).map(edge => edge.parentId).sort()
    return item.deletedAt || !candidate.explicit && (item.archivedAt || item.status !== 'todo') || item.title !== candidate.title || item.placement.horizon !== candidate.horizon
      || !mayParent(item.placement.horizon, horizon) || JSON.stringify(parentIds) !== JSON.stringify([...candidate.parentIds].sort()) ? [] : [item]
  })
  const kept = independentParentIds(valid.map(item => item.id), effective, new Set(parents.filter(candidate => candidate.explicit).map(candidate => candidate.itemId)))
  return [...new Map(valid.filter(item => kept.has(item.id)).map(item => [item.id, item])).values()]
}
function selectionPeriod(context: Context, selection: CreationSelection): boolean {
  try { return selection.horizon === 'later' ? selection.previewPeriodId === null : !!context.workspace.calendar
    && currentPeriod(context.workspace.calendar, selection.horizon, context.now).id === selection.previewPeriodId }
  catch { return false }
}
export function readyCreation(context: Context, command: CreationCommand, selection?: CreationSelection): CreationCommand {
  if (!isCapture(command) || !selection) return command
  const intent = command.smartCapture
  const item = command.type === 'create' ? command : command.items.length === 1 ? command.items[0]! : null
  if (!item) return command
  const placement = intent.allowPlacement && selectionPeriod(context, selection)
  const horizon = placement ? selection.horizon : item.horizon
  const parents = intent.allowParents && item.flowColor === null && !(command.type === 'create' ? command.parentId || command.parentRefs?.length : command.items[0]!.parentRefs.length)
    ? validParents(context, selection.parents, horizon).map(parent => ({ kind: 'existing' as const, itemId: parent.id, expectedVersion: parent.version, automatic: !selection.parents.find(candidate => candidate.itemId === parent.id)?.explicit })) : []
  if (command.type === 'create') return { ...command, horizon, ...(parents.length ? { parentRefs: parents } : {}) }
  return { ...command, items: [{ ...command.items[0]!, horizon, previewPeriodId: horizon === 'later' ? null : placement ? selection.previewPeriodId : command.items[0]!.previewPeriodId,
    ...(parents.length ? { parentRefs: parents } : {}) }] }
}
export function createdGuard(context: Context, command: CreationCommand, pending: boolean): CaptureGuard | undefined {
  if (!isCapture(command) || !context.itemId) return undefined
  const item = context.store.item(context.itemId)
  return { requestId: command.smartCapture.request.requestId, itemId: item.id, itemVersion: item.version, placementVersion: item.placement.version,
    allowPlacement: command.smartCapture.allowPlacement, allowParents: command.smartCapture.allowParents,
    autoPlace: !!command.autoPlace && !(command.type === 'create' && command.beforeId !== undefined), pending }
}
export function completeCreation(context: Context, command: CommandOf<'completeCreation'>): boolean {
  const original = context.store.operation(command.creationOperationId), guard = original?.result.capture
  context.itemId = command.itemId
  context.label = serverText().labels.create
  if (!original || original.generation !== command.generation || !['create', 'createPlan'].includes(original.kind) || !guard?.pending
    || guard.requestId !== command.requestId || guard.itemId !== command.itemId || guard.itemVersion !== command.expectedVersion || guard.placementVersion !== command.expectedPlacementVersion
    || context.store.db.prepare('SELECT 1 FROM undo_effects WHERE originalId=? LIMIT 1').get(original.id)
    || context.store.db.prepare("SELECT 1 FROM operations WHERE kind='completeCreation' AND json_extract(result,'$.creationOperationId')=? AND json_extract(result,'$.captureRequestId')=? LIMIT 1").get(original.id, command.requestId)) return false
  const item = context.store.item(command.itemId)
  if (item.version !== guard.itemVersion || item.placement.version !== guard.placementVersion || item.deletedAt || item.archivedAt || item.status !== 'todo' || item.placement.nestingParentId) return false
  if (item.placement.periodId && compareInstants(context.store.period(item.placement.periodId).endAt, context.now) <= 0) return false
  const selection = command.selection
  if (guard.allowPlacement && !selectionPeriod(context, selection)) return false
  const horizon = guard.allowPlacement ? selection.horizon : item.placement.horizon
  const parents = guard.allowParents && item.flowColor === null ? validParents(context, selection.parents, horizon) : []
  if (horizon !== item.placement.horizon) {
    const before = structuredClone(item), position = context.store.position(item), period = targetPeriod(context, horizon)
    const version = item.placement.version
    Object.assign(item.placement, { horizon, periodId: period?.id ?? null, sortKey: nextSortKey(context, horizon, period?.id ?? null, null, item.id), version: version + 1, holdPeriodId: null })
    context.store.savePlacement(item.placement, version)
    touch(context, item)
    context.effects.push({ kind: 'position', itemId: item.id, before: position, after: context.store.position(item) })
    context.store.event(command.operationId, context.now, 'moved', before, item)
  }
  const edges = parents.flatMap(parent => relationProblem(parent.id, item.id, context.store.relations()) ? [] : [newRelation(parent.id, item.id, context.now)])
  if (edges.length) {
    writeEdges(context, edges, item.id)
    touch(context, item)
    context.effects.push({ kind: 'relations', itemId: item.id, edges: edges.map(after => ({ before: null, after })) })
    if (guard.autoPlace) placeByParent(context, item)
  }
  return context.effects.length > 0
}
