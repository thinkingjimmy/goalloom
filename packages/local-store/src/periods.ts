/**
 * [INPUT]: An explicit observation instant, IANA timezone, week start and cycle anchor.
 * [OUTPUT]: The six current planning periods, with month-end clamping and exclusive UTC bounds, a period rebuilt from its id, and the column date the desktop header shows.
 * [POS]: Mobile calendar. Parity with apps/desktop/src/domain/calendar.ts is locked by tests; no Temporal import.
 */
import type { LocaleId } from './prefs'
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

const SHORT_MONTH: Record<Exclude<LocaleId, 'zh' | 'ja'>, readonly string[]> = {
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
  es: ['ene.', 'feb.', 'mar.', 'abr.', 'may.', 'jun.', 'jul.', 'ago.', 'sept.', 'oct.', 'nov.', 'dic.'],
  fr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
}

const RANGE_DASH = ' – '

/**
 * Compact range beside a column title. The year is written only when the range crosses one.
 * `endDateExclusive` matches a period's exclusive end. A day unit drops a repeated month; a month unit names months only.
 */
export function compactRange(startDate: string, endDateExclusive: string, locale: LocaleId, unit: 'day' | 'month'): string {
  const start = parseYmd(startDate)
  const end = addDays(parseYmd(endDateExclusive), -1)
  return unit === 'month' ? monthSpan(start, end, locale) : daySpan(start, end, locale)
}

function daySpan(start: Ymd, end: Ymd, locale: LocaleId): string {
  if (locale === 'zh' || locale === 'ja') {
    if (start.y !== end.y) return `${start.y}年${start.m}月${start.d}日${RANGE_DASH}${end.y}年${end.m}月${end.d}日`
    if (start.m !== end.m) return `${start.m}月${start.d}日${RANGE_DASH}${end.m}月${end.d}日`
    if (start.d === end.d) return `${start.m}月${start.d}日`
    return `${start.m}月${start.d}日${RANGE_DASH}${end.d}日`
  }
  const name = SHORT_MONTH[locale]
  const left = name[start.m - 1] ?? ''
  const right = name[end.m - 1] ?? ''
  if (locale === 'en') {
    if (start.y !== end.y) return `${left} ${start.d}, ${start.y}${RANGE_DASH}${right} ${end.d}, ${end.y}`
    if (start.m !== end.m) return `${left} ${start.d}${RANGE_DASH}${right} ${end.d}`
    if (start.d === end.d) return `${left} ${start.d}`
    return `${left} ${start.d}${RANGE_DASH}${end.d}`
  }
  if (start.y !== end.y) return `${start.d} ${left} ${start.y}${RANGE_DASH}${end.d} ${right} ${end.y}`
  if (start.m !== end.m) return `${start.d} ${left}${RANGE_DASH}${end.d} ${right}`
  if (start.d === end.d) return `${start.d} ${left}`
  return `${start.d}${RANGE_DASH}${end.d} ${left}`
}

function monthSpan(start: Ymd, end: Ymd, locale: LocaleId): string {
  if (locale === 'zh' || locale === 'ja') {
    if (start.y !== end.y) return `${start.y}年${start.m}月${RANGE_DASH}${end.y}年${end.m}月`
    if (start.m !== end.m) return `${start.m}月${RANGE_DASH}${end.m}月`
    return `${start.m}月`
  }
  const name = SHORT_MONTH[locale]
  const left = name[start.m - 1] ?? ''
  const right = name[end.m - 1] ?? ''
  if (locale === 'en') {
    if (start.y !== end.y) return `${left} ${start.y}${RANGE_DASH}${right} ${end.y}`
    if (start.m !== end.m) return `${left}${RANGE_DASH}${right}`
    return left
  }
  if (start.y !== end.y) return `${left} ${start.y}${RANGE_DASH}${right} ${end.y}`
  if (start.m !== end.m) return `${left}${RANGE_DASH}${right}`
  return left
}

const INTL_TAG: Record<LocaleId, string> = { zh: 'zh-CN', en: 'en', ja: 'ja-JP', es: 'es', fr: 'fr-FR' }

