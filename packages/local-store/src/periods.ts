/**
 * [INPUT]: An explicit observation instant, IANA timezone, week start and cycle anchor.
 * [OUTPUT]: The six current planning periods, with month-end clamping and exclusive UTC bounds, plus a period rebuilt from its id.
 * [POS]: Mobile calendar. Parity with apps/desktop/src/domain/calendar.ts is locked by tests; no Temporal import.
 */
import type { CalendarConfig, Period, PeriodHorizon } from './types'

export interface Ymd { y: number; m: number; d: number }

const anchoredMonths: Record<'year' | 'half' | 'cycle', number> = { year: 12, half: 6, cycle: 3 }

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export function parseYmd(value: string): Ymd {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error('date')
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3])
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) throw new Error('date')
  return { y, m, d }
}

export function formatYmd(date: Ymd): string {
  return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
}

export function compareYmd(a: Ymd, b: Ymd): number {
  return a.y - b.y || a.m - b.m || a.d - b.d
}

export function addMonths(date: Ymd, months: number): Ymd {
  const index = date.m - 1 + months
  const y = date.y + Math.floor(index / 12)
  const m = ((index % 12) + 12) % 12 + 1
  return { y, m, d: Math.min(date.d, daysInMonth(y, m)) }
}

export function addDays(date: Ymd, days: number): Ymd {
  const utc = new Date(Date.UTC(date.y, date.m - 1, date.d + days))
  return { y: utc.getUTCFullYear(), m: utc.getUTCMonth() + 1, d: utc.getUTCDate() }
}

export function isoWeekday(date: Ymd): number {
  const day = new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay()
  return day === 0 ? 7 : day
}

function parts(timeZone: string, utcMs: number): Ymd & { hour: number; minute: number; second: number } {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(formatted.find(part => part.type === type)?.value)
  const hour = get('hour')
  return { y: get('year'), m: get('month'), d: get('day'), hour: hour === 24 ? 0 : hour, minute: get('minute'), second: get('second') }
}

function offsetMinutes(timeZone: string, utcMs: number): number {
  const local = parts(timeZone, utcMs)
  const asUtc = Date.UTC(local.y, local.m - 1, local.d, local.hour, local.minute, local.second)
  return Math.round((asUtc - utcMs) / 60_000)
}

export function zonedMidnight(date: Ymd, timeZone: string): string {
  // Earliest UTC instant whose local calendar date is `date`. That matches Temporal's
  // compatible disambiguation: a missing midnight starts after the gap, a repeated one uses the earlier instant.
  const target = formatYmd(date)
  const localDate = (ms: number) => formatYmd(parts(timeZone, ms))
  const noon = Date.UTC(date.y, date.m - 1, date.d, 12)
  let instant = Date.UTC(date.y, date.m - 1, date.d) - offsetMinutes(timeZone, noon) * 60_000
  for (let step = 0; step < 60 * 36 && localDate(instant) < target; step++) instant += 60_000
  for (let step = 0; step < 60 * 36 && localDate(instant) > target; step++) instant -= 60_000
  for (let step = 0; step < 60 * 36 && instant >= 60_000 && localDate(instant - 60_000) === target; step++) instant -= 60_000
  return new Date(instant).toISOString().replace(/\.000Z$/, 'Z')
}

export function workspaceDate(timeZone: string, instant: string): string {
  const local = parts(timeZone, Date.parse(instant))
  return formatYmd(local)
}

export function validateCalendar(calendar: CalendarConfig): void {
  if (!calendar.id.trim() || !Number.isInteger(calendar.weekStart) || calendar.weekStart < 1 || calendar.weekStart > 7) throw new Error('calendar')
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(calendar.timezone)) throw new Error('timezone')
  new Intl.DateTimeFormat('en', { timeZone: calendar.timezone }).format(0)
  parseYmd(calendar.cycleAnchor)
  if (calendar.mode === 'natural' && !calendar.cycleAnchor.endsWith('-01-01')) throw new Error('calendar')
}

function anchoredRange(anchor: string, today: Ymd, monthsPerPeriod: number): [Ymd, Ymd] {
  const origin = parseYmd(anchor)
  if (compareYmd(origin, today) > 0) throw new Error('anchor')
  const months = (today.y - origin.y) * 12 + today.m - origin.m
  let index = Math.floor(months / monthsPerPeriod)
  if (compareYmd(addMonths(origin, index * monthsPerPeriod), today) > 0) index--
  return [addMonths(origin, index * monthsPerPeriod), addMonths(origin, (index + 1) * monthsPerPeriod)]
}

function makePeriod(calendar: CalendarConfig, horizon: PeriodHorizon, start: Ymd, end: Ymd): Period {
  return {
    id: `${calendar.id}:${horizon}:${formatYmd(start)}`, horizon,
    startDate: formatYmd(start), endDate: formatYmd(end),
    startAt: zonedMidnight(start, calendar.timezone), endAt: zonedMidnight(end, calendar.timezone),
  }
}

