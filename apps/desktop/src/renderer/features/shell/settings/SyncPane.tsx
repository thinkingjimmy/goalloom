/**
 * [INPUT]: Main-process sync status, workspace today and shared Tailwind controls/fields.
 * [OUTPUT]: Account-bound sign-in, explicit keep/clear sign-out, safe password recovery, live sync state and a neutral entry into independent task review.
 * [POS]: Settings › Sync. The password stays in this pane and is not part of the polled status.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { SettingsButton, IconButton } from '../../../components/ui/button'
import { Input } from '../../../components/ui/fields'
import { useState, type ReactNode } from 'react'
import type { SyncAction, SyncStatus } from '../../../../shared/contracts/sync'
import { messages, settingsMessages as s } from '../../../i18n'
import { useDismissedNotice } from '../../../state/notices'
import { desktopApi } from '../../../state/use-workspace'
import { Icon } from '../../../components/icons'
import { SyncSignOutDialog } from './SyncSignOutDialog'
import { SyncRecovery } from './SyncRecovery'
import { SettingsGroup, SettingsRow, relativeDay, stamp } from './parts'
import { AuthMark } from '../../../components/AuthMark'
import { requestSyncReview } from '../../sync/SyncReview'

function passwordOk(value: string, again: string): boolean {
  const text = value.trim()
  return text.length >= 8 && text.length <= 128 && text === again.trim()
}

function syncClock(instant: string, today: string, timezone?: string): string {
  return `${relativeDay(instant, today, timezone, s)} ${stamp(instant, timezone).slice(11)}`
}

/** Sidebar status for a signed-in workspace. Other phases stay unlabeled. */
export function syncNavBadge(status: SyncStatus | null): { text: string; dot?: true | 'err' } | null {
  const t = s.sync
  if (!status) return null
  if (status.phase === 'locked') return { text: t.lockedNav, dot: 'err' }
  if (status.phase !== 'ready') return null
  if (status.syncing) return { text: t.syncingNav }
  if (status.error || status.offline) return { text: t.errorNav, dot: 'err' }
  if (status.uploadWait) return { text: t.uploadWaitingNav }
  if (status.pending > 0) return { text: t.syncingNav }
  if (status.paused) return { text: t.pausedNav }
  return { text: t.ready, dot: true }
}

function readyLine(status: SyncStatus, today: string, timezone?: string): { state: 'ok' | 'run' | 'bad' | 'off'; label: string; detail?: string } {
  const t = s.sync
  const when = status.lastSyncedAt ? t.lastSync(syncClock(status.lastSyncedAt, today, timezone)) : undefined
  if (status.syncing) return { state: 'run', label: t.syncing }
  if (status.error || status.offline) {
    const label = status.error && status.error !== 'network' ? t.errors[status.error] : t.errors.network
    return { state: 'bad', label, ...(when ? { detail: when } : {}) }
  }
  if (status.uploadWait) return { state: 'off', label: t.uploadWaiting, detail: t.uploadRetry(syncClock(status.uploadWait.retryAt, today, timezone)) }
  if (status.pending > 0) return { state: 'run', label: t.syncing }
  if (status.paused) return { state: 'off', label: t.paused, ...(when ? { detail: when } : {}) }
  return { state: 'ok', label: t.ready, ...(when ? { detail: when } : {}) }
}


function StatusLine({ state, label, detail, wrap = false }: { wrap?: boolean; state: 'ok' | 'run' | 'bad' | 'off'; label: string; detail?: string }) {
  return <span className={`sync-status inline-flex items-center gap-1.5 text-[12px] text-muted-foreground ${wrap ? 'max-w-full flex-wrap whitespace-normal justify-end' : 'whitespace-nowrap'}`} data-state={state} role="status"><i aria-hidden="true" /><b>{label}</b>{detail && <><span className="sep" aria-hidden="true">·</span><span>{detail}</span></>}</span>
}

