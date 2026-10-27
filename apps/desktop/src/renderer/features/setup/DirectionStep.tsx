/**
 * [INPUT]: Direction draft, live dates, selected year and explicit navigation/confirmation callbacks.
 * [OUTPUT]: Compact textarea, plain examples and equal-height navigation; Enter only focuses confirmation.
 * [POS]: Setup's annual form. Short years retain the next-year default and current-year override.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useRef, type MouseEventHandler } from 'react'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import { Textarea } from '../../components/ui/fields'
import { Button, TextButton } from '../../components/ui/button'
import { calendarMessages as c, messages } from '../../i18n'
import { fullDate } from '../../i18n/format'
import appIcon from '../../assets/app-icon.png'
import type { useSetupCalendar } from './use-setup-calendar'

export const directionLimit = 500
export function DirectionStep({ value, change, live, remaining, nextYear, target, useCurrent, confirm, back, busy }: {
  value: string; change: (value: string) => void; live: ReturnType<typeof useSetupCalendar>; remaining: number; nextYear: boolean; target: PlanningPeriod | undefined; useCurrent: () => void; confirm: (period: PlanningPeriod) => void; back: MouseEventHandler<HTMLButtonElement>; busy: boolean
}) {
  const button = useRef<HTMLButtonElement>(null)
  return <section className="onboarding-direction" aria-labelledby="direction-title">
    <img className="setup-logo" src={appIcon} alt="" draggable={false} />
    <h1 id="direction-title" className="setup-title">{live.calendar.mode === 'natural' ? c.naturalDirectionTitle : messages.directionTitle}</h1>
    <p className="onboarding-hint setup-hint" aria-live="polite">{nextYear && target
      ? <>{c.futureDirection(remaining, fullDate(target.startDate))} <TextButton disabled={busy} onClick={useCurrent}>{c.useCurrentYear}</TextButton></>
      : c.yearRemaining(remaining)}</p>
    <Textarea className="direction-input setup-direction-input" rows={2} autoFocus disabled={busy} value={value} maxLength={directionLimit} aria-label={messages.directionLabel} placeholder={messages.directionPlaceholder}
      onChange={event => change(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); button.current?.focus() } }} />
    <div className="direction-examples setup-examples"><span>{messages.directionExamplesLabel}</span>{messages.directionExamples.slice(0, 2).map(example => <TextButton key={example} className="setup-example" disabled={busy} onClick={() => change(example)}>{example}</TextButton>)}</div>
    <div className="onboarding-actions setup-navigation">
      <Button variant="outline" className="setup-back" disabled={busy} onClick={back}>{messages.start.back}</Button>
      <Button ref={button} className="calendar-primary setup-next" disabled={busy || !target} onClick={() => { if (target) confirm(target) }}>{messages.confirmSetup}</Button>
    </div>
  </section>
}
