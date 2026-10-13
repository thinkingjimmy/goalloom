/**
 * [INPUT]: Inclusive planning periods and the five renderer locales.
 * [OUTPUT]: Year-boundary range text plus Chinese review labels that glue period names.
 * [POS]: Presentation checks for the shared period range formatter; numeric yearAwareRange stays in period-labels.test.ts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { afterEach, expect, it } from 'vitest'
import type { PlanningPeriod } from '../../src/shared/contracts/entities'
import { setLocale } from '../../src/renderer/i18n'
import { insightMessages } from '../../src/renderer/i18n/locales/zh/insight'
import { periodDates } from '../../src/renderer/lib/periods'

Object.assign(globalThis, { document: { documentElement: { lang: '' } } })

function period(horizon: PlanningPeriod['horizon'], startDate: string, endDate: string): PlanningPeriod {
  return { id: `${horizon}:${startDate}`, horizon, startDate, endDate, startAt: `${startDate}T00:00:00Z`, endAt: `${endDate}T00:00:00Z` }
}

const sameMonth = period('week', '2026-10-05', '2026-10-12')
const nextMonth = period('week', '2026-10-05', '2026-11-03')
const crossYear = period('week', '2026-12-28', '2027-01-04')

afterEach(async () => { await setLocale('zh') })

it('omits the year inside one year and keeps it on both ends when a range crosses a year', async () => {
  expect(periodDates(sameMonth)).toBe('10月5日 – 10月11日')
  expect(periodDates(sameMonth, false)).toBe('10月5日 – 10月11日')
  expect(periodDates(nextMonth)).toBe('10月5日 – 11月2日')
  expect(periodDates(crossYear)).toBe('2026年12月28日 – 2027年1月3日')
  expect(periodDates(crossYear, false)).toBe('2026年12月28日 – 2027年1月3日')
  expect(periodDates(period('year', '2026-01-01', '2027-01-01'))).toBe('1月1日 – 12月31日')
  expect(periodDates(period('year', '2026-07-01', '2027-07-01'))).toBe('2026年7月1日 – 2027年6月30日')

  await setLocale('en')
  expect(periodDates(sameMonth)).toBe('Oct 5 – 11')
  expect(periodDates(nextMonth)).toBe('Oct 5 – Nov 2')
  expect(periodDates(crossYear)).toBe('Dec 28, 2026 – Jan 3, 2027')

  await setLocale('ja')
  expect(periodDates(sameMonth)).toBe('10月5日 – 10月11日')
  expect(periodDates(crossYear)).toBe('2026年12月28日 – 2027年1月3日')

  await setLocale('es')
  expect(periodDates(sameMonth)).toBe('5–11 oct')
  expect(periodDates(crossYear)).toBe('28 dic 2026 – 3 ene 2027')

  await setLocale('fr')
  expect(periodDates(sameMonth)).toBe('5–11 oct.')
  expect(periodDates(crossYear)).toBe('28 déc. 2026 – 3 janv. 2027')
})

it('still lets day and month labels choose whether to include the year', () => {
  const day = period('day', '2026-10-05', '2026-10-06')
  const month = period('month', '2026-10-01', '2026-11-01')
  expect(periodDates(day)).toBe('2026年10月5日')
  expect(periodDates(day, false)).toBe('10月5日')
  expect(periodDates(month)).toBe('2026年10月')
  expect(periodDates(month, false)).toBe('10月')
})

it('glues Chinese review labels to the period name', () => {
  expect(insightMessages.reviewGuide('上周', '本周')).toBe('回顾上周，安排本周')
  expect(insightMessages.reviewStart('上周')).toBe('开始上周复盘')
  expect(insightMessages.reviewLookBack('上周')).toBe('回顾上周')
  expect(insightMessages.reviewArrange('本周')).toBe('安排本周')
  expect(insightMessages.reviewMove('本周')).toBe('移入本周')
  expect(insightMessages.reviewGuidePending(3)).toBe('3 项未完成，一起整理后再出发。')
})
