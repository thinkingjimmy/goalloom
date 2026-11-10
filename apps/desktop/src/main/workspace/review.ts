/**
 * [INPUT]: Generation-bound day/week/month selections, shared outline ordering, Repository and its injected clock.
 * [OUTPUT]: A period-end review projection, child-horizon steps (a week's days, a month's weeks) projected at each child period's end, live unfinished outlines, current parent summaries, active/future destination planning summaries and raw focus pointers for both.
 * [POS]: Read-only review boundary in the serial storage worker; historical states never become write versions.
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
  // Closed periods keep their historical pointers; the renderer judges them against the projected items.
  let board: Snapshot = { ...snapshot, periods, focus: store.focus(periods.map(period => period.id)) }
  // Each period is projected at its own end: text is current; lifecycle/placement facts are historical.
  const project = (period: PlanningPeriod, at: string, record = true): ItemSummary[] => projectPeriod(store, { ...period, endAt: at }).flatMap(({ id, endState }) => {
    if (!endState) {
      const item = store.summaries('i.id=?', [id])[0]
      if (record && item && compareInstants(item.createdAt, at) < 0) unknown.add(id)
      return []
    }
    if (endState.periodId !== period.id || endState.deletedAt) return []
    const item = store.summaries('i.id=?', [id])[0]
    if (!item) return []
    return [{ ...item, status: endState.status, completedAt: endState.completedAt, cancelledAt: endState.cancelledAt,
      archivedAt: endState.archivedAt, deletedAt: endState.deletedAt, deletedBy: endState.deletedBy,
      placement: { ...item.placement, horizon: endState.horizon, periodId: endState.periodId, sortKey: endState.sortKey, holdPeriodId: endState.holdPeriodId, nestingParentId: endState.nestingParentId ?? null } }]
  })
  // Steps: every child-horizon period inside a reviewed week (its days) or month (its weeks).
  const steps: ItemSummary[] = []
  if (closed) for (const target of targets) {
    const child = target.horizon === 'month' ? 'week' : target.horizon === 'week' ? 'day' : null
    if (!child) continue
    for (let period = currentPeriod(calendar, child, target.startAt); compareInstants(period.startAt, target.endAt) < 0; period = currentPeriod(calendar, child, period.endAt)) {
      const at = compareInstants(period.endAt, end) < 0 ? period.endAt : end
      steps.push(...project(period, at, false).filter(item => !item.archivedAt && item.status !== 'cancelled'))
    }
  }
  if (closed) {
    const items: ItemSummary[] = [], projected: ItemSummary[] = []
    for (const period of periods) {
      for (const row of project(period, end)) {
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
    // A current week can outlive its starting month; planning must use an unexpired parent period.
    const planningAt = compareInstants(next.startAt, now) < 0 ? now : next.startAt
    const parent = currentPeriod(calendar, period.horizon === 'month' ? 'cycle' : period.horizon === 'week' ? 'month' : 'week', planningAt)
    destinations.set(parent.horizon, parent)
    destinations.set(next.horizon, next)
  }
  const planning = readBoardPeriods(store, { type: 'boardPeriods', generation: query.generation,
    periods: [...destinations.values()].map(({ horizon, startDate }) => ({ horizon, startDate })) }, now)
  return { board, planning: { ...snapshot, periods: planning.periods, items: planning.items, nestingParents: planning.nestingParents, orderNodes: planning.orderNodes, rolloverSources: planning.rolloverSources, focus: planning.focus ?? [] }, closing, closingParents: parents, sourcePeriods, unknown: unknown.size, steps }
}
