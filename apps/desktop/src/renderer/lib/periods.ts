/**
 * [INPUT]: Workspace calendar, observation time and authoritative planning periods.
 * [OUTPUT]: Locale-aware absolute or yearless ranges and unambiguous previous/current/next/distant destination names.
 * [POS]: Shared presentation helpers for board, details and feedback; no view state or persistence.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { CalendarConfig, PlanningPeriod } from '../../shared/contracts/entities'
import { currentPeriod, precedingPeriod, workspaceDate } from '../../domain/calendar'
import { calendarMessages as c, currentLocale, horizonNames, messages } from '../i18n'
import { fullDate, monthDay, monthName, shortDate, shortYearDate, yearMonth, yearOf } from '../i18n/format'
import type { ItemHorizon } from '../../shared/contracts/entities'
import { isAnchoredHorizon } from '../../shared/contracts/values'
import { addDays } from './dates'

export function horizonName(horizon: ItemHorizon, calendar: CalendarConfig): string {
  return calendar.mode === 'natural' && horizon === 'year' ? c.naturalYear
    : calendar.mode === 'natural' && horizon === 'cycle' ? c.naturalCycle : horizonNames[horizon]
}
export function relativePeriodName(horizon: PlanningPeriod['horizon'], calendar: CalendarConfig, position: 'previous' | 'current' | 'next'): string {
  if (position === 'current') return horizonName(horizon, calendar)
  if (calendar.mode === 'natural' && horizon === 'year') return position === 'previous' ? c.previousNaturalYear : c.nextNaturalYear
  if (calendar.mode === 'natural' && horizon === 'cycle') return position === 'previous' ? c.previousQuarter : c.nextQuarter
  return (position === 'previous' ? messages.previousPeriodNames : messages.nextPeriodNames)[horizon]
}
export function returnPeriodName(horizon: PlanningPeriod['horizon'], calendar: CalendarConfig): string {
  return calendar.mode === 'natural' && horizon === 'year' ? c.returnNaturalYear
    : calendar.mode === 'natural' && horizon === 'cycle' ? c.returnNaturalCycle : messages.returnCurrentPeriod[horizon]
}
/** Relative headings omit years; date-named list/distant entries only add years outside workspace today. */
export function anchoredPeriodLabel(period: Pick<PlanningPeriod, 'horizon' | 'startDate' | 'endDate'>, calendar: CalendarConfig, today: string, relative = false): string {
  const end = addDays(period.endDate, -1), year = today.slice(0, 4)
  if (calendar.mode === 'natural') {
    if (period.horizon === 'year') return yearOf(period.startDate)
    const otherYear = !relative && period.startDate.slice(0, 4) !== year ? yearOf(period.startDate) : null
    if (period.horizon === 'cycle') return `${otherYear ? `${otherYear} ` : ''}Q${Math.ceil(Number(period.startDate.slice(5, 7)) / 3)}`
    if (period.horizon === 'half') {
      const numeric = ['zh', 'ja'].includes(currentLocale())
      return c.halfRange(numeric ? String(Number(period.startDate.slice(5, 7))) : monthName(period.startDate), numeric ? String(Number(end.slice(5, 7))) : monthName(end), otherYear)
    }
  }
  return yearAwareRange(period, today, relative)
}
export function yearAwareRange(period: Pick<PlanningPeriod, 'startDate' | 'endDate'>, today: string, relative = false): string {
  const end = addDays(period.endDate, -1), year = today.slice(0, 4), startYear = period.startDate.slice(0, 4), endYear = end.slice(0, 4)
  const start = !relative && startYear !== year ? shortYearDate(period.startDate) : shortDate(period.startDate)
  const last = !relative && endYear !== year && endYear !== startYear ? shortYearDate(end) : shortDate(end)
  return `${start} – ${last}`
}

/** Ranges show the inclusive final day; compact menu hints can omit the year. */
export function periodDates(period: PlanningPeriod, includeYear = true): string {
  const date = includeYear ? fullDate : monthDay
  if (period.horizon === 'day') return date(period.startDate)
  if (period.horizon === 'month') return (includeYear ? yearMonth : monthName)(period.startDate)
  return `${date(period.startDate)} – ${date(addDays(period.endDate, -1))}`
}

/** Relative names are tied to workspace today, never to whichever column the user has opened. */
export function planningLabel(period: PlanningPeriod, calendar: CalendarConfig, observedAt: string): string {
  let current: PlanningPeriod
  try { current = currentPeriod(calendar, period.horizon, observedAt) }
  catch { return periodDates(period) }
  if (period.id === current.id) return relativePeriodName(period.horizon, calendar, 'current')
  if (period.id === precedingPeriod(calendar, current)?.id) return relativePeriodName(period.horizon, calendar, 'previous')
  if (period.id === currentPeriod(calendar, period.horizon, current.endAt).id) return relativePeriodName(period.horizon, calendar, 'next')
  if (isAnchoredHorizon(period.horizon)) return anchoredPeriodLabel(period, calendar, workspaceDate(calendar.timezone, observedAt))
  const end = addDays(period.endDate, -1), year = workspaceDate(calendar.timezone, observedAt).slice(0, 4)
  if (period.startDate.slice(0, 4) !== year || end.slice(0, 4) !== year) return periodDates(period)
  if (period.horizon === 'day') return monthDay(period.startDate)
  if (period.horizon === 'month') return monthName(period.startDate)
  return `${shortDate(period.startDate)} – ${shortDate(end)}`
}
