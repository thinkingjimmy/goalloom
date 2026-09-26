/**
 * [INPUT]: Chinese source fragments, a fixed workspace date, ISO week start and native Temporal.
 * [OUTPUT]: Whole-expression date candidates, calculated dates and explicit ambiguity.
 * [POS]: Deterministic smart-input dates; the provider classifies purpose, never computes calendar values.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Temporal } from '../temporal'
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
  { pattern: /(上上|下下|上个?|下个?|本|这个?|这)?(?:周|星期|礼拜)([一二三四五六日天1-7])/g, resolve: (m, reference, weekStart) => {
    const day = weekdays[m[2]!]!, prefix = m[1] ?? ''
    if (!prefix) return { value: nextWeekday(reference, day), ambiguous: false }
    const offset = prefix.startsWith('下下') ? 2 : prefix.startsWith('下') ? 1 : prefix.startsWith('上上') ? -2 : prefix.startsWith('上') ? -1 : 0
    return { value: weekDay(reference, weekStart, day, offset), ambiguous: false }
  } },
  { pattern: /(?:(\d{4})年)?([0-9一二三四五六七八九十]{1,3})月月?[底末]/g, resolve: (m, reference) => {
    const today = parseDate(reference), year = m[1] ? Number(m[1]) : today.year, month = number(m[2]!)
    const start = plain(year, month, 1)
    if (!start) return { value: null, ambiguous: true }
    const date = parseDate(start), end = date.with({ day: date.daysInMonth })
    const nextYear = !m[1] && end.toString() < reference
    return { value: (nextYear ? end.add({ years: 1 }).with({ day: end.add({ years: 1 }).daysInMonth }) : end).toString(), ambiguous: nextYear }
  } },
  { pattern: /(上上个?|下下个?|上个?|下个?|本|这个?|这)?月月?[底末]/g, resolve: (m, reference) => {
    const prefix = m[1] ?? '', offset = prefix.startsWith('下下') ? 2 : prefix.startsWith('下') ? 1 : prefix.startsWith('上上') ? -2 : prefix.startsWith('上') ? -1 : 0
    const date = parseDate(reference).add({ months: offset })
    return { value: date.with({ day: date.daysInMonth }).toString(), ambiguous: false }
  } },
  { pattern: /大前天|大后天|前天|昨天|昨日|今天|今日|明天|明日|后天/g, resolve: (m, reference) => ({ value: parseDate(reference).add({ days: { 大前天: -3, 前天: -2, 昨天: -1, 昨日: -1, 今天: 0, 今日: 0, 明天: 1, 明日: 1, 后天: 2, 大后天: 3 }[m[0]]! }).toString(), ambiguous: false }) },
]

export function dateCandidates(text: string, reference: string, weekStart: number): DateCandidate[] {
  const found: DateCandidate[] = []
  for (const { pattern, resolve } of patterns) {
    for (const match of text.matchAll(new RegExp(pattern.source, pattern.flags))) {
      const start = match.index!, end = start + match[0].length
      if (found.some(row => start < row.end && end > row.start)) continue
      // Unknown qualifiers must never turn a longer expression into a certain substring.
      if (start > 0 && /[\d一二三四五六七八九十百千年月上下去来前后大本这今明个]/.test(text[start - 1]!)) continue
      found.push({ text: match[0], start, end, ...resolve(match as RegExpExecArray, reference, weekStart) })
    }
  }
  found.sort((a, b) => a.start - b.start)
  for (const candidate of found) {
    // A range may omit the month (or weekday prefix) at its second endpoint.
    // Preserve the whole range as uncertain instead of offering its first day as a deadline.
    const shortened = /^\s*(?:到|至|[-—~～])\s*(?:[0-9]{1,2}|[一二三四五六七八九十]{1,3})(?:[日号]|(?=$|[前后止，。；、\s]))/.exec(text.slice(candidate.end))
    if (!shortened) continue
    candidate.end += shortened[0].length
    candidate.text = text.slice(candidate.start, candidate.end)
    candidate.value = null; candidate.ambiguous = true
  }
  for (let index = 1; index < found.length; index++) {
    const previous = found[index - 1]!, next = found[index]!
    if (/^\s*(?:到|至|[-—~～])\s*$/.test(text.slice(previous.end, next.start))) previous.ambiguous = next.ambiguous = true
  }
  return found
}
