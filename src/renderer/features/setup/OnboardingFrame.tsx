/**
 * [INPUT]: Step, content, note/actions, shared language control and optional portal action ref.
 * [OUTPUT]: Three-step calendar/direction/AI frame: progress at the top left, one centred scrolling content column (titles stay put between steps) and a note/actions row pinned to the bottom without a bar.
 * [POS]: Shared setup layout; keeps confirmation controls in a stable position.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ReactNode, Ref } from 'react'
import { messages } from '../../i18n'
import { Icon } from '../../components/icons'
import { LanguageSelect } from '../../components/LanguageSelect'
import './onboarding.css'

export function OnboardingFrame({ step, label, children, note, lock = false, actions, actionsRef }: {
  step: 0 | 1 | 2; label: string; children: ReactNode; note: ReactNode; lock?: boolean; actions: ReactNode; actionsRef?: Ref<HTMLDivElement>
}) {
  const steps = [messages.stepCalendar, messages.stepDirection, messages.stepAi]
  return <div className="onboarding">
    <header className="onboarding-header">
      <ol className="onboarding-steps" aria-label={messages.onboardingProgress}>
        {steps.map((name, index) => <li key={index} data-state={index < step ? 'done' : index === step ? 'current' : 'next'} aria-current={index === step ? 'step' : undefined}>
          <span className="onboarding-step-mark" aria-hidden="true">{index < step ? <Icon name="check" size={12} strokeWidth={2.4} /> : index + 1}</span>{name}
        </li>)}
      </ol>
      <LanguageSelect id="setup-language" className="onboarding-language" />
    </header>
    <main className="onboarding-main" aria-label={label}><div className="onboarding-content">{children}</div></main>
    <footer className="onboarding-footer">
      {lock && <span className="onboarding-lock" aria-hidden="true"><Icon name="lock" size={16} /></span>}
      <p className="onboarding-note">{note}</p>
      <div className="onboarding-actions" ref={actionsRef}>{actions}</div>
    </footer>
  </div>
}
