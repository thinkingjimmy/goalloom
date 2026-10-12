/**
 * [INPUT]: Sync status from the main process, and the existing JSON export.
 * [OUTPUT]: Sign-in, recovery-key setup or entry, a local-data choice, and sync status.
 * [POS]: Settings › Sync. The phrase is shown once and is not part of the polled status.
 */
import { useState } from 'react'
import type { SyncStatus } from '../../../../shared/contracts/sync'
import { settingsMessages as s } from '../../../i18n'
import { desktopApi } from '../../../state/use-workspace'
import { SettingsGroup, SettingsRow, stamp } from './parts'

export function SyncPane({ status, timezone }: { status: SyncStatus | null; timezone?: string }) {
  const t = s.sync
  const [phrase, setPhrase] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [answers, setAnswers] = useState(['', '', ''])
  const [entry, setEntry] = useState('')
  const [choice, setChoice] = useState<'use-remote' | 'merge'>('use-remote')
  const [acknowledged, setAcknowledged] = useState(false)
  const [working, setWorking] = useState(false)
  const run = async (action: Parameters<ReturnType<typeof desktopApi>['sync']>[0]) => {
    setWorking(true)
    try {
      const reply = await desktopApi().sync(action)
      if (action.type === 'prepare') { setPhrase(reply.phrase); setCopied(false); setAnswers(['', '', '']) }
      if (action.type === 'confirm' || action.type === 'cancel' || action.type === 'sign-out') setPhrase(null)
    } finally { setWorking(false) }
  }
  if (!status) return <p className="settings-footnote">{t.loading}</p>
  const error = status.error ? t.errors[status.error] : ''
  return <div className="sync-pane">
    {error && <p className="settings-alert" role="alert">{error}</p>}
    {status.phase === 'unconfigured' && <p className="settings-footnote">{t.unconfigured}</p>}
    {status.phase === 'locked' && <p className="settings-footnote">{t.locked}</p>}
    {status.phase === 'signed-out' && <SettingsGroup>
      <SettingsRow title={t.signIn} note={t.signedOut}>
        <button type="button" className="settings-button primary" disabled={working} onClick={() => void run({ type: 'sign-in' })}>{t.signIn}</button>
      </SettingsRow>
    </SettingsGroup>}
    {status.phase === 'signing-in' && <p className="settings-footnote" role="status">{t.signingIn}</p>}
    {status.phase === 'setup' && <SettingsGroup>
      <SettingsRow title={t.createKey} note={t.setupNote}>
        <button type="button" className="settings-button primary" disabled={working} onClick={() => void run({ type: 'prepare' })}>{t.createKey}</button>
      </SettingsRow>
    </SettingsGroup>}
    {status.phase === 'confirm' && phrase && <SettingsGroup title={t.phrase}>
      <ol className="sync-words">{phrase.split(' ').map((word, index) => <li key={index}><span>{index + 1}</span>{word}</li>)}</ol>
      <div className="sync-actions">
        <button type="button" className="settings-button" disabled={working} onClick={() => void run({ type: 'copy' })}>{t.copy}</button>
        <button type="button" className="settings-button ghost" disabled={working} onClick={() => void run({ type: 'cancel' })}>{t.cancel}</button>
      </div>
      <label className="sync-ack"><input type="checkbox" checked={copied} onChange={event => setCopied(event.target.checked)} />{t.copied}</label>
      {copied && status.checks && <div className="sync-checks">
        {status.checks.map((index, offset) => <label key={index}>{t.check(index)}
          <input value={answers[offset] ?? ''} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={event => setAnswers(current => current.map((value, place) => place === offset ? event.target.value : value))} />
        </label>)}
        <button type="button" className="settings-button primary" disabled={working || answers.some(word => !word.trim())} onClick={() => void run({ type: 'confirm', words: answers })}>{t.start}</button>
      </div>}
    </SettingsGroup>}
    {status.phase === 'confirm' && !phrase && <SettingsGroup title={t.phrase}>
      <p className="settings-footnote">{t.setupNote}</p>
      {status.checks && <div className="sync-checks">
        {status.checks.map((index, offset) => <label key={index}>{t.check(index)}
          <input value={answers[offset] ?? ''} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={event => setAnswers(current => current.map((value, place) => place === offset ? event.target.value : value))} />
        </label>)}
        <button type="button" className="settings-button primary" disabled={working || answers.some(word => !word.trim())} onClick={() => void run({ type: 'confirm', words: answers })}>{t.start}</button>
        <button type="button" className="settings-button ghost" disabled={working} onClick={() => void run({ type: 'cancel' })}>{t.cancel}</button>
      </div>}
    </SettingsGroup>}
    {status.phase === 'enter-key' && <SettingsGroup>
      <SettingsRow title={t.phrase} note={t.enterNote} below={<>
        <textarea className="sync-phrase" value={entry} spellCheck={false} autoCapitalize="off" autoCorrect="off" onChange={event => setEntry(event.target.value)} />
        <button type="button" className="settings-button primary" disabled={working || !entry.trim()} onClick={() => void run({ type: 'submit-phrase', phrase: entry })}>{t.continue}</button>
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
    </SettingsGroup>}
    {status.email && status.phase !== 'ready' && status.phase !== 'signed-out' && status.phase !== 'unconfigured' && status.phase !== 'locked' && <div className="sync-actions">
      <button type="button" className="settings-button ghost" disabled={working} onClick={() => void run({ type: 'sign-out' })}>{t.signOut}</button>
    </div>}
  </div>
}
