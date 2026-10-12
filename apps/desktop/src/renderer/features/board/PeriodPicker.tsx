/**
 * [INPUT]: Shared picker surface/list styles, column horizon/name, displayed/current periods, workspace calendar/today, the immediate earlier period
 *          that stays selectable, the recorded history index (loaded while open), a pending-review period and the column's choose callback.
 * [OUTPUT]: Header-B period panel under the column title: quick buttons for the previous/current/next period, then week
 *           rows, day cells, a year of months, or six year/half/cycle rows with mode-aware labels.
 *           History errors expose retry; periods older than the earliest recorded history stay disabled.
 * [POS]: Board column header switcher; Column owns switching, directional motion, focus return and Esc-to-current.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { CalendarConfig, PlanningPeriod } from '../../../shared/contracts/entities'
import type { HistoryIndex } from '../../../shared/contracts/history'
import { currentPeriod, makePeriod, parseDate, precedingPeriod, type Horizon } from '../../../domain/calendar'
import { calendarMessages, messages } from '../../i18n'
import { monthName, weekdayName, yearMonth, yearOf } from '../../i18n/format'
import { addDays, addMonths, weekday } from '../../lib/dates'
import { anchoredPeriodLabel, periodDates, relativePeriodName } from '../../lib/periods'
import { isAnchoredHorizon } from '../../../shared/contracts/values'
import { desktopApi } from '../../state/use-workspace'
import { Popover } from '../../components/Popover'
import { Icon } from '../../components/icons'
import '../../components/picker-panel.css'
import './period-picker.css'

type Choose = (target: PlanningPeriod, pointer: boolean, keepOpen?: boolean) => void
const monthStart = (date: string) => `${date.slice(0, 7)}-01`

export function PeriodPicker({ horizon, name, period, current, calendar, today, back, busy, review, open, setOpen, choose, anchor }: {
  horizon: Horizon; name: string; period: PlanningPeriod; current: PlanningPeriod; calendar: CalendarConfig; today: string
  back: PlanningPeriod | null; busy: boolean; review: string | null
  open: boolean; setOpen: (open: boolean) => void; choose: Choose; anchor: ReactNode
}) {
  const [index, setIndex] = useState<HistoryIndex['periods']>([])
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [page, setPage] = useState(monthStart(period.startDate))
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    let active = true
    setFailed(false)
    void desktopApi().getHistoryIndex(horizon).then(value => { if (active) setIndex(value.periods) }).catch(() => { if (active) setFailed(true) })
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('[aria-pressed="true"], [data-selected="true"]')?.focus({ preventScroll: true }))
    return () => { active = false; cancelAnimationFrame(frame) }
  }, [open, horizon, attempt])
  useEffect(() => { setPage(monthStart(period.startDate)) }, [period.id])
  const at = (date: string) => currentPeriod(calendar, horizon, makePeriod(calendar, 'day', parseDate(date), parseDate(addDays(date, 1))).startAt) as PlanningPeriod
  // History stops at the earliest recorded period; empty periods after it stay reachable, the future is open.
  const earliest = index.reduce<string | null>((min, entry) => !min || entry.period.startDate < min ? entry.period.startDate : min, null)
  const allowed = (target: PlanningPeriod) => target.startDate >= current.startDate || target.id === back?.id
    || (earliest !== null && target.startDate >= earliest && (!isAnchoredHorizon(horizon) || target.startDate >= calendar.cycleAnchor))
  const stats = (target: PlanningPeriod) => index.find(entry => entry.period.id === target.id)
  const pick = (target: PlanningPeriod, pointer: boolean) => { if (allowed(target) && !busy) choose(target, pointer) }
  const previousOfCurrent = precedingPeriod(calendar, current) as PlanningPeriod | null
  const quick = [
    previousOfCurrent && { target: previousOfCurrent, label: relativePeriodName(horizon, calendar, 'previous') },
    { target: current, label: isAnchoredHorizon(horizon) && !(horizon === 'year' && calendar.mode === 'natural') ? messages.currentCycle : relativePeriodName(horizon, calendar, 'current') },
    { target: currentPeriod(calendar, horizon, current.endAt) as PlanningPeriod, label: relativePeriodName(horizon, calendar, 'next') },
  ].filter(value => !!value)
  const state = (target: PlanningPeriod) => ({ 'data-selected': target.id === period.id, 'data-current': target.id === current.id, 'data-past': target.startDate < current.startDate })

  const monthNav = (step: number, label: string, icon: 'previous' | 'next') =>
    <button type="button" className="period-picker-icon" aria-label={label} onClick={() => setPage(addMonths(page, step))}><Icon name={icon} size={16} /></button>
  const body = () => {
    if (isAnchoredHorizon(horizon)) {
      // Anchored lists center on today with at most two earlier periods and six rows in total.
      const list: PlanningPeriod[] = []
      for (let cursor = precedingPeriod(calendar, current) as PlanningPeriod | null, steps = 0; cursor && steps < 2; cursor = precedingPeriod(calendar, cursor) as PlanningPeriod | null, steps++) list.unshift(cursor)
      list.push(current)
      let cursor = current
      while (list.length < 6) {
        cursor = currentPeriod(calendar, horizon, cursor.endAt) as PlanningPeriod
        list.push(cursor)
      }
      return <div className="picker-list period-picker-list" role="group" aria-label={name}>
        {list.map(target => { const recorded = stats(target); return <button type="button" key={target.id} className="picker-row period-picker-row" {...state(target)} aria-pressed={target.id === period.id}
          disabled={!allowed(target)} title={periodDates(target)} onClick={event => pick(target, event.detail > 0)}>
          <span>{anchoredPeriodLabel(target, calendar, today)}</span><small>{recorded ? `${recorded.done}/${recorded.total}` : ''}</small>
        </button> })}
      </div>
    }
    if (horizon === 'month') {
      const year = page.slice(0, 4)
      return <>
        <div className="period-picker-nav"><strong>{yearOf(page)}</strong><span>{monthNav(-12, messages.duePreviousYear, 'previous')}{monthNav(12, messages.dueNextYear, 'next')}</span></div>
        <div className="period-picker-months" role="group" aria-label={yearOf(page)}>
          {Array.from({ length: 12 }, (_, month) => { const target = at(`${year}-${String(month + 1).padStart(2, '0')}-01`), recorded = stats(target)
            return <button type="button" key={month} {...state(target)} aria-pressed={target.id === period.id} disabled={!allowed(target)} title={periodDates(target)} onClick={event => pick(target, event.detail > 0)}>
              {monthName(target.startDate)}<small>{recorded ? `${recorded.done}/${recorded.total}` : ''}</small>
            </button> })}
        </div>
      </>
    }
    const first = addDays(page, -((weekday(page) - calendar.weekStart + 7) % 7))
    const days = (row: number) => Array.from({ length: 7 }, (_, day) => addDays(first, row * 7 + day))
    const weekdays = Array.from({ length: 7 }, (_, day) => (calendar.weekStart + day - 1) % 7 + 1)
    return <>
      <div className="period-picker-nav"><strong>{yearMonth(page)}</strong><span>{monthNav(-1, messages.duePreviousMonth, 'previous')}{monthNav(1, messages.dueNextMonth, 'next')}</span></div>
      <div className="period-picker-weekdays" aria-hidden="true">{weekdays.map(day => <span key={day}>{weekdayName(day, 'narrow')}</span>)}</div>
      {Array.from({ length: 6 }, (_, row) => {
        const dates = days(row), cell = (date: string) => <span className={`period-picker-day${date.startsWith(page.slice(0, 7)) ? '' : ' outside'}${date === today ? ' today' : ''}`}>{Number(date.slice(8))}</span>
        if (horizon === 'week') {
          const target = at(dates[0]!)
          return <button type="button" key={row} className="period-picker-week" {...state(target)} aria-pressed={target.id === period.id} aria-label={periodDates(target)}
            disabled={!allowed(target)} onClick={event => pick(target, event.detail > 0)}>{dates.map(date => <span key={date}>{cell(date)}</span>)}</button>
        }
        return <div key={row} className="period-picker-week" role="group">{dates.map(date => { const target = at(date)
          return <button type="button" key={date} {...state(target)} aria-pressed={target.id === period.id} aria-label={periodDates(target)} disabled={!allowed(target)} onClick={event => pick(target, event.detail > 0)}>{cell(date)}</button> })}</div>
      })}
    </>
  }
  return <Popover open={open} onClose={() => setOpen(false)} className="period-picker-popover" anchor={anchor}>
    <div ref={panel} className="picker-panel period-picker" role="dialog" aria-label={name}>
      <div className="period-picker-quick" style={{ gridTemplateColumns: `repeat(${quick.length}, minmax(0, 1fr))` }}>
        {quick.map(({ target, label }) => <button type="button" key={target.id} aria-pressed={target.id === period.id} disabled={!allowed(target) || busy} title={periodDates(target)}
          onClick={event => pick(target, event.detail > 0)}>{label}{review === target.id && <span className="period-picker-review" aria-hidden="true" />}</button>)}
      </div>
      <div className="period-picker-body">{body()}</div>
      {failed && <p className="inline-error" role="alert">{calendarMessages.periodRecordsFailed} <button className="text-button" onClick={() => setAttempt(value => value + 1)}>{messages.retryPeriod}</button></p>}
    </div>
  </Popover>
}
