/**
 * [INPUT]: Sync status from the main process, and the existing JSON export.
 * [OUTPUT]: Sign-in, a sync password, a local-data choice, and sync status.
 * [POS]: Settings › Sync. The password stays in this pane and is not part of the polled status.
 */
import { useState } from 'react'
import type { SyncStatus } from '../../../../shared/contracts/sync'
import { messages, settingsMessages as s } from '../../../i18n'
import { desktopApi } from '../../../state/use-workspace'
import { Icon } from '../../../components/icons'
import { SettingsGroup, SettingsRow, stamp } from './parts'

function passwordOk(value: string, again: string): boolean {
  const text = value.trim()
  return text.length >= 8 && text.length <= 128 && text === again.trim()
}

export function SyncPane({ status, timezone }: { status: SyncStatus | null; timezone?: string }) {
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
  const [hiddenError, setHiddenError] = useState<string | null>(null)
  const run = async (action: Parameters<ReturnType<typeof desktopApi>['sync']>[0]) => {
    setWorking(true)
    try { await desktopApi().sync(action) }
    finally { setWorking(false) }
  }
  if (!status) return <p className="settings-footnote">{t.loading}</p>
  const error = status.error && hiddenError !== status.error ? t.errors[status.error] : ''
  return <div className="sync-pane">
    {error && <div className="settings-alert" role="alert"><span>{error}</span><button type="button" className="icon-button small" aria-label={messages.dismissNotice} onClick={() => setHiddenError(status.error)}><Icon name="close" size={16} /></button></div>}
    {status.phase === 'unconfigured' && <p className="settings-footnote">{t.unconfigured}</p>}
    {status.phase === 'locked' && <p className="settings-footnote">{t.locked}</p>}
    {status.phase === 'signed-out' && <SettingsGroup>
      <SettingsRow title={t.signIn} note={t.signedOut}>
        <button type="button" className="settings-button primary" disabled={working} onClick={() => void run({ type: 'sign-in' })}>{t.signIn}</button>
      </SettingsRow>
    </SettingsGroup>}
    {status.phase === 'signing-in' && <SettingsGroup>
      <SettingsRow title={t.signIn} note={t.signingIn}>
        {status.error
          ? <button type="button" className="settings-button primary" disabled={working} onClick={() => void run({ type: 'sign-in' })}>{t.signIn}</button>
          : <p className="settings-footnote" role="status">{t.signingIn}</p>}
      </SettingsRow>
    </SettingsGroup>}
    {status.phase === 'setup' && <SettingsGroup>
      <SettingsRow title={t.password} note={t.setupNote} below={<>
        <label className="sync-field">{t.password}
          <input className="sync-password" type="password" autoComplete="new-password" value={created} onChange={event => setCreated(event.target.value)} />
        </label>
        <label className="sync-field">{t.confirmPassword}
          <input className="sync-password" type="password" autoComplete="new-password" value={createdAgain} onChange={event => setCreatedAgain(event.target.value)} />
        </label>
        <button type="button" className="settings-button primary" disabled={working || !passwordOk(created, createdAgain)} onClick={() => void run({ type: 'create', password: created.trim() })}>{t.start}</button>
      </>} />
    </SettingsGroup>}
    {status.phase === 'enter-key' && <SettingsGroup>
      <SettingsRow title={t.password} note={t.enterNote} below={<>
        <input className="sync-password" type="password" autoComplete="current-password" value={entry} onChange={event => setEntry(event.target.value)} />
        <button type="button" className="settings-button primary" disabled={working || entry.trim().length < 8} onClick={() => void run({ type: 'submit-password', password: entry.trim() })}>{t.continue}</button>
      </>} />
      <SettingsRow title={t.resetSync} note={t.resetNote} below={<>
        <label className="sync-field">{t.newPassword}
          <input className="sync-password" type="password" autoComplete="new-password" value={resetPassword} onChange={event => setResetPassword(event.target.value)} />
        </label>
        <label className="sync-field">{t.confirmPassword}
          <input className="sync-password" type="password" autoComplete="new-password" value={resetAgain} onChange={event => setResetAgain(event.target.value)} />
        </label>
        <button type="button" className="settings-button" disabled={working || !passwordOk(resetPassword, resetAgain)} onClick={() => void run({ type: 'reset-sync', password: resetPassword.trim() })}>{t.resetSync}</button>
      </>} />
    </SettingsGroup>}
    {status.phase === 'choose' && <SettingsGroup title={t.chooseNote}>
      <SettingsRow title={t.useRemote} note={t.useRemoteNote}>
        <input type="radio" name="sync-choice" checked={choice === 'use-remote'} onChange={() => setChoice('use-remote')} />
      </SettingsRow>
      <SettingsRow title={t.merge} note={t.mergeNote}>
        <input type="radio" name="sync-choice" checked={choice === 'merge'} onChange={() => setChoice('merge')} />
      </SettingsRow>
      <label className="sync-ack"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} />{t.acknowledge}</label>
      <div className="sync-actions">
        <button type="button" className="settings-button" onClick={() => void desktopApi().exportWorkspace()}>{t.exportJson}</button>
        <button type="button" className="settings-button ghost" disabled={working} onClick={() => void run({ type: 'cancel' })}>{t.cancel}</button>
        <button type="button" className="settings-button primary" disabled={working || !acknowledged} onClick={() => void run({ type: 'join', choice, acknowledged })}>{t.continue}</button>
      </div>
    </SettingsGroup>}
    {status.phase === 'ready' && <SettingsGroup>
      <SettingsRow title={status.offline ? t.offline : t.ready} note={[
        status.email,
        status.pending ? t.pending(status.pending) : null,
        status.conflicts ? t.conflicts(status.conflicts) : null,
        status.paused ? t.paused : null,
        status.lastSyncedAt ? t.lastSync(stamp(status.lastSyncedAt, timezone)) : null,
      ].filter(Boolean).join(' · ')}>
        <button type="button" className="settings-button" disabled={working} onClick={() => void run({ type: 'sign-out' })}>{t.signOut}</button>
      </SettingsRow>
      <SettingsRow title={t.changePassword} below={<>
        <label className="sync-field">{t.newPassword}
          <input className="sync-password" type="password" autoComplete="new-password" value={nextPassword} onChange={event => setNextPassword(event.target.value)} />
        </label>
        <label className="sync-field">{t.confirmPassword}
          <input className="sync-password" type="password" autoComplete="new-password" value={nextAgain} onChange={event => setNextAgain(event.target.value)} />
        </label>
        <button type="button" className="settings-button" disabled={working || !passwordOk(nextPassword, nextAgain)} onClick={() => void run({ type: 'change-password', password: nextPassword.trim() })}>{t.changePassword}</button>
      </>} />
    </SettingsGroup>}
    {status.email && status.phase !== 'ready' && status.phase !== 'signed-out' && status.phase !== 'unconfigured' && status.phase !== 'locked' && <div className="sync-actions">
      <button type="button" className="settings-button ghost" disabled={working} onClick={() => void run({ type: 'sign-out' })}>{t.signOut}</button>
    </div>}
  </div>
}
