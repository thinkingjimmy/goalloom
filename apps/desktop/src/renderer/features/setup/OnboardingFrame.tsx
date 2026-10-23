/**
 * [INPUT]: Step, content, note/actions, shared language control and optional portal action ref.
 * [OUTPUT]: Eligibility-aware two/three-step calendar/direction/AI frame: progress at the top left, one centred scrolling content column (titles stay put between steps) and a note/actions row pinned to the bottom without a bar.
 * [POS]: Shared setup layout; keeps confirmation controls in a stable position.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ReactNode, Ref } from 'react'
import { messages } from '../../i18n'
import { Icon } from '../../components/icons'
import { LanguageSelect } from '../../components/LanguageSelect'
import './onboarding.css'

export function OnboardingFrame({ step, label, children, note, lock = false, actions, actionsRef, skipAi = false }: {
  skipAi?: boolean; step: 0 | 1 | 2; label: string; children: ReactNode; note: ReactNode; lock?: boolean; actions: ReactNode; actionsRef?: Ref<HTMLDivElement>
}) {
  const steps = skipAi ? [messages.stepCalendar, messages.stepDirection] : [messages.stepCalendar, messages.stepDirection, messages.stepAi]
  return <div className="onboarding flex-1 min-h-0 flex flex-col">
    <header className="onboarding-header w-full h-11 shrink-0 mx-auto my-0 flex items-center justify-between gap-4">
      <ol className="onboarding-steps flex items-center gap-10 m-0 p-0 list-none text-[13px] text-muted-foreground" aria-label={messages.onboardingProgress}>
        {steps.map((name, index) => <li key={index} data-state={index < step ? 'done' : index === step ? 'current' : 'next'} aria-current={index === step ? 'step' : undefined}>
          <span className="onboarding-step-mark w-5 h-5 rounded-[10px] grid place-items-center text-[11px] tabular-nums" aria-hidden="true">{index < step ? <Icon name="check" size={12} strokeWidth={2.4} /> : index + 1}</span>{name}
        </li>)}
      </ol>
      <LanguageSelect id="setup-language" className="onboarding-language" />
    </header>
    <main className="onboarding-main flex-1 min-h-0 overflow-y-auto" aria-label={label}><div className="onboarding-content w-full mx-auto my-0 flex flex-col gap-8">{children}</div></main>
    <footer className="onboarding-footer w-full shrink-0 mx-auto my-0 flex items-center gap-3">
      {lock && <span className="onboarding-lock w-7 h-7 shrink-0 grid place-items-center rounded-[8px] bg-hover text-soft" aria-hidden="true"><Icon name="lock" size={16} /></span>}
      <p className="onboarding-note flex-1 min-w-0 m-0 flex flex-col gap-px text-[13px] leading-[1.6] text-soft text-pretty">{note}</p>
      <div className="onboarding-actions flex items-center gap-1 shrink-0" ref={actionsRef}>{actions}</div>
    </footer>
  </div>
}
