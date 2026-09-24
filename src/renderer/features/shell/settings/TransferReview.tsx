/**
 * [INPUT]: 恢复/重置预览、执行中状态、每次默认未选的确认勾选、工作区时区与数据动作。
 * [OUTPUT]: 三步进度（预览 → 保护备份 → 确认）、维护提示、五栏数据规模卡（源日历/警告/说明在卡底）、保护备份回执与底部确认栏。
 * [POS]: settings 整库替换的两阶段确认界面；维护期间由 Settings 锁定导航，取消恢复原运行状态。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ReactNode } from 'react'
import type { DataAction, TransferPreview } from '../../../../shared/contracts/transfer'
import { messages } from '../../../i18n'
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
    preview.sourceCalendar && <p key="calendar">{messages.sourceCalendar(preview.sourceCalendar.timezone, weekdayName(preview.sourceCalendar.weekStart), preview.sourceCalendar.cycleAnchor)}</p>,
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
