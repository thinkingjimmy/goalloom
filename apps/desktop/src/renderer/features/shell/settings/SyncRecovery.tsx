/**
 * [INPUT]: Localized recovery copy and the existing serialized sync action.
 * [OUTPUT]: Flat native recovery dialog with a recommended workspace, destructive confirmation and Back.
 * [POS]: Shared Settings/first-run presentation; setup confirmation and sync writes remain caller-owned.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useId, useRef, useState } from 'react'
import type { SyncAction } from '../../../../shared/contracts/sync'
import { SettingsButton } from '../../../components/ui/button'
import { Input } from '../../../components/ui/fields'
import { messages, settingsMessages as s } from '../../../i18n'
import { SyncPasswordFields, SyncPasswordModal } from './SyncPasswordDialog'

export const cloudDeleteConfirmation = 'DELETE ALL CLOUD DATA'

export function SyncRecovery({ working, error, run, close }: { working: boolean; error?: string | undefined; run: (action: SyncAction) => Promise<boolean>; close: () => void }) {
  const t = s.sync, id = useId()
  const [option, setOption] = useState<'new' | 'destructive'>('new')
  const [password, setPassword] = useState(''), [again, setAgain] = useState(''), [confirmation, setConfirmation] = useState('')
  const [failed, setFailed] = useState(false), [expanded, setExpanded] = useState(false)
  const form = useRef<HTMLFormElement>(null), submitting = useRef(false)
  const valid = password.trim().length >= 8 && password.trim().length <= 128 && password.trim() === again.trim()
    && (option === 'new' || confirmation === cloudDeleteConfirmation)
  useEffect(() => {
    if (matchMedia('(pointer: coarse)').matches) return
    const target = option === 'destructive' ? form.current?.querySelector<HTMLInputElement>('input') : form.current?.querySelector<HTMLButtonElement>('.sync-recovery-alternative')
    target?.focus({ preventScroll: true })
  }, [option])
  const changeOption = (value: 'new' | 'destructive') => { setOption(value); setConfirmation(''); setFailed(false) }
  return <SyncPasswordModal title={option === 'new' ? t.recoveryTitle : t.destructiveReset} className="sync-recovery-modal" working={working} error={failed ? error ?? t.errors.storage : undefined} close={close}>
    <form ref={form} className="sync-recovery-form flex flex-col gap-5" aria-busy={working} noValidate onSubmit={event => {
      event.preventDefault()
      if (!valid || working || submitting.current) return
      submitting.current = true; setFailed(false)
      void run(option === 'new' ? { type: 'create-new-workspace', password: password.trim() }
        : { type: 'reset-sync', password: password.trim(), confirmation: cloudDeleteConfirmation }).then(ok => { if (ok) close(); else setFailed(true) })
        .catch(() => setFailed(true)).finally(() => { submitting.current = false })
    }}>
      {option === 'new' ? <>
        <p className="m-0 text-sm text-muted-foreground">{t.recoverOtherDevice}</p>
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-medium text-foreground">{t.createNewWorkspace}</h3>
          <p className="m-0 text-sm text-muted-foreground">{t.createNewNote}</p>
        </div>
      </> : <div className="flex flex-col gap-2">
        <p className="m-0 text-sm text-destructive" role="alert">{t.destructiveWarning}</p>
        <p className="m-0 text-sm text-muted-foreground">{t.destructiveNote}</p>
      </div>}
      <SyncPasswordFields password={password} again={again} disabled={working} setPassword={setPassword} setAgain={setAgain} />
      {option === 'new' ? <details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)} className="text-sm text-muted-foreground">
        <summary className="w-fit">{t.recoveryOptions}</summary>
        <div className="mt-3 flex flex-col items-start gap-3">
          <p className="m-0">{t.destructiveWarning}</p>
          <SettingsButton type="button" className="sync-recovery-alternative whitespace-normal text-left" disabled={working} onClick={() => changeOption('destructive')}>{t.destructiveReset}</SettingsButton>
        </div>
      </details> : <label className="m-0 flex flex-col gap-2 text-sm" htmlFor={`${id}-confirmation`}>{t.typeDeleteConfirmation}
        <code className="break-words text-xs font-normal">{cloudDeleteConfirmation}</code>
        <Input id={`${id}-confirmation`} className="text-base" type="text" autoComplete="off" spellCheck={false} disabled={working} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      </label>}
      <footer className="modal-footer justify-end flex-wrap">
        <SettingsButton type="button" className={option === 'destructive' ? 'sync-recovery-back' : ''} disabled={working} onClick={() => { if (option === 'destructive') changeOption('new'); else close() }}>{option === 'destructive' ? messages.start.back : t.cancel}</SettingsButton>
        <SettingsButton type="submit" variant={option === 'new' ? 'primary' : 'danger'} className={option === 'destructive' ? 'sync-danger' : ''} disabled={working || !valid}>{working ? t.recovering : option === 'new' ? t.createWorkspace : t.destructiveReset}</SettingsButton>
      </footer>
    </form>
  </SyncPasswordModal>
}
