/**
 * [INPUT]: Localized recovery copy and the serialized sync action.
 * [OUTPUT]: Recommended non-destructive recovery or an exactly confirmed destructive reset.
 * [POS]: Shared recovery form for locked cloud data and an already unlocked device.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useId, useState } from 'react'
import type { SyncAction } from '../../../../shared/contracts/sync'
import { Icon } from '../../../components/icons'
import { SettingsButton } from '../../../components/ui/button'
import { Input } from '../../../components/ui/fields'
import { settingsMessages as s } from '../../../i18n'
import './sync-security.css'

export const cloudDeleteConfirmation = 'DELETE ALL CLOUD DATA'

export function SyncRecovery({ working, run, close }: { working: boolean; run: (action: SyncAction) => Promise<boolean>; close: () => void }) {
  const t = s.sync, id = useId()
  const [option, setOption] = useState<'new' | 'destructive'>('new')
  const [password, setPassword] = useState(''), [again, setAgain] = useState(''), [confirmation, setConfirmation] = useState('')
  const valid = password.trim().length >= 8 && password.trim().length <= 128 && password.trim() === again.trim()
    && (option === 'new' || confirmation === cloudDeleteConfirmation)
  return <form className="sync-recovery-form flex flex-col gap-4" aria-busy={working} onSubmit={event => {
    event.preventDefault()
    if (!valid || working) return
    void run(option === 'new' ? { type: 'create-new-workspace', password: password.trim() }
      : { type: 'reset-sync', password: password.trim(), confirmation: cloudDeleteConfirmation }).then(ok => { if (ok) close() })
  }}>
    <p className="m-0 text-sm text-muted-foreground">{t.recoverOtherDevice}</p>
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0" disabled={working}>
      <legend className="sr-only">{t.recoveryTitle}</legend>
      {(['new', 'destructive'] as const).map(value => <label key={value} className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3">
        <input type="radio" className="mt-1" name={`${id}-recovery`} value={value} checked={option === value} onChange={() => { setOption(value); setConfirmation('') }} />
        <span className="flex min-w-0 flex-col gap-1 text-sm"><strong>{value === 'new' ? t.createNewWorkspace : t.destructiveReset}</strong>
          <span className="text-muted-foreground">{value === 'new' ? t.createNewNote : t.destructiveNote}</span></span>
      </label>)}
    </fieldset>
    <p className={`m-0 flex items-start gap-2 text-sm ${option === 'new' ? 'text-muted-foreground' : 'text-destructive'}`} role={option === 'destructive' ? 'alert' : undefined}>
      <Icon name={option === 'new' ? 'info' : 'warning'} size={18} /><span>{option === 'new' ? t.oldWorkspaceKept : t.destructiveWarning}</span>
    </p>
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={`${id}-password`}>{t.newPassword}
      <Input id={`${id}-password`} type="password" autoComplete="new-password" maxLength={128} disabled={working} value={password} onChange={event => setPassword(event.target.value)} />
    </label>
    <label className="flex flex-col gap-1.5 text-sm" htmlFor={`${id}-again`}>{t.confirmPassword}
      <Input id={`${id}-again`} type="password" autoComplete="new-password" maxLength={128} disabled={working} value={again} onChange={event => setAgain(event.target.value)} />
    </label>
    {option === 'destructive' && <label className="flex flex-col gap-1.5 text-sm" htmlFor={`${id}-confirmation`}>{t.typeDeleteConfirmation}
      <Input id={`${id}-confirmation`} autoComplete="off" spellCheck={false} disabled={working} value={confirmation} onChange={event => setConfirmation(event.target.value)} />
      <code className="break-words text-xs">{cloudDeleteConfirmation}</code>
    </label>}
    <p className="m-0 text-xs text-muted-foreground">{t.rememberPassword}</p>
    <div className="flex flex-wrap justify-end gap-2">
      <SettingsButton type="button" disabled={working} onClick={close}>{t.cancel}</SettingsButton>
      <SettingsButton type="submit" variant={option === 'new' ? 'primary' : 'danger'} className={option === 'destructive' ? 'sync-danger' : ''} disabled={working || !valid}>{working ? t.recovering : option === 'new' ? t.createWorkspace : t.destructiveReset}</SettingsButton>
    </div>
  </form>
}
