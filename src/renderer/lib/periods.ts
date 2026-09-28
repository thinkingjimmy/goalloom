/**
 * [INPUT]: Workspace calendar, observation time and authoritative planning periods.
 * [OUTPUT]: Locale-aware absolute ranges and unambiguous current/next/future destination names.
 * [POS]: Shared presentation helpers for board, details and feedback; no view state or persistence.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { CalendarConfig, PlanningPeriod } from '../../shared/contracts/entities'
import { currentPeriod, workspaceDate } from '../../domain/calendar'
import { horizonNames, messages } from '../i18n'
import { fullDate, monthDay, monthName, shortDate, yearMonth } from '../i18n/format'
import { addDays } from './dates'

/** Absolute destinations always include their year; ranges show the inclusive final day. */
export function periodDates(period: PlanningPeriod): string {
  if (period.horizon === 'day') return fullDate(period.startDate)
  if (period.horizon === 'month') return yearMonth(period.startDate)
  return `${fullDate(period.startDate)} – ${fullDate(addDays(period.endDate, -1))}`
}

/** Relative names are tied to workspace today, never to whichever column the user has opened. */
export function planningLabel(period: PlanningPeriod, calendar: CalendarConfig, observedAt: string): string {
  let current: PlanningPeriod
  try { current = currentPeriod(calendar, period.horizon, observedAt) }
  catch { return periodDates(period) }
  if (period.id === current.id) return horizonNames[period.horizon]
  if (period.id === currentPeriod(calendar, period.horizon, current.endAt).id) return messages.nextPeriodNames[period.horizon]
  const end = addDays(period.endDate, -1), year = workspaceDate(calendar.timezone, observedAt).slice(0, 4)
  if (period.startDate.slice(0, 4) !== year || end.slice(0, 4) !== year) return periodDates(period)
  if (period.horizon === 'day') return monthDay(period.startDate)
  if (period.horizon === 'month') return monthName(period.startDate)
  return `${shortDate(period.startDate)} – ${shortDate(end)}`
}
