/**
 * [INPUT]: 备份状态、工作区备份偏好、工作区时区、受限提交与数据动作。
 * [OUTPUT]: 上次备份状态卡与立即备份、每日备份开关、即时保存的保留份数、按时间倒序的备份列表与预览恢复。
 * [POS]: settings 的备份分类；备份创建与恢复预览经 Settings 的 data 动作进入主进程。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { BackupStatus, DataAction } from '../../../../shared/contracts/transfer'
import { messages } from '../../../i18n/messages'
import type { Action } from '../../../state/use-workspace'
import { Icon } from '../../../components/icons'
import { SettingsGroup, SettingsRow, stamp } from './parts'

const kinds = { daily: messages.daily, protective: messages.protective, manual: messages.manual }

export function BackupPane({ status, enabled, retention, timezone, generation, configured, disabled, submit, data }: {
  status: BackupStatus | null; enabled: boolean; retention: number; timezone: string | undefined; generation: string; configured: boolean; disabled: boolean
  submit: (action: Action) => Promise<unknown>; data: (action: DataAction) => Promise<void>
}) {
  const records = [...(status?.records ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const latest = records[0]
  const save = (next: { enabled?: boolean; retention?: number }) => void submit({ type: 'backupPreferences', enabled: next.enabled ?? enabled, retention: next.retention ?? retention })
  return <>
    <div className="backup-status">
      <span className="backup-status-icon" aria-hidden="true"><Icon name={latest ? 'check' : 'backup'} size={18} /></span>
      <div className="settings-row-text">
        <span>{latest ? messages.lastBackup(stamp(latest.createdAt, timezone)) : messages.noBackupYet}</span>
        <small>{status?.lastError ? <span role="alert" className="danger-text">{status.lastError}</span> : messages.backupCount(records.length)}</small>
      </div>
      <button type="button" className="settings-button primary" disabled={disabled} onClick={() => void data({ type: 'createBackup', generation })}>{messages.backupNow}</button>
    </div>
    {configured && <SettingsGroup title={messages.autoBackup}>
      <SettingsRow title={messages.dailyBackupTitle} note={messages.dailyBackupNote}>
        <button type="button" role="switch" className="switch" aria-checked={enabled} aria-label={messages.dailyBackupTitle} disabled={disabled} onClick={() => save({ enabled: !enabled })}><span /></button>
      </SettingsRow>
      <SettingsRow title={messages.retentionTitle} note={messages.retentionShort} dimmed={!enabled}>
        <div className="stepper">
          <button type="button" aria-label={messages.decreaseRetention} disabled={disabled || retention <= 1} onClick={() => save({ retention: retention - 1 })}><Icon name="minus" size={14} /></button>
          <output className="tabular" aria-label={messages.retentionTitle}>{retention}</output>
          <button type="button" aria-label={messages.increaseRetention} disabled={disabled || retention >= 100} onClick={() => save({ retention: retention + 1 })}><Icon name="add" size={14} /></button>
        </div>
      </SettingsRow>
    </SettingsGroup>}
    <SettingsGroup title={messages.backupList} description={<><span>{messages.sameDiskNote}</span><span className="settings-path" title={status?.directory}>{status?.directory ?? messages.readingBackupPath}</span></>}>
      {records.length > 0 ? <div className="backup-records">
        {records.map(record => <div key={record.id} className="settings-row backup-record">
          <span className={`backup-kind backup-kind-${record.kind}`}>{kinds[record.kind]}</span>
          <span className="settings-row-text tabular">{stamp(record.createdAt, timezone)}</span>
          <span className="settings-hint tabular">{Math.ceil(record.size / 1024)} KB</span>
          <button type="button" className="settings-button subtle" disabled={disabled} onClick={() => void data({ type: 'previewBackup', generation, backupId: record.id })}>{messages.previewRestore}</button>
        </div>)}
      </div> : <p className="settings-card-empty">{messages.noBackupYet}</p>}
    </SettingsGroup>
  </>
}
