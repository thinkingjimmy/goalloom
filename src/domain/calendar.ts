/**
 * [INPUT]: 显式观察时刻和固定 IANA 时区/周起始日；Temporal 日历运算。
 * [OUTPUT]: 日/周/月的排他区间及固定 UTC 边界，不读取系统时钟。
 * [POS]: 独立领域库；cycle 的 D07 参数确认前不实现或隐含默认值。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { Temporal } from '@js-temporal/polyfill'

export type Horizon = 'day' | 'week' | 'month'
export interface Clock { now(): string }
export interface Calendar { id: string; timezone: string; weekStart: number }
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
    throw new Error('周起始日必须为 1–7，日历 ID 不可为空')
  }
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(calendar.timezone)) throw new Error('需要 IANA 时区')
  new Intl.DateTimeFormat('en', { timeZone: calendar.timezone }).format(0)
}

export function currentPeriod(calendar: Calendar, horizon: Horizon, observedAt: string): Period {
  validateCalendar(calendar)
  const today = Temporal.Instant.from(observedAt).toZonedDateTimeISO(calendar.timezone).toPlainDate()
  const starts = {
    day: today,
    week: today.subtract({ days: (today.dayOfWeek - calendar.weekStart + 7) % 7 }),
    month: today.with({ day: 1 }),
  }
  const start = starts[horizon]
  const duration = { day: { days: 1 }, week: { weeks: 1 }, month: { months: 1 } }[horizon]
  const end = start.add(duration)
  return {
    id: `${calendar.id}:${horizon}:${start}`, horizon,
    startDate: start.toString(), endDate: end.toString(),
    startAt: start.toZonedDateTime(calendar.timezone).toInstant().toString(),
    endAt: end.toZonedDateTime(calendar.timezone).toInstant().toString(),
  }
}

export function workspaceDate(timezone: string, instant: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDate().toString()
}

export function compareInstants(left: string, right: string): number {
  return Temporal.Instant.compare(left, right)
}
