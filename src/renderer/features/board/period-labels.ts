/**
 * [INPUT]: Column horizon and a period's half-open date range; locale-aware date formatters.
 * [OUTPUT]: periodLabel (current column header / onboarding preview) and historyLabel (past-period titles).
 * [POS]: Pure board label helpers shared by the column header, history picker and setup board preview.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemHorizon, PlanningPeriod } from '../../../shared/contracts/entities'
import { longDate, monthDay, monthName, shortDate, yearMonth, yearOf } from '../../i18n/format'
import { addDays } from '../../lib/dates'

/** Column-header label for a current period; shared with the onboarding board preview. */
export function periodLabel(horizon: ItemHorizon, period: Pick<PlanningPeriod, 'startDate' | 'endDate'>): string {
  if (horizon === 'day') return monthDay(period.startDate)
  if (horizon === 'month') return monthName(period.startDate)
  return `${shortDate(period.startDate)} – ${shortDate(addDays(period.endDate, -1))}`
}

/** Past periods read as a single day, a named month or a range, never as the raw half-open date pair. */
export function historyLabel(horizon: ItemHorizon, period: Pick<PlanningPeriod, 'startDate' | 'endDate'>): string {
  if (horizon === 'day') return longDate(period.startDate)
  if (horizon === 'month') return yearMonth(period.startDate)
  return `${yearOf(period.startDate)} ${periodLabel(horizon, period)}`
}
