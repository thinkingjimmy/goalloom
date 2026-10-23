/**
 * [INPUT]: Calendar draft, shared live preview and timezone choices.
 * [OUTPUT]: Welcome intro, keyboard radio cards for rolling/natural mode with live dates and a year timeline, the rolling card's collapsible start date, and a timezone/week-start sentence; next never locks setup.
 * [POS]: First setup step; date authority remains in the confirmation transaction.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Input } from '../../components/ui/fields'
import { useId, useRef, useState } from 'react'
import { currentPeriod } from '../../../domain/calendar'
import { calendarMessages as c, messages } from '../../i18n'
import { fullDate, monthDay, weekdayName } from '../../i18n/format'
import { addDays } from '../../lib/dates'
import { Button, TextButton } from '../../components/ui/button'
import { Icon } from '../../components/icons'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { YearTimeline, yearProgress } from '../../components/YearTimeline'
import appIcon from '../../assets/app-icon.png'
import { OnboardingFrame } from './OnboardingFrame'
import { TimezoneSelect } from './TimezoneSelect'
import type { CalendarDraft, useSetupCalendar } from './use-setup-calendar'

export function CalendarStep({ draft, change, live, zones, next, busy, back, skipAi = false }: {
  skipAi?: boolean; draft: CalendarDraft; change: (patch: Partial<CalendarDraft>) => void; live: ReturnType<typeof useSetupCalendar>; zones: string[]; next: () => void; busy: boolean; back?: () => void
}) {
  const timezoneLabel = useId(), [changing, setChanging] = useState(draft.anchorMode !== 'today')
  const cards = useRef<HTMLDivElement>(null)
  const monthStart = `${live.today.slice(0, 8)}01`
  const view = (mode: CalendarDraft['mode']) => {
    const cycleAnchor = mode === 'natural' ? `${live.today.slice(0, 4)}-01-01` : draft.anchorMode === 'date' ? draft.customAnchor : draft.anchorMode === 'monthStart' ? monthStart : live.today
    const calendar = { ...live.calendar, mode, cycleAnchor }
    try {
      const year = currentPeriod(calendar, 'year', live.now), half = currentPeriod(calendar, 'half', live.now), cycle = currentPeriod(calendar, 'cycle', live.now)
      return { progress: yearProgress(calendar, live.now), range: mode === 'natural' ? c.naturalRange(Math.round((Date.parse(year.endDate) - Date.parse(live.today)) / 86400000), monthDay(addDays(cycle.endDate, -1)))
        : c.modeRange(fullDate(addDays(year.endDate, -1)), monthDay(addDays(half.endDate, -1)), monthDay(addDays(cycle.endDate, -1))) }
    } catch { return { progress: null, range: ' ' } }
  }
  const anchorText = draft.anchorMode === 'monthStart' ? messages.anchorMonth(monthDay(monthStart))
    : draft.anchorMode === 'date' ? (draft.customAnchor ? fullDate(draft.customAnchor) : messages.anchorCustom) : messages.anchorToday(monthDay(live.today))
  const timezone = <TimezoneSelect key="timezone" className="pill-trigger" value={draft.timezone} zones={zones} labelId={timezoneLabel} onChange={timezone => change({ timezone })} />
  const weekStart = <Select key="week" value={String(draft.weekStart)} onValueChange={value => change({ weekStart: Number(value) })}>
    <SelectTrigger className="pill-trigger" aria-label={messages.weekStart}><SelectValue /></SelectTrigger>
    <SelectContent>{[1, 2, 3, 4, 5, 6, 7].map(day => <SelectItem key={day} value={String(day)}>{weekdayName(day)}</SelectItem>)}</SelectContent>
  </Select>
  return <OnboardingFrame skipAi={skipAi} step={0} label={messages.stepCalendar} note={messages.calendarLockNote} lock
    actions={<>{back && <Button type="button" variant="ghost" disabled={busy} onClick={back}>{messages.previousStep}</Button>}<Button type="button" disabled={busy || !live.periods} onClick={next}>{messages.nextStep}<Icon name="forward" size={16} /></Button></>}>
    <section className="onboarding-calendar calendar-choice flex flex-col gap-7">
      <header className="onboarding-intro flex flex-col items-start gap-3">
        <p className="onboarding-eyebrow m-0 flex items-center gap-2 text-[13px] font-medium text-muted-foreground"><span className="onboarding-mark relative w-5.5 h-5.5 shrink-0 rounded-[6px] overflow-hidden" aria-hidden="true"><img src={appIcon} alt="" draggable={false} /></span>{messages.welcome}</p>
        <h1 className="onboarding-title m-0 text-[32px] leading-[1.25] font-semibold tracking-[-.02em] text-balance">{c.chooseCalendar}</h1>
        <p className="onboarding-subtitle m-0 text-[14.5px] leading-[1.75] text-soft text-pretty">{c.calendarLead}</p>
      </header>
      <div ref={cards} className="calendar-modes grid grid-cols-2 gap-4" role="radiogroup" aria-label={c.calendarMode}>
        {(['rolling', 'natural'] as const).map(mode => {
          const selected = draft.mode === mode, { progress, range } = view(mode)
          return <div key={mode} className="calendar-mode-card min-w-0 flex flex-col rounded-[16px] bg-raised" data-selected={selected}>
            <button className="calendar-mode min-w-0 flex flex-col gap-2 pt-5.5 pr-6 pb-5 pl-6 rounded-[16px] text-left text-[14px] leading-[1.6]" type="button" role="radio" aria-checked={selected}
              tabIndex={selected ? 0 : -1} autoFocus={selected} data-mode={mode} onClick={() => change({ mode })}
              onKeyDown={event => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
                  event.preventDefault(); const target = mode === 'rolling' ? 'natural' : 'rolling'; change({ mode: target }); cards.current?.querySelector<HTMLElement>(`[data-mode="${target}"]`)?.focus()
                } else if (event.key === 'Enter') { event.preventDefault(); if (live.periods) next() }
              }}>
              <span className="calendar-mode-heading flex items-center gap-3 text-[20px] leading-[1.3]">
                <span className="ai-radio" data-checked={selected} aria-hidden="true" /><strong>{mode === 'rolling' ? c.rollingMode : c.naturalMode}</strong>
                {mode === 'rolling' && <span className="calendar-mode-tag h-5 px-[7px] py-0 inline-flex items-center rounded-[6px] bg-hover text-soft text-[11.5px] font-medium">{c.defaultTag}</span>}
              </span>
              <span className="calendar-mode-description pl-7.5 text-soft">{mode === 'rolling' ? c.rollingDescription : c.naturalDescription}</span>
              <YearTimeline progress={progress} />
              <small aria-live="polite">{range}</small>
            </button>
            {mode === 'rolling' && selected && <div className="calendar-start min-h-13 mt-0 mr-6 mb-0 ml-13.5 pt-2.5 pr-0 pb-3 pl-0 flex items-center gap-2.5 text-[13px]">
              <span className="calendar-start-label shrink-0 text-muted-foreground">{c.anchorLabel}</span>
              {changing ? <span className="calendar-start-controls flex-1 min-w-0 flex items-center flex-wrap gap-2">
                <Select value={draft.anchorMode} onValueChange={value => change({ anchorMode: value as CalendarDraft['anchorMode'], customAnchor: draft.customAnchor || live.today })}>
                  <SelectTrigger className="pill-trigger" aria-label={c.anchorLabel}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">{messages.anchorToday(monthDay(live.today))}</SelectItem>
                    <SelectItem value="monthStart">{messages.anchorMonth(monthDay(monthStart))}</SelectItem>
                    <SelectItem value="date">{messages.anchorCustom}</SelectItem>
                  </SelectContent>
                </Select>
                {draft.anchorMode === 'date' && <Input type="date" className="pill-date w-auto h-8.5 mx-1 my-0 px-2.5 py-0 text-[14px]" aria-label={messages.customAnchor} max={live.today} required value={draft.customAnchor} onChange={event => change({ customAnchor: event.target.value })} />}
              </span> : <span className="calendar-start-value flex-1 min-w-0 font-medium">{anchorText}</span>}
              <TextButton type="button" aria-expanded={changing} onClick={() => setChanging(value => !value)}>{c.changeAnchor}</TextButton>
            </div>}
          </div>
        })}
      </div>
      <div className="calendar-sentence calendar-controls m-0 flex items-center flex-wrap gap-y-1.5 gap-x-0.5 text-[15px] leading-[1.6] text-soft">
        <span id={timezoneLabel} className="sr-only">{messages.timezone}</span>
        {c.zoneSentence.split(/(\{timezone\}|\{weekStart\})/).map((part, index) => part === '{timezone}' ? timezone : part === '{weekStart}' ? weekStart : part && <span key={index}>{part}</span>)}
      </div>
    </section>
  </OnboardingFrame>
}
