/**
 * [INPUT]: Valid ISO draft date, workspace today/week start and a draft selection callback.
 * [OUTPUT]: Localized day/month grids with keyboard navigation, selected/today states, clear and return-to-today actions.
 * [POS]: Calendar body shared by detail and composer deadline panels; owns navigation, never persistence.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { messages } from '../../i18n'
import { calendarDate, monthName, weekdayName, yearMonth, yearOf } from '../../i18n/format'
import { addDays, addMonths, weekday } from '../../lib/dates'
import { Icon } from '../icons'

const monthStart = (date: string) => `${date.slice(0, 7)}-01`
const inRange = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)

export function Calendar({ value, today, weekStart, onSelect }: { value: string; today: string; weekStart: number; onSelect: (date: string) => void }) {
  const [month, setMonth] = useState(monthStart(value || today))
  const [focused, setFocused] = useState(value || today)
  const [months, setMonths] = useState(false)
  const [year, setYear] = useState(Number(month.slice(0, 4)))
  const root = useRef<HTMLDivElement>(null), monthButton = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef<string | null>(null)
  const focus = (date: string) => root.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus({ preventScroll: true })
  useEffect(() => {
    // Wait for floating placement without overriding an early pointer or keyboard action.
    const frame = requestAnimationFrame(() => {
      if (!root.current?.closest('.due-panel')?.contains(document.activeElement)) focus(value || today)
    })
    return () => cancelAnimationFrame(frame)
  }, [])
  useLayoutEffect(() => {
    if (pendingFocus.current && !months) { focus(pendingFocus.current); pendingFocus.current = null }
  }, [focused, month, months])
  const focusDate = (next: string) => {
    if (!inRange(next)) return
    pendingFocus.current = next
    setFocused(next); setMonth(monthStart(next)); setMonths(false)
    if (!months && month === monthStart(next)) { focus(next); pendingFocus.current = null }
  }
  const offset = (weekday(month) - weekStart + 7) % 7
  const start = addDays(month, -offset)
  const days = Array.from({ length: 42 }, (_, index) => addDays(start, index))
  const week = Array.from({ length: 7 }, (_, index) => (weekStart + index - 1) % 7 + 1)
  const yearDate = `${String(year).padStart(4, '0')}-01-01`
  const monthAt = (index: number) => `${String(year).padStart(4, '0')}-${String(index + 1).padStart(2, '0')}-01`
  const navigate = (delta: number) => {
    if (months) setYear(year + delta)
    else {
      const next = addMonths(month, delta)
      if (inRange(next)) { setMonth(next); setFocused(next) }
    }
  }
  const keys = (event: KeyboardEvent, date: string) => {
    if (event.nativeEvent.isComposing || event.metaKey || event.ctrlKey || event.altKey) return
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
    const offset = (weekday(date) - weekStart + 7) % 7
    let next: string | undefined
    if (event.key in moves) next = addDays(date, moves[event.key]!)
    else if (event.key === 'Home') next = addDays(date, -offset)
    else if (event.key === 'End') next = addDays(date, 6 - offset)
    else if (event.key === 'PageUp') next = addMonths(date, event.shiftKey ? -12 : -1)
    else if (event.key === 'PageDown') next = addMonths(date, event.shiftKey ? 12 : 1)
    if (next) { event.preventDefault(); event.stopPropagation(); focusDate(next) }
  }
  return <div className="due-calendar" ref={root} onKeyDown={event => {
    if (event.key === 'Escape' && months && !event.nativeEvent.isComposing) {
      event.preventDefault(); event.stopPropagation(); setMonths(false); monthButton.current?.focus()
    }
  }}>
    <div className="due-month-nav">
      <button type="button" className="due-month-title" ref={monthButton} aria-label={months ? messages.dueBackToDays : messages.dueChooseMonth} aria-expanded={months}
        onClick={() => { setYear(Number(month.slice(0, 4))); setMonths(!months) }}>
        <span aria-live="polite">{months ? yearOf(yearDate) : yearMonth(month)}</span><Icon name={months ? 'up' : 'expand'} size={14} />
      </button>
      <div className="due-month-arrows">
        <button type="button" className="due-icon" aria-label={months ? messages.duePreviousYear : messages.duePreviousMonth} disabled={months ? year === 0 : month === '0000-01-01'} onClick={() => navigate(-1)}><Icon name="previous" size={16} /></button>
        <button type="button" className="due-icon" aria-label={months ? messages.dueNextYear : messages.dueNextMonth} disabled={months ? year === 9999 : month === '9999-12-01'} onClick={() => navigate(1)}><Icon name="next" size={16} /></button>
      </div>
    </div>
    {months ? <div className="due-month-grid" role="group" aria-label={yearOf(yearDate)}>
      {Array.from({ length: 12 }, (_, index) => <button type="button" key={index} data-month={index + 1} aria-pressed={month === monthAt(index)}
        onClick={() => focusDate(monthAt(index))}>{monthName(monthAt(index))}</button>)}
    </div> : <div role="grid" aria-label={yearMonth(month)}>
      <div className="due-weekdays" role="row">{week.map(day => <span key={day} role="columnheader" aria-label={weekdayName(day)}>{weekdayName(day, 'narrow')}</span>)}</div>
      {Array.from({ length: 6 }, (_, row) => <div className="due-week" role="row" key={row}>
        {days.slice(row * 7, row * 7 + 7).map(date => <span key={date} role="gridcell" aria-selected={date === value}>
          {inRange(date) && <button type="button" className="due-day tabular" data-date={date} data-outside={!date.startsWith(month.slice(0, 7))} data-selected={date === value} data-today={date === today}
            aria-label={calendarDate(date)} aria-current={date === today ? 'date' : undefined} tabIndex={date === focused ? 0 : -1}
            onFocus={() => setFocused(date)} onClick={() => onSelect(date)} onKeyDown={event => keys(event, date)}>{Number(date.slice(8, 10))}</button>}
        </span>)}
      </div>)}
    </div>}
    <div className="due-calendar-footer">
      <button type="button" onClick={() => onSelect('')} disabled={!value}>{messages.clearDue}</button>
      <button type="button" onClick={() => focusDate(today)}>{messages.dueBackToToday}</button>
    </div>
  </div>
}
