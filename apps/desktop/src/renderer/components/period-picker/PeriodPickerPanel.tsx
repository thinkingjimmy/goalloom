/**
 * [INPUT]: Selected/current periods, workspace calendar/day, choice handler and optional board history metadata.
 * [OUTPUT]: Quick choices, week/day calendars, month grid and a year-grouped anchored period list. Menu controls join Radix focus navigation.
 * [POS]: Shared period picker content; callers own positioning, persistence and focus return.
 */
import { Item as MenuItem } from '@radix-ui/react-context-menu'
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { currentPeriod, makePeriod, parseDate, precedingPeriod } from '../../../domain/calendar'
import type { CalendarConfig, PlanningPeriod } from '../../../shared/contracts/entities'
import type { HistoryIndex } from '../../../shared/contracts/history'
import { isAnchoredHorizon } from '../../../shared/contracts/values'
import { calendarMessages, messages } from '../../i18n'
import { monthName, weekdayName, yearMonth, yearOf } from '../../i18n/format'
import { addDays, addMonths, weekday } from '../../lib/dates'
import { periodDates, periodListEntry, relativePeriodName } from '../../lib/periods'
import { Icon } from '../icons'
import { TextButton } from '../ui/button'
import '../picker-panel.css'
import './period-picker.css'

interface PickerHistory {
  back: PlanningPeriod | null
  index: HistoryIndex['periods']
  retry: (() => void) | null
}

function PickerButton({ menu, selected, keepMenuOpen, ...props }: ComponentProps<'button'> & { menu: boolean; selected?: boolean; keepMenuOpen?: boolean }) {
  const button = <button type="button" {...props} data-selected={selected} aria-pressed={menu ? undefined : selected} aria-current={menu && selected ? true : undefined} />
  if (!menu) return button
  return <MenuItem asChild disabled={!!props.disabled} onSelect={event => { if (keepMenuOpen) event.preventDefault() }}>{button}</MenuItem>
}

const monthStart = (date: string) => `${date.slice(0, 7)}-01`

