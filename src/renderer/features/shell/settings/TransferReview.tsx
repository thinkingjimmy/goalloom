/**
 * [INPUT]: Guarded replacement preview, acknowledgement, workspace timezone and data actions.
 * [OUTPUT]: Source calendar mode, data counts, verified backup receipt and replacement confirmation.
 * [POS]: Settings workspace replacement review; navigation stays locked during maintenance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ReactNode } from 'react'
import type { DataAction, TransferPreview } from '../../../../shared/contracts/transfer'
import { calendarMessages as c, messages } from '../../../i18n'
import { count, weekdayName } from '../../../i18n/format'
import { Icon } from '../../../components/icons'
import { SettingsGroup, stamp } from './parts'

const steps = () => [messages.stepPreview, messages.stepBackup, messages.stepConfirm]

export function TransferSteps({ backedUp }: { backedUp: boolean }) {
  const current = backedUp ? 2 : 0
  return <ol className="transfer-steps" aria-label={messages.transferSteps}>
    {steps().map((step, index) => <li key={step} aria-current={index === current ? 'step' : undefined} data-done={index < current}>
      <span className="transfer-step-mark">{index < current ? <Icon name="check" size={12} strokeWidth={2} /> : index + 1}</span>{step}
    </li>)}
  </ol>
}

export function TransferReview({ children, preview, working, acknowledged, acknowledge, timezone, generation, data }: {
  children?: ReactNode; preview: TransferPreview; working: boolean; acknowledged: boolean; acknowledge: (value: boolean) => void; timezone: string | undefined; generation: string; data: (action: DataAction) => Promise<void>
}) {
  const reset = preview.mode === 'reset'
  const stats = [[preview.items, messages.statItems], [preview.relations, messages.statRelations], [preview.periods, messages.statPeriods], [preview.events, messages.statEvents], [preview.operations, messages.statOperations]] as const
  const token = preview.token
  const notes = [
    preview.sourceCalendar && <p key="calendar">{preview.sourceCalendar.mode === 'natural' ? c.naturalMode : c.rollingMode} · {messages.sourceCalendar(preview.sourceCalendar.timezone, weekdayName(preview.sourceCalendar.weekStart), preview.sourceCalendar.cycleAnchor)}</p>,
    ...preview.warnings.map(warning => <p className="warning" key={warning}>{warning}</p>),
    !preview.backup && <p key="scope">{reset ? messages.resetNote : messages.restoreNoteFull}{messages.maintenanceNote}</p>,
  ].filter(Boolean)
  return <>
    <div className="settings-body">
      {children}
      {preview.backup && <div className="maintenance-note"><Icon name="lock" size={16} /><span>{messages.maintenanceActive}</span></div>}
      <SettingsGroup title={reset ? messages.resetClears : messages.replacesWith}>
        <div className="transfer-stats">{stats.map(([value, label]) => <div key={label}><strong className="tabular">{count(value)}</strong><span>{label}</span></div>)}</div>
        {notes.length > 0 && <div className="settings-card-foot transfer-notes">{notes}</div>}
      </SettingsGroup>
      {preview.backup && <SettingsGroup title={messages.stepBackup}>
        <div className="settings-row receipt-row">
          <span className="settings-hero-icon" data-state="enabled" aria-hidden="true"><Icon name="check" size={16} strokeWidth={2} /></span>
          <div className="settings-row-text">
            <span className="receipt-title"><span>{messages.backupCreatedVerified}</span><span className="settings-hint tabular">{stamp(preview.backup.createdAt, timezone)} · {Math.ceil(preview.backup.size / 1024)} KB</span></span>
            <small>{messages.restoreBackupHelp}</small>
            <small className="settings-path" title={preview.backupPath ?? undefined}>{preview.backupPath}</small>
          </div>
        </div>
      </SettingsGroup>}
    </div>
    <footer className="settings-footer">
      {preview.backup
        ? <label className="check-label"><input type="checkbox" checked={acknowledged} onChange={event => acknowledge(event.target.checked)} />{messages.acknowledgeBackup}</label>
        : <span />}
      <button type="button" className="settings-button ghost" disabled={working} onClick={() => void data({ type: 'cancel', generation, token })}>{messages.cancel}</button>
      {preview.backup
        ? <button type="button" className="settings-button danger-solid" disabled={working || !acknowledged} onClick={() => void data({ type: 'commit', generation, token, acknowledged: true })}>{reset ? messages.resetConfirm : messages.restoreConfirm}</button>
        : <button type="button" className="settings-button primary" disabled={working} onClick={() => void data({ type: 'prepare', generation, token })}>{messages.prepareBackup}</button>}
    </footer>
  </>
}
