/**
 * [INPUT]: Explicit observation time, fixed IANA timezone/week start and the native Temporal boundary.
 * [OUTPUT]: Six exclusive planning ranges with fixed UTC boundaries, derived without a global clock.
 * [POS]: Pure calendar rules; rolling/natural modes share original-anchor month clamping.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Temporal, type PlainDate } from './temporal'
import { serverText } from '../shared/i18n/server'
import { isAnchoredHorizon, type AnchoredHorizon, type PeriodHorizon } from '../shared/contracts/values'

export type Horizon = PeriodHorizon
export interface Clock { now(): string }
export interface Calendar { id: string; timezone: string; weekStart: number; cycleAnchor?: string; mode?: 'rolling' | 'natural' }
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
  if (calendar.mode === 'natural' && !calendar.cycleAnchor?.endsWith('-01-01')) throw new Error(serverText().calendar.invalidCalendar)
}

export function parseDate(value: string): PlainDate {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(serverText().calendar.dateFormat)
  return Temporal.PlainDate.from(value, { overflow: 'reject' })
}

export function anchoredRange(anchor: string, today: PlainDate, monthsPerPeriod: number): [PlainDate, PlainDate] {
  const origin = parseDate(anchor)
  if (Temporal.PlainDate.compare(origin, today) > 0) throw new Error(serverText().calendar.anchorAfterToday)
  const months = (today.year - origin.year) * 12 + today.month - origin.month
  let index = Math.floor(months / monthsPerPeriod)
  if (Temporal.PlainDate.compare(origin.add({ months: index * monthsPerPeriod }), today) > 0) index--
  return [origin.add({ months: index * monthsPerPeriod }), origin.add({ months: (index + 1) * monthsPerPeriod })]
}
export const cycleRange = (anchor: string, today: PlainDate): [PlainDate, PlainDate] => anchoredRange(anchor, today, 3)
const anchoredMonths: Record<AnchoredHorizon, number> = { year: 12, half: 6, cycle: 3 }

export function currentPeriod(calendar: Calendar, horizon: Horizon, observedAt: string): Period {
  validateCalendar(calendar)
  const today = Temporal.Instant.from(observedAt).toZonedDateTimeISO(calendar.timezone).toPlainDate()
  if (isAnchoredHorizon(horizon)) {
    if (!calendar.cycleAnchor) throw new Error(serverText().calendar.anchorMissing)
    const [start, end] = anchoredRange(calendar.cycleAnchor, today, anchoredMonths[horizon])
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

export function makePeriod(calendar: Calendar, horizon: Horizon, start: PlainDate, end: PlainDate): Period {
  return {
    id: `${calendar.id}:${horizon}:${start}`, horizon,
    startDate: start.toString(), endDate: end.toString(),
    startAt: start.toZonedDateTime(calendar.timezone).toInstant().toString(),
    endAt: end.toZonedDateTime(calendar.timezone).toInstant().toString(),
  }
}

export function precedingPeriod(calendar: Calendar, period: Period): Period | null {
  const instant = Temporal.Instant.from(period.startAt).subtract({ nanoseconds: 1 }).toString()
  if (isAnchoredHorizon(period.horizon) && period.startDate === calendar.cycleAnchor) return null
  return currentPeriod(calendar, period.horizon, instant)
}

export function workspaceDate(timezone: string, instant: string): string {
  return Temporal.Instant.from(instant).toZonedDateTimeISO(timezone).toPlainDate().toString()
}

export function compareInstants(left: string, right: string): number {
  return Temporal.Instant.compare(left, right)
}
