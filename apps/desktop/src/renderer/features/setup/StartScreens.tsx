/**
 * [INPUT]: Copy, the signed-in address, password draft and shared Tailwind fields. Sync calls stay in StartGate.
 * [OUTPUT]: Centered password/syncing screens with account navigation below content, and the re-exported local-first welcome screen.
 * [POS]: Presentational first-run account screens; WelcomeScreen owns the initial choice. Joining never mounts Setup.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Input } from '../../components/ui/fields'
import { useId, useState, type ReactNode } from 'react'
import { messages, settingsMessages as settings } from '../../i18n'
import { Icon } from '../../components/icons'
import { Button } from '../../components/ui/button'
import appIcon from '../../assets/app-icon.png'
import { passwordReady } from './entry'
export { ChoiceScreen } from './WelcomeScreen'

function Frame({ back, children }: { back?: ReactNode; children: ReactNode }) {
  return <div className="onboarding start-entry flex-1 min-h-0 flex flex-col">
    <main className="onboarding-main onboarding-flow flex-1 min-h-0 overflow-y-auto"><div className="onboarding-content onboarding-stack start-column flex flex-col gap-8">{children}{back && <div className="start-back-footer">{back}</div>}</div></main>
  </div>
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="start-back h-8 pt-0 pr-2.5 pb-0 pl-1.5 inline-flex items-center gap-1 rounded-[8px] text-[13px] text-soft" disabled={disabled} onClick={onClick}><Icon name="previous" size={16} />{messages.start.back}</button>
}

function Account({ email }: { email: string }) {
  const letter = email.trim().charAt(0).toUpperCase() || '?'
  return <span className="start-account inline-flex items-center gap-2 h-7.5 pt-0 pr-3 pb-0 pl-1 rounded-[15px] bg-hover text-[13px] text-soft"><span className="start-avatar w-5.5 h-5.5 rounded-[11px] bg-focus text-background grid place-items-center text-[11px] font-semibold" aria-hidden="true">{letter}</span>{email}</span>
}

function SecretField({ id, label, value, onChange, invalid, autoComplete }: {
  id?: string; label: string; value: string; onChange: (value: string) => void; invalid?: boolean; autoComplete: string
}) {
  const [shown, setShown] = useState(false)
  return <div className="start-field h-11 flex items-center gap-2 pt-0 pr-2 pb-0 pl-3 bg-raised rounded-[8px]" data-invalid={invalid || undefined}>
    <Input id={id} type={shown ? 'text' : 'password'} aria-label={label} aria-invalid={invalid || undefined} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} />
    <button type="button" className="start-eye w-8 h-8 grid place-items-center text-muted-foreground rounded-[8px]" aria-label={shown ? messages.start.hidePassword : messages.start.showPassword} onClick={() => setShown(current => !current)}>
      <Icon name={shown ? 'viewOff' : 'view'} size={18} />
    </button>
  </div>
}

export function JoinPasswordScreen({ email, wrong, busy, onBack, onSubmit, onReset }: {
  email: string | null; wrong: boolean; busy: boolean; onBack: () => void; onSubmit: (password: string) => void; onReset: () => void
}) {
  const copy = messages.start
  const [password, setPassword] = useState('')
  const passwordId = useId()
  return <Frame back={<BackButton disabled={busy} onClick={onBack} />}>
    <form className="start-form flex flex-col gap-5.5" onSubmit={event => { event.preventDefault(); if (password.trim().length >= 8) onSubmit(password.trim()) }}>
      <header className="onboarding-intro flex flex-col items-start gap-3">
        {email && <Account email={email} />}
        <h2 className="start-heading m-0 text-[24px] leading-[1.3] font-semibold tracking-[-.01em]">{copy.enterTitle}</h2>
        <p className="onboarding-subtitle m-0 text-[14.5px] leading-[1.75] text-soft text-pretty">{copy.enterNote}</p>
      </header>
      <div className="start-label flex flex-col gap-2 text-[13px] font-medium">
        <span className="start-label-row flex justify-between items-baseline"><label htmlFor={passwordId}>{settings.sync.password}</label><button type="button" className="start-link text-focus text-[13px] font-normal" onClick={onReset}>{settings.sync.forgot}</button></span>
        <SecretField id={passwordId} label={settings.sync.password} autoComplete="current-password" value={password} invalid={wrong} onChange={setPassword} />
        {wrong && <p className="start-error m-0 flex items-center gap-1.5 text-[12.5px] font-normal text-destructive" role="alert"><Icon name="warning" size={14} />{settings.sync.errors.password}</p>}
      </div>
      <Button type="submit" className="start-continue w-full" disabled={busy || password.trim().length < 8}>{settings.sync.continue}</Button>
    </form>
  </Frame>
}

export function NewPasswordScreen({ email, busy, onBack, onContinue, initialPassword = '', initialAgain = '' }: {
  email: string | null; busy: boolean; onBack: () => void; onContinue: (password: string) => void; initialPassword?: string; initialAgain?: string
}) {
  const copy = messages.start
  const [password, setPassword] = useState(initialPassword)
  const [again, setAgain] = useState(initialAgain)
  const mismatch = again.length > 0 && password !== again
  const ready = passwordReady(password, again)
  const longEnough = password.trim().length >= 8
  return <Frame back={<BackButton disabled={busy} onClick={onBack} />}>
    <form className="start-form flex flex-col gap-5.5" onSubmit={event => { event.preventDefault(); if (ready) onContinue(password.trim()) }}>
      <header className="onboarding-intro flex flex-col items-start gap-3">
        {email && <Account email={email} />}
        <h2 className="start-heading m-0 text-[24px] leading-[1.3] font-semibold tracking-[-.01em]">{copy.newTitle}</h2>
        <p className="onboarding-subtitle m-0 text-[14.5px] leading-[1.75] text-soft text-pretty">{copy.newNote}</p>
      </header>
      <label className="start-label flex flex-col gap-2 text-[13px] font-medium">
        <span>{settings.sync.password}</span>
        <SecretField label={settings.sync.password} autoComplete="new-password" value={password} onChange={setPassword} />
        <p className="start-hint m-0 flex items-center gap-1.5 text-[12.5px] font-normal text-muted-foreground" data-ok={longEnough || undefined}>{longEnough && <Icon name="check" size={14} />}{settings.sync.passwordRule}</p>
      </label>
      <label className="start-label flex flex-col gap-2 text-[13px] font-medium">
        <span>{settings.sync.confirmPassword}</span>
        <SecretField label={settings.sync.confirmPassword} autoComplete="new-password" value={again} invalid={mismatch} onChange={setAgain} />
        {mismatch && <p className="start-error m-0 flex items-center gap-1.5 text-[12.5px] font-normal text-destructive" role="alert"><Icon name="warning" size={14} />{copy.mismatch}</p>}
      </label>
      <Button type="submit" className="start-continue w-full" disabled={busy || !ready}>{settings.sync.continue}</Button>
    </form>
  </Frame>
}

export function SyncingScreen() {
  return <Frame>
    <div className="start-syncing flex flex-col items-center text-center gap-4.5" role="status">
      <span className="onboarding-mark start-mark-large relative shrink-0 overflow-hidden w-12 h-12 rounded-[12px]" aria-hidden="true"><img src={appIcon} alt="" draggable={false} /></span>
      <h2 className="start-heading m-0 text-[24px] leading-[1.3] font-semibold tracking-[-.01em]">{messages.start.syncing}</h2>
      <span className="start-bar h-1 w-60 rounded-[2px] bg-hover overflow-hidden" aria-hidden="true"><i /></span>
    </div>
  </Frame>
}