export function currentPeriod(calendar: CalendarConfig, horizon: PeriodHorizon, observedAt: string): Period {
  validateCalendar(calendar)
  const today = parseYmd(workspaceDate(calendar.timezone, observedAt))
  if (horizon === 'year' || horizon === 'half' || horizon === 'cycle') {
    const [start, end] = anchoredRange(calendar.cycleAnchor, today, anchoredMonths[horizon])
    return makePeriod(calendar, horizon, start, end)
  }
  const start = horizon === 'day' ? today
    : horizon === 'month' ? { ...today, d: 1 }
      : addDays(today, -((isoWeekday(today) - calendar.weekStart + 7) % 7))
  const end = horizon === 'day' ? addDays(start, 1) : horizon === 'week' ? addDays(start, 7) : addMonths(start, 1)
  return makePeriod(calendar, horizon, start, end)
}

export function precedingPeriod(calendar: CalendarConfig, period: Period): Period | null {
  if ((period.horizon === 'year' || period.horizon === 'half' || period.horizon === 'cycle') && period.startDate === calendar.cycleAnchor) return null
  const instant = new Date(Date.parse(period.startAt) - 1).toISOString()
  return currentPeriod(calendar, period.horizon, instant)
}

export function nearbyPeriods(calendar: CalendarConfig, horizon: PeriodHorizon, observedAt: string, radius = 4): Period[] {
  const current = currentPeriod(calendar, horizon, observedAt)
  const past: Period[] = []
  let cursor = current
  for (let index = 0; index < radius; index++) {
    const previous = precedingPeriod(calendar, cursor)
    if (!previous || previous.id === cursor.id) break
    past.push(previous)
    cursor = previous
  }
  const future: Period[] = []
  let instant = current.endAt
  for (let index = 0; index < radius; index++) {
    const next = currentPeriod(calendar, horizon, instant)
    if (next.id === current.id || future.some(period => period.id === next.id)) {
      instant = new Date(Date.parse(instant) + 36 * 3600 * 1000).toISOString()
      continue
    }
    future.push(next)
    instant = next.endAt
  }
  return [...past.reverse(), current, ...future]
}

/** Period encoded as `${calendar}:${horizon}:${start}`. End is exclusive, matching `currentPeriod`. */
export function periodFromId(horizon: PeriodHorizon, periodId: string): Period | null {
  const startDate = periodId.split(':').at(-1) ?? ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null
  let start: Ymd
  try { start = parseYmd(startDate) } catch { return null }
  const months = horizon === 'year' ? 12 : horizon === 'half' ? 6 : horizon === 'cycle' ? 3 : horizon === 'month' ? 1 : 0
  const end = months ? addMonths(start, months) : addDays(start, horizon === 'week' ? 7 : 1)
  return { id: periodId, horizon, startDate, endDate: formatYmd(end), startAt: '', endAt: '' }
}

export function daysLeft(period: Period, today: string): number {
  return Math.round((Date.parse(`${period.endDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000)
}

/** Inclusive range. A year is written on both ends only when the range crosses one. */
export function rangeLabel(start: Ymd, endInclusive: Ymd, unit: 'day' | 'month'): string {
  const crosses = start.y !== endInclusive.y
  if (unit === 'month') {
    return crosses ? `${start.y}年${start.m}月–${endInclusive.y}年${endInclusive.m}月` : `${start.m}月–${endInclusive.m}月`
  }
  return crosses
    ? `${start.y}/${start.m}/${start.d}–${endInclusive.y}/${endInclusive.m}/${endInclusive.d}`
    : `${start.m}/${start.d}–${endInclusive.m}/${endInclusive.d}`
}

export function periodMeta(horizon: PeriodHorizon | 'later', period: Period | null, today: string): { title: string; meta: string; countdown: number | null } {
  if (horizon === 'later' || !period) return { title: 'Later', meta: '', countdown: null }
  const end = addDays(parseYmd(period.endDate), -1)
  const start = parseYmd(period.startDate)
  if (horizon === 'year') return { title: '1年', meta: String(start.y), countdown: null }
  if (horizon === 'half') return { title: '半年', meta: rangeLabel(start, end, 'month'), countdown: null }
  if (horizon === 'cycle') return { title: '3个月', meta: rangeLabel(start, end, 'month'), countdown: null }
  if (horizon === 'month') return { title: '本月', meta: `${start.m}月`, countdown: daysLeft(period, today) }
  if (horizon === 'week') return { title: '本周', meta: rangeLabel(start, end, 'day'), countdown: daysLeft(period, today) }
  const weekday = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'][isoWeekday(start)]
  return { title: '今天', meta: `${start.m}月${start.d}日 ${weekday}`, countdown: null }
}
