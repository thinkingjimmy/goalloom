/**
 * [INPUT]: Session calendar draft, native Temporal and the renderer clock/focus lifecycle.
 * [OUTPUT]: Live workspace today, validated preview periods, confirmation anchor and an explicit refresh.
 * [POS]: Setup-only clock owner; one midnight timer catches delayed wakeups without background polling.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useState } from 'react'
import { currentPeriod, workspaceDate } from '../../../domain/calendar'
import { Temporal } from '../../../domain/temporal'
import { periodHorizons } from '../../../shared/contracts/values'
import type { CalendarConfig, PlanningPeriod } from '../../../shared/contracts/entities'
import type { SetupAnchor } from '../../../shared/contracts/commands'

export interface CalendarDraft { mode: 'rolling' | 'natural'; timezone: string; weekStart: number; anchorMode: 'today' | 'monthStart' | 'date'; customAnchor: string }
export interface CalendarChoice { mode: CalendarDraft['mode']; timezone: string; weekStart: number; anchor: SetupAnchor }

export function useSetupCalendar(draft: CalendarDraft) {
  const [now, setNow] = useState(() => new Date().toISOString())
  const refresh = useCallback(() => setNow(new Date().toISOString()), [])
  const today = workspaceDate(draft.timezone, now)
  useEffect(() => {
    refresh()
    const date = Temporal.Instant.from(new Date().toISOString()).toZonedDateTimeISO(draft.timezone).toPlainDate()
    const midnight = date.add({ days: 1 }).toZonedDateTime(draft.timezone).toInstant().epochMilliseconds
    const timer = setTimeout(refresh, Math.max(1, midnight - Date.now()))
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [draft.timezone, today, refresh])
  const start = draft.mode === 'natural' ? `${today.slice(0, 4)}-01-01`
    : draft.anchorMode === 'date' ? draft.customAnchor : draft.anchorMode === 'monthStart' ? `${today.slice(0, 8)}01` : today
  const anchor: SetupAnchor = draft.mode === 'natural' ? { kind: 'today', expected: start }
    : draft.anchorMode === 'date' ? { kind: 'date', date: start } : { kind: draft.anchorMode, expected: start }
  const calendar: CalendarConfig = { id: 'preview', mode: draft.mode, timezone: draft.timezone, weekStart: draft.weekStart, cycleAnchor: start }
  let periods: PlanningPeriod[] | null = null
  try { if (start && start <= today) periods = periodHorizons.map(horizon => currentPeriod(calendar, horizon, now)) } catch { /* Invalid custom dates keep the draft editable. */ }
  return { today, now, calendar, periods, refresh, choice: { mode: draft.mode, timezone: draft.timezone, weekStart: draft.weekStart, anchor } satisfies CalendarChoice }
}
