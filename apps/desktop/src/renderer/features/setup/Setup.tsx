/**
 * [INPUT]: Explicit completion intent, device timezone and live calendar rules.
 * [OUTPUT]: Calendar-first setup with retained drafts; Skip confirms only the calendar and direction confirmation may create an annual goal.
 * [POS]: Account-free first-run coordinator over the shared calendar/direction/AI canvas.
 */
import { useEffect, useLayoutEffect } from 'react'
import { currentPeriod } from '../../../domain/calendar'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import { messages } from '../../i18n'
import { CalendarStep } from './CalendarStep'
import { DirectionStep } from './DirectionStep'
import { SetupCanvas } from './SetupCanvas'
import { useSetupMotion } from './use-setup-motion'
import { useSetupCalendar, type CalendarChoice } from './use-setup-calendar'
import { useSetupSession } from './use-setup-session'
import { useOnboardingStage } from './OnboardingStage'
import './onboarding.css'
import './calendar.css'
import './setup-canvas.css'

export type { CalendarChoice } from './use-setup-calendar'
export type SetupSubmission = { calendar: CalendarChoice } & ({ kind: 'skip' } | { kind: 'direction'; direction: string; period: PlanningPeriod })
interface SetupProps {
  confirm: (submission: SetupSubmission) => void
  busy: boolean; errorCode: string | null
}
export function Setup({ confirm, busy, errorCode }: SetupProps) {
  const { step, setStep, text, setText, useCurrentYear, setUseCurrentYear, draft, setDraft } = useSetupSession()
  const live = useSetupCalendar(draft)
  const current = live.periods?.find(period => period.horizon === 'year')
  const remaining = current ? Math.round((Date.parse(current.endDate) - Date.parse(live.today)) / 86400000) : 0
  const nextYear = !!current && remaining < 14 && !useCurrentYear
  const target = current && (nextYear ? currentPeriod(live.calendar, 'year', current.endAt) : current)
  const motion = useSetupMotion(step, setStep)
  const stage = useOnboardingStage()
  useLayoutEffect(() => {
    stage?.publish({ live, direction: text, target, camera: step === 'direction' ? 'year' : 'overview' })
  }, [stage, step, text, target?.id, live.now, draft.mode, draft.timezone, draft.weekStart, draft.anchorMode, draft.customAnchor])
  useEffect(() => { if (errorCode === 'stale_preview') live.refresh() }, [errorCode, live.refresh])
  return <div ref={motion.root} className="onboarding setup-entry calendar-entry flex-1 min-h-0" data-setup-step={step === 'calendar' ? 0 : 1} data-setup-timezone={draft.timezone}>
    <main className="setup-scroll" aria-label={step === 'calendar' ? messages.stepCalendar : messages.stepDirection}>
      <div ref={motion.form} className="onboarding-content setup-form" data-entry-part="form">
        {step === 'calendar'
          ? <CalendarStep draft={draft} change={patch => setDraft(current => ({ ...current, ...patch }))} live={live} busy={busy} next={event => { stage?.motion(event.detail === 0); motion.navigate('direction', event.detail === 0) }} skip={() => confirm({ kind: 'skip', calendar: live.choice })} />
          : <DirectionStep value={text} change={setText} live={live} remaining={remaining} nextYear={nextYear} target={target} useCurrent={() => setUseCurrentYear(true)} busy={busy} back={event => { stage?.motion(event.detail === 0); motion.navigate('calendar', event.detail === 0) }} confirm={period => confirm({ kind: 'direction', calendar: live.choice, direction: text.trim(), period })} />}
      </div>
      {!stage && <SetupCanvas live={live} direction={text} step={step} target={target} worldRef={motion.world} />}
    </main>
  </div>
}
