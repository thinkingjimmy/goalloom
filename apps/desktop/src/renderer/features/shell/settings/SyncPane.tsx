/**
 * [INPUT]: Sync status from the main process, workspace today, and the existing JSON export.
 * [OUTPUT]: Plain settings rows for sign-in, the sync password, a local-data choice, and live sync status.
 * [POS]: Settings › Sync. The password stays in this pane and is not part of the polled status.
 */
import { useState, type ReactNode } from 'react'
import type { SyncAction, SyncStatus } from '../../../../shared/contracts/sync'
import { messages, settingsMessages as s } from '../../../i18n'
import { desktopApi } from '../../../state/use-workspace'
import { Icon } from '../../../components/icons'
import { SettingsGroup, SettingsRow, relativeDay, stamp } from './parts'

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
  if (status.pending > 0) return { state: 'run', label: t.syncing }
  if (status.paused) return { state: 'off', label: t.paused, ...(when ? { detail: when } : {}) }
  return { state: 'ok', label: t.ready, ...(when ? { detail: when } : {}) }
}

function GoogleMark() {
  return <svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.6-.4-3.9z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.6-.4-3.9z"/></svg>
}

function StatusLine({ state, label, detail }: { state: 'ok' | 'run' | 'bad' | 'off'; label: string; detail?: string }) {
  return <span className="sync-status" data-state={state} role="status"><i aria-hidden="true" /><b>{label}</b>{detail && <><span className="sep" aria-hidden="true">·</span><span>{detail}</span></>}</span>
}

function PasswordField({ label, value, onChange, autoComplete, invalid = false }: { label: string; value: string; onChange: (value: string) => void; autoComplete: string; invalid?: boolean }) {
  return <input className="sync-password" type="password" aria-label={label} autoComplete={autoComplete} value={value} data-invalid={invalid || undefined} onChange={event => onChange(event.target.value)} />
}

function Account({ note, children }: { note?: ReactNode; children?: ReactNode }) {
  return <SettingsRow className="sync-account" title={s.sync.account} note={note}>{children && <div className="sync-row-actions">{children}</div>}</SettingsRow>
}

