/**
 * [INPUT]: A generation-bound item, indexed active relations and the shared execution query.
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
  const parents = store.summaries('i.deletedAt IS NULL AND i.id IN (SELECT parentId FROM item_relations WHERE childId=? AND invalidatedAt IS NULL)', [item.id, 4], order)
  const children = store.summaries("i.deletedAt IS NULL AND i.archivedAt IS NULL AND i.status='todo' AND i.id IN (SELECT childId FROM item_relations WHERE parentId=? AND invalidatedAt IS NULL)", [item.id, 9], order)
  const siblings = store.summaries(`i.id!=? AND i.deletedAt IS NULL AND i.archivedAt IS NULL AND i.status='todo' AND i.id IN
    (SELECT childId FROM item_relations WHERE invalidatedAt IS NULL AND parentId IN (SELECT parentId FROM item_relations WHERE childId=? AND invalidatedAt IS NULL))`, [item.id, item.id, 9], order)
  const map = (row: ItemSummary): AssistanceContext['parents'][number] => ({ id: row.id, title: row.title, status: row.status, archived: !!row.archivedAt, horizon: row.placement.horizon, periodId: row.placement.periodId, note: row.note?.excerpt ?? null, guidance: row.guidance?.nextAction ?? null })
  const limitedParents = parents.slice(0, 3), limitedChildren = children.slice(0, 8), limitedSiblings = siblings.slice(0, 8)
  const dependencies = [...new Map([{ id: item.id, version: item.version }, ...limitedParents, ...limitedChildren, ...limitedSiblings].map(row => [row.id, { itemId: row.id, version: row.version }])).values()]
  const parentRelationIds = store.prepare('SELECT id FROM item_relations WHERE childId=? AND invalidatedAt IS NULL ORDER BY id LIMIT 3').all(item.id).map(row => String(row.id))
  const parentRelationCount = Number(store.prepare('SELECT count(*) AS n FROM item_relations WHERE childId=? AND invalidatedAt IS NULL').get(item.id)!.n)
  const childCount = Number(store.prepare("SELECT count(*) AS n FROM item_relations r JOIN items i ON i.id=r.childId WHERE r.parentId=? AND r.invalidatedAt IS NULL AND i.deletedAt IS NULL AND i.archivedAt IS NULL AND i.status='todo'").get(item.id)!.n)
  const siblingCount = Number(store.prepare("SELECT count(DISTINCT r.childId) AS n FROM item_relations r JOIN items i ON i.id=r.childId WHERE r.childId!=? AND r.invalidatedAt IS NULL AND i.deletedAt IS NULL AND i.archivedAt IS NULL AND i.status='todo' AND r.parentId IN (SELECT parentId FROM item_relations WHERE childId=? AND invalidatedAt IS NULL)").get(item.id, item.id)!.n)
  const context: AssistanceContext = {
    item: { ...item, description: item.description.slice(0, 6000) }, guidance: store.guidance(item.id), period: item.placement.periodId ? store.period(item.placement.periodId) : null,
    parents: limitedParents.map(map), children: limitedChildren.map(map), siblings: limitedSiblings.map(map), recentGuidance: [], facts,
    guard: { today: workspaceDate(workspace.calendar.timezone, now), calendarId: workspace.calendar.id, sourceRevision: facts.sourceRevision, dependencies, guidanceRevision: store.guidance(item.id)?.revision ?? 0, parentRelationCount, parentRelationIds },
    truncatedSections: [], omitted: {},
  }
  for (const [name, count, limit] of [['parents', parentRelationCount, 3], ['children', childCount, 8], ['siblings', siblingCount, 8]] as const) {
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
  const retainedIds = new Set([item.id, ...context.parents.map(row => row.id), ...context.children.map(row => row.id), ...context.siblings.map(row => row.id)])
  context.guard.dependencies = context.guard.dependencies.filter(row => retainedIds.has(row.itemId))
  if (JSON.stringify(context).length > 14_000 || Buffer.byteLength(JSON.stringify(context)) > 48 * 1024) throw new DomainError('invalid', serverText().errors.fileTooLarge)
  return context
}
