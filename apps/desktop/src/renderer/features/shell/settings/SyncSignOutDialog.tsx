/**
 * [INPUT]: Account label, credential availability and the serialized sign-out action.
 * [OUTPUT]: Explicit keep/clear confirmation, safe defaults and visible cleanup errors.
 * [POS]: Settings-owned native dialog. Cancelling never reaches IPC.
 */
import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../../components/Modal'
import { Icon } from '../../../components/icons'
import { SettingsButton } from '../../../components/ui/button'
import { settingsMessages as s } from '../../../i18n'
import './sync-security.css'

export function SyncSignOutDialog({ email, canClear, confirm, close }: {
  email: string | null; canClear: boolean; confirm: (clearLocal: boolean) => Promise<boolean>; close: () => void
}) {
  const t = s.sync
  const [clearLocal, setClearLocal] = useState(false)
  const [working, setWorking] = useState(false)
  const [failed, setFailed] = useState(false)
  const trigger = useRef(document.activeElement)
  useEffect(() => () => {
    if (trigger.current instanceof HTMLElement && trigger.current.isConnected) trigger.current.focus({ preventScroll: true })
  }, [])
  const cancel = () => { if (!working) close() }
  return <Modal title={t.signOut} close={cancel} className="sync-signout-modal">
    <form className="flex flex-col gap-4 p-5" aria-busy={working} onSubmit={event => {
      event.preventDefault()
      if (working) return
      setWorking(true); setFailed(false)
      void confirm(clearLocal).then(ok => { if (ok) close(); else setFailed(true) }).catch(() => setFailed(true)).finally(() => setWorking(false))
    }}>
      {email && <p className="m-0 break-all text-sm text-muted-foreground">{email}</p>}
      <p className="m-0 text-sm">{t.signOutMessage}</p>
      <fieldset disabled={working} className="m-0 flex flex-col gap-3 border-0 p-0">
        <legend className="sr-only">{t.signOut}</legend>
        <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3">
          <input type="radio" name="signout-local" className="mt-1" value="keep" checked={!clearLocal} onChange={() => setClearLocal(false)} />
          <span className="flex flex-col gap-1 text-sm"><strong>{t.keepLocal}</strong><span className="text-muted-foreground">{t.keepLocalNote}</span></span>
        </label>
        <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border p-3">
          <input type="radio" name="signout-local" className="mt-1" value="clear" checked={clearLocal} disabled={!canClear} onChange={() => setClearLocal(true)} />
          <span className="flex flex-col gap-1 text-sm"><strong>{t.clearLocal}</strong><span className="text-muted-foreground">{canClear ? t.clearLocalNote : t.clearLocked}</span></span>
        </label>
      </fieldset>
      {clearLocal && <p className="m-0 flex items-start gap-2 text-sm text-destructive" role="alert"><Icon name="warning" size={18} /><span>{t.clearWarning}</span></p>}
      {failed && <p className="m-0 text-sm text-destructive" role="alert">{t.errors.storage}</p>}
      <div className="flex flex-wrap justify-end gap-2">
        <SettingsButton type="button" disabled={working} onClick={cancel}>{t.cancel}</SettingsButton>
        <SettingsButton type="submit" variant="primary" disabled={working}>{working ? t.signingOut : t.confirmSignOut}</SettingsButton>
      </div>
    </form>
  </Modal>
}
