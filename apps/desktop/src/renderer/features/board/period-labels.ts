/**
 * [INPUT]: Column periods, workspace calendar and locale-aware date formatters.
 * [OUTPUT]: Mode-aware relative headings, distant anchored labels and yearless adjacent dates shared by onboarding.
 *           List ranges add a two-digit year outside the workspace's current year and at crossed year boundaries.
 * [POS]: Pure board-header presentation; destination descriptions remain in lib/periods.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { CalendarConfig, ItemHorizon, PlanningPeriod } from '../../../shared/contracts/entities'
import { currentPeriod, precedingPeriod } from '../../../domain/calendar'
import { monthDay, monthName, shortDate } from '../../i18n/format'
import { addDays } from '../../lib/dates'
import { anchoredPeriodLabel, relativePeriodName, yearAwareRange } from '../../lib/periods'
import { isAnchoredHorizon } from '../../../shared/contracts/values'

export function periodTitle(period: PlanningPeriod, current: PlanningPeriod, calendar: CalendarConfig): string | null {
  if (period.id === current.id) return relativePeriodName(period.horizon, calendar, 'current')
  if (period.horizon === 'cycle' && calendar.mode !== 'natural') return null
  if (period.id === precedingPeriod(calendar, current)?.id) return relativePeriodName(period.horizon, calendar, 'previous')
  if (period.id === currentPeriod(calendar, current.horizon, current.endAt).id) return relativePeriodName(period.horizon, calendar, 'next')
  return null
}

export function periodLabel(horizon: ItemHorizon, period: Pick<PlanningPeriod, 'startDate' | 'endDate'>, calendar?: CalendarConfig, today?: string, relative = true): string {
  const end = addDays(period.endDate, -1)
  if (horizon === 'day') return monthDay(period.startDate)
  if (horizon === 'month') return monthName(period.startDate)
  if (calendar && today && isAnchoredHorizon(horizon)) return anchoredPeriodLabel({ ...period, horizon }, calendar, today, relative)
  return `${shortDate(period.startDate)} – ${shortDate(end)}`
}

/** Disambiguate list rows using workspace today, including same-month ranges in another year. */
export function cycleOptionLabel(period: Pick<PlanningPeriod, 'startDate' | 'endDate'>, today: string): string {
  return yearAwareRange(period, today)
}
