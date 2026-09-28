/**
 * [INPUT]: Column periods, workspace calendar and locale-aware date formatters.
 * [OUTPUT]: Relative headings for adjacent periods or date-only distant headings, with year-free compact dates shared by onboarding.
 * [POS]: Pure board-header presentation; destination descriptions remain in lib/periods.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { CalendarConfig, ItemHorizon, PlanningPeriod } from '../../../shared/contracts/entities'
import { currentPeriod, precedingPeriod } from '../../../domain/calendar'
import { horizonNames, messages } from '../../i18n'
import { monthDay, monthName, shortDate } from '../../i18n/format'
import { addDays } from '../../lib/dates'

export function periodTitle(period: PlanningPeriod, current: PlanningPeriod, calendar: CalendarConfig): string | null {
  if (period.id === current.id) return horizonNames[period.horizon]
  if (period.horizon === 'cycle') return null
  if (period.id === precedingPeriod(calendar, current)?.id) return messages.previousPeriodNames[period.horizon]
  if (period.id === currentPeriod(calendar, current.horizon, current.endAt).id) return messages.nextPeriodNames[period.horizon]
  return null
}

export function periodLabel(horizon: ItemHorizon, period: Pick<PlanningPeriod, 'startDate' | 'endDate'>): string {
  const end = addDays(period.endDate, -1)
  if (horizon === 'day') return monthDay(period.startDate)
  if (horizon === 'month') return monthName(period.startDate)
  return `${shortDate(period.startDate)} – ${shortDate(end)}`
}
