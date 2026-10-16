/**
 * [INPUT]: Copy, the signed-in address, password draft and shared Tailwind fields. Sync calls stay in StartGate.
 * [OUTPUT]: The choice cards, inline browser wait, password forms, reset dialog and syncing state.
 * [POS]: Presentational first-run screens. Joining never mounts Setup.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Input } from '../../components/ui/fields'
import { cn } from '../../lib/utils'
import { useId, useState, type ReactNode } from 'react'
import { messages, settingsMessages as settings } from '../../i18n'
import { Icon } from '../../components/icons'
import { LanguageSelect } from '../../components/LanguageSelect'
import { Button } from '../../components/ui/button'
import appIcon from '../../assets/app-icon.png'
import { passwordReady } from './entry'

function GoogleMark() {
  return <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
}

function Frame({ back, children, wide = false }: { back?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <div className="onboarding start-entry flex-1 min-h-0 flex flex-col">
    <header className="onboarding-header w-full h-11 shrink-0 mx-auto my-0 flex items-center justify-between gap-4">
      {back ?? <span />}
      <LanguageSelect id="start-language" className="onboarding-language" />
    </header>
    <main className="onboarding-main flex-1 min-h-0 overflow-y-auto"><div className={cn(`onboarding-content start-column${wide ? ' wide' : ''}`, 'w-full mx-auto my-0 flex flex-col gap-8 max-w-105')}>{children}</div></main>
  </div>
}

function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="start-back h-8 pt-0 pr-2.5 pb-0 pl-1.5 inline-flex items-center gap-1 rounded-[8px] text-[13px] text-soft" disabled={disabled} onClick={onClick}><Icon name="previous" size={16} />{messages.start.back}</button>
}

function Account({ email }: { email: string }) {
  const letter = email.trim().charAt(0).toUpperCase() || '?'
  return <span className="start-account inline-flex items-center gap-2 h-7.5 pt-0 pr-3 pb-0 pl-1 rounded-[15px] bg-hover text-[13px] text-soft"><span className="start-avatar w-5.5 h-5.5 rounded-[11px] bg-focus text-background grid place-items-center text-[11px] font-semibold" aria-hidden="true">{letter}</span>{email}</span>
}

function SecretField({ label, value, onChange, invalid, autoComplete }: {
  label: string; value: string; onChange: (value: string) => void; invalid?: boolean; autoComplete: string
}) {
  const [shown, setShown] = useState(false)
  return <div className="start-field h-11 flex items-center gap-2 pt-0 pr-2 pb-0 pl-3 bg-raised rounded-[8px]" data-invalid={invalid || undefined}>
    <Input type={shown ? 'text' : 'password'} aria-label={label} aria-invalid={invalid || undefined} autoComplete={autoComplete} value={value} onChange={event => onChange(event.target.value)} />
    <button type="button" className="start-eye w-8 h-8 grid place-items-center text-muted-foreground rounded-[8px]" aria-label={shown ? messages.start.hidePassword : messages.start.showPassword} onClick={() => setShown(current => !current)}>
      <Icon name={shown ? 'viewOff' : 'view'} size={18} />
    </button>
  </div>
}

export function ChoiceScreen({ waiting, onLocal, onGoogle, onCancel }: {
  waiting: boolean; onLocal: () => void; onGoogle: () => void; onCancel: () => void
}) {
  const copy = messages.start
  return <Frame wide>
    <header className="onboarding-intro flex flex-col items-start gap-3">
      <p className="onboarding-eyebrow m-0 flex items-center gap-2 text-[13px] font-medium text-muted-foreground"><span className="onboarding-mark relative w-5.5 h-5.5 shrink-0 rounded-[6px] overflow-hidden" aria-hidden="true"><img src={appIcon} alt="" draggable={false} /></span>{messages.welcome}</p>
      <h1 className="onboarding-title m-0 text-[32px] leading-[1.25] font-semibold tracking-[-.02em] text-balance">{copy.title}</h1>
    </header>
    <div className="start-cards grid grid-cols-2 gap-4">
      <button type="button" className="start-card min-h-37.5 px-6 py-5.5 flex flex-col items-start gap-2.5 rounded-[16px] bg-raised text-left" data-dim={waiting || undefined} disabled={waiting} onClick={onLocal}>
        <span className="start-card-icon w-9 h-9 rounded-[10px] grid place-items-center bg-hover text-soft" aria-hidden="true"><Icon name="monitor" size={20} /></span>
        <b>{copy.local}</b>
        <small>{copy.localNote}</small>
      </button>
      {waiting ? <div className="start-card min-h-37.5 px-6 py-5.5 flex flex-col items-start gap-2.5 rounded-[16px] bg-raised text-left" data-selected="true" data-waiting="true" role="status">
        <span className="start-card-icon w-9 h-9 rounded-[10px] grid place-items-center bg-hover text-soft" aria-hidden="true"><GoogleMark /></span>
        <b>{copy.google}</b>
        <span className="start-wait flex items-center gap-2.5 text-[13.5px] text-soft"><span className="start-spinner" aria-hidden="true" />{copy.browser}</span>
        <span className="start-card-foot mt-auto self-end"><button type="button" className="start-quiet text-[13px] text-muted-foreground" onClick={onCancel}>{settings.sync.cancel}</button></span>
      </div> : <button type="button" className="start-card min-h-37.5 px-6 py-5.5 flex flex-col items-start gap-2.5 rounded-[16px] bg-raised text-left" onClick={onGoogle}>
        <span className="start-card-icon w-9 h-9 rounded-[10px] grid place-items-center bg-hover text-soft" aria-hidden="true"><GoogleMark /></span>
        <b>{copy.google}</b>
        <small>{copy.googleNote}</small>
      </button>}
    </div>
  </Frame>
}

export function JoinPasswordScreen({ email, wrong, busy, onBack, onSubmit, onReset }: {
  email: string | null; wrong: boolean; busy: boolean; onBack: () => void; onSubmit: (password: string) => void; onReset: () => void
}) {
  const copy = messages.start
  const [password, setPassword] = useState('')
  return <Frame back={<BackButton disabled={busy} onClick={onBack} />}>
    <form className="start-form flex flex-col gap-5.5" onSubmit={event => { event.preventDefault(); if (password.trim().length >= 8) onSubmit(password.trim()) }}>
      <header className="onboarding-intro flex flex-col items-start gap-3">
        {email && <Account email={email} />}
        <h2 className="start-heading m-0 text-[24px] leading-[1.3] font-semibold tracking-[-.01em]">{copy.enterTitle}</h2>
        <p className="onboarding-subtitle m-0 text-[14.5px] leading-[1.75] text-soft text-pretty">{copy.enterNote}</p>
      </header>
      <label className="start-label flex flex-col gap-2 text-[13px] font-medium">
        <span className="start-label-row flex justify-between items-baseline"><span>{settings.sync.password}</span><button type="button" className="start-link text-focus text-[13px] font-normal" onClick={onReset}>{settings.sync.resetSync}</button></span>
        <SecretField label={settings.sync.password} autoComplete="current-password" value={password} invalid={wrong} onChange={setPassword} />
        {wrong && <p className="start-error m-0 flex items-center gap-1.5 text-[12.5px] font-normal text-destructive" role="alert"><Icon name="warning" size={14} />{settings.sync.errors.password}</p>}
      </label>
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

export function ResetSyncDialog({ acknowledged, busy, onAcknowledge, onCancel, onConfirm }: {
  acknowledged: boolean; busy: boolean; onAcknowledge: (value: boolean) => void; onCancel: () => void; onConfirm: () => void
}) {
  const copy = messages.start
  const titleId = useId()
  return <div className="start-scrim fixed grid place-items-center">
    <div className="start-dialog w-100 bg-surface rounded-[14px] pt-5.5 pr-5.5 pb-4.5 pl-5.5 flex flex-col gap-3.5" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <h3 id={titleId}>{copy.resetTitle}</h3>
      <p>{copy.resetUnknown}</p>
      <p>{copy.resetBody}</p>
      <label className="start-check flex gap-2 items-center text-[13px] font-normal text-soft"><input type="checkbox" checked={acknowledged} onChange={event => onAcknowledge(event.target.checked)} />{copy.resetAck}</label>
      <div className="start-dialog-actions flex justify-end gap-2 mt-1.5">
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>{settings.sync.cancel}</Button>
        <Button type="button" className="start-danger" disabled={busy || !acknowledged} onClick={onConfirm}>{copy.resetConfirm}</Button>
      </div>
    </div>
  </div>
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
