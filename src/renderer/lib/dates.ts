/**
 * [INPUT]: 工作区当地日期 YYYY-MM-DD。
 * [OUTPUT]: 纯日历日加减、星期与中文短/长格式；不涉及时区换算。
 * [POS]: renderer 截止日展示与快捷选择的日期工具，工作区“今天”由 domain/calendar 计算。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const parts = (date: string) => date.split('-').map(Number) as [number, number, number]
const utc = (date: string) => { const [y, m, d] = parts(date); return new Date(Date.UTC(y, m - 1, d)) }
const iso = (value: Date) => value.toISOString().slice(0, 10)

export function addDays(date: string, days: number): string { const value = utc(date); value.setUTCDate(value.getUTCDate() + days); return iso(value) }
export function weekday(date: string): number { return utc(date).getUTCDay() }
export function monthEnd(date: string): string { const [y, m] = parts(date); return iso(new Date(Date.UTC(y, m, 0))) }
export function shortDate(date: string): string { const [, m, d] = parts(date); return `${m}/${d}` }
export function longDate(date: string): string { const [, m, d] = parts(date); return `${m}月${d}日 ${weekdays[weekday(date)]}` }
