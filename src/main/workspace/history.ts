/**
 * [INPUT]: Validated history/activity queries, Store and observation time.
 * [OUTPUT]: Period pages (members grouped by outcome, per-outcome summary, earliest-period stop), the recent past-period index and paged activity.
 * [POS]: Read-only history adapter; never creates periods or synthesizes events.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { compareInstants, currentPeriod, parseDate, precedingPeriod, type Period } from '../../domain/calendar'
import { historyOutcome, projectOrderedHistory } from '../../domain/history'
import { DomainError } from '../../shared/contracts/commands'
import type { Query } from '../../shared/contracts/queries'
import type { HistoryIndex, HistoryOutcome, HistoryPage, Activity } from '../../shared/contracts/history'
import type { Store } from '../storage/store'
import { serverText } from '../../shared/i18n/server'

const order: Record<HistoryOutcome, number> = { done: 0, open: 1, moved: 2, cancelled: 3, unknown: 4 }
// --- 两个独立索引取成员，不扫描全库 JSON，也不把其他尺度隐式纳入。 ---
const membership = 'SELECT itemId FROM item_events WHERE fromPeriodId=? UNION SELECT itemId FROM item_events WHERE toPeriodId=?'

/** Every member's end-of-period projection in one ordered event stream, grouped by outcome then end-state order. */
function projectPeriod(store: Store, period: Period) {
  const stream = store.prepare(`SELECT * FROM item_events WHERE itemId IN (${membership}) ORDER BY itemId,seq`).iterate(period.id, period.id)
  let current = stream.next()
  const projections = []
  while (!current.done) {
    const id = String(current.value.itemId)
    function* eventsFor() {
      while (!current.done && current.value.itemId === id) {
        yield store.eventRows([current.value])[0]!
        current = stream.next()
      }
    }
    const projection = projectOrderedHistory(eventsFor(), period, 5)
    projections.push({ id, ...projection, outcome: historyOutcome(projection.endState, period) })
  }
  return projections.sort((a, b) => order[a.outcome] - order[b.outcome] || (a.endState?.sortKey ?? 0) - (b.endState?.sortKey ?? 0) || a.id.localeCompare(b.id))
}

function closedPeriod(store: Store, horizon: Extract<Query, { type: 'history' }>['horizon'], startDate: string, now: string): Period {
  const calendar = store.workspace().calendar
  if (!calendar) throw new DomainError('setup', serverText().errors.setupRequired)
  const instant = parseDate(startDate).toZonedDateTime(calendar.timezone).toInstant().toString()
  const period = currentPeriod(calendar, horizon, instant)
  if (period.startDate !== startDate || compareInstants(period.endAt, now) > 0) throw new DomainError('invalid', serverText().errors.closedPeriodOnly)
  return period
}

export function readHistory(store: Store, query: Extract<Query, { type: 'history' }>, now: string): HistoryPage {
  const calendar = store.workspace().calendar!
  const period = closedPeriod(store, query.horizon, query.startDate, now)
  const projections = projectPeriod(store, period)
  const summary = { done: 0, open: 0, moved: 0, cancelled: 0, unknown: 0 }
  for (const projection of projections) summary[projection.outcome]++
  const page = projections.slice(query.offset, query.offset + query.limit)
  const keys = page.map(projection => projection.id), placeholders = keys.map(() => '?').join(',') || 'NULL'
  const items = new Map(store.summaries(`i.id IN (${placeholders})`, keys).map(item => [item.id, item]))
  const rows = page.map(({ id, endState, outcome, later, laterCount, anomalous }) => ({ item: items.get(id)!, endState, outcome, later, laterCount, anomalous })) as HistoryPage['rows']
  // Stepping back ends at the earliest period of this scale the workspace ever materialised.
  const earlier = store.prepare('SELECT 1 FROM planning_periods WHERE horizon=? AND startDate<? LIMIT 1').get(period.horizon, period.startDate)
  return { period, previous: earlier ? precedingPeriod(calendar, period) : null, next: currentPeriod(calendar, period.horizon, period.endAt), rows, total: projections.length, summary }
}

/** Recent closed periods of one scale that had members, newest first, with their completion counts for the period picker. */
export function readHistoryIndex(store: Store, query: Extract<Query, { type: 'historyIndex' }>, now: string): HistoryIndex {
  if (!store.workspace().calendar) throw new DomainError('setup', serverText().errors.setupRequired)
  const recent = store.prepare('SELECT * FROM planning_periods WHERE horizon=? ORDER BY startAt DESC LIMIT ?').all(query.horizon, indexLimit + 1) as unknown as Period[]
  return {
    periods: recent.filter(period => compareInstants(period.endAt, now) <= 0).slice(0, indexLimit).flatMap(period => {
      const projections = projectPeriod(store, period)
      return projections.length ? [{ period, total: projections.length, done: projections.filter(projection => projection.outcome === 'done').length }] : []
    }),
  }
}
const indexLimit = 24
export function readActivity(store: Store, query: Extract<Query, { type: 'activity' }>): Activity {
  if (!store.prepare('SELECT 1 FROM items WHERE id=?').get(query.itemId)) throw new DomainError('invalid', serverText().errors.itemMissing)
  const events = store.eventRows(store.db.prepare('SELECT * FROM item_events WHERE itemId=? AND seq<? ORDER BY seq DESC LIMIT ?').all(query.itemId, query.beforeSeq ?? Number.MAX_SAFE_INTEGER, query.limit + 1)) as Activity['events']
  return { events: events.slice(0, query.limit), more: events.length > query.limit }
}
