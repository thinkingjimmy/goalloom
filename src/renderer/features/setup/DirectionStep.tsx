/**
 * [INPUT]: Annual direction draft, live calendar preview and explicit confirmation/back callbacks.
 * [OUTPUT]: Mode-aware direction and seven-column header preview; Enter focuses confirmation, short remaining years default to next year.
 * [POS]: Second setup step; no workspace writes until confirmation, draft remains owned by Setup.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useRef } from 'react'
import { currentPeriod } from '../../../domain/calendar'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import { calendarMessages as c, messages } from '../../i18n'
import { fullDate, weekdayName } from '../../i18n/format'
import { relativePeriodName } from '../../lib/periods'
import { Button } from '../../components/ui/button'
import { OnboardingFrame } from './OnboardingFrame'
import { BoardPreview } from './BoardPreview'
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
  const periods = live.periods?.map(period => target && next && (period.horizon === 'year' || period.horizon === 'half') ? currentPeriod(live.calendar, period.horizon, target.startAt) : period)
  const summary = c.lockedSummary(live.calendar.mode === 'natural' ? c.naturalMode : c.rollingMode, fullDate(live.calendar.cycleAnchor), live.calendar.timezone, weekdayName(live.calendar.weekStart))
  return <OnboardingFrame step={1} label={messages.stepDirection} note={<>{summary} · {messages.calendarLockNote} <button className="text-button" onClick={back} disabled={busy}>{c.modify}</button></>} lock
    actions={<><Button type="button" variant="ghost" disabled={busy} onClick={back}>{messages.previousStep}</Button>
      <Button ref={button} type="button" disabled={busy || !target} onClick={() => { if (target) confirm(target) }}>{messages.confirmSetup}</Button></>}>
    <section className="onboarding-direction">
      <h1 className="onboarding-title small">{live.calendar.mode === 'natural' ? c.naturalDirectionTitle : messages.directionTitle}</h1>
      <p className="onboarding-hint" aria-live="polite">{c.yearRemaining(remaining)}</p>
      <input className="direction-input" autoFocus value={value} maxLength={directionLimit} aria-label={messages.directionLabel} placeholder={messages.directionPlaceholder}
        onChange={event => change(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); button.current?.focus() } }} />
      <div className="direction-examples"><span>{messages.directionExamplesLabel}</span>{messages.directionExamples.map(example => <button key={example} type="button" className="direction-example" onClick={() => change(example)}>{example}</button>)}</div>
      {next && target && <p className="onboarding-hint" aria-live="polite">{c.futureDirection(remaining, fullDate(target.startDate))} <button className="text-button" onClick={() => setUseCurrent(true)}>{c.useCurrentYear}</button></p>}
    </section>
    <p className="preview-caption">{messages.previewTitle}</p>
    {periods && <BoardPreview periods={periods} calendar={live.calendar} today={live.today} direction={value.trim()} yearName={relativePeriodName('year', live.calendar, next ? 'next' : 'current')} />}
  </OnboardingFrame>
}
