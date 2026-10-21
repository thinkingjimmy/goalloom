/**
 * [INPUT]: Generation/version-guarded nest/unnest commands, optional child/root insertion and current explicit goals/placements.
 * [OUTPUT]: Persistent cross-period ownership, placement-local order, atomic flattened groups and inherited-edge/color provenance.
 * [POS]: Authoritative outline writes shared by dragging, lifecycle and ordinary moves.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { compareInstants } from '../../../domain/calendar'
import { validateDag } from '../../../domain/relations'
import { nestingTargets, sameOutlinePeriod } from '../../../domain/nesting'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { Item, Relation } from '../../../shared/contracts/entities'
import type { EdgeDelta, NestingPosition } from '../../../shared/contracts/effects'
import { nestingText } from '../../../shared/i18n/nesting'
import { assertAvailable, nextSortKey, touch, type Context } from '../context'

export function assertOutline(context: Context): void {
  const links = context.store.nestingLinks()
  if (!links.length) return
  const items = context.store.prepare('SELECT i.id,i.flowColor,p.horizon,p.periodId,p.nestingParentId FROM items i JOIN item_placements p ON p.itemId=i.id WHERE i.deletedAt IS NULL').all()
  const byId = new Map(items.map(item => [String(item.id), item]))
  const raw = context.store.relations(), incoming = new Set(raw.map(edge => edge.childId))
  for (const link of links) {
    const parent = byId.get(link.parentId), child = byId.get(link.childId)
    if (!parent || !child || parent.nestingParentId || parent.id === child.id
      || (parent.horizon === 'later') !== (child.horizon === 'later')
      || child.flowColor !== null || incoming.has(String(child.id))) throw new DomainError('conflict', nestingText().changed)
  }
  const topology: Relation[] = [...raw.map(edge => ({ ...edge, id: `goal:${edge.id}` })), ...links.map(link => ({ ...link, id: `nest:${link.childId}`, createdAt: context.now, invalidatedAt: null, invalidatedBy: null, reason: null }))]
  try { validateDag(new Set(items.map(item => String(item.id))), topology) }
  catch { throw new DomainError('conflict', nestingText().cycle) }
}
export function nestingPosition(context: Context, item: Item): NestingPosition {
  return { ...context.store.position(item), nestingParentId: item.placement.nestingParentId ?? null }
}
export function changeNesting(context: Context, item: Item, parent: Item | null, beforeId?: string | null, preservePlacement = false): boolean {
  const oldParent = item.placement.nestingParentId ?? null
  if (oldParent === (parent?.id ?? null)) return false
  if (parent && (parent.id === item.id || parent.placement.nestingParentId || context.store.hasNestedChildren(item.id))) throw new DomainError('conflict', nestingText().levels)
  if (parent) {
    const links = context.store.nestingLinks().filter(link => link.childId !== item.id)
    links.push({ parentId: parent.id, childId: item.id })
    const edges = context.store.relations().filter(edge => edge.childId !== item.id)
    const graph: Relation[] = [...edges.map(edge => ({ ...edge, id: `goal:${edge.id}` })), ...links.map(link => ({ ...link, id: `nest:${link.childId}`, createdAt: context.now, invalidatedAt: null, invalidatedBy: null, reason: null }))]
    try { validateDag(new Set(context.store.prepare('SELECT id FROM items WHERE deletedAt IS NULL').all().map(row => String(row.id))), graph) }
    catch { throw new DomainError('conflict', nestingText().cycle) }
  }
  const beforeItem = structuredClone(item), before = nestingPosition(context, item)
  const remoteDetach = !parent && !!oldParent && !sameOutlinePeriod(item.placement, context.store.item(oldParent).placement)
  const destination = parent && !preservePlacement ? parent.placement : item.placement
  const keepPosition = remoteDetach && beforeId === undefined || preservePlacement && parent && !sameOutlinePeriod(item.placement, parent.placement)
  const sortKey = keepPosition ? item.placement.sortKey : nextSortKey(context, destination.horizon,
    destination.periodId, beforeId ?? null, item.id, parent?.id ?? null)
  const incoming = context.store.relations().filter(edge => edge.childId === item.id)
  const inherited = !parent && oldParent ? context.store.relations().filter(edge => edge.childId === oldParent) : []
  const edges: EdgeDelta[] = incoming.map(edge => ({ before: edge, after: { ...edge, invalidatedAt: context.now, invalidatedBy: context.command.operationId, reason: 'unlink' } }))
  for (const delta of edges) context.store.saveRelation(delta.after)
  const flowColor = item.flowColor === null ? undefined : { before: item.flowColor, after: null as null }
  if (flowColor) { item.flowColor = null; touch(context, item) }
  const p = item.placement, version = p.version
  p.nestingParentId = parent?.id ?? null
  if (parent && !preservePlacement) { p.horizon = parent.placement.horizon; p.periodId = parent.placement.periodId }
  p.sortKey = sortKey; p.version++; if (parent) p.holdPeriodId = null
  context.store.savePlacement(p, version)
  for (const source of inherited) {
    const edge: Relation = { id: randomUUID(), parentId: source.parentId, childId: item.id, createdAt: context.now, invalidatedAt: null, invalidatedBy: null, reason: null }
    context.store.saveRelation(edge); edges.push({ before: null, after: edge })
  }
  touch(context, item)
  context.effects.push({ kind: 'nesting', itemId: item.id, before, after: nestingPosition(context, item), edges, ...(flowColor ? { flowColor } : {}),
    ...(oldParent && !parent ? { inheritedFrom: { rootId: oldParent, relations: inherited } } : {}) })
  context.store.event(context.command.operationId, context.now, 'nesting_changed', beforeItem, item)
  context.itemId = item.id; context.label = parent ? nestingText().nest : nestingText().unnest
  return true
}
export function nestItem(context: Context, command: CommandOf<'nest'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion), parent = context.store.item(command.parentId, command.expectedParentVersion)
  assertAvailable(item); assertAvailable(parent)
  if (item.placement.version !== command.expectedPlacementVersion || parent.placement.version !== command.expectedParentPlacementVersion) throw new DomainError('stale', nestingText().changed)
  for (const endpoint of [item, parent]) if (endpoint.placement.periodId && compareInstants(context.store.period(endpoint.placement.periodId).endAt, context.now) <= 0) throw new DomainError('stale_preview', nestingText().expired)
  if (item.archivedAt || item.status === 'cancelled' || parent.archivedAt || parent.status === 'cancelled') throw new DomainError('conflict', nestingText().changed)
  if (!nestingTargets(item.id, context.store.relations(), context.store.nestingLinks())(parent.id)) throw new DomainError('conflict', nestingText().cycle)
  // Reparent children first so neither SQLite nor sync replay sees a third level.
  const children = context.store.nestedItems(item.id)
  for (const child of children) changeNesting(context, child, parent, command.beforeId ?? null)
  return changeNesting(context, item, parent, children[0]?.id ?? command.beforeId ?? null)
}
export function unnestItem(context: Context, command: CommandOf<'unnest'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion); assertAvailable(item)
  if (item.placement.version !== command.expectedPlacementVersion) throw new DomainError('stale', nestingText().changed)
  if (command.beforeId !== undefined && item.placement.periodId && compareInstants(context.store.period(item.placement.periodId).endAt, context.now) <= 0) throw new DomainError('stale_preview', nestingText().expired)
  return changeNesting(context, item, null, command.beforeId)
}
