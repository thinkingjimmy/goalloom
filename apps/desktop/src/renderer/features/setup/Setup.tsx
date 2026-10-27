/**
 * [INPUT]: Explicit confirmation, optional shared drafts, device timezone and live calendar rules.
 * [OUTPUT]: Calendar/direction forms over a persistent read-only canvas; only confirmation writes data.
 * [POS]: Setup coordinator. StartGate retains drafts across welcome; standalone callers own a session.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, type MouseEventHandler } from 'react'
import { currentPeriod } from '../../../domain/calendar'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import { messages } from '../../i18n'
import { CalendarStep } from './CalendarStep'
import { DirectionStep } from './DirectionStep'
import { SetupCanvas } from './SetupCanvas'
import { useEntryMotion, useSetupMotion } from './use-setup-motion'
import { useSetupCalendar, type CalendarChoice } from './use-setup-calendar'
import { useSetupSession, type SetupSession } from './use-setup-session'
import { useOnboardingStage } from './OnboardingStage'
import './onboarding.css'
import './calendar.css'
import './setup-canvas.css'

export type { CalendarChoice } from './use-setup-calendar'
interface SetupProps {
  confirm: (calendar: CalendarChoice, direction: string, period: PlanningPeriod) => void
  busy: boolean; errorCode: string | null; skipAi?: boolean; back?: MouseEventHandler<HTMLButtonElement>; session?: SetupSession
}
export function Setup(props: SetupProps) {
  return props.session ? <SetupPages {...props} session={props.session} /> : <OwnedSetup {...props} />
}
function OwnedSetup(props: SetupProps) {
  const session = useSetupSession()
  return <SetupPages {...props} session={session} />
}
function SetupPages({ confirm, busy, errorCode, back, skipAi = false, session }: SetupProps & { session: SetupSession }) {
  const { step, setStep, text, setText, useCurrentYear, setUseCurrentYear, draft, setDraft } = session
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
  useEntryMotion(motion.root, session.entryMotion)
  useEffect(() => { if (errorCode === 'stale_preview') live.refresh() }, [errorCode, live.refresh])
  return <div ref={motion.root} className="onboarding setup-entry calendar-entry flex-1 min-h-0" data-setup-step={step === 'calendar' ? 0 : 1} data-setup-count={skipAi ? 2 : 3} data-setup-timezone={draft.timezone}>
    <main className="setup-scroll" aria-label={step === 'calendar' ? messages.stepCalendar : messages.stepDirection}>
      <div ref={motion.form} className="onboarding-content setup-form" data-entry-part="form">
        {step === 'calendar'
          ? <CalendarStep draft={draft} change={patch => setDraft(current => ({ ...current, ...patch }))} live={live} busy={busy} next={event => { stage?.motion(event.detail === 0); motion.navigate('direction', event.detail === 0) }} {...(back ? { back } : {})} />
          : <DirectionStep value={text} change={setText} live={live} remaining={remaining} nextYear={nextYear} target={target} useCurrent={() => setUseCurrentYear(true)} busy={busy} back={event => { stage?.motion(event.detail === 0); motion.navigate('calendar', event.detail === 0) }} confirm={period => confirm(live.choice, text.trim(), period)} />}
      </div>
      {!stage && <SetupCanvas live={live} direction={text} step={step} target={target} worldRef={motion.world} />}
    </main>
  </div>
}