export function SyncPane({ status, timezone, today = '' }: { status: SyncStatus | null; timezone?: string; today?: string }) {
  const t = s.sync
  const [created, setCreated] = useState('')
  const [createdAgain, setCreatedAgain] = useState('')
  const [entry, setEntry] = useState('')
  const [resetPassword, setResetPassword] = useState('')
  const [resetAgain, setResetAgain] = useState('')
  const [nextPassword, setNextPassword] = useState('')
  const [nextAgain, setNextAgain] = useState('')
  const [choice, setChoice] = useState<'use-remote' | 'merge'>('use-remote')
  const [acknowledged, setAcknowledged] = useState(false)
  const [working, setWorking] = useState(false)
  const [changing, setChanging] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [hiddenError, setHiddenError] = useState<string | null>(null)
  const run = async (action: SyncAction) => {
    setWorking(true)
    try {
      const reply = await desktopApi().sync(action)
      if (!reply.status.error) {
        if (action.type === 'change-password') { setChanging(false); setNextPassword(''); setNextAgain('') }
        if (action.type === 'create') { setCreated(''); setCreatedAgain('') }
        if (action.type === 'reset-sync') { setResetting(false); setForgot(false); setResetPassword(''); setResetAgain('') }
        if (action.type === 'submit-password') setEntry('')
      }
    }
    finally { setWorking(false) }
  }
  if (!status) return <p className="settings-footnote">{t.loading}</p>
  const onRow = status.phase === 'ready' || status.phase === 'locked'
  const error = status.error && !onRow && hiddenError !== status.error ? t.errors[status.error] : ''
  const signOut = <button type="button" className="settings-button" disabled={working} onClick={() => void run({ type: 'sign-out' })}>{t.signOut}</button>
  const accountNote = status.conflicts > 0
    ? <>{status.email}<span className="sync-extra">{t.conflicts(status.conflicts)}</span></>
    : status.email
  const line = status.phase === 'ready' ? readyLine(status, today, timezone) : null
  const failed = line?.state === 'bad'
  const syncing = line?.state === 'run'
  return <div className="sync-pane">
    {error && <div className="settings-alert" role="alert"><span>{error}</span><button type="button" className="icon-button small" aria-label={messages.dismissNotice} onClick={() => setHiddenError(status.error)}><Icon name="close" size={16} /></button></div>}
    {status.phase === 'unconfigured' && <p className="settings-footnote">{t.unconfigured}</p>}
    {status.phase === 'locked' && <SettingsGroup>
      <Account note={accountNote}>
        <StatusLine state="off" label={t.lockedStatus} detail={status.error ? t.errors[status.error] : t.lockedReason} />
        {status.email && signOut}
      </Account>
      <SettingsRow title={t.password}><button type="button" className="settings-button" disabled>{t.change}</button></SettingsRow>
    </SettingsGroup>}
    {(status.phase === 'signed-out' || status.phase === 'signing-in') && <SettingsGroup>
      <Account note={status.email ?? t.notSignedIn}>
        {status.phase === 'signing-in' && !status.error && <StatusLine state="run" label={t.signingIn} />}
        <button type="button" className="settings-button" disabled={working || status.phase === 'signing-in'} onClick={() => void run({ type: 'sign-in' })}><GoogleMark />{t.signIn}</button>
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
      <div className="sync-end"><button type="button" className="settings-button primary" disabled={working || !passwordOk(created, createdAgain)} onClick={() => void run({ type: 'create', password: created.trim() })}>{t.start}</button></div>
    </>}
    {status.phase === 'enter-key' && <>
      <SettingsGroup>
        <Account note={accountNote}>{signOut}</Account>
        <SettingsRow title={t.password}>
          <PasswordField label={t.password} autoComplete="current-password" value={entry} invalid={status.error === 'password'} onChange={setEntry} />
        </SettingsRow>
      </SettingsGroup>
      {forgot && <SettingsGroup danger>
        <SettingsRow title={t.newPassword}><PasswordField label={t.newPassword} autoComplete="new-password" value={resetPassword} onChange={setResetPassword} /></SettingsRow>
        <SettingsRow title={t.confirmPassword}><PasswordField label={t.confirmPassword} autoComplete="new-password" value={resetAgain} onChange={setResetAgain} /></SettingsRow>
        <SettingsRow title={t.resetSync}><button type="button" className="settings-button sync-danger" disabled={working || !passwordOk(resetPassword, resetAgain)} onClick={() => void run({ type: 'reset-sync', password: resetPassword.trim() })}>{t.reset}</button></SettingsRow>
      </SettingsGroup>}
      <div className="sync-end">
        <button type="button" className="settings-button ghost" onClick={() => setForgot(value => !value)}>{t.forgot}</button>
        <button type="button" className="settings-button primary" disabled={working || entry.trim().length < 8} onClick={() => void run({ type: 'submit-password', password: entry.trim() })}>{t.continue}</button>
      </div>
    </>}
    {status.phase === 'choose' && <>
      <SettingsGroup><Account note={accountNote}>{signOut}</Account></SettingsGroup>
      <SettingsGroup title={t.localItems}>
        <SettingsRow title={t.useRemote} note={t.useRemoteNote}>
          <input type="radio" name="sync-choice" aria-label={t.useRemote} checked={choice === 'use-remote'} onChange={() => setChoice('use-remote')} />
        </SettingsRow>
        <SettingsRow title={t.merge} note={t.mergeNote}>
          <input type="radio" name="sync-choice" aria-label={t.merge} checked={choice === 'merge'} onChange={() => setChoice('merge')} />
        </SettingsRow>
        <label className="sync-ack"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />{t.acknowledge}</label>
      </SettingsGroup>
      <div className="sync-end">
        <button type="button" className="settings-button" onClick={() => void desktopApi().exportWorkspace()}>{t.exportJson}</button>
        <button type="button" className="settings-button ghost" disabled={working} onClick={() => void run({ type: 'cancel' })}>{t.cancel}</button>
        <button type="button" className="settings-button primary" disabled={working || !acknowledged} onClick={() => void run({ type: 'join', choice, acknowledged })}>{t.continue}</button>
      </div>
    </>}
    {status.phase === 'ready' && line && <>
      <SettingsGroup>
        <Account note={accountNote}>
          <StatusLine state={line.state} label={line.label} {...(line.detail ? { detail: line.detail } : {})} />
          {failed && <button type="button" className="settings-button" disabled={working} onClick={() => void run({ type: 'retry' })}>{t.retry}</button>}
          {signOut}
        </Account>
        <SettingsRow title={t.password}><button type="button" className="settings-button" disabled={syncing || working} aria-expanded={changing} onClick={() => setChanging(value => !value)}>{t.change}</button></SettingsRow>
        {changing && <>
          <SettingsRow title={t.newPassword}><PasswordField label={t.newPassword} autoComplete="new-password" value={nextPassword} onChange={setNextPassword} /></SettingsRow>
          <SettingsRow title={t.confirmPassword}><PasswordField label={t.confirmPassword} autoComplete="new-password" value={nextAgain} onChange={setNextAgain} /></SettingsRow>
          <SettingsRow title={t.changePassword}><button type="button" className="settings-button" disabled={working || syncing || !passwordOk(nextPassword, nextAgain)} onClick={() => void run({ type: 'change-password', password: nextPassword.trim() })}>{t.changePassword}</button></SettingsRow>
        </>}
      </SettingsGroup>
      <SettingsGroup danger>
        {resetting && <>
          <SettingsRow title={t.newPassword}><PasswordField label={t.newPassword} autoComplete="new-password" value={resetPassword} onChange={setResetPassword} /></SettingsRow>
          <SettingsRow title={t.confirmPassword}><PasswordField label={t.confirmPassword} autoComplete="new-password" value={resetAgain} onChange={setResetAgain} /></SettingsRow>
        </>}
        <SettingsRow title={t.resetSync}>
          <div className="sync-row-actions">
            {resetting && <button type="button" className="settings-button ghost" disabled={working} onClick={() => { setResetting(false); setResetPassword(''); setResetAgain('') }}>{t.cancel}</button>}
            <button type="button" className="settings-button sync-danger" disabled={working || (resetting && !passwordOk(resetPassword, resetAgain))} onClick={() => resetting ? void run({ type: 'reset-sync', password: resetPassword.trim() }) : setResetting(true)}>{t.reset}</button>
          </div>
        </SettingsRow>
      </SettingsGroup>
    </>}
  </div>
}
