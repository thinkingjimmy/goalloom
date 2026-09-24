/**
 * [INPUT]: 工作区当地日期 YYYY-MM-DD 或本机时刻；i18n/index 的当前语言。
 * [OUTPUT]: 按当前语言的 Intl 日期/星期/时间/数字格式（短/长日期、月份、年月、年份、星期名、活动时间戳）。
 * [POS]: renderer 的本地化格式层；日历日均按 UTC 解释，不做时区换算，纯日期运算仍在 lib/dates。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
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
export function monthDay(date: string): string { return format({ month: 'short', day: 'numeric' }).format(day(date)) }
export function longDate(date: string): string { return format({ month: 'short', day: 'numeric', weekday: 'short' }).format(day(date)) }
export function monthName(date: string): string { return format({ month: 'short' }).format(day(date)) }
export function yearMonth(date: string): string { return format({ year: 'numeric', month: 'short' }).format(day(date)) }
export function yearOf(date: string): string { return format({ year: 'numeric' }).format(day(date)) }
/** ISO weekday 1 (Monday) – 7 (Sunday); 2024-01-01 was a Monday. */
export function weekdayName(isoWeekday: number): string { return format({ weekday: 'long' }).format(new Date(Date.UTC(2024, 0, isoWeekday))) }
export function stamp(at: Date): string { return format({ month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }, false).format(at) }
export function clockTime(at: Date): string { return format({ hour: '2-digit', minute: '2-digit' }, false).format(at) }
export function count(value: number): string { return value.toLocaleString(intlTags[currentLocale()]) }
