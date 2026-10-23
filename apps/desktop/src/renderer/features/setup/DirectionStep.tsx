/**
 * [INPUT]: Annual direction draft, live calendar preview and explicit confirmation/back callbacks.
 * [OUTPUT]: Mode-aware direction with examples, one hint line (days left, or the next-year destination with a way back) and a two-line lock summary; Enter focuses confirmation, short remaining years default to next year.
 * [POS]: Second setup step; no workspace writes until confirmation, draft remains owned by Setup.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Input } from '../../components/ui/fields'
import { useRef } from 'react'
import { currentPeriod } from '../../../domain/calendar'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import { calendarMessages as c, messages } from '../../i18n'
import { fullDate, weekdayName } from '../../i18n/format'
import { Button, TextButton } from '../../components/ui/button'
import { Icon } from '../../components/icons'
import { OnboardingFrame } from './OnboardingFrame'
import type { useSetupCalendar } from './use-setup-calendar'

export const directionLimit = 500
export function DirectionStep({ value, change, live, confirm, back, busy, useCurrent, setUseCurrent, skipAi = false }: {
  skipAi?: boolean; useCurrent: boolean; setUseCurrent: (value: boolean) => void; value: string; change: (value: string) => void; live: ReturnType<typeof useSetupCalendar>; confirm: (period: PlanningPeriod) => void; back: () => void; busy: boolean
}) {
  const button = useRef<HTMLButtonElement>(null)
  const current = live.periods?.find(period => period.horizon === 'year')
  const remaining = current ? Math.round((Date.parse(current.endDate) - Date.parse(live.today)) / 86400000) : 0
  const next = !!current && remaining < 14 && !useCurrent
  const target = current && (next ? currentPeriod(live.calendar, 'year', current.endAt) : current)
  const summary = c.lockedSummary(live.calendar.mode === 'natural' ? c.naturalMode : c.rollingMode, fullDate(live.calendar.cycleAnchor), live.calendar.timezone, weekdayName(live.calendar.weekStart))
  return <OnboardingFrame skipAi={skipAi} step={1} label={messages.stepDirection} lock
    note={<><span className="onboarding-note-main text-foreground">{summary} <TextButton type="button" onClick={back} disabled={busy}>{c.modify}</TextButton></span>
      <span className="onboarding-note-sub text-[12px] text-muted-foreground">{messages.calendarLockNote}</span></>}
    actions={<><Button type="button" variant="ghost" disabled={busy} onClick={back}>{messages.previousStep}</Button>
      <Button ref={button} type="button" disabled={busy || !target} onClick={() => { if (target) confirm(target) }}>{messages.confirmSetup}</Button></>}>
    <section className="onboarding-direction flex flex-col gap-4 max-w-190">
      <header className="onboarding-intro flex flex-col items-start gap-3">
        <h1 className="onboarding-title m-0 text-[32px] leading-[1.25] font-semibold tracking-[-.02em] text-balance">{live.calendar.mode === 'natural' ? c.naturalDirectionTitle : messages.directionTitle}</h1>
        <p className="onboarding-hint onboarding-meta m-0 text-[13px] leading-[1.7] text-muted-foreground inline-flex items-center flex-wrap gap-1.5" aria-live="polite"><Icon name="calendar" size={14} />
          {next && target ? <>{c.futureDirection(remaining, fullDate(target.startDate))}<TextButton type="button" onClick={() => setUseCurrent(true)}>{c.useCurrentYear}</TextButton></> : c.yearRemaining(remaining)}
        </p>
      </header>
      <Input className="direction-input h-15 px-5 py-0 text-[20px] rounded-[14px]" autoFocus value={value} maxLength={directionLimit} aria-label={messages.directionLabel} placeholder={messages.directionPlaceholder}
        onChange={event => change(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); button.current?.focus() } }} />
      <div className="direction-examples flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground"><span>{messages.directionExamplesLabel}</span>{messages.directionExamples.map(example => <button key={example} type="button" className="direction-example h-7.5 px-3 py-0 rounded-[15px] bg-hover text-[13px] text-soft" data-active={value.trim() === example} onClick={() => change(example)}>{example}</button>)}</div>
    </section>
  </OnboardingFrame>
}
