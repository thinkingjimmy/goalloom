/**
 * [INPUT]: 工作区当地日期 YYYY-MM-DD。
 * [OUTPUT]: Calendar-day/month arithmetic with month-end clamping, weekdays and month ends; formatting stays in i18n/format.
 * [POS]: renderer 截止日快捷选择的日期工具，工作区“今天”由 domain/calendar 计算。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
const utc = (date: string) => new Date(`${date}T00:00:00Z`)
const iso = (value: Date) => value.toISOString().split('T')[0]!

export function addDays(date: string, days: number): string { const value = utc(date); value.setUTCDate(value.getUTCDate() + days); return iso(value) }
export function weekday(date: string): number { return utc(date).getUTCDay() }
export function monthEnd(date: string): string { const value = utc(date); value.setUTCMonth(value.getUTCMonth() + 1, 0); return iso(value) }
export function addMonths(date: string, months: number): string {
  const value = utc(date), day = value.getUTCDate()
  value.setUTCDate(1); value.setUTCMonth(value.getUTCMonth() + months)
  const end = utc(iso(value)); end.setUTCMonth(end.getUTCMonth() + 1, 0)
  value.setUTCDate(Math.min(day, end.getUTCDate()))
  return iso(value)
}
