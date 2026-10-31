/**
 * [INPUT]: Localized password copy, controlled drafts and the existing serialized sync action.
 * [OUTPUT]: Flat native password dialogs, shared password fields and scoped focus/error feedback.
 * [POS]: Settings sync presentation shared with recovery; sync commands remain owned by the caller.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { SyncAction } from '../../../../shared/contracts/sync'
import { Modal } from '../../../components/Modal'
import { SettingsButton } from '../../../components/ui/button'
import { Input } from '../../../components/ui/fields'
import { messages, settingsMessages as s } from '../../../i18n'
import './sync-security.css'

export function SyncPasswordModal({ title, className, working, error, close, children }: {
  title: string; className: string; working: boolean; error?: string | undefined; close: () => void; children: ReactNode
}) {
  const content = useRef<HTMLDivElement>(null)
  const trigger = useRef(document.activeElement)
  useEffect(() => {
    if (!matchMedia('(pointer: coarse)').matches) content.current?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true })
    return () => {
      if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus({ preventScroll: true })
    }
  }, [])
  return createPortal(<Modal title={title} close={() => { if (!working) close() }} className={`sync-password-modal ${className}`}>
    <div ref={content}>
      {error && <p className="m-0 mb-4 text-sm text-destructive" role="alert">{error}</p>}
      {children}
    </div>
  </Modal>, document.body)
}

export function SyncPasswordFields({ password, again, disabled, setPassword, setAgain }: {
  password: string; again: string; disabled: boolean; setPassword: (value: string) => void; setAgain: (value: string) => void
}) {
  const t = s.sync, id = useId()
  const [checked, setChecked] = useState(false)
  const mismatch = checked && again.length > 0 && password.trim() !== again.trim()
  return <div className="flex flex-col gap-4">
    <label className="m-0 flex flex-col gap-1.5 text-sm" htmlFor={`${id}-password`}>{t.newPassword}
      <Input id={`${id}-password`} className="text-base" type="password" autoComplete="new-password" maxLength={128} placeholder={t.passwordRule} disabled={disabled} value={password} onChange={event => setPassword(event.target.value)} />
    </label>
    <label className="m-0 flex flex-col gap-1.5 text-sm" htmlFor={`${id}-again`}>{t.confirmPassword}
      <Input id={`${id}-again`} className="text-base" type="password" autoComplete="new-password" maxLength={128} disabled={disabled} value={again} aria-invalid={mismatch || undefined} aria-describedby={mismatch ? `${id}-mismatch` : undefined} onBlur={() => setChecked(true)} onChange={event => setAgain(event.target.value)} />
      {mismatch && <span id={`${id}-mismatch`} className="text-xs text-destructive" role="alert">{messages.start.mismatch}</span>}
    </label>
  </div>
}

export function SyncPasswordDialog({ working, syncing, error, run, close }: {
  working: boolean; syncing: boolean; error?: string | undefined; run: (action: SyncAction) => Promise<boolean>; close: () => void
}) {
  const t = s.sync
  const [password, setPassword] = useState(''), [again, setAgain] = useState('')
  const [failed, setFailed] = useState(false)
  const submitting = useRef(false)
  const valid = password.trim().length >= 8 && password.trim().length <= 128 && password.trim() === again.trim()
  return <SyncPasswordModal title={t.changePassword} className="sync-change-password-modal" working={working} error={failed ? error ?? t.errors.storage : undefined} close={close}>
    <form className="sync-password-form flex flex-col gap-5" aria-busy={working} noValidate onSubmit={event => {
      event.preventDefault()
      if (!valid || working || syncing || submitting.current) return
      submitting.current = true; setFailed(false)
      void run({ type: 'change-password', password: password.trim() }).then(ok => { if (ok) close(); else setFailed(true) })
        .catch(() => setFailed(true)).finally(() => { submitting.current = false })
    }}>
      <p className="m-0 text-sm text-muted-foreground">{t.changePasswordNote}</p>
      <SyncPasswordFields password={password} again={again} disabled={working} setPassword={setPassword} setAgain={setAgain} />
      <footer className="modal-footer justify-end flex-wrap">
        <SettingsButton type="button" disabled={working} onClick={close}>{t.cancel}</SettingsButton>
        <SettingsButton type="submit" variant="primary" disabled={working || syncing || !valid}>{working ? t.changingPassword : t.changePassword}</SettingsButton>
      </footer>
    </form>
  </SyncPasswordModal>
}
