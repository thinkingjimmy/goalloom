/**
 * [INPUT]: Injected calendar observations, horizon contracts and shared period-label helpers.
 * [OUTPUT]: Regression assertions for nested calendar ranges, DST, pre-anchor guards and six-horizon consumers.
 * [POS]: Domain regression boundary shared by calendar algorithms and horizon consumers.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { describe, expect, it, vi } from 'vitest'
import { currentPeriod, precedingPeriod, validateCalendar, type Calendar } from '../../src/domain/calendar'
import { Temporal } from '../../src/domain/temporal'
import { mayParent } from '../../src/domain/relations'
import { shorter } from '../../src/renderer/features/insight/signals'
import { calendarSchema } from '../../src/shared/contracts/entities'
import { querySchema } from '../../src/shared/contracts/queries'
import { cycleOptionLabel } from '../../src/renderer/features/board/period-labels'

const anchored = ['year', 'half', 'cycle'] as const
const calendar: Calendar = { id: 'calendar', timezone: 'America/New_York', weekStart: 7, cycleAnchor: '2026-01-31', mode: 'rolling' }

describe('Calendar modes and shared horizon boundaries', () => {
  it.each(['2026-01-31', '2028-02-29', '2026-12-31'])('derives every boundary from the original anchor %s', anchor => {
    const origin = Temporal.PlainDate.from(anchor)
    for (const [horizon, months] of [['year', 12], ['half', 6], ['cycle', 3]] as const) {
      const config = { ...calendar, cycleAnchor: anchor }
      for (let index = 0; index <= 8; index++) {
        const start = origin.add({ months: index * months })
        const observed = start.toZonedDateTime(config.timezone).toInstant().toString()
        const period = currentPeriod(config, horizon, observed)
        expect([period.startDate, period.endDate]).toEqual([start.toString(), origin.add({ months: (index + 1) * months }).toString()])
        const previous = precedingPeriod(config, period)
        expect(previous?.startDate ?? null).toBe(index ? origin.add({ months: (index - 1) * months }).toString() : null)
        expect(currentPeriod(config, horizon, period.endAt).startDate).toBe(period.endDate)
      }
    }
  })
  it('uses the same nested algorithm in natural mode and validates January 1', () => {
    const natural = { ...calendar, mode: 'natural' as const, cycleAnchor: '2026-01-01' }
    expect(anchored.map(h => currentPeriod(natural, h, '2026-10-02T12:00:00Z')).map(p => [p.startDate, p.endDate])).toEqual([
      ['2026-01-01', '2027-01-01'], ['2026-07-01', '2027-01-01'], ['2026-10-01', '2027-01-01'],
    ])
    expect(() => validateCalendar({ ...natural, cycleAnchor: '2026-07-01' })).toThrow()
    expect(calendarSchema.parse({ id: 'old', timezone: 'UTC', weekStart: 1, cycleAnchor: '2026-09-23' }).mode).toBe('rolling')
    expect(calendarSchema.safeParse({ ...natural, cycleAnchor: '2026-07-01' }).success).toBe(false)
  })
  it('keeps natural short periods, DST, nesting and injected time independent of system time', () => {
    vi.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Global clock used') })
    try {
      const observed = '2026-11-01T12:00:00Z'
      const periods = anchored.map(h => currentPeriod(calendar, h, observed))
      expect(periods[0]!.startDate <= periods[1]!.startDate && periods[1]!.startDate <= periods[2]!.startDate).toBe(true)
      expect(periods[2]!.endDate <= periods[1]!.endDate && periods[1]!.endDate <= periods[0]!.endDate).toBe(true)
      const day = currentPeriod(calendar, 'day', observed)
      expect(Date.parse(day.endAt) - Date.parse(day.startAt)).toBe(25 * 3600_000)
      for (const h of anchored) expect(() => currentPeriod(calendar, h, '2026-01-01T12:00:00Z')).toThrow()
    } finally { vi.restoreAllMocks() }
  })
  it('BUG-02: asks for exactly the next level and excludes Later/day', () => {
    expect(['later', 'year', 'half', 'cycle', 'month', 'week', 'day'].map(h => shorter(h as Parameters<typeof shorter>[0]))).toEqual([null, 'half', 'cycle', 'month', 'week', 'day', null])
    expect(mayParent('year', 'cycle')).toBe(true)
    expect(mayParent('half', 'year')).toBe(false)
  })
  it('BUG-03/04: accepts all history horizons and six simultaneously selected periods', () => {
    const periods = ['year', 'half', 'cycle', 'month', 'week', 'day'].map(horizon => ({ horizon, startDate: '2026-01-01' }))
    for (const { horizon } of periods) expect(querySchema.safeParse({ type: 'historyIndex', horizon }).success).toBe(true)
    expect(querySchema.safeParse({ type: 'boardPeriods', generation: 'g', periods }).success).toBe(true)
  })
  it('BUG-09: gives six repeated month/day ranges distinct labels relative to the workspace year', () => {
    const config = { ...calendar, cycleAnchor: '2025-03-23' }
    const labels = Array.from({ length: 6 }, (_, index) => {
      const date = Temporal.PlainDate.from('2025-09-23').add({ months: index * 3 })
      return cycleOptionLabel(currentPeriod(config, 'cycle', date.toZonedDateTime(config.timezone).toInstant().toString()), '2026-10-02')
    })
    expect(new Set(labels).size).toBe(6)
    expect(labels[0]).toBe('25/9/23 – 12/22')
    expect(labels[5]).toBe('12/23 – 27/3/22')
  })
})
