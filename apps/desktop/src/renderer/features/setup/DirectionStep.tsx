/**
 * [INPUT]: Annual direction draft, live calendar preview and explicit confirmation/back callbacks.
 * [OUTPUT]: Mode-aware direction with examples, one hint line (days left, or the next-year destination with a way back) and a two-line lock summary; Enter focuses confirmation, short remaining years default to next year.
 * [POS]: Second setup step; no workspace writes until confirmation, draft remains owned by Setup.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useRef } from 'react'
import { currentPeriod } from '../../../domain/calendar'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import { calendarMessages as c, messages } from '../../i18n'
import { fullDate, weekdayName } from '../../i18n/format'
import { Button } from '../../components/ui/button'
import { Icon } from '../../components/icons'
import { OnboardingFrame } from './OnboardingFrame'
import type { useSetupCalendar } from './use-setup-calendar'

export const directionLimit = 500
export function DirectionStep({ value, change, live, confirm, back, busy, useCurrent, setUseCurrent }: {
  useCurrent: boolean; setUseCurrent: (value: boolean) => void; value: string; change: (value: string) => void; live: ReturnType<typeof useSetupCalendar>; confirm: (period: PlanningPeriod) => void; back: () => void; busy: boolean
}) {
  const button = useRef<HTMLButtonElement>(null)
  const current = live.periods?.find(period => period.horizon === 'year')
  const remaining = current ? Math.round((Date.parse(current.endDate) - Date.parse(live.today)) / 86400000) : 0
  const next = !!current && remaining < 14 && !useCurrent
  const target = current && (next ? currentPeriod(live.calendar, 'year', current.endAt) : current)
  const summary = c.lockedSummary(live.calendar.mode === 'natural' ? c.naturalMode : c.rollingMode, fullDate(live.calendar.cycleAnchor), live.calendar.timezone, weekdayName(live.calendar.weekStart))
  return <OnboardingFrame step={1} label={messages.stepDirection} lock
    note={<><span className="onboarding-note-main">{summary} <button type="button" className="text-button" onClick={back} disabled={busy}>{c.modify}</button></span>
      <span className="onboarding-note-sub">{messages.calendarLockNote}</span></>}
    actions={<><Button type="button" variant="ghost" disabled={busy} onClick={back}>{messages.previousStep}</Button>
      <Button ref={button} type="button" disabled={busy || !target} onClick={() => { if (target) confirm(target) }}>{messages.confirmSetup}</Button></>}>
    <section className="onboarding-direction">
      <header className="onboarding-intro">
        <h1 className="onboarding-title">{live.calendar.mode === 'natural' ? c.naturalDirectionTitle : messages.directionTitle}</h1>
        <p className="onboarding-hint onboarding-meta" aria-live="polite"><Icon name="calendar" size={14} />
          {next && target ? <>{c.futureDirection(remaining, fullDate(target.startDate))}<button type="button" className="text-button" onClick={() => setUseCurrent(true)}>{c.useCurrentYear}</button></> : c.yearRemaining(remaining)}
        </p>
      </header>
      <input className="direction-input" autoFocus value={value} maxLength={directionLimit} aria-label={messages.directionLabel} placeholder={messages.directionPlaceholder}
        onChange={event => change(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); button.current?.focus() } }} />
      <div className="direction-examples"><span>{messages.directionExamplesLabel}</span>{messages.directionExamples.map(example => <button key={example} type="button" className="direction-example" data-active={value.trim() === example} onClick={() => change(example)}>{example}</button>)}</div>
    </section>
  </OnboardingFrame>
}
