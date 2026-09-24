/**
 * [INPUT]: 经过校验的周期/活动查询、Store 与观察时刻。
 * [OUTPUT]: 由 from/to 周期索引找到的分页成员、期末投影和活动。
 * [POS]: 只读历史适配器；不会创建空周期、补事件或写位置。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { compareInstants, currentPeriod, parseDate, precedingPeriod } from '../../domain/calendar'
import { projectHistory } from '../../domain/history'
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
  const rows = ids.map(row => {
    const item = store.item(String(row.itemId)), projection = projectHistory(store.events(item.id), period)
    return { item, endState: projection.endState, later: projection.later.slice(-5), laterCount: projection.later.length, anomalous: projection.anomalous }
  }) as HistoryPage['rows']
  return { period, previous: precedingPeriod(calendar, period), next: currentPeriod(calendar, period.horizon, period.endAt), rows, total }
}
export function readActivity(store: Store, query: Extract<Query, { type: 'activity' }>): Activity {
  store.item(query.itemId)
  const events = store.eventRows(store.db.prepare('SELECT * FROM item_events WHERE itemId=? AND seq<? ORDER BY seq DESC LIMIT ?').all(query.itemId, query.beforeSeq ?? Number.MAX_SAFE_INTEGER, query.limit + 1)) as Activity['events']
  return { events: events.slice(0, query.limit), more: events.length > query.limit }
}