function intlDate(locale: LocaleId, options: Intl.DateTimeFormatOptions, date: string): string {
  return new Intl.DateTimeFormat(INTL_TAG[locale], { ...options, timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
}

/**
 * Date beside a column name. Mirrors the desktop column header
 * (`periodLabel` / `anchoredPeriodLabel` / `yearAwareRange`): numeric month/day ranges,
 * a short date for today, a month name for the month column, no date on Later or a natural year.
 * `relative` omits year digits, matching a current, previous, or next heading.
 */
export function columnRange(
  horizon: PeriodHorizon | 'later',
  period: { startDate: string; endDate: string } | null,
  calendar: { mode: 'rolling' | 'natural' } | null,
  today: string,
  locale: LocaleId,
  relative = true,
): string {
  if (horizon === 'later' || !period) return ''
  if (calendar?.mode === 'natural' && horizon === 'year') return ''
  const end = formatYmd(addDays(parseYmd(period.endDate), -1))
  if (horizon === 'day') return intlDate(locale, { month: 'short', day: 'numeric' }, period.startDate)
  if (horizon === 'month') return intlDate(locale, { month: 'short' }, period.startDate)
  if (calendar && (horizon === 'year' || horizon === 'half' || horizon === 'cycle')) return anchoredColumnRange(horizon, period.startDate, end, calendar.mode, today, locale, relative)
  return `${intlDate(locale, { month: 'numeric', day: 'numeric' }, period.startDate)} – ${intlDate(locale, { month: 'numeric', day: 'numeric' }, end)}`
}

function anchoredColumnRange(horizon: 'year' | 'half' | 'cycle', startDate: string, endInclusive: string, mode: 'rolling' | 'natural', today: string, locale: LocaleId, relative: boolean): string {
  if (mode === 'natural') {
    if (horizon === 'year') return intlDate(locale, { year: 'numeric' }, startDate)
    const otherYear = !relative && startDate.slice(0, 4) !== today.slice(0, 4) ? intlDate(locale, { year: 'numeric' }, startDate) : null
    if (horizon === 'cycle') return `${otherYear ? `${otherYear} ` : ''}Q${Math.ceil(Number(startDate.slice(5, 7)) / 3)}`
    const numeric = locale === 'zh' || locale === 'ja'
    const first = numeric ? String(Number(startDate.slice(5, 7))) : intlDate(locale, { month: 'short' }, startDate)
    const last = numeric ? String(Number(endInclusive.slice(5, 7))) : intlDate(locale, { month: 'short' }, endInclusive)
    if (locale === 'zh' || locale === 'ja') return `${otherYear ? `${otherYear}年` : ''}${first}月–${last}月`
    return `${otherYear ? `${otherYear} ` : ''}${first}–${last}`
  }
  const year = today.slice(0, 4)
  const startYear = startDate.slice(0, 4)
  const endYear = endInclusive.slice(0, 4)
  const start = !relative && startYear !== year ? intlDate(locale, { year: '2-digit', month: 'numeric', day: 'numeric' }, startDate) : intlDate(locale, { month: 'numeric', day: 'numeric' }, startDate)
  const last = !relative && endYear !== year && endYear !== startYear ? intlDate(locale, { year: '2-digit', month: 'numeric', day: 'numeric' }, endInclusive) : intlDate(locale, { month: 'numeric', day: 'numeric' }, endInclusive)
  return `${start} – ${last}`
}

/** Year row in the column menu: the start year, and the inclusive end month after 至. */
export function yearMenu(startDate: string, endDateExclusive: string, locale: LocaleId): { title: string; range: string } {
  const start = parseYmd(startDate)
  const end = addDays(parseYmd(endDateExclusive), -1)
  const title = locale === 'zh' ? `${start.y} 年` : locale === 'ja' ? `${start.y}年` : String(start.y)
  const name = locale === 'zh' || locale === 'ja' ? '' : SHORT_MONTH[locale][end.m - 1] ?? ''
  const range = locale === 'zh' ? `至 ${end.y}年${end.m}月`
    : locale === 'ja' ? `${end.y}年${end.m}月まで`
    : locale === 'en' ? `through ${name} ${end.y}`
    : locale === 'es' ? `hasta ${name} ${end.y}`
    : `jusqu’en ${name} ${end.y}`
  return { title, range }
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
