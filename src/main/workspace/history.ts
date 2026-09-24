/**
 * [INPUT]: Validated history/activity queries, Store and observation time.
 * [OUTPUT]: Batched item summaries, streaming period projections and paged activity.
 * [POS]: Read-only history adapter; never creates periods or synthesizes events.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { compareInstants, currentPeriod, parseDate, precedingPeriod } from '../../domain/calendar'
import { projectOrderedHistory } from '../../domain/history'
import { DomainError } from '../../shared/contracts/commands'
import type { Query } from '../../shared/contracts/queries'
import type { HistoryPage, Activity } from '../../shared/contracts/history'
import type { Store } from '../storage/store'
import { serverText } from '../../shared/i18n/server'

export function readHistory(store: Store, query: Extract<Query, { type: 'history' }>, now: string): HistoryPage {
  const calendar = store.workspace().calendar
  if (!calendar) throw new DomainError('setup', serverText().errors.setupRequired)
  const instant = parseDate(query.startDate).toZonedDateTime(calendar.timezone).toInstant().toString()
  const period = currentPeriod(calendar, query.horizon, instant)
  if (period.startDate !== query.startDate || compareInstants(period.endAt, now) > 0) throw new DomainError('invalid', serverText().errors.closedPeriodOnly)
  // --- 两个独立索引取成员，不扫描全库 JSON，也不把其他尺度隐式纳入。 ---
  const membership = 'SELECT itemId FROM item_events WHERE fromPeriodId=? UNION SELECT itemId FROM item_events WHERE toPeriodId=?'
  const total = Number(store.db.prepare(`SELECT count(*) AS n FROM (${membership})`).get(period.id, period.id)!.n)
  const ids = store.db.prepare(`${membership} ORDER BY itemId LIMIT ? OFFSET ?`).all(period.id, period.id, query.limit, query.offset)
  const keys = ids.map(row => String(row.itemId)), placeholders = keys.map(() => '?').join(',') || 'NULL'
  const items = new Map(store.summaries(`i.id IN (${placeholders})`, keys).map(item => [item.id, item]))
  const stream = store.prepare(`SELECT * FROM item_events WHERE itemId IN (${placeholders}) ORDER BY itemId,seq`).iterate(...keys)
  let current = stream.next()
  function* eventsFor(id: string) {
    while (!current.done && current.value.itemId === id) {
      yield store.eventRows([current.value])[0]!
      current = stream.next()
    }
  }
  const rows = keys.map(id => {
    const { endState, later, laterCount, anomalous } = projectOrderedHistory(eventsFor(id), period, 5)
    return { item: items.get(id)!, endState, later, laterCount, anomalous }
  }) as HistoryPage['rows']
  return { period, previous: precedingPeriod(calendar, period), next: currentPeriod(calendar, period.horizon, period.endAt), rows, total }
}
export function readActivity(store: Store, query: Extract<Query, { type: 'activity' }>): Activity {
  if (!store.prepare('SELECT 1 FROM items WHERE id=?').get(query.itemId)) throw new DomainError('invalid', serverText().errors.itemMissing)
  const events = store.eventRows(store.db.prepare('SELECT * FROM item_events WHERE itemId=? AND seq<? ORDER BY seq DESC LIMIT ?').all(query.itemId, query.beforeSeq ?? Number.MAX_SAFE_INTEGER, query.limit + 1)) as Activity['events']
  return { events: events.slice(0, query.limit), more: events.length > query.limit }
}
