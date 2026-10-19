/**
 * [INPUT]: Generation-bound week/month selections, shared outline ordering, Repository and its injected clock.
 * [OUTPUT]: A period-end review projection, placement-local live unfinished outlines, their current parent summaries and exact destination-period planning summaries.
 * [POS]: Read-only review boundary in the serial storage worker; historical states never become write versions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { compareInstants, currentPeriod, parseDate, workspaceDate } from '../../domain/calendar'
import { effectiveRelations, outlineRows } from '../../domain/nesting'
import { inheritedRelationId } from '../storage/store'
import type { Relation } from '../../shared/contracts/entities'
import { Temporal } from '../../domain/temporal'
import { DomainError } from '../../shared/contracts/commands'
import type { ItemSummary, PlanningPeriod } from '../../shared/contracts/entities'
import type { Query, ReviewContext, Snapshot } from '../../shared/contracts/queries'
import { serverText } from '../../shared/i18n/server'
import type { Repository } from './repository'
import { projectPeriod } from './history'
import { readBoardPeriods } from './periods'
import { isAnchoredHorizon, periodHorizons } from '../../shared/contracts/values'

export function readReviewContext(repository: Repository, query: Extract<Query, { type: 'reviewContext' }>): ReviewContext {
  const { store } = repository
  const snapshot = repository.snapshot(), { workspace, observedAt: now } = snapshot
  if (workspace.generation !== query.generation) throw new DomainError('generation', serverText().errors.workspaceReplaced)
  const calendar = workspace.calendar
  if (!calendar) throw new DomainError('setup', serverText().errors.setupRequired)
  const invalid = () => new DomainError('invalid', serverText().errors.invalidPlanningPeriod)
  const targets = query.periods.map(({ horizon, startDate }) => {
    const period = currentPeriod(calendar, horizon, parseDate(startDate).toZonedDateTime(calendar.timezone).toInstant().toString())
    if (period.startDate !== startDate || compareInstants(period.startAt, now) > 0) throw invalid()
    return period
  })
  if (new Set(targets.map(period => period.horizon)).size !== targets.length || targets.some(period => period.endAt !== targets[0]!.endAt)) throw invalid()
  const end = targets[0]!.endAt, closed = compareInstants(end, now) <= 0
  const observation = closed ? Temporal.Instant.from(end).subtract({ nanoseconds: 1 }).toString() : now
  const periods = periodHorizons.flatMap(horizon => {
    // Anchored periods do not exist before setup's original anchor.
    if (isAnchoredHorizon(horizon) && workspaceDate(calendar.timezone, observation) < calendar.cycleAnchor) return []
    return [currentPeriod(calendar, horizon, observation)]
  })
  const unknown = new Set<string>()
  let board: Snapshot = { ...snapshot, periods }
  if (closed) {
    const items: ItemSummary[] = [], projected: ItemSummary[] = []
    for (const period of periods) {
      const projections = projectPeriod(store, { ...period, endAt: end })
      for (const { id, endState } of projections) {
        if (!endState) {
          const item = store.summaries('i.id=?', [id])[0]
          if (item && compareInstants(item.createdAt, end) < 0) unknown.add(id)
          continue
        }
        if (endState.periodId !== period.id || endState.deletedAt) continue
        const item = store.summaries('i.id=?', [id])[0]
        if (!item) continue
        const row: ItemSummary = { ...item, guidance: null, status: endState.status, completedAt: endState.completedAt, cancelledAt: endState.cancelledAt,
          archivedAt: endState.archivedAt, deletedAt: endState.deletedAt, deletedBy: endState.deletedBy,
          placement: { ...item.placement, horizon: endState.horizon, periodId: endState.periodId, sortKey: endState.sortKey, holdPeriodId: endState.holdPeriodId, nestingParentId: endState.nestingParentId ?? null } }
        projected.push(row)
        if (!row.archivedAt && row.status !== 'cancelled') items.push(row)
      }
    }
    // As with history, text is current; lifecycle/placement facts are projected at the review boundary.
    const roots = store.summaries('i.flowColor IS NOT NULL AND julianday(i.createdAt)<julianday(?) AND (i.deletedAt IS NULL OR julianday(i.deletedAt)>=julianday(?))', [end, end])
    const flows = roots.map(item => ({ id: item.id, title: item.title, flowColor: item.flowColor!, archived: !!item.archivedAt && compareInstants(item.archivedAt, end) < 0 }))
    const nesting = projected.flatMap(item => item.placement.nestingParentId ? [{ parentId: item.placement.nestingParentId, childId: item.id }] : [])
    const raw = store.prepare('SELECT * FROM item_relations WHERE julianday(createdAt)<julianday(?) AND (invalidatedAt IS NULL OR julianday(invalidatedAt)>=julianday(?)) ORDER BY createdAt,id').all(end, end) as unknown as Relation[]
    const relations = effectiveRelations(raw.map(edge => ({ ...edge, invalidatedAt: null, invalidatedBy: null, reason: null })), nesting, inheritedRelationId)
      .map(({ id, parentId, childId, inheritedFrom }) => ({ id, parentId, childId, ...(inheritedFrom ? { inheritedFrom } : {}) }))
    const parents = new Set(items.flatMap(item => item.placement.nestingParentId ? [item.placement.nestingParentId] : []))
    board = { ...board, items, flows, relations, nesting, nestingParents: projected.filter(item => parents.has(item.id)), observedAt: observation, orderNodes: [], rolloverSources: {}, backlog: {} }
  }
  const unfinished = targets.flatMap(period => store.summaries("i.status='todo' AND i.deletedAt IS NULL AND i.archivedAt IS NULL AND p.periodId IN (SELECT id FROM planning_periods WHERE horizon=? AND startDate<=?)", [period.horizon, period.startDate]))
  const sourcePeriods = [...new Set(unfinished.map(item => item.placement.periodId!))].map(id => store.period(id))
    .sort((a, b) => b.startDate.localeCompare(a.startDate) || a.horizon.localeCompare(b.horizon))
  const parents = store.nestingParents(unfinished)
  const closing = sourcePeriods.flatMap(period => outlineRows(unfinished.filter(item => item.placement.periodId === period.id), undefined, parents))
  const destinations = new Map<string, PlanningPeriod>()
  for (const period of targets) {
    const next = currentPeriod(calendar, period.horizon, period.endAt)
    const parent = currentPeriod(calendar, period.horizon === 'month' ? 'cycle' : 'month', next.startAt)
    destinations.set(parent.horizon, parent)
    destinations.set(next.horizon, next)
  }
  const planning = readBoardPeriods(store, { type: 'boardPeriods', generation: query.generation,
    periods: [...destinations.values()].map(({ horizon, startDate }) => ({ horizon, startDate })) }, now)
  return { board, planning: { ...snapshot, periods: planning.periods, items: planning.items, nestingParents: planning.nestingParents, orderNodes: planning.orderNodes, rolloverSources: planning.rolloverSources }, closing, closingParents: parents, sourcePeriods, unknown: unknown.size }
}
