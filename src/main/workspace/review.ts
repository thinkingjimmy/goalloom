/**
 * [INPUT]: Generation-bound week/month selections, Repository and its injected clock.
 * [OUTPUT]: A period-end review projection, live unfinished placements and exact destination-period planning summaries.
 * [POS]: Read-only review boundary in the serial storage worker; historical states never become write versions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { compareInstants, currentPeriod, parseDate, workspaceDate } from '../../domain/calendar'
import { Temporal } from '../../domain/temporal'
import { DomainError } from '../../shared/contracts/commands'
import type { ItemSummary, PlanningPeriod } from '../../shared/contracts/entities'
import type { Query, ReviewContext, Snapshot } from '../../shared/contracts/queries'
import { serverText } from '../../shared/i18n/server'
import type { Repository } from './repository'
import { projectPeriod } from './history'
import { readBoardPeriods } from './periods'

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
  const periods = (['cycle', 'month', 'week', 'day'] as const).flatMap(horizon => {
    // A workspace created this month has no preceding cycle to invent.
    if (horizon === 'cycle' && workspaceDate(calendar.timezone, observation) < calendar.cycleAnchor) return []
    return [currentPeriod(calendar, horizon, observation)]
  })
  const unknown = new Set<string>()
  let board: Snapshot = { ...snapshot, periods }
  if (closed) {
    const items: ItemSummary[] = []
    for (const period of periods) {
      const projections = projectPeriod(store, { ...period, endAt: end })
      for (const { id, endState } of projections) {
        if (!endState) {
          const item = store.summaries('i.id=?', [id])[0]
          if (item && compareInstants(item.createdAt, end) < 0) unknown.add(id)
          continue
        }
        if (endState.periodId !== period.id || endState.deletedAt || endState.archivedAt || endState.status === 'cancelled') continue
        const item = store.summaries('i.id=?', [id])[0]
        if (!item) continue
        items.push({ ...item, status: endState.status, completedAt: endState.completedAt, cancelledAt: endState.cancelledAt,
          archivedAt: endState.archivedAt, deletedAt: endState.deletedAt, deletedBy: endState.deletedBy,
          placement: { ...item.placement, horizon: endState.horizon, periodId: endState.periodId, sortKey: endState.sortKey, holdPeriodId: endState.holdPeriodId } })
      }
    }
    // As with history, text is current; lifecycle/placement facts are projected at the review boundary.
    const roots = store.summaries('i.flowColor IS NOT NULL AND julianday(i.createdAt)<julianday(?) AND (i.deletedAt IS NULL OR julianday(i.deletedAt)>=julianday(?))', [end, end])
    const flows = roots.map(item => ({ id: item.id, title: item.title, flowColor: item.flowColor!, archived: !!item.archivedAt && compareInstants(item.archivedAt, end) < 0 }))
    const relations = store.prepare('SELECT id,parentId,childId FROM item_relations WHERE julianday(createdAt)<julianday(?) AND (invalidatedAt IS NULL OR julianday(invalidatedAt)>=julianday(?)) ORDER BY createdAt,id').all(end, end) as Snapshot['relations']
    board = { ...board, items, flows, relations, observedAt: observation, orderNodes: [], rolloverSources: {}, backlog: {} }
  }
  const closing = targets.flatMap(period => store.summaries("i.status='todo' AND i.deletedAt IS NULL AND i.archivedAt IS NULL AND p.periodId IN (SELECT id FROM planning_periods WHERE horizon=? AND startDate<=?)", [period.horizon, period.startDate]))
  const sourcePeriods = [...new Set(closing.map(item => item.placement.periodId!))].map(id => store.period(id))
  const destinations = new Map<string, PlanningPeriod>()
  for (const period of targets) {
    const next = currentPeriod(calendar, period.horizon, period.endAt)
    const parent = currentPeriod(calendar, period.horizon === 'month' ? 'cycle' : 'month', next.startAt)
    destinations.set(parent.horizon, parent)
    destinations.set(next.horizon, next)
  }
  const planning = readBoardPeriods(store, { type: 'boardPeriods', generation: query.generation,
    periods: [...destinations.values()].map(({ horizon, startDate }) => ({ horizon, startDate })) }, now)
  return { board, planning: { ...snapshot, periods: planning.periods, items: planning.items, orderNodes: planning.orderNodes, rolloverSources: planning.rolloverSources }, closing, sourcePeriods, unknown: unknown.size }
}