function PasswordField({ label, value, onChange, autoComplete, invalid = false }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; invalid?: boolean }) {
  return <Input className="sync-password w-50 max-w-full h-8 box-border rounded-[8px] px-2.5 py-0 bg-background text-foreground text-[13px]" type="password" aria-label={label} autoComplete={autoComplete} value={value} data-invalid={invalid || undefined} onChange={event => onChange(event.target.value)} />
}

function Account({ note, children }: { note?: ReactNode; children?: ReactNode }) {
  return <SettingsRow className="sync-account" title={s.sync.account} note={note}>{children && <div className="sync-row-actions ml-auto flex-wrap justify-end">{children}</div>}</SettingsRow>
}

export function SyncPane({ status, timezone, today = '' }: { status: SyncStatus | null; timezone?: string; today?: string }) {
  const t = s.sync
  const [created, setCreated] = useState('')
  const [createdAgain, setCreatedAgain] = useState('')
  const [entry, setEntry] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [nextAgain, setNextAgain] = useState('')
  const [acknowledged, setAcknowledged] = useState(false)
  const [working, setWorking] = useState(false)
  const [changing, setChanging] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [requestFailed, setRequestFailed] = useState(false)
  const [hiddenError, setHiddenError] = useState<string | null>(null)
  const conflictNotice = useDismissedNotice('sync-conflicts', status?.conflicts ? String(status.conflicts) : null)
  const run = async (action: SyncAction) => {
    setHiddenError(null)
    setWorking(true); setRequestFailed(false)
    try {
      const reply = await desktopApi().sync(action)
      if (!reply.status.error) {
        if (action.type === 'change-password') { setChanging(false); setNextPassword(''); setNextAgain('') }
        if (action.type === 'create') { setCreated(''); setCreatedAgain('') }
        if (action.type === 'reset-sync' || action.type === 'create-new-workspace') setForgot(false)
        if (action.type === 'submit-password') setEntry('')
        if (action.type === 'join' || action.type === 'cancel' || action.type === 'sign-out') setAcknowledged(false)
      }
      return !reply.status.error
    } catch { setRequestFailed(true); return false }
    finally { setWorking(false) }
  }
  if (!status) return <p className="settings-footnote m-0 text-[12px] leading-[1.7] text-muted-foreground">{t.loading}</p>
  const onRow = status.phase === 'ready' || status.phase === 'locked'
  const error = status.error && !onRow && hiddenError !== status.error ? t.errors[status.error] : ''
  const signOut = <SettingsButton type="button" disabled={working} onClick={() => setSigningOut(true)}>{t.signOut}</SettingsButton>
  const accountNote = status.email
  const line = status.phase === 'ready' ? readyLine(status, today, timezone) : null
  const failed = line?.state === 'bad'
  const syncing = line?.state === 'run'
  return <div className="sync-pane flex flex-col gap-5.5">
    {signingOut && <SyncSignOutDialog email={status.email} canClear={status.phase !== 'locked' && (status.credentialStorage !== 'password' || status.phase === 'ready' || status.phase === 'choose')} confirm={clearLocal => run({ type: 'sign-out', clearLocal })} close={() => setSigningOut(false)} />}
    {requestFailed && <p className="m-0 text-sm text-destructive" role="alert">{t.errors.storage}</p>}
    {status.credentialStorage === 'password' && <p className="sync-password-storage m-0 text-[12px] leading-[1.7] text-muted-foreground">{t.passwordStorage}</p>}
    {import.meta.env.DEV && <p className="sync-diagnostics m-0 text-xs text-muted-foreground" role="status">{t.networkLabel}: {status.offline ? t.networkOffline : t.networkOnline} · {t.realtimeLabel}: {status.realtimeConnected ? t.realtimeOnline : t.realtimeOffline}</p>}
    {error && <div className="settings-alert m-0 flex items-start gap-2 px-3.5 py-2.5 rounded-[10px] bg-destructive-tint text-destructive text-[12.5px] leading-[1.6]" role="alert"><span>{error}</span><IconButton size="small" type="button" aria-label={messages.dismissNotice} onClick={() => setHiddenError(status.error)}><Icon name="close" size={16} /></IconButton></div>}
    {conflictNotice.open && <div className="settings-alert m-0 flex items-center gap-2 text-[12.5px] leading-[1.6] text-muted-foreground" role="status"><span>{t.reviewNotice(status.conflicts)}</span><SettingsButton type="button" onClick={requestSyncReview}>{t.reviewDetails}</SettingsButton><IconButton size="small" type="button" aria-label={messages.dismissNotice} onClick={conflictNotice.dismiss}><Icon name="close" size={16} /></IconButton></div>}
    {status.phase === 'unconfigured' && <p className="settings-footnote m-0 text-[12px] leading-[1.7] text-muted-foreground">{t.unconfigured}</p>}
    {status.phase === 'locked' && <><SettingsGroup>
      <Account note={accountNote}>
        <StatusLine state="off" label={t.lockedStatus} detail={status.error ? t.errors[status.error] : t.lockedReason} />
        {signOut}
      </Account>
      <SettingsRow title={t.password}><SettingsButton type="button" disabled>{t.change}</SettingsButton></SettingsRow>
    </SettingsGroup>
      <div className="sync-recovery text-[12px] leading-[1.7] text-muted-foreground">
        <p className="m-0">{status.error === 'storage' ? t.lockedStorage : t.locked}</p>
        {!status.error && typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac') && <details className="mt-3">
          <summary className="cursor-pointer text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">{t.lockedHelp}</summary>
          <ol className="mt-2 mb-2 list-decimal pl-5 space-y-1">{t.lockedSteps.map(step => <li key={step}>{step}</li>)}</ol>
          <p className="m-0">{t.lockedPreserve}</p>
        </details>}
      </div>
    </>}
    {(status.phase === 'signed-out' || status.phase === 'signing-in') && <SettingsGroup>
      <Account note={status.email ?? t.notSignedIn}>
        {status.phase === 'signing-in' && !status.error && <StatusLine state="run" label={t.signingIn} detail={status.signingInProvider === 'apple' ? t.signInApple : t.signIn} />}
        {(['apple', 'google'] as const).map(provider => <SettingsButton key={provider} type="button" disabled={working || status.phase === 'signing-in'} onClick={() => void run({ type: 'sign-in', provider })}><AuthMark provider={provider} size={14} />{provider === 'apple' ? t.signInApple : t.signIn}</SettingsButton>)}
        {status.phase === 'signing-in' && <SettingsButton type="button" onClick={() => void desktopApi().sync({ type: 'cancel' })}>{t.cancel}</SettingsButton>}
      </Account>
    </SettingsGroup>}
    {status.phase === 'setup' && <>
      <SettingsGroup>
        <Account note={accountNote}>{signOut}</Account>
        <SettingsRow title={t.password} note={t.passwordRule}>
          <PasswordField label={t.password} autoComplete="new-password" value={created} invalid={status.error === 'password'} onChange={setCreated} />
        </SettingsRow>
        <SettingsRow title={t.confirmPassword}>
          <PasswordField label={t.confirmPassword} autoComplete="new-password" value={createdAgain} invalid={status.error === 'password'} onChange={setCreatedAgain} />
        </SettingsRow>
      </SettingsGroup>
      <div className="sync-end justify-end"><SettingsButton variant="primary" type="button" disabled={working || !passwordOk(created, createdAgain)} onClick={() => void run({ type: 'create', password: created.trim() })}>{t.start}</SettingsButton></div>
    </>}
    {status.phase === 'enter-key' && <>
      <SettingsGroup>
        <Account note={accountNote}>{signOut}</Account>
        <SettingsRow title={t.password}>
          <PasswordField label={t.password} autoComplete="current-password" value={entry} invalid={status.error === 'password'} onChange={setEntry} />
        </SettingsRow>
      </SettingsGroup>
      {forgot && <SyncRecovery working={working} run={run} close={() => setForgot(false)} />}
      <div className="sync-end justify-end">
        <SettingsButton variant="ghost" type="button" onClick={() => setForgot(value => !value)}>{t.forgot}</SettingsButton>
        <SettingsButton variant="primary" type="button" disabled={working || entry.trim().length < 8} onClick={() => void run({ type: 'submit-password', password: entry.trim() })}>{t.continue}</SettingsButton>
      </div>
    </>}
    {status.phase === 'choose' && <>
      <SettingsGroup><Account note={accountNote}>{signOut}</Account></SettingsGroup>
      <SettingsGroup title={t.localItems}>
        <SettingsRow title={t.merge} note={t.mergeNote} />
      </SettingsGroup>
      <p className="settings-footnote m-0 text-[12px] leading-[1.7] text-muted-foreground">{t.automaticBackup}</p>
      <div className="sync-end justify-end">
        <SettingsButton variant="ghost" type="button" disabled={working} onClick={() => void run({ type: 'cancel' })}>{t.cancel}</SettingsButton>
        <SettingsButton variant="primary" type="button" disabled={working} onClick={() => void run({ type: 'join', choice: 'merge', acknowledged: true })}>{t.mergeStart}</SettingsButton>
      </div>
      <details onToggle={event => { if (!event.currentTarget.open) setAcknowledged(false) }}>
        <summary className="cursor-pointer text-[12px] text-muted-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">{t.otherOptions}</summary>
        <div className="mt-3"><SettingsGroup danger>
          <SettingsRow title={t.useRemote} note={t.useRemoteNote} />
          <label className="sync-ack flex items-start gap-2 m-0 px-4 py-3 text-[13px]"><input type="checkbox" className="mt-1 shrink-0" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />{t.acknowledge}</label>
          <SettingsRow title={t.useRemote}>
            <SettingsButton type="button" className="sync-danger" disabled={working || !acknowledged} onClick={() => void run({ type: 'join', choice: 'use-remote', acknowledged })}>{t.useRemote}</SettingsButton>
          </SettingsRow>
        </SettingsGroup></div>
      </details>
    </>}
    {status.phase === 'ready' && line && <>
      <SettingsGroup>
        <Account note={accountNote}>
          <StatusLine wrap={!!status.uploadWait} state={line.state} label={line.label} {...(line.detail ? { detail: line.detail } : {})} />
          {failed && <SettingsButton type="button" disabled={working} onClick={() => void run({ type: 'retry' })}>{t.retry}</SettingsButton>}
          {signOut}
        </Account>
        <SettingsRow title={t.password}><SettingsButton type="button" disabled={syncing || working} aria-expanded={changing} onClick={() => setChanging(value => !value)}>{t.change}</SettingsButton></SettingsRow>
        {changing && <>
          <SettingsRow title={t.newPassword}><PasswordField label={t.newPassword} autoComplete="new-password" value={nextPassword} onChange={setNextPassword} /></SettingsRow>
          <SettingsRow title={t.confirmPassword}><PasswordField label={t.confirmPassword} autoComplete="new-password" value={nextAgain} onChange={setNextAgain} /></SettingsRow>
          <SettingsRow title={t.changePassword}><SettingsButton type="button" disabled={working || syncing || !passwordOk(nextPassword, nextAgain)} onClick={() => void run({ type: 'change-password', password: nextPassword.trim() })}>{t.changePassword}</SettingsButton></SettingsRow>
        </>}
      </SettingsGroup>
      {status.awaitingTasks && !failed && <p className="settings-footnote m-0 text-[12px] leading-[1.7] text-muted-foreground">{t.awaitingTasks}</p>}
      {status.uploadWait && <p className="settings-footnote" role="status">{t.uploadWaitingDetail}</p>}
      <SettingsGroup>
        <SettingsRow title={t.recoveryTitle}><SettingsButton type="button" disabled={working} aria-expanded={forgot} onClick={() => setForgot(value => !value)}>{t.forgot}</SettingsButton></SettingsRow>
      </SettingsGroup>
      {forgot && <SyncRecovery working={working} run={run} close={() => setForgot(false)} />}
    </>}
  </div>
}
