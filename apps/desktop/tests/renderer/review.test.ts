/**
 * [INPUT]: Explicit workspace clocks/calendars and isolated device storage.
 * [OUTPUT]: Weekly boundary/retention, monthly overlap and persistent dismissal checks.
 * [POS]: Deterministic review-rule coverage written before the reminder change; no desktop acceptance claim.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { currentPeriod } from '../../src/domain/calendar'
import { Temporal } from '../../src/domain/temporal'
import type { CalendarConfig } from '../../src/shared/contracts/entities'
import type { Snapshot } from '../../src/shared/contracts/queries'
import { periodHorizons } from '../../src/shared/contracts/values'
import { reviewDue, reviewTarget } from '../../src/renderer/features/insight/review'

function snapshot(observedAt: string, weekStart = 1, timezone = 'UTC', generation = 'workspace-one'): Snapshot {
  const calendar: CalendarConfig = { id: 'calendar', mode: 'natural', timezone, weekStart, cycleAnchor: '2026-01-01' }
  return { observedAt, workspace: { generation, calendar, setupConfirmedAt: '2026-01-01T00:00:00Z', pausedAfterRestore: false,
    revision: 1, lastObservedAt: observedAt, clockAnomaly: false, theme: 'light', style: 'paper', checkStyle: 'outline', backupEnabled: true, backupRetention: 7 },
  periods: periodHorizons.map(horizon => currentPeriod(calendar, horizon, observedAt)), items: [], relations: [], policies: [],
  backlog: {}, maintenance: false, backupError: null, rolloverSources: {}, flows: [], orderNodes: [] }
}

it('starts the new weekly review on Monday, not the preceding Sunday', () => {
  expect(reviewTarget(snapshot('2026-10-11T23:59:59Z'), 'week', [])).toMatchObject({ key: 'week:2026-09-28', lastDay: false })
  expect(reviewTarget(snapshot('2026-10-12T00:00:00Z'), 'week', [])).toMatchObject({ key: 'week:2026-10-05', lastDay: false,
    period: { endDate: '2026-10-12' }, next: { startDate: '2026-10-12' } })
})

it.each([1, 2, 3, 4, 5, 6, 7])('retains the same review for the entire week starting on weekday %i', weekStart => {
  const start = Temporal.PlainDate.from('2026-10-12').add({ days: weekStart - 1 })
  const key = `week:${start.subtract({ days: 7 })}`
  for (let day = 0; day < 7; day++) {
    const value = snapshot(`${start.add({ days: day })}T12:00:00Z`, weekStart)
    expect(reviewTarget(value, 'week', [])).toMatchObject({ key, lastDay: false, next: { startDate: start.toString() } })
    expect(reviewTarget(value, 'week', [key])).toBeNull()
  }
  expect(reviewTarget(snapshot(`${start.add({ days: 7 })}T00:00:00Z`, weekStart), 'week', [key])?.key).toBe(`week:${start}`)
})

it.each([
  ['Asia/Shanghai', '2026-10-11T15:59:59Z', '2026-10-11T16:00:00Z', 'week:2026-10-05'],
  ['America/Los_Angeles', '2026-11-02T07:59:59Z', '2026-11-02T08:00:00Z', 'week:2026-10-26'],
])('uses the configured timezone boundary in %s, including DST', (timezone, before, after, key) => {
  expect(reviewTarget(snapshot(before, 1, timezone), 'week', [])?.key).not.toBe(key)
  expect(reviewTarget(snapshot(after, 1, timezone), 'week', [])?.key).toBe(key)
})

it('keeps the monthly two-day window', () => {
  expect(reviewTarget(snapshot('2026-10-31T12:00:00Z'), 'month', [])).toMatchObject({ key: 'month:2026-10-01', lastDay: true })
  expect(reviewTarget(snapshot('2026-11-01T12:00:00Z'), 'month', [])).toMatchObject({ key: 'month:2026-10-01', lastDay: false })
  expect(reviewTarget(snapshot('2026-11-02T12:00:00Z'), 'month', [])).toBeNull()
})

it('merges matching closing boundaries and preserves separate reminders otherwise', () => {
  const merged = reviewDue(snapshot('2026-06-01T12:00:00Z'), [])
  expect(merged).toHaveLength(1)
  expect(merged[0]).toMatchObject({ scope: 'both', week: { period: { endDate: '2026-06-01' } }, month: { period: { endDate: '2026-06-01' } } })
  expect(reviewDue(snapshot('2026-10-01T12:00:00Z'), []).map(value => value.scope)).toEqual(['month', 'week'])
  expect(reviewDue(snapshot('2026-10-31T12:00:00Z'), []).map(value => value.scope)).toEqual(['month', 'week'])
})

it('dismisses only the selected reminder and workspace generation, not future weeks', () => {
  const dismissed = ['workspace-one:week:2026-09-21']
  expect(reviewDue(snapshot('2026-10-01T12:00:00Z'), [], dismissed).map(value => value.scope)).toEqual(['month'])
  expect(reviewDue(snapshot('2026-10-05T12:00:00Z'), [], dismissed)[0]?.week?.key).toBe('week:2026-09-28')
  expect(reviewDue(snapshot('2026-10-01T12:00:00Z', 1, 'UTC', 'workspace-two'), [], dismissed).map(value => value.scope)).toEqual(['month', 'week'])
  expect(reviewDue(snapshot('2026-06-01T12:00:00Z'), [], ['workspace-one:week:2026-05-25']).map(value => value.scope)).toEqual(['month'])
})

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules() })

it('persists dismissal separately from completion and leaves future reviews enabled', async () => {
  const values = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) })
  vi.resetModules()
  const state = await import('../../src/renderer/state/insight')
  state.dismissReviews('workspace-one', ['week:2026-10-05'])
  expect(state.insightSettings()).toMatchObject({ reviews: true, reviewed: [], dismissed: ['workspace-one:week:2026-10-05'] })
  vi.resetModules()
  const reloaded = await import('../../src/renderer/state/insight')
  expect(reloaded.insightSettings()).toMatchObject({ reviews: true, reviewed: [], dismissed: ['workspace-one:week:2026-10-05'] })
  reloaded.markReviewed(['week:2026-10-12'])
  expect(reloaded.insightSettings()).toMatchObject({ reviewed: ['week:2026-10-12'], dismissed: ['workspace-one:week:2026-10-05'] })
})

it('bounds dismissal storage and keeps session dismissal if storage fails', async () => {
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => { throw new Error('Storage full') } })
  vi.resetModules()
  const state = await import('../../src/renderer/state/insight')
  state.dismissReviews('workspace-one', Array.from({ length: 30 }, (_, index) => `week:${index}`))
  expect(state.insightSettings().dismissed).toHaveLength(24)
  expect(state.insightSettings().dismissed.at(-1)).toBe('workspace-one:week:29')
  expect(state.insightSettings().reviewed).toEqual([])
})
