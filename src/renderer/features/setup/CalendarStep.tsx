/**
 * [INPUT]: Calendar draft, shared live preview and timezone choices.
 * [OUTPUT]: Keyboard radio cards for rolling/natural mode and optional rolling start-date controls; next never locks setup.
 * [POS]: First setup step; date authority remains in the confirmation transaction.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useId, useRef, useState } from 'react'
import { currentPeriod } from '../../../domain/calendar'
import { calendarMessages as c, messages } from '../../i18n'
import { fullDate, monthDay, weekdayName } from '../../i18n/format'
import { addDays } from '../../lib/dates'
import { Button } from '../../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { OnboardingFrame } from './OnboardingFrame'
import { TimezoneSelect } from './TimezoneSelect'
import type { CalendarDraft, useSetupCalendar } from './use-setup-calendar'

export function CalendarStep({ draft, change, live, zones, next, busy }: {
  draft: CalendarDraft; change: (patch: Partial<CalendarDraft>) => void; live: ReturnType<typeof useSetupCalendar>; zones: string[]; next: () => void; busy: boolean
}) {
  const timezoneLabel = useId(), [changing, setChanging] = useState(draft.anchorMode !== 'today')
  const cards = useRef<HTMLDivElement>(null)
  const range = (mode: CalendarDraft['mode']) => {
    const cycleAnchor = mode === 'natural' ? `${live.today.slice(0, 4)}-01-01` : draft.anchorMode === 'date' ? draft.customAnchor : draft.anchorMode === 'monthStart' ? `${live.today.slice(0, 8)}01` : live.today
    try {
      const calendar = { ...live.calendar, mode, cycleAnchor }
      const year = currentPeriod(calendar, 'year', live.now), half = currentPeriod(calendar, 'half', live.now), cycle = currentPeriod(calendar, 'cycle', live.now)
      return mode === 'natural' ? c.naturalRange(Math.round((Date.parse(year.endDate) - Date.parse(live.today)) / 86400000), monthDay(addDays(cycle.endDate, -1)))
        : c.modeRange(fullDate(addDays(year.endDate, -1)), monthDay(addDays(half.endDate, -1)), monthDay(addDays(cycle.endDate, -1)))
    } catch { return ' ' }
  }
  return <OnboardingFrame step={0} label={messages.stepCalendar} note={messages.calendarLockNote} lock
    actions={<Button type="button" disabled={busy || !live.periods} onClick={next}>{messages.nextStep}</Button>}>
    <section className="onboarding-calendar calendar-choice">
      <p className="onboarding-eyebrow">{messages.welcome}</p>
      <h1 className="onboarding-title">{c.chooseCalendar}</h1>
      <div ref={cards} className="calendar-modes" role="radiogroup" aria-label={c.calendarMode}>
        {(['rolling', 'natural'] as const).map(mode => <button key={mode} className="calendar-mode" type="button" role="radio" aria-checked={draft.mode === mode}
          tabIndex={draft.mode === mode ? 0 : -1} autoFocus={draft.mode === mode} data-mode={mode} onClick={() => change({ mode })}
          onKeyDown={event => {
            if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
              event.preventDefault(); const target = mode === 'rolling' ? 'natural' : 'rolling'; change({ mode: target }); cards.current?.querySelector<HTMLElement>(`[data-mode="${target}"]`)?.focus()
            } else if (event.key === 'Enter') { event.preventDefault(); if (live.periods) next() }
          }}>
          <span className="calendar-mode-heading"><span className="ai-radio" data-checked={draft.mode === mode} aria-hidden="true" /><strong>{mode === 'rolling' ? c.rollingMode : c.naturalMode}</strong></span>
          <span>{mode === 'rolling' ? c.rollingDescription : c.naturalDescription}</span>
          <small aria-live="polite">{range(mode)}</small>
        </button>)}
      </div>
      <div className="calendar-sentence calendar-controls">
        <span id={timezoneLabel} className="sr-only">{messages.timezone}</span>
        <TimezoneSelect className="pill-trigger" value={draft.timezone} zones={zones} labelId={timezoneLabel} onChange={timezone => change({ timezone })} />
        <Select value={String(draft.weekStart)} onValueChange={value => change({ weekStart: Number(value) })}>
          <SelectTrigger className="pill-trigger" aria-label={messages.weekStart}><SelectValue /></SelectTrigger>
          <SelectContent>{[1, 2, 3, 4, 5, 6, 7].map(day => <SelectItem key={day} value={String(day)}>{weekdayName(day)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {draft.mode === 'rolling' && <div className="calendar-start">
        <button className="text-button" aria-expanded={changing} onClick={() => setChanging(value => !value)}>{c.changeAnchor}</button>
        {changing && <div className="calendar-controls">
          <Select value={draft.anchorMode} onValueChange={value => change({ anchorMode: value as CalendarDraft['anchorMode'], customAnchor: draft.customAnchor || live.today })}>
            <SelectTrigger className="pill-trigger" aria-label={c.anchorLabel}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{messages.anchorToday(monthDay(live.today))}</SelectItem>
              <SelectItem value="monthStart">{messages.anchorMonth(monthDay(`${live.today.slice(0, 8)}01`))}</SelectItem>
              <SelectItem value="date">{messages.anchorCustom}</SelectItem>
            </SelectContent>
          </Select>
          {draft.anchorMode === 'date' && <input type="date" className="pill-date" aria-label={messages.customAnchor} max={live.today} required value={draft.customAnchor} onChange={event => change({ customAnchor: event.target.value })} />}
        </div>}
      </div>}
    </section>
  </OnboardingFrame>
}
