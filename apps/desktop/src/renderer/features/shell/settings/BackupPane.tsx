/**
 * [INPUT]: 备份状态、工作区备份偏好、工作区时区与今天、受限提交、数据动作与导出回调；从日历「更换日历」进入时的定位标记。
 * [OUTPUT]: 「备份与恢复」：状态卡（上次备份、立即备份、每日开关、保留份数）、按时间倒序的备份列表（默认 3 份可展开，逐份预览恢复）、导出 JSON 与单一文件选择恢复（JSON/SQLite）、危险区重置入口（定位进入时滚入视口、聚焦并短暂高亮）。
 * [POS]: settings 的备份与恢复分类；备份、导入与重置都经 Settings 的 data 动作进入主进程，整库替换统一进入 TransferReview 两阶段确认。
 */
import { SettingsButton } from '../../../components/ui/button'
import { cn } from '../../../lib/utils'
import { useEffect, useRef, useState } from 'react'
import type { BackupStatus, DataAction } from '../../../../shared/contracts/transfer'
import { messages, settingsMessages as s } from '../../../i18n'
import type { Action } from '../../../state/use-workspace'
import { Icon } from '../../../components/icons'
import { SettingsGroup, SettingsRow, Switch, relativeDay, stamp } from './parts'

const kinds = () => ({ daily: messages.daily, protective: messages.protective, manual: messages.manual })
const collapsed = 3

export function BackupPane({ status, enabled, retention, timezone, today, generation, configured, disabled, submit, data, exportJson, revealReset = false }: {
  status: BackupStatus | null; enabled: boolean; retention: number; timezone: string | undefined; today: string; generation: string; configured: boolean; disabled: boolean
  submit: (action: Action) => Promise<unknown>; data: (action: DataAction) => Promise<void>; exportJson: () => void; revealReset?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const reset = useRef<HTMLElement>(null)
  useEffect(() => { if (revealReset) reset.current?.querySelector('button')?.focus({ preventScroll: true }) }, [])
  // Re-run once the list loads: rows arriving above would otherwise push the reset entry back out of view.
  useEffect(() => {
    if (revealReset) reset.current?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
  }, [revealReset, status])
  const records = [...(status?.records ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const latest = records[0]
  const shown = expanded ? records : records.slice(0, collapsed)
  const save = (next: { enabled?: boolean; retention?: number }) => void submit({ type: 'backupPreferences', enabled: next.enabled ?? enabled, retention: next.retention ?? retention })
  const when = (instant: string) => {
    const day = relativeDay(instant, today, timezone, s)
    return /^\d/.test(day) ? stamp(instant, timezone) : `${day} ${stamp(instant, timezone).slice(11)}`
  }
  return <>
    <div className={cn(cn('settings-card', 'flex flex-col bg-raised rounded-[12px]'), 'rounded-settings-card shadow-settings-card')}>
      <div className="settings-hero flex items-center gap-3.5 pt-4 pr-4 pb-4 pl-4.5 rounded-[12px] bg-hover" data-state={latest ? 'enabled' : 'disabled'}>
        <span className="settings-hero-icon w-9 h-9 shrink-0 grid place-items-center rounded-[10px] bg-raised text-muted-foreground" aria-hidden="true"><Icon name={latest ? 'check' : 'backup'} size={18} strokeWidth={latest ? 2 : 1.6} /></span>
        <div className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]">
          <span>{latest ? s.backedUpAt(when(latest.createdAt)) : messages.noBackupYet}</span>
          <small>{status?.lastError ? <span role="alert" className="danger-text">{status.lastError}</span> : s.backupSummary(records.length)}</small>
        </div>
        <SettingsButton variant="primary" type="button" disabled={disabled} onClick={() => void data({ type: 'createBackup', generation })}>{messages.backupNow}</SettingsButton>
      </div>
      {configured && <>
        <SettingsRow title={s.dailyBackup} note={s.dailyBackupNote}>
          <Switch label={s.dailyBackup} checked={enabled} disabled={disabled} onChange={value => save({ enabled: value })} />
        </SettingsRow>
        <SettingsRow title={s.keepLatest} note={messages.retentionShort} dimmed={!enabled}>
          <div className="stepper shrink-0 h-7.5 flex items-center rounded-[8px] bg-raised">
            <button type="button" aria-label={messages.decreaseRetention} disabled={disabled || retention <= 1} onClick={() => save({ retention: retention - 1 })}><Icon name="minus" size={14} /></button>
            <output className="tabular" aria-label={messages.retentionTitle}>{s.keepCount(retention)}</output>
            <button type="button" aria-label={messages.increaseRetention} disabled={disabled || retention >= 100} onClick={() => save({ retention: retention + 1 })}><Icon name="add" size={14} /></button>
          </div>
        </SettingsRow>
      </>}
    </div>
    <SettingsGroup title={s.backupList} aside={<small className="settings-path min-w-0 text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis" title={status?.directory}>{status?.directory ?? messages.readingBackupPath}</small>}>
      {records.length === 0 && <p className="settings-card-empty m-0 px-4 py-4.5 text-center text-[12px] text-muted-foreground">{messages.noBackupYet}</p>}
      {shown.map(record => <div key={record.id} className="settings-row backup-record flex items-center min-h-10.5 pt-1 pr-2.5 pb-1 pl-4.5 gap-3.5">
        <span className="backup-kind shrink-0 w-9 h-5 inline-grid place-items-center rounded-[5px] text-[11.5px] font-medium bg-hover text-soft" data-kind={record.kind}>{kinds()[record.kind]}</span>
        <span className="settings-row-text tabular flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]">{stamp(record.createdAt, timezone)}</span>
        <span className="settings-hint tabular shrink-0 text-[12px] text-muted-foreground">{Math.ceil(record.size / 1024)} KB</span>
        <SettingsButton variant="link" type="button" disabled={disabled} onClick={() => void data({ type: 'previewBackup', generation, backupId: record.id })}>{s.restoreFrom}</SettingsButton>
      </div>)}
      {records.length > collapsed && <button type="button" className="settings-card-more h-8.5 text-[12.5px] text-muted-foreground" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? s.showFewer : s.showAll(records.length)}</button>}
    </SettingsGroup>
    <SettingsGroup title={s.transfer}>
      <SettingsRow title={s.exportJson} note={s.exportNote}>
        <SettingsButton type="button" disabled={disabled} onClick={exportJson}>{s.exportAction}</SettingsButton>
      </SettingsRow>
      <SettingsRow title={s.restoreFile} note={s.restoreFileNote}>
        <SettingsButton type="button" disabled={disabled} onClick={() => void data({ type: 'chooseImport', generation })}>{s.chooseFile}</SettingsButton>
      </SettingsRow>
    </SettingsGroup>
    <SettingsGroup danger reveal={revealReset} ref={reset}>
      <SettingsRow title={messages.resetWorkspace} note={s.resetNote}>
        <SettingsButton variant="danger" type="button" disabled={disabled} onClick={() => void data({ type: 'previewReset', generation })}>{s.reset}</SettingsButton>
      </SettingsRow>
    </SettingsGroup>
  </>
}
