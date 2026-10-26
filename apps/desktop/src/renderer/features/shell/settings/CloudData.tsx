/**
 * [INPUT]: Non-secret cloud state, current generation and the existing protected TransferReview callback.
 * [OUTPUT]: Explicit retrieval/export, read-only task inspection, proof-based lifecycle copy and field-specific privacy progress.
 * [POS]: Settings cloud privacy panel. No action changes the current workspace without TransferReview.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { SyncRecovery } from './SyncRecovery'
import { desktopApi } from '../../../state/use-workspace'
import { useEffect, useRef, useState } from 'react'
import type { CloudAction, CloudReply } from '../../../../shared/contracts/cloud'
import type { TransferPreview } from '../../../../shared/contracts/transfer'
import { cloudCatalog } from '../../../../shared/i18n/cloud'
import { currentLocale } from '../../../i18n'
import { useCloud, runCloud } from '../../../state/cloud'
import { Input } from '../../../components/ui/fields'
import { SettingsButton } from '../../../components/ui/button'

export function CloudData({ generation, onPreview }: { generation: string; onPreview: (preview: TransferPreview) => void }) {
  const state = useCloud(), t = cloudCatalog[currentLocale()]
  const [newGeneration, setNewGeneration] = useState(false)
  const downloadControl = useRef<HTMLButtonElement | null>(null), cancelled = useRef(false)
  const [retrieving, setRetrieving] = useState(false)
  const [busy, setBusy] = useState(false), [failed, setFailed] = useState(false), [password, setPassword] = useState(''), [acknowledged, setAcknowledged] = useState(false)
  const [confirming, setConfirming] = useState(false), [page, setPage] = useState<Extract<CloudReply, { type: 'items' }> | null>(null)
  const [selectedCopy, setSelectedCopy] = useState<string | null>(null), [offset, setOffset] = useState(0)
  useEffect(() => { setPassword(''); setAcknowledged(false); setConfirming(false) }, [state?.accountId])
  useEffect(() => {
    if (!busy && cancelled.current) { cancelled.current = false; downloadControl.current?.focus() }
  }, [busy])
  const date = (value: string) => new Date(value).toLocaleString(currentLocale(), { dateStyle: 'medium', timeStyle: 'short' })
  const run = async (action: CloudAction) => {
    if (busy) return
    setBusy(true); setFailed(false)
    if (action.type === 'retrieve') { cancelled.current = false; setRetrieving(true) }
    try {
      const result = await runCloud(action)
      if (result.type === 'items') setPage(result)
      if (result.type === 'preview' && result.reply.type === 'preview') onPreview(result.reply.preview)
      if (result.type === 'copy') setPassword('')
      return result
    } catch { setFailed(true); return undefined } finally { setBusy(false); setRetrieving(false) }
  }
  const error = state?.error === 'password' ? t.wrongPassword : state?.error === 'retrieval_data_unavailable' ? t.incomplete : state?.error === 'retrieved_copy_pending_operations' ? t.pendingWrites : t.unavailable
  return <section className="cloud-data flex flex-col gap-3" aria-label={t.title} aria-busy={busy}>
    <h3 className="m-0 text-[14px] font-medium">{t.title}</h3>
    <p className="m-0 text-[12px] text-muted-foreground">{t.local}</p>
    {state?.accountId && <SettingsButton disabled={busy} onClick={() => void run({ type: 'refresh', expectedAccountId: state.accountId! })}>{t.refresh}</SettingsButton>}
    {retrieving && <div role="status" className="flex items-center gap-2 text-[12px]"><span>{t.downloading}</span><SettingsButton onClick={() => { if (state?.accountId) { cancelled.current = true; void runCloud({ type: 'cancel-retrieval', expectedAccountId: state.accountId }) } }}>{t.cancel}</SettingsButton></div>}
    {(failed || state?.error) && <p role="status" className="m-0 text-[12px]">{error}</p>}
    {state?.entries.map(entry => <div key={`${entry.target.workspaceId}:${entry.target.generation}`} className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="m-0 text-[12px]">{t.status}: {t[entry.state === 'deleted' && !entry.onlineDeletedAt ? 'closed' : entry.state]} · {entry.target.workspaceId.slice(0, 8)}</p>
      {entry.retrieveUntil && <p className="m-0 text-[12px]">{t.until} {date(entry.retrieveUntil)}</p>}
      {entry.retrievalWindowOpen && <details onToggle={event => { if (!event.currentTarget.open) setPassword('') }}>
        <summary>{t.retrieve}</summary>
        <p className="text-[12px] text-muted-foreground">{t.copyHelp}</p>
        <label className="flex flex-col gap-2 text-[12px]">{t.password}<Input type="password" value={password} autoComplete="current-password" onChange={event => setPassword(event.target.value)} /></label>
        <SettingsButton variant="primary" disabled={busy || password.length < 8 || !state.accountId} onClick={event => { downloadControl.current = event.currentTarget; void run({ type: 'retrieve', expectedAccountId: state.accountId!, target: entry.target, password }) }}>{t.download}</SettingsButton>
      </details>}
      {state.accountId && !['deleted', 'deleting'].includes(entry.state) && <SettingsButton disabled={busy} onClick={() => { setAcknowledged(false); setConfirming(true); void run({ type: 'prepare', expectedAccountId: state.accountId!, scope: 'cloud', target: entry.target, expectedRevision: entry.lifecycleVersion }) }}>{t.cloudDelete}</SettingsButton>}
    </div>)}
    {state?.accountId && state.canCreateCloud && state.entries.some(row => row.newCreateRequired) && <SettingsButton disabled={busy} onClick={() => setNewGeneration(true)}>{t.newGeneration}</SettingsButton>}
    {newGeneration && <SyncRecovery working={busy} close={() => setNewGeneration(false)} run={async action => { setBusy(true); try { const result = await desktopApi().sync(action); return !result.status.error && result.status.phase === 'ready' } finally { setBusy(false); setRetrieving(false) } }} />}
    {state?.accountId && <SettingsButton disabled={busy || !state.serverNow} onClick={() => { setAcknowledged(false); setConfirming(true); void run({ type: 'prepare', expectedAccountId: state.accountId!, scope: 'account', target: null, expectedRevision: state.accountRevision }) }}>{t.accountDelete}</SettingsButton>}
    {confirming && state?.prepared && state.accountId && <div className="flex flex-col gap-3 rounded-lg border p-3" role="group" aria-label={t.prepare}>
      <p className="m-0 text-[12px]">{state.prepared.scope === 'account' ? t.accountWarning : t.cloudWarning}</p>
      <p className="m-0 text-[12px]">{t.local}</p>
      <label className="check-label"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />{t.acknowledge}</label>
      <div className="flex gap-2"><SettingsButton disabled={busy} onClick={() => { void run({ type: 'cancel-preparation', expectedAccountId: state.accountId!, requestId: state.prepared!.requestId }).then(() => { setConfirming(false); setAcknowledged(false) }) }}>{t.cancel}</SettingsButton><SettingsButton variant="primary" disabled={busy || !acknowledged} onClick={() => { void run({ type: 'confirm', expectedAccountId: state.accountId!, requestId: state.prepared!.requestId, acknowledge: true }).then(() => { setConfirming(false); setAcknowledged(false) }) }}>{t.confirm}</SettingsButton></div>
    </div>}
    {state?.pendingReceipts.map(receipt => <div key={receipt.requestId} role="status"><p>{t.pending}</p><SettingsButton disabled={busy} onClick={() => void run({ type: 'receipt', requestId: receipt.requestId })}>{t.check}</SettingsButton></div>)}
    {state?.progress.map(progress => <div key={progress.requestId} className="flex flex-col gap-2 rounded-lg border p-3" aria-label={t.progress}>
      <p className="m-0 text-[12px]">{progress.accepted ? t.accepted : t.pending}{progress.confirmedAt ? ` · ${date(progress.confirmedAt)}` : ''}</p>
      {(['intent', 'content', 'auth', 'renewal'] as const).map(key => <p key={key} className="m-0 text-[12px]">{t[key]}: {progress[key] === 'deleted' ? key === 'auth' ? t.accountDeleted : t.contentDeleted : t[progress[key]]}</p>)}
      <SettingsButton disabled={busy} onClick={() => void run({ type: 'receipt', requestId: progress.requestId })}>{t.check}</SettingsButton>
      {progress.content === 'deleted' && ['deleted', 'not_applicable'].includes(progress.auth) && ['stopped', 'not_applicable'].includes(progress.renewal) && <SettingsButton disabled={busy} onClick={() => void run({ type: 'acknowledge', requestId: progress.requestId })}>{t.done}</SettingsButton>}
    </div>)}
    {!!state?.copies.length && <h4 className="m-0 text-[13px]">{t.copies}</h4>}
    {state?.copies.map(copy => <div key={copy.artifactId} className="flex flex-col gap-2 rounded-lg border p-3">
      <p className="m-0 text-[12px]">{date(copy.verifiedAt)} · {copy.counts.items}</p><p className="m-0 text-[12px] text-muted-foreground">{t.baseline}</p>
      <div className="flex flex-wrap gap-2"><SettingsButton disabled={busy} onClick={() => { setSelectedCopy(copy.artifactId); setOffset(0); void run({ type: 'inspect', artifactId: copy.artifactId, offset: 0, limit: 50 }) }}>{t.inspect}</SettingsButton>
        <SettingsButton disabled={busy} variant="primary" onClick={() => void run({ type: 'export', artifactId: copy.artifactId, format: 'json' })}>{t.exportJson}</SettingsButton>
        <SettingsButton disabled={busy} onClick={() => void run({ type: 'export', artifactId: copy.artifactId, format: 'sqlite' })}>{t.exportSqlite}</SettingsButton></div>
      <SettingsButton disabled={busy} onClick={() => void run({ type: 'replace', artifactId: copy.artifactId, generation })}>{t.replace}</SettingsButton>
    </div>)}
    {page && <div className="rounded-lg border p-3" role="region" aria-label={t.inspect}>
      <p className="text-[12px]">{t.baseline}</p>{page.items.length ? <ul className="text-[13px]">{page.items.map(item => <li key={item.id}><strong>{item.title}</strong>{item.description && <p>{item.description}</p>}</li>)}</ul> : <p>{t.empty}</p>}
      {selectedCopy && offset + page.items.length < page.total && <SettingsButton disabled={busy} onClick={() => { const next = offset + 50; setOffset(next); void run({ type: 'inspect', artifactId: selectedCopy, offset: next, limit: 50 }) }}>{t.inspect} · {offset + 51}–{Math.min(offset + 100, page.total)}</SettingsButton>}
      <SettingsButton onClick={() => { setPage(null); setSelectedCopy(null) }}>{t.dismiss}</SettingsButton>
    </div>}
  </section>
}
