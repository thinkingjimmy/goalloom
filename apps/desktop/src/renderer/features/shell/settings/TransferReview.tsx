/**
 * [INPUT]: Guarded replacement preview, acknowledgement, workspace timezone and data actions.
 * [OUTPUT]: Source calendar mode, data counts, verified backup receipt and replacement confirmation.
 * [POS]: Settings workspace replacement review; navigation stays locked during maintenance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { SettingsButton } from '../../../components/ui/button'
import type { ReactNode } from 'react'
import type { DataAction, TransferPreview } from '../../../../shared/contracts/transfer'
import { calendarMessages as c, messages } from '../../../i18n'
import { count, weekdayName } from '../../../i18n/format'
import { Icon } from '../../../components/icons'
import { SettingsGroup, stamp } from './parts'

const steps = () => [messages.stepPreview, messages.stepBackup, messages.stepConfirm]

export function TransferSteps({ backedUp }: { backedUp: boolean }) {
  const current = backedUp ? 2 : 0
  return <ol className="transfer-steps m-0 p-0 list-none flex items-center gap-7 text-[12.5px] text-muted-foreground" aria-label={messages.transferSteps}>
    {steps().map((step, index) => <li key={step} aria-current={index === current ? 'step' : undefined} data-done={index < current}>
      <span className="transfer-step-mark w-4.5 h-4.5 rounded-[9px] grid place-items-center text-[11px]">{index < current ? <Icon name="check" size={12} strokeWidth={2} /> : index + 1}</span>{step}
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
    <div className="settings-body min-h-0 overflow-y-auto pt-0.5 pr-9 pb-8 pl-9 flex flex-col gap-5.5">
      {children}
      {preview.backup && <div className="maintenance-note shrink-0 flex items-center gap-2.5 px-3.5 py-2.5 rounded-[10px] text-warning text-[12.5px] leading-[1.6]"><Icon name="lock" size={16} /><span>{messages.maintenanceActive}</span></div>}
      <SettingsGroup title={reset ? messages.resetClears : messages.replacesWith}>
        <div className="transfer-stats px-0 py-4 grid">{stats.map(([value, label]) => <div key={label}><strong className="tabular">{count(value)}</strong><span>{label}</span></div>)}</div>
        {notes.length > 0 && <div className="settings-card-foot transfer-notes m-0 px-4.5 py-2.5 flex text-[12px] text-muted-foreground flex-col items-stretch gap-0.5 leading-[1.6]">{notes}</div>}
      </SettingsGroup>
      {preview.backup && <SettingsGroup title={messages.stepBackup}>
        <div className="settings-row receipt-row min-h-14 pt-2.5 pr-4 pb-2.5 pl-4.5 flex gap-4 items-start">
          <span className="settings-hero-icon w-9 h-9 shrink-0 grid place-items-center rounded-[10px] bg-raised text-muted-foreground" data-state="enabled" aria-hidden="true"><Icon name="check" size={16} strokeWidth={2} /></span>
          <div className="settings-row-text flex-1 min-w-0 flex flex-col gap-[3px] text-[14px]">
            <span className="receipt-title flex items-baseline gap-2.5"><span>{messages.backupCreatedVerified}</span><span className="settings-hint tabular shrink-0 text-[12px] text-muted-foreground">{stamp(preview.backup.createdAt, timezone)} · {Math.ceil(preview.backup.size / 1024)} KB</span></span>
            <small>{messages.restoreBackupHelp}</small>
            <small className="settings-path min-w-0 text-[11px] text-muted-foreground whitespace-nowrap overflow-hidden text-ellipsis" title={preview.backupPath ?? undefined}>{preview.backupPath}</small>
          </div>
        </div>
      </SettingsGroup>}
    </div>
    <footer className="settings-footer flex items-center gap-2 pt-3.5 pr-5 pb-3.5 pl-9 bg-background">
      {preview.backup
        ? <label className="check-label"><input type="checkbox" checked={acknowledged} onChange={event => acknowledge(event.target.checked)} />{messages.acknowledgeBackup}</label>
        : <span />}
      <SettingsButton variant="ghost" type="button" disabled={working} onClick={() => void data({ type: 'cancel', generation, token })}>{messages.cancel}</SettingsButton>
      {preview.backup
        ? <SettingsButton variant="danger-solid" type="button" disabled={working || !acknowledged} onClick={() => void data({ type: 'commit', generation, token, acknowledged: true })}>{reset ? messages.resetConfirm : messages.restoreConfirm}</SettingsButton>
        : <SettingsButton variant="primary" type="button" disabled={working} onClick={() => void data({ type: 'prepare', generation, token })}>{messages.prepareBackup}</SettingsButton>}
    </footer>
  </>
}
