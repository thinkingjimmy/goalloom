/**
 * [INPUT]: 当前步骤序号、主体内容、底栏说明与按钮；LanguageSelect 语言控件；可选底栏按钮槽 ref（供 portal 放入表单外的提交按钮）。
 * [OUTPUT]: OnboardingFrame：顶部三步进度与语言、可滚动主体、固定底栏（说明在左，按钮统一在右下）。
 * [POS]: features/setup 的首次流程外框，方向/日历/Jev 三步共用，保证主按钮始终在同一位置。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ReactNode, Ref } from 'react'
import { messages } from '../../i18n'
import { Icon } from '../../components/icons'
import { LanguageSelect } from '../../components/LanguageSelect'
import './onboarding.css'

export function OnboardingFrame({ step, label, children, note, lock = false, actions, actionsRef }: {
  step: 0 | 1 | 2; label: string; children: ReactNode; note: ReactNode; lock?: boolean; actions: ReactNode; actionsRef?: Ref<HTMLDivElement>
}) {
  const steps = [messages.stepDirection, messages.stepCalendar, messages.stepJev]
  return <div className="onboarding">
    <header className="onboarding-header">
      <ol className="onboarding-steps" aria-label={messages.onboardingProgress}>
        {steps.map((name, index) => <li key={index} data-state={index < step ? 'done' : index === step ? 'current' : 'next'} aria-current={index === step ? 'step' : undefined}>
          <span className="onboarding-step-mark" aria-hidden="true">{index < step ? <Icon name="check" size={12} strokeWidth={2.4} /> : index + 1}</span>{name}
        </li>)}
      </ol>
      <LanguageSelect id="setup-language" className="onboarding-language" />
    </header>
    <main className="onboarding-main" aria-label={label}>{children}</main>
    <footer className="onboarding-footer">
      {lock && <Icon name="lock" size={18} />}
      <p className="onboarding-note">{note}</p>
      <div className="onboarding-actions" ref={actionsRef}>{actions}</div>
    </footer>
  </div>
}