export function PeriodPickerPanel({ id, name, period, current, calendar, today, busy, choose, history, menu = false }: {
  id?: string; name?: string; period: PlanningPeriod; current: PlanningPeriod; calendar: CalendarConfig; today: string
  busy: boolean; choose: (target: PlanningPeriod, pointer: boolean) => void; history?: PickerHistory; menu?: boolean
}) {
  const { horizon } = period
  const initialMonth = monthStart(!history && period.startDate < current.startDate ? current.startDate : period.startDate)
  const [page, setPage] = useState(initialMonth)
  const panel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (menu) return
    const frame = requestAnimationFrame(() => {
      const root = panel.current
      const target = root?.querySelector<HTMLElement>('button[data-selected="true"]:enabled') ?? root?.querySelector<HTMLElement>('button:enabled')
      target?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [menu])
  useEffect(() => { setPage(initialMonth) }, [initialMonth])

  const at = (date: string) => currentPeriod(calendar, horizon, makePeriod(calendar, 'day', parseDate(date), parseDate(addDays(date, 1))).startAt)
  // The board can browse empty periods between today and the earliest recorded history.
  const earliest = history?.index.reduce<string | null>((min, entry) => !min || entry.period.startDate < min ? entry.period.startDate : min, null) ?? null
  const allowed = (target: PlanningPeriod) => target.startDate >= current.startDate || target.id === history?.back?.id
    || (earliest !== null && target.startDate >= earliest && (!isAnchoredHorizon(horizon) || target.startDate >= calendar.cycleAnchor))
  const stats = (target: PlanningPeriod) => history?.index.find(entry => entry.period.id === target.id)
  const choice = (target: PlanningPeriod) => ({
    menu,
    selected: target.id === period.id,
    'data-current': target.id === current.id,
    'data-past': target.startDate < current.startDate,
    disabled: busy || !allowed(target),
    onClick: (event: React.MouseEvent<HTMLButtonElement>) => choose(target, event.detail > 0),
  })
  const previousOfCurrent = precedingPeriod(calendar, current)
  const quick = [
    previousOfCurrent && { target: previousOfCurrent, label: relativePeriodName(horizon, calendar, 'previous') },
    { target: current, label: isAnchoredHorizon(horizon) && !(horizon === 'year' && calendar.mode === 'natural') ? messages.currentCycle : relativePeriodName(horizon, calendar, 'current') },
    { target: currentPeriod(calendar, horizon, current.endAt), label: relativePeriodName(horizon, calendar, 'next') },
  ].filter(value => !!value)

  const monthNav = (step: number, label: string, icon: 'previous' | 'next') =>
    <PickerButton menu={menu} keepMenuOpen className="period-picker-icon" aria-label={label} onClick={() => setPage(value => addMonths(value, step))}><Icon name={icon} size={16} /></PickerButton>
  const body = () => {
    if (isAnchoredHorizon(horizon)) {
      // Keep a future task's placement visible when it is outside the board's six-period window.
      const center = !history && period.startDate > current.startDate ? period : current
      const list: PlanningPeriod[] = []
      for (let cursor = precedingPeriod(calendar, center), steps = 0; cursor && steps < 2; cursor = precedingPeriod(calendar, cursor), steps++) list.unshift(cursor)
      list.push(center)
      let cursor = center
      while (list.length < 6) {
        cursor = currentPeriod(calendar, horizon, cursor.endAt)
        list.push(cursor)
      }
      const sections: { group: string | null; rows: { target: PlanningPeriod; label: string; detail: string | null }[] }[] = []
      for (const target of list) {
        const { group, ...entry } = periodListEntry(target, calendar), last = sections.at(-1)
        if (last && last.group === group) last.rows.push({ target, ...entry })
        else sections.push({ group, rows: [{ target, ...entry }] })
      }
      return <div className="picker-list period-picker-list" role="group" aria-label={name}>
        {sections.map(({ group, rows }, index) => <div key={group ?? index} className="period-picker-section" role="group" aria-label={group ?? undefined}>
          {group && <div className="period-picker-group" aria-hidden="true">{group}</div>}
          {rows.map(({ target, label, detail }) => { const recorded = stats(target); return <PickerButton key={target.id} className="picker-row period-picker-row" {...choice(target)} title={periodDates(target)}>
            <span className="period-picker-label">{label}{detail && <span className="period-picker-detail">{detail}</span>}</span><small>{recorded ? `${recorded.done}/${recorded.total}` : ''}</small>
          </PickerButton> })}
        </div>)}
      </div>
    }
    if (horizon === 'month') {
      const year = page.slice(0, 4)
      return <>
        <div className="period-picker-nav"><strong>{yearOf(page)}</strong><span>{monthNav(-12, messages.duePreviousYear, 'previous')}{monthNav(12, messages.dueNextYear, 'next')}</span></div>
        <div className="period-picker-months" role="group" aria-label={yearOf(page)}>
          {Array.from({ length: 12 }, (_, month) => { const target = at(`${year}-${String(month + 1).padStart(2, '0')}-01`)
            return <PickerButton key={month} {...choice(target)} title={periodDates(target)}>
              {monthName(target.startDate)}
            </PickerButton> })}
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
          return <PickerButton key={row} className="period-picker-week" {...choice(target)} aria-label={periodDates(target)}>{dates.map(date => <span key={date}>{cell(date)}</span>)}</PickerButton>
        }
        return <div key={row} className="period-picker-week" role="group">{dates.map(date => { const target = at(date)
          return <PickerButton key={date} {...choice(target)} aria-label={periodDates(target)}>{cell(date)}</PickerButton> })}</div>
      })}
    </>
  }
  return <div id={id} ref={panel} className={menu ? 'period-picker' : 'picker-panel period-picker'} role={menu ? undefined : 'dialog'} aria-label={menu ? undefined : name}>
    <div className="period-picker-quick">
      {quick.map(({ target, label }) => <PickerButton key={target.id} {...choice(target)} title={periodDates(target)}>
        {label}
      </PickerButton>)}
    </div>
    <div className="period-picker-body">{body()}</div>
    {history?.retry && <p className="inline-error" role="alert">{calendarMessages.periodRecordsFailed} <TextButton onClick={history.retry}>{messages.retryPeriod}</TextButton></p>}
  </div>
}
