/**
 * [INPUT]: Step, content, note/actions and optional portal action ref; text follows the saved device language.
 * [OUTPUT]: Header-free setup frame with content, notes and actions centered together in a scrollable column.
 * [POS]: Optional AI setup layout; calendar/direction use the persistent bottom canvas.
 */
import type { ReactNode, Ref } from 'react'
import { Icon } from '../../components/icons'
import './onboarding.css'

export function OnboardingFrame({ step, label, children, note, lock = false, actions, actionsRef, skipAi = false }: {
  skipAi?: boolean; step: 0 | 1 | 2; label: string; children: ReactNode; note: ReactNode; lock?: boolean; actions: ReactNode; actionsRef?: Ref<HTMLDivElement>
}) {
  return <div className="onboarding flex-1 min-h-0 flex flex-col" data-setup-step={step} data-setup-count={skipAi ? 2 : 3}>
    <main className="onboarding-main onboarding-flow flex-1 min-h-0 overflow-y-auto" aria-label={label}>
      <div className="onboarding-stack">
        <div className="onboarding-content w-full flex flex-col gap-8">{children}</div>
        <footer className="onboarding-footer w-full shrink-0 mx-auto my-0 flex items-center gap-3">
          {lock && <span className="onboarding-lock w-7 h-7 shrink-0 grid place-items-center rounded-[8px] bg-hover text-soft" aria-hidden="true"><Icon name="lock" size={16} /></span>}
          <p className="onboarding-note flex-1 min-w-0 m-0 flex flex-col gap-px text-[13px] leading-[1.6] text-soft text-pretty">{note}</p>
          <div className="onboarding-actions flex items-center gap-1 shrink-0" ref={actionsRef}>{actions}</div>
        </footer>
      </div>
    </main>
  </div>
}
