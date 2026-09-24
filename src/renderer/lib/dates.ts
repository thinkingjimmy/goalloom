/**
 * [INPUT]: 工作区当地日期 YYYY-MM-DD。
 * [OUTPUT]: 纯日历日加减、星期与月末；不涉及时区换算，也不做本地化格式（见 i18n/format）。
 * [POS]: renderer 截止日快捷选择的日期工具，工作区“今天”由 domain/calendar 计算。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
const parts = (date: string) => date.split('-').map(Number) as [number, number, number]
const utc = (date: string) => { const [y, m, d] = parts(date); return new Date(Date.UTC(y, m - 1, d)) }
const iso = (value: Date) => value.toISOString().slice(0, 10)

export function addDays(date: string, days: number): string { const value = utc(date); value.setUTCDate(value.getUTCDate() + days); return iso(value) }
export function weekday(date: string): number { return utc(date).getUTCDay() }
export function monthEnd(date: string): string { const [y, m] = parts(date); return iso(new Date(Date.UTC(y, m, 0))) }
