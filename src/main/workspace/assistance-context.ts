/**
 * [INPUT]: A generation-bound item, effective goal parents and nesting dependencies and the shared execution query.
 * [OUTPUT]: Deterministically trimmed task context and transaction-verifiable dependency guards.
 * [POS]: Worker-local assistance read; does not fetch URL content, scan unrelated bodies or write periods.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { workspaceDate } from '../../domain/calendar'
import type { AssistanceContext } from '../../shared/contracts/assistance'
import type { ItemSummary } from '../../shared/contracts/entities'
import type { Query } from '../../shared/contracts/queries'
import { DomainError } from '../../shared/contracts/commands'
import { serverText } from '../../shared/i18n/server'
import type { Store } from '../storage/store'
import type { ExecutionQueries } from './execution'

export function readAssistanceContext(store: Store, execution: ExecutionQueries, query: Extract<Query, { type: 'assistanceContext' }>, now: string): AssistanceContext {
  const workspace = store.workspace(), item = store.item(query.itemId)
  if (workspace.generation !== query.generation) throw new DomainError('generation', serverText().errors.workspaceReplaced)
  if (!workspace.calendar) throw new DomainError('setup', serverText().errors.setupRequired)
  const facts = execution.summary({ type: 'executionSummary', generation: query.generation, itemId: query.itemId }, now)
  const order = "ORDER BY CASE p.horizon WHEN 'year' THEN 0 WHEN 'half' THEN 1 WHEN 'cycle' THEN 2 WHEN 'month' THEN 3 WHEN 'week' THEN 4 WHEN 'day' THEN 5 ELSE 6 END,p.sortKey,i.id LIMIT ?"
  const topology = store.effectiveRelations()
  const incoming = topology.filter(edge => edge.childId === item.id)
  const parentIds = new Set(incoming.map(edge => edge.parentId))
  const childIds = new Set(topology.filter(edge => edge.parentId === item.id).map(edge => edge.childId))
  const siblingIds = new Set(topology.filter(edge => parentIds.has(edge.parentId) && edge.childId !== item.id).map(edge => edge.childId))
  const parents = store.summaries('i.deletedAt IS NULL AND i.id IN (SELECT value FROM json_each(?))', [JSON.stringify([...parentIds]), 4], order)
  const children = store.summaries("i.deletedAt IS NULL AND i.archivedAt IS NULL AND i.status='todo' AND i.id IN (SELECT value FROM json_each(?))", [JSON.stringify([...childIds]), 9], order)
  const siblings = store.summaries("i.deletedAt IS NULL AND i.archivedAt IS NULL AND i.status='todo' AND i.id IN (SELECT value FROM json_each(?))", [JSON.stringify([...siblingIds]), 9], order)
  const map = (row: ItemSummary): AssistanceContext['parents'][number] => ({ id: row.id, title: row.title, status: row.status, archived: !!row.archivedAt, horizon: row.placement.horizon, periodId: row.placement.periodId, note: row.note?.excerpt ?? null, guidance: row.guidance?.nextAction ?? null })
  // Reserve one of the 20 dependency slots for an outline container, even when it is hidden.
  const siblingLimit = item.placement.nestingParentId ? 7 : 8
  const limitedParents = parents.slice(0, 3), limitedChildren = children.slice(0, 8), limitedSiblings = siblings.slice(0, siblingLimit)
  const dependencies = [...new Map([{ id: item.id, version: item.version }, ...limitedParents, ...limitedChildren, ...limitedSiblings].map(row => [row.id, { itemId: row.id, version: row.version }])).values()]
  const parentRelationIds = incoming.map(edge => edge.id).sort().slice(0, 3)
  const parentRelationCount = incoming.length
  const countVisible = (ids: Set<string>) => Number(store.prepare("SELECT count(*) AS n FROM items WHERE deletedAt IS NULL AND archivedAt IS NULL AND status='todo' AND id IN (SELECT value FROM json_each(?))").get(JSON.stringify([...ids]))!.n)
  const childCount = countVisible(childIds), siblingCount = countVisible(siblingIds)
  if (item.placement.nestingParentId) {
    const root = store.item(item.placement.nestingParentId)
    if (!dependencies.some(dependency => dependency.itemId === root.id)) dependencies.push({ itemId: root.id, version: root.version })
  }
  const context: AssistanceContext = {
    item: { ...item, description: item.description.slice(0, 6000) }, guidance: store.guidance(item.id), period: item.placement.periodId ? store.period(item.placement.periodId) : null,
    parents: limitedParents.map(map), children: limitedChildren.map(map), siblings: limitedSiblings.map(map), recentGuidance: [], facts,
    guard: { today: workspaceDate(workspace.calendar.timezone, now), calendarId: workspace.calendar.id, sourceRevision: facts.sourceRevision, dependencies, guidanceRevision: store.guidance(item.id)?.revision ?? 0, parentRelationCount, parentRelationIds },
    truncatedSections: [], omitted: {},
  }
  for (const [name, count, limit] of [['parents', parentRelationCount, 3], ['children', childCount, 8], ['siblings', siblingCount, siblingLimit]] as const) {
    if (count > limit) { context.truncatedSections.push(name); context.omitted[name] = count - limit }
  }
  if (item.description.length > 6000) { context.truncatedSections.push('description'); context.omitted.description = item.description.length - 6000 }
  const recent = store.prepare("SELECT operationId FROM item_events WHERE itemId=? AND type='guidance_changed' ORDER BY seq DESC LIMIT 3").all(item.id)
  for (const row of recent) {
    if (row.operationId === context.guidance?.operationId) continue
    const operation = store.operation(String(row.operationId))
    const value = operation?.effects.find(effect => effect.kind === 'guidance' && effect.itemId === item.id)
    if (value?.kind === 'guidance' && value.after.value) context.recentGuidance.push(value.after.value)
    if (context.recentGuidance.length === 2) break
  }
  // Reserve 2,000 code units for each explicit user turn. The task and current guidance have priority.
  const groups = ['siblings', 'children', 'parents', 'recentGuidance'] as const
  for (const group of groups) while (context[group].length && JSON.stringify(context).length > 12_000) {
    context[group].pop(); context.omitted[group] = (context.omitted[group] ?? 0) + 1
    if (!context.truncatedSections.includes(group)) context.truncatedSections.push(group)
  }
  if (JSON.stringify(context).length > 12_000) {
    const excess = JSON.stringify(context).length - 12_000
    context.item.description = context.item.description.slice(0, Math.max(0, context.item.description.length - excess))
    if (!context.truncatedSections.includes('description')) context.truncatedSections.push('description')
    context.omitted.description = item.description.length - context.item.description.length
  }
  const retainedIds = new Set([item.id, ...(item.placement.nestingParentId ? [item.placement.nestingParentId] : []), ...context.parents.map(row => row.id), ...context.children.map(row => row.id), ...context.siblings.map(row => row.id)])
  context.guard.dependencies = context.guard.dependencies.filter(row => retainedIds.has(row.itemId))
  if (JSON.stringify(context).length > 14_000 || Buffer.byteLength(JSON.stringify(context)) > 48 * 1024) throw new DomainError('invalid', serverText().errors.fileTooLarge)
  return context
}
