/**
 * [INPUT]: Transaction-local items/relations, strict lifecycle commands and injected time.
 * [OUTPUT]: Independent lifecycle effects, creation-owned group restore and atomic unlink/placement when the effective parent changes.
 * [POS]: Lifecycle commands; deletion retains saved text/placement for undo without cascading state.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { changeNesting } from './nesting'
import { orderingParent, placeByParent } from './ordering'
import { nestingText } from '../../../shared/i18n/nesting'
import { samePosition } from '../../../domain/undo'
import { nestingTargets } from '../../../domain/nesting'
import { creationNestingRestore } from '../../../domain/creation'
import { changeStatus } from '../../../domain/status'
import { relationProblem } from '../../../domain/relations'
import { canDiscardEmptyTitle } from '../../../domain/items'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import { statusGroup, type EdgeDelta } from '../../../shared/contracts/effects'
import type { Item, Relation } from '../../../shared/contracts/entities'
import { assertAvailable, flowColorOwner, hasActiveParent, touch, type Context } from '../context'
import { serverText } from '../../../shared/i18n/server'

export function setStatus(context: Context, command: CommandOf<'status'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if (item.status === command.status) return false
  const before = structuredClone(item)
  Object.assign(item, changeStatus(command.status, context.now))
  touch(context, item)
  context.effects.push({ kind: 'status', itemId: item.id, before: statusGroup(before), after: statusGroup(item) })
  context.store.event(command.operationId, context.now, 'status_changed', before, item)
  context.itemId = item.id
  context.label = serverText().labels.status[command.status]
  return true
}
export function setArchive(context: Context, command: CommandOf<'archive'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if ((item.archivedAt !== null) === command.archived) return false
  const before = structuredClone(item)
  item.archivedAt = command.archived ? context.now : null
  touch(context, item)
  context.effects.push({ kind: 'archive', itemId: item.id, before: before.archivedAt, after: item.archivedAt })
  context.store.event(command.operationId, context.now, command.archived ? 'archived' : 'unarchived', before, item)
  context.itemId = item.id
  context.label = command.archived ? serverText().labels.archive : serverText().labels.unarchive
  return true
}
export function invalidateEdges(context: Context, itemId: string): EdgeDelta[] {
  return context.store.relations().filter(edge => edge.parentId === itemId || edge.childId === itemId).map(edge => ({
    before: edge, after: { ...edge, invalidatedAt: context.now, invalidatedBy: context.command.operationId, reason: 'delete' },
  }))
}
export function writeEdges(context: Context, edges: Relation[], exceptId?: string): void {
  // --- 先失效再恢复，数据库防环约束始终成立。端点版本只保护本次写入。 ---
  for (const edge of [...edges].sort((a, b) => Number(a.invalidatedAt === null) - Number(b.invalidatedAt === null))) context.store.saveRelation(edge)
  const ids = new Set(edges.flatMap(edge => [edge.parentId, edge.childId]))
  for (const id of ids) if (id !== exceptId) touch(context, context.store.item(id))
}
export function deleteItem(context: Context, command: CommandOf<'delete' | 'discardEmpty'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if (command.type === 'discardEmpty') {
    const linked = item.placement.nestingParentId || context.store.hasNestedChildren(item.id)
      || context.store.prepare('SELECT 1 FROM item_relations WHERE invalidatedAt IS NULL AND (parentId=? OR childId=?) LIMIT 1').get(item.id, item.id)
    if (!canDiscardEmptyTitle(item, Number(!!linked), !!context.store.guidance(item.id)?.value)) throw new DomainError('conflict', serverText().errors.itemChanged)
  }
  for (const child of context.store.nestedItems(item.id)) changeNesting(context, child, null)
  if (item.placement.nestingParentId) changeNesting(context, item, null)
  const before = structuredClone(item)
  const edges = command.type === 'discardEmpty' ? [] : invalidateEdges(context, item.id)
  writeEdges(context, edges.map(delta => delta.after), item.id)
  Object.assign(item, { deletedAt: context.now, deletedBy: command.operationId })
  touch(context, item)
  visibilityEffect(context, before, item, edges)
  context.store.event(command.operationId, context.now, 'deleted', before, item)
  context.label = command.type === 'discardEmpty' ? serverText().labels.discardEmpty : serverText().labels.delete
  return true
}
export function restoreItem(context: Context, command: CommandOf<'restoreItem'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  if (!item.deletedAt || (command.deletionSource !== null && item.deletedBy !== command.deletionSource)) throw new DomainError('conflict', serverText().errors.deletionExpired)
  const before = structuredClone(item)
  const deletion = context.store.operation(item.deletedBy!)
  const originalEffects = deletion?.effects ?? []
  const creation = deletion?.result.originalOperationId ? context.store.operation(deletion.result.originalOperationId) : undefined
  const creationOutline = creationNestingRestore(deletion, creation, item.id)
  const ownOutline = originalEffects.find(effect => effect.kind === 'nesting' && effect.itemId === item.id && effect.before.nestingParentId !== null)
    ?? creationOutline
  const ownParent = ownOutline?.kind === 'nesting' ? context.store.item(ownOutline.before.nestingParentId!) : null
  // The creation's temporary root neighbors are not part of its saved group.
  const ownPlacementUnchanged = ownOutline?.kind === 'nesting' && (ownOutline === creationOutline
    ? !item.placement.nestingParentId && item.placement.horizon === ownOutline.after.horizon && item.placement.periodId === ownOutline.after.periodId && item.flowColor === null && !hasActiveParent(context, item.id)
    : samePosition(context.store.position(item), ownOutline.after))
  const ownEligible = ownOutline?.kind === 'nesting' && ownParent && !ownParent.deletedAt && !ownParent.placement.nestingParentId
    && ownParent.placement.horizon === ownOutline.before.horizon && ownParent.placement.periodId === ownOutline.before.periodId
    && ownPlacementUnchanged
  const outline = originalEffects.flatMap(effect => effect.kind === 'nesting' && effect.before.nestingParentId === item.id && effect.after.nestingParentId === null ? [effect] : [])
  const eligible = new Set(outline.filter(effect => {
    const child = context.store.item(effect.itemId)
    const incoming = context.store.relations().filter(edge => edge.childId === child.id)
    const expected = effect.edges.filter(delta => !delta.after.invalidatedAt).map(delta => delta.after.id)
    return !child.deletedAt && !child.placement.nestingParentId && child.flowColor === null && samePosition(context.store.position(child), effect.after)
      && incoming.length === expected.length && incoming.every(edge => expected.includes(edge.id))
  }).map(effect => effect.itemId))
  const candidates = context.store.relations(false).filter(edge => edge.reason === 'delete' && edge.invalidatedBy === item.deletedBy && (edge.parentId === item.id || edge.childId === item.id))
  Object.assign(item, { deletedAt: null, deletedBy: null })
  // A colour reused while this flow was in the trash stays with its new owner.
  const owner = item.flowColor !== null ? flowColorOwner(context, item.flowColor, item.id) : null
  if (owner !== null) { item.flowColor = null; context.warnings.push(serverText().warnings.restoreColorTaken(owner)) }
  touch(context, item)
  const edges: EdgeDelta[] = []
  for (const edge of candidates) {
    const other = context.store.item(edge.parentId === item.id ? edge.childId : edge.parentId)
    const child = edge.childId === item.id ? item : other
    const topology: Relation[] = [...context.store.relations(), ...context.store.nestingLinks().map(link => ({ ...link, id: `nest:${link.childId}`, createdAt: context.now, invalidatedAt: null, invalidatedBy: null, reason: null }))]
    const problem = other.deletedAt ? serverText().warnings.endpointInTrash : child.flowColor !== null ? serverText().warnings.childIsFlow : relationProblem(edge.parentId, edge.childId, topology)
    if (problem) { context.warnings.push(serverText().warnings.relationNotRestored(problem)); continue }
    const restored: Relation = { ...edge, invalidatedAt: null, invalidatedBy: null, reason: null }
    writeEdges(context, [restored], item.id)
    edges.push({ before: edge, after: restored })
  }
  visibilityEffect(context, before, item, edges)
  context.store.event(command.operationId, context.now, 'item_restored', before, item)
  if (ownOutline && ownParent) {
    if (ownEligible && nestingTargets(item.id, context.store.relations(), context.store.nestingLinks())(ownParent.id)) changeNesting(context, item, ownParent)
    else context.warnings.push(nestingText().restored)
  }
  for (const effect of outline) {
    if (eligible.has(effect.itemId)) changeNesting(context, context.store.item(effect.itemId), item)
    else context.warnings.push(nestingText().restored)
  }
  context.label = serverText().labels.restore
  return true
}
function visibilityEffect(context: Context, before: Item, after: Item, edges: EdgeDelta[]): void {
  context.effects.push({ kind: 'visibility', itemId: after.id, before: { deletedAt: before.deletedAt, deletedBy: before.deletedBy }, after: { deletedAt: after.deletedAt, deletedBy: after.deletedBy }, edges })
  context.itemId = after.id
}
export function unlinkItems(context: Context, command: CommandOf<'unlink'>): boolean {
  const edge = context.store.relations().find(row => row.id === command.relationId)
  if (!edge) throw new DomainError('conflict', context.store.effectiveRelations().some(row => row.id === command.relationId && row.inheritedFrom) ? nestingText().inherited : serverText().errors.relationGone)
  assertAvailable(context.store.item(edge.parentId, command.expectedParentVersion))
  assertAvailable(context.store.item(edge.childId, command.expectedChildVersion))
  const previousParent = command.autoPlace ? orderingParent(context, edge.childId) : null
  const after: Relation = { ...edge, invalidatedAt: context.now, invalidatedBy: command.operationId, reason: 'unlink' }
  writeEdges(context, [after])
  context.effects.push({ kind: 'relations', itemId: edge.childId, edges: [{ before: edge, after }] })
  if (command.autoPlace && orderingParent(context, edge.childId) !== previousParent) placeByParent(context, context.store.item(edge.childId))
  context.itemId = edge.childId
  context.label = serverText().labels.unlink
  return true
}
