/**
 * [INPUT]: Localized recovery copy, optional fixed account scope and the existing serialized sync action.
 * [OUTPUT]: Fresh current-state preview, blank password fields and unchecked approval for a new cloud workspace.
 * [POS]: Shared Settings/first-run presentation; setup confirmation and sync writes remain caller-owned.
 */
import { useEffect, useRef, useState } from 'react'
import type { SyncAction } from '../../../../shared/contracts/sync'
import { SettingsButton } from '../../../components/ui/button'
import { settingsMessages as s } from '../../../i18n'
import { desktopApi } from '../../../state/use-workspace'
import { cloudCatalog } from '../../../../shared/i18n/cloud'
import { currentLocale } from '../../../i18n'
import type { SyncReply } from '../../../../shared/contracts/sync'
import { SyncPasswordFields, SyncPasswordModal } from './SyncPasswordDialog'

export function SyncRecovery({ working, error, run, close, expectedAccountId }: { working: boolean; error?: string | undefined; run: (action: SyncAction) => Promise<boolean>; close: () => void; expectedAccountId?: string }) {
  const t = s.sync
  const copy = cloudCatalog[currentLocale()]
  const [previewRevision, setPreviewRevision] = useState(0)
  const [preview, setPreview] = useState<SyncReply['generationPreview']>(undefined), [approved, setApproved] = useState(false)
  useEffect(() => { let live = true; void desktopApi().sync({ type: 'status' }).then(reply => reply.status.accountId && (!expectedAccountId || reply.status.accountId === expectedAccountId) ? desktopApi().sync({ type: 'generation-preview', expectedAccountId: reply.status.accountId }) : null).then(reply => { if (live) setPreview(reply?.generationPreview) }).catch(() => undefined); return () => { live = false } }, [previewRevision, expectedAccountId])
  const [password, setPassword] = useState(''), [again, setAgain] = useState('')
  const [failed, setFailed] = useState(false)
  const form = useRef<HTMLFormElement>(null), submitting = useRef(false)
  const valid = password.trim().length >= 8 && password.trim().length <= 128 && password.trim() === again.trim()

  return <SyncPasswordModal title={t.recoveryTitle} className="sync-recovery-modal" working={working} error={failed ? error ?? t.errors.storage : undefined} close={close}>
    <form ref={form} className="sync-recovery-form flex flex-col gap-5" aria-busy={working} noValidate onSubmit={event => {
      event.preventDefault()
      if (!valid || working || submitting.current || (!preview || !approved)) return
      submitting.current = true; setFailed(false)
      void run({ type: 'create-new-workspace', password: password.trim(), expectedAccountId: preview!.accountId, previewToken: preview!.token, acknowledged: true }).then(ok => { if (ok) close(); else { setFailed(true); setApproved(false); setPreview(undefined); setPreviewRevision(value => value + 1) } })
        .catch(() => setFailed(true)).finally(() => { submitting.current = false })
    }}>
      <>
        <p className="m-0 text-sm text-muted-foreground">{t.recoverOtherDevice}</p>
        <div className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-medium text-foreground">{t.createNewWorkspace}</h3>
          <p className="m-0 text-sm text-muted-foreground">{t.createNewNote}</p>
        </div>
      </>
      <p className="m-0 text-sm text-muted-foreground">{copy.baseline} {preview ? `${preview.items} · ${preview.operations}` : copy.pending}</p>
      <label className="check-label"><input type="checkbox" checked={approved} onChange={event => setApproved(event.target.checked)} />{copy.newGenerationAck}</label>
      <SyncPasswordFields password={password} again={again} disabled={working} setPassword={setPassword} setAgain={setAgain} />
      <footer className="modal-footer justify-end flex-wrap">
        <SettingsButton type="button" disabled={working} onClick={close}>{t.cancel}</SettingsButton>
        <SettingsButton type="submit" variant="primary" disabled={working || !valid || (!preview || !approved)}>{working ? t.recovering : t.createWorkspace}</SettingsButton>
      </footer>
    </form>
  </SyncPasswordModal>
}
