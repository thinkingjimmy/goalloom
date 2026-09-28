/**
 * [INPUT]: Validated period selections, workspace calendar, observation time and Store.
 * [OUTPUT]: Read-only current/future resolution and board/ancestor summaries with generation/revision guards.
 * [POS]: Planning read boundary shared by explicit placement writes; reads never materialize periods.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { compareInstants, currentPeriod, parseDate, type Horizon, type Period } from '../../domain/calendar'
import { DomainError } from '../../shared/contracts/commands'
import type { BoardPeriods, Query } from '../../shared/contracts/queries'
import { serverText } from '../../shared/i18n/server'
import type { Store } from '../storage/store'
import { orderNodes } from './ordering'

export function readPlanningPeriod(store: Store, horizon: Horizon, startDate: string, now: string): Period {
  const calendar = store.workspace().calendar
  if (!calendar) throw new DomainError('setup', serverText().errors.setupRequired)
  const instant = parseDate(startDate).toZonedDateTime(calendar.timezone).toInstant().toString()
  let period: Period
  try { period = currentPeriod(calendar, horizon, instant) }
  catch { throw new DomainError('invalid', serverText().errors.invalidPlanningPeriod) }
  if (period.startDate !== startDate) throw new DomainError('invalid', serverText().errors.invalidPlanningPeriod)
  if (compareInstants(period.endAt, now) <= 0) throw new DomainError('stale_preview', serverText().errors.planningPeriodExpired)
  return period
}

export function periodRolloverSources(store: Store, ids: string[]): Record<string, string> {
  if (!ids.length) return {}
  const rows = store.db.prepare(`SELECT e.itemId,pp.startDate FROM items i JOIN item_placements p ON p.itemId=i.id
    JOIN item_events e ON e.seq=(SELECT max(seq) FROM item_events WHERE itemId=i.id AND fromPeriodId IS NOT toPeriodId)
    JOIN planning_periods pp ON pp.id=e.fromPeriodId
    WHERE i.deletedAt IS NULL AND i.archivedAt IS NULL AND i.status!='cancelled'
      AND p.periodId IN (${ids.map(() => '?').join(',')}) AND e.type='rolled_over'`).all(...ids)
  return Object.fromEntries(rows.map(row => [String(row.itemId), String(row.startDate)]))
}

export function readBoardPeriods(store: Store, query: Extract<Query, { type: 'boardPeriods' }>, now: string): BoardPeriods {
  const workspace = store.workspace()
  if (workspace.generation !== query.generation) throw new DomainError('generation', serverText().errors.workspaceReplaced)
  if (new Set(query.periods.map(period => period.horizon)).size !== query.periods.length) throw new DomainError('invalid', serverText().errors.duplicateSelection)
  const periods = query.periods.map(({ horizon, startDate }) => readPlanningPeriod(store, horizon, startDate, now))
  const ids = periods.map(period => period.id)
  const items = store.summaries(`i.deletedAt IS NULL AND i.archivedAt IS NULL AND i.status!='cancelled' AND p.periodId IN (${ids.map(() => '?').join(',')})`, ids)
  return { generation: workspace.generation, revision: workspace.revision, periods, items, orderNodes: orderNodes(store, items.map(item => item.id)), rolloverSources: periodRolloverSources(store, ids) }
}
