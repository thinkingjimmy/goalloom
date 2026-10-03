/**
 * [INPUT]: Chinese source text, validated calendar and an explicit workspace reference date.
 * [OUTPUT]: Colloquial year/half expressions resolved to horizon choices and exclusive actual dates.
 * [POS]: Pure hint generation for Jev; it does not assign deadlines or overwrite the user's manual choices.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { currentPeriod, parseDate, type Calendar } from '../calendar'

export interface CalendarPhrase { text: string; horizon: 'year' | 'half' | 'future' | 'unclear'; startDate: string; endDate: string }
export function parseCalendarPhrases(text: string, calendar: Calendar, today: string): CalendarPhrase[] {
  const observedAt = parseDate(today).toZonedDateTime(calendar.timezone).toInstant().toString()
  const year = currentPeriod(calendar, 'year', observedAt), half = currentPeriod(calendar, 'half', observedAt)
  const result: CalendarPhrase[] = []
  const matches = text.matchAll(/明年(?:上半年|下半年)?|下(?:一)?个半年|上半年|下半年|今年|这一年|这年|年内|这半年|半年内/g)
  for (const [phrase] of matches) {
    let horizon: CalendarPhrase['horizon'], startDate: string, endDate: string
    if (phrase === '下个半年' || phrase === '下一个半年') {
      const next = currentPeriod(calendar, 'half', half.endAt)
      horizon = 'future'; startDate = next.startDate; endDate = next.endDate
    } else if (phrase.startsWith('明年')) {
      const naturalYear = Number(today.slice(0, 4)) + 1
      if (phrase.endsWith('半年')) {
        startDate = `${naturalYear}-${phrase.endsWith('上半年') ? '01' : '07'}-01`
        endDate = phrase.endsWith('上半年') ? `${naturalYear}-07-01` : `${naturalYear + 1}-01-01`
      } else {
        const next = currentPeriod(calendar, 'year', year.endAt)
        startDate = next.startDate; endDate = next.endDate
      }
      horizon = 'future'
    } else if (phrase === '上半年' || phrase === '下半年') {
      const naturalYear = Number(today.slice(0, 4))
      startDate = `${naturalYear}-${phrase === '上半年' ? '01' : '07'}-01`
      endDate = phrase === '上半年' ? `${naturalYear}-07-01` : `${naturalYear + 1}-01-01`
      horizon = startDate > today ? 'future' : endDate <= today ? 'unclear'
        : calendar.mode === 'natural' || endDate <= half.endDate ? 'half' : endDate <= year.endDate ? 'year' : 'unclear'
    } else {
      horizon = phrase.includes('半年') ? 'half' : 'year'
      const period = horizon === 'year' ? year : half
      startDate = period.startDate; endDate = period.endDate
    }
    result.push({ text: phrase, horizon, startDate, endDate })
  }
  return result
}
