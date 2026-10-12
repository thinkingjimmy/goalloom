/**
 * [INPUT]: Workspace date strings or timestamps and the active renderer locale.
 * [OUTPUT]: Intl date/time/number formats, including year-inclusive planning destinations, 2-digit cycle ends and accessible calendar labels.
 * [POS]: Presentation-only formatting; date strings use UTC without timezone shifts, date arithmetic stays in lib/dates.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { intlTags } from '../../shared/i18n/locale'
import { currentLocale } from './index'

const cache = new Map<string, Intl.DateTimeFormat>()
function format(options: Intl.DateTimeFormatOptions, calendarDay = true): Intl.DateTimeFormat {
  const tag = intlTags[currentLocale()]
  const key = `${tag}|${calendarDay}|${JSON.stringify(options)}`
  let value = cache.get(key)
  if (!value) { value = new Intl.DateTimeFormat(tag, calendarDay ? { ...options, timeZone: 'UTC' } : options); cache.set(key, value) }
  return value
}
const day = (date: string) => new Date(`${date}T00:00:00Z`)

export function shortDate(date: string): string { return format({ month: 'numeric', day: 'numeric' }).format(day(date)) }
export function shortYearDate(date: string): string { return format({ year: '2-digit', month: 'numeric', day: 'numeric' }).format(day(date)) }
export function monthDay(date: string): string { return format({ month: 'short', day: 'numeric' }).format(day(date)) }
export function longDate(date: string): string { return format({ month: 'short', day: 'numeric', weekday: 'short' }).format(day(date)) }
export function fullDate(date: string): string { return format({ year: 'numeric', month: 'short', day: 'numeric' }).format(day(date)) }
export function calendarDate(date: string): string { return format({ year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(day(date)) }
export function monthName(date: string): string { return format({ month: 'short' }).format(day(date)) }
export function yearMonth(date: string): string { return format({ year: 'numeric', month: 'short' }).format(day(date)) }
export function yearOf(date: string): string { return format({ year: 'numeric' }).format(day(date)) }
/** ISO weekday 1 (Monday) – 7 (Sunday); 2024-01-01 was a Monday. */
export function weekdayName(isoWeekday: number, style: 'long' | 'narrow' = 'long'): string { return format({ weekday: style }).format(new Date(Date.UTC(2024, 0, isoWeekday))) }
export function stamp(at: Date): string { return format({ month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }, false).format(at) }
export function clockTime(at: Date): string { return format({ hour: '2-digit', minute: '2-digit' }, false).format(at) }
export function count(value: number): string { return value.toLocaleString(intlTags[currentLocale()]) }
