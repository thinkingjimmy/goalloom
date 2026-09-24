/**
 * [INPUT]: 备份状态、工作区备份偏好、工作区时区与今天、受限提交、数据动作与导出回调。
 * [OUTPUT]: 「备份与恢复」：状态卡（上次备份、立即备份、每日开关、保留份数）、按时间倒序的备份列表（默认 3 份可展开，逐份预览恢复）、导出 JSON 与单一文件选择恢复（JSON/SQLite）、危险区重置入口。
 * [POS]: settings 的备份与恢复分类；备份、导入与重置都经 Settings 的 data 动作进入主进程，整库替换统一进入 TransferReview 两阶段确认。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useState } from 'react'
import type { BackupStatus, DataAction } from '../../../../shared/contracts/transfer'
import { messages, settingsMessages as s } from '../../../i18n'
import type { Action } from '../../../state/use-workspace'
import { Icon } from '../../../components/icons'
import { SettingsGroup, SettingsRow, Switch, relativeDay, stamp } from './parts'

const kinds = () => ({ daily: messages.daily, protective: messages.protective, manual: messages.manual })
const collapsed = 3

export function BackupPane({ status, enabled, retention, timezone, today, generation, configured, disabled, submit, data, exportJson }: {
  status: BackupStatus | null; enabled: boolean; retention: number; timezone: string | undefined; today: string; generation: string; configured: boolean; disabled: boolean
  submit: (action: Action) => Promise<unknown>; data: (action: DataAction) => Promise<void>; exportJson: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const records = [...(status?.records ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const latest = records[0]
  const shown = expanded ? records : records.slice(0, collapsed)
  const save = (next: { enabled?: boolean; retention?: number }) => void submit({ type: 'backupPreferences', enabled: next.enabled ?? enabled, retention: next.retention ?? retention })
  const when = (instant: string) => {
    const day = relativeDay(instant, today, timezone, s)
    return /^\d/.test(day) ? stamp(instant, timezone) : `${day} ${stamp(instant, timezone).slice(11)}`
  }
  return <>
    <div className="settings-card">
      <div className="settings-hero" data-state={latest ? 'enabled' : 'disabled'}>
        <span className="settings-hero-icon" aria-hidden="true"><Icon name={latest ? 'check' : 'backup'} size={18} strokeWidth={latest ? 2 : 1.6} /></span>
        <div className="settings-row-text">
          <span>{latest ? s.backedUpAt(when(latest.createdAt)) : messages.noBackupYet}</span>
          <small>{status?.lastError ? <span role="alert" className="danger-text">{status.lastError}</span> : s.backupSummary(records.length)}</small>
        </div>
        <button type="button" className="settings-button primary" disabled={disabled} onClick={() => void data({ type: 'createBackup', generation })}>{messages.backupNow}</button>
      </div>
      {configured && <>
        <SettingsRow title={s.dailyBackup} note={s.dailyBackupNote}>
          <Switch label={s.dailyBackup} checked={enabled} disabled={disabled} onChange={value => save({ enabled: value })} />
        </SettingsRow>
        <SettingsRow title={s.keepLatest} note={messages.retentionShort} dimmed={!enabled}>
          <div className="stepper">
            <button type="button" aria-label={messages.decreaseRetention} disabled={disabled || retention <= 1} onClick={() => save({ retention: retention - 1 })}><Icon name="minus" size={14} /></button>
            <output className="tabular" aria-label={messages.retentionTitle}>{s.keepCount(retention)}</output>
            <button type="button" aria-label={messages.increaseRetention} disabled={disabled || retention >= 100} onClick={() => save({ retention: retention + 1 })}><Icon name="add" size={14} /></button>
          </div>
        </SettingsRow>
      </>}
    </div>
    <SettingsGroup title={s.backupList} aside={<small className="settings-path" title={status?.directory}>{status?.directory ?? messages.readingBackupPath}</small>}>
      {records.length === 0 && <p className="settings-card-empty">{messages.noBackupYet}</p>}
      {shown.map(record => <div key={record.id} className="settings-row backup-record">
        <span className="backup-kind" data-kind={record.kind}>{kinds()[record.kind]}</span>
        <span className="settings-row-text tabular">{stamp(record.createdAt, timezone)}</span>
        <span className="settings-hint tabular">{Math.ceil(record.size / 1024)} KB</span>
        <button type="button" className="settings-button link" disabled={disabled} onClick={() => void data({ type: 'previewBackup', generation, backupId: record.id })}>{s.restoreFrom}</button>
      </div>)}
      {records.length > collapsed && <button type="button" className="settings-card-more" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? s.showFewer : s.showAll(records.length)}</button>}
    </SettingsGroup>
    <SettingsGroup title={s.transfer}>
      <SettingsRow title={s.exportJson} note={s.exportNote}>
        <button type="button" className="settings-button" disabled={disabled} onClick={exportJson}>{s.exportAction}</button>
      </SettingsRow>
      <SettingsRow title={s.restoreFile} note={s.restoreFileNote}>
        <button type="button" className="settings-button" disabled={disabled} onClick={() => void data({ type: 'chooseImport', generation })}>{s.chooseFile}</button>
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup danger>
      <SettingsRow title={messages.resetWorkspace} note={s.resetNote}>
        <button type="button" className="settings-button danger" disabled={disabled} onClick={() => void data({ type: 'previewReset', generation })}>{s.reset}</button>
      </SettingsRow>
    </SettingsGroup>
  </>
}
