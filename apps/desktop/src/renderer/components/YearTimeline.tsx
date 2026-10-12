/**
 * [INPUT]: A confirmed or draft calendar and an observation instant.
 * [OUTPUT]: yearProgress (current year, its four 3-month periods, elapsed/total days) and its decorative timeline: halves split by a wider gap, elapsed tint and a labelled today marker.
 * [POS]: Shared read-only visual for setup mode cards and Settings › Calendar; renders nothing for an invalid draft.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { CSSProperties } from 'react'
import { currentPeriod, workspaceDate, type Period } from '../../domain/calendar'
import type { CalendarConfig } from '../../shared/contracts/entities'
import { calendarMessages as c } from '../i18n'
import './year-timeline.css'

const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000)

export interface YearProgress { year: Period; cycles: Period[]; today: string; elapsed: number; total: number }
/** Today counts as remaining; null when the draft calendar cannot produce periods yet. */
export function yearProgress(calendar: CalendarConfig, observedAt: string): YearProgress | null {
  try {
    const year = currentPeriod(calendar, 'year', observedAt), cycles: Period[] = []
    for (let at = year.startAt; cycles.length < 4; at = cycles.at(-1)!.endAt) cycles.push(currentPeriod(calendar, 'cycle', at))
    const today = workspaceDate(calendar.timezone, observedAt)
    return { year, cycles, today, elapsed: days(year.startDate, today), total: days(year.startDate, year.endDate) }
  } catch { return null }
}

export function YearTimeline({ progress }: { progress: YearProgress | null }) {
  if (!progress) return null
  const { cycles, today, elapsed, total } = progress
  const at = (value: number) => `${Math.min(100, Math.max(0, value * 100))}%`
  return <div className="year-timeline">
    <div className="year-timeline-track" aria-hidden="true" style={{ '--at': at(elapsed / total) } as CSSProperties}>
      {cycles.map((cycle, index) => {
        const length = days(cycle.startDate, cycle.endDate), past = days(cycle.startDate, today) / length
        const current = today >= cycle.startDate && today < cycle.endDate
        return <span key={cycle.id} className="year-timeline-segment" data-half={index === 1 || undefined} style={{ flexGrow: length, '--past': at(past) } as CSSProperties}>
          {current && <i className="year-timeline-marker" style={{ left: at(past) }} />}
        </span>
      })}
      <span className="year-timeline-today">{c.todayMarker}</span>
    </div>
  </div>
}
