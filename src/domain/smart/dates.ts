/**
 * [INPUT]: 原文片段、固定 referenceTime 的工作区日期与 ISO weekStart(1–7)。
 * [OUTPUT]: dateCandidates：原文中可无损定位的日期表达及代码计算的绝对日期、歧义标记；weekDay 计算本周/下周/最近星期。
 * [POS]: 智能输入的确定性日期层；只列候选值，日期用途（截止/执行）由 Jev 判断，绝不按服务或宿主的“今天”计算。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { Temporal } from '@js-temporal/polyfill'
import { parseDate } from '../calendar'

export interface DateCandidate { text: string; start: number; end: number; value: string | null; ambiguous: boolean }

const weekdays: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7 }
const cn: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }

// Workspace week W contains the reference day; "本周五" is W + ((5 - weekStart + 7) % 7), even when already past.
export function weekDay(reference: string, weekStart: number, day: number, offsetWeeks = 0): string {
  const today = parseDate(reference)
  const start = today.subtract({ days: (today.dayOfWeek - weekStart + 7) % 7 })
  return start.add({ days: (day - weekStart + 7) % 7 + offsetWeeks * 7 }).toString()
}
export function nextWeekday(reference: string, day: number): string {
  const today = parseDate(reference)
  return today.add({ days: (day - today.dayOfWeek + 7) % 7 }).toString()
}

function number(text: string): number {
  if (/^\d+$/.test(text)) return Number(text)
  if (text === '十') return 10
  if (text.startsWith('十')) return 10 + (cn[text[1]!] ?? 0)
  if (text.endsWith('十')) return (cn[text[0]!] ?? 0) * 10
  if (text.includes('十')) return (cn[text[0]!] ?? 0) * 10 + (cn[text[2]!] ?? 0)
  return cn[text] ?? NaN
}
function plain(year: number, month: number, day: number): string | null {
  try { return Temporal.PlainDate.from({ year, month, day }, { overflow: 'reject' }).toString() } catch { return null }
}

const patterns: { pattern: RegExp; resolve: (match: RegExpExecArray, reference: string, weekStart: number) => { value: string | null; ambiguous: boolean } }[] = [
  { pattern: /(\d{4})[-/年.](\d{1,2})[-/月.](\d{1,2})[日号]?/g, resolve: m => ({ value: plain(Number(m[1]), Number(m[2]), Number(m[3])), ambiguous: false }) },
  { pattern: /([0-9一二三四五六七八九十]{1,3})月([0-9一二三四五六七八九十]{1,3})[日号]/g, resolve: (m, reference) => {
    const today = parseDate(reference), month = number(m[1]!), day = number(m[2]!)
    const current = plain(today.year, month, day)
    if (!current) return { value: null, ambiguous: true }
    // Missing year: take the next occurrence and flag it, since "past date this year" may mean next year.
    return current >= reference ? { value: current, ambiguous: false } : { value: plain(today.year + 1, month, day), ambiguous: true }
  } },
  { pattern: /(下下|下个?|本|这个?|这)?(?:周|星期|礼拜)([一二三四五六日天1-7])/g, resolve: (m, reference, weekStart) => {
    const day = weekdays[m[2]!]!, prefix = m[1] ?? ''
    if (!prefix) return { value: nextWeekday(reference, day), ambiguous: false }
    const offset = prefix.startsWith('下下') ? 2 : prefix.startsWith('下') ? 1 : 0
    return { value: weekDay(reference, weekStart, day, offset), ambiguous: false }
  } },
  { pattern: /(?:本月|这个月)?月底/g, resolve: (_m, reference) => { const today = parseDate(reference); return { value: today.with({ day: today.daysInMonth }).toString(), ambiguous: false } } },
  { pattern: /今天|今日|明天|明日|后天/g, resolve: (m, reference) => ({ value: parseDate(reference).add({ days: { 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2 }[m[0]]! }).toString(), ambiguous: false }) },
]

export function dateCandidates(text: string, reference: string, weekStart: number): DateCandidate[] {
  const found: DateCandidate[] = []
  for (const { pattern, resolve } of patterns) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const start = match.index!, end = start + match[0].length
      if (found.some(row => start < row.end && end > row.start)) continue
      found.push({ text: match[0], start, end, ...resolve(match as RegExpExecArray, reference, weekStart) })
    }
  }
  return found.sort((a, b) => a.start - b.start)
}
