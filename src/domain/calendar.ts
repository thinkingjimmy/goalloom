/**
 * [INPUT]: 显式观察时刻和固定 IANA 时区/周起始日；Temporal 日历运算。
 * [OUTPUT]: 日/周/月/三个月的排他区间及固定 UTC 边界，不读取系统时钟。
 * [POS]: 独立领域库；三个月按已确认 D07 从原锚点推导。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { Temporal } from '@js-temporal/polyfill'
import { serverText } from '../shared/i18n/server'

export type Horizon = 'day' | 'week' | 'month' | 'cycle'
export interface Clock { now(): string }
export interface Calendar { id: string; timezone: string; weekStart: number; cycleAnchor?: string }
export interface Period {
  id: string
  horizon: Horizon
  startDate: string
  endDate: string
  startAt: string
  endAt: string
}

export function validateCalendar(calendar: Calendar): void {
  if (!calendar.id.trim() || !Number.isInteger(calendar.weekStart) || calendar.weekStart < 1 || calendar.weekStart > 7) {
    throw new Error(serverText().calendar.invalidCalendar)
  }
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(calendar.timezone)) throw new Error(serverText().calendar.timezoneRequired)
  new Intl.DateTimeFormat('en', { timeZone: calendar.timezone }).format(0)
  if (calendar.cycleAnchor !== undefined) parseDate(calendar.cycleAnchor)
}

export function parseDate(value: string): Temporal.PlainDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(serverText().calendar.dateFormat)
  return Temporal.PlainDate.from(value, { overflow: 'reject' })
}

export function cycleRange(anchor: string, today: Temporal.PlainDate): [Temporal.PlainDate, Temporal.PlainDate] {
  const origin = parseDate(anchor)
  if (Temporal.PlainDate.compare(origin, today) > 0) throw new Error(serverText().calendar.anchorAfterToday)
  const months = (today.year - origin.year) * 12 + today.month - origin.month
  let index = Math.floor(months / 3)
  if (Temporal.PlainDate.compare(origin.add({ months: index * 3 }), today) > 0) index--
  return [origin.add({ months: index * 3 }), origin.add({ months: (index + 1) * 3 })]
}

export function currentPeriod(calendar: Calendar, horizon: Horizon, observedAt: string): Period {
  validateCalendar(calendar)
  const today = Temporal.Instant.from(observedAt).toZonedDateTimeISO(calendar.timezone).toPlainDate()
  if (horizon === 'cycle') {
    if (!calendar.cycleAnchor) throw new Error(serverText().calendar.anchorMissing)
    const [start, end] = cycleRange(calendar.cycleAnchor, today)
    return makePeriod(calendar, horizon, start, end)
  }
  const starts = {
    day: today,
    week: today.subtract({ days: (today.dayOfWeek - calendar.weekStart + 7) % 7 }),
    month: today.with({ day: 1 }),
  }
  const start = starts[horizon]
  const duration = { day: { days: 1 }, week: { weeks: 1 }, month: { months: 1 } }[horizon]
  const end = start.add(duration)
  return makePeriod(calendar, horizon, start, end)
}

export function makePeriod(calendar: Calendar, horizon: Horizon, start: Temporal.PlainDate, end: Temporal.PlainDate): Period {
  return {
    id: `${calendar.id}:${horizon}:${start}`, horizon,
    startDate: start.toString(), endDate: end.toString(),
    startAt: start.toZonedDateTime(calendar.timezone).toInstant().toString(),
    endAt: end.toZonedDateTime(calendar.timezone).toInstant().toString(),
  }
}

export function precedingPeriod(calendar: Calendar, period: Period): Period | null {
  const instant = Temporal.Instant.from(period.startAt).subtract({ nanoseconds: 1 }).toString()
  if (period.horizon === 'cycle' && period.startDate === calendar.cycleAnchor) return null
  return currentPeriod(calendar, period.horizon, instant)
}

export function workspaceDate(timezone: string, instant: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDate().toString()
}

export function compareInstants(left: string, right: string): number {
  return Temporal.Instant.compare(left, right)
}
