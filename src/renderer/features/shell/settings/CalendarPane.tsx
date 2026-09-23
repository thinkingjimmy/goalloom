/**
 * [INPUT]: 工作区日历、顺延策略、自动顺延批次、受限提交与禁用状态。
 * [OUTPUT]: 只读固定日历、逐列手动/自动顺延切换（3个月固定手动）、可展开并撤销的顺延记录。
 * [POS]: settings 的日历与顺延分类；策略版本与批次撤销仍由主进程事务复核。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useState } from 'react'
import type { CalendarConfig, Policy } from '../../../../shared/contracts/entities'
import type { BatchSummary } from '../../../../shared/contracts/transfer'
import { horizonNames, messages } from '../../../i18n/messages'
import type { Action } from '../../../state/use-workspace'
import { gmtOffset } from '../../../lib/timezones'
import { Icon } from '../../../components/icons'
import { SettingsGroup, SettingsRow, Segmented, stamp } from './parts'

const weekdays = [messages.monday, messages.tuesday, messages.wednesday, messages.thursday, messages.friday, messages.saturday, messages.sunday]
const modes = [{ value: 'manual', label: messages.manualShort }, { value: 'auto', label: messages.autoMode }] as const

export function CalendarPane({ calendar, policies, batches, disabled, submit, goReset }: { calendar: CalendarConfig; policies: Policy[]; batches: BatchSummary[]; disabled: boolean; submit: (action: Action) => Promise<unknown>; goReset: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  return <>
    <SettingsGroup title={messages.fixedCalendar} description={<span>{messages.calendarResetHint}<button type="button" className="inline-link" onClick={goReset}>{messages.goReset}</button></span>}
      aside={<span className="settings-status"><Icon name="lock" size={12} strokeWidth={1.8} />{messages.locked}</span>}>
      <SettingsRow title={messages.timezone}><span className="settings-value">{calendar.timezone}</span><span className="settings-hint tabular">{gmtOffset(calendar.timezone)}</span></SettingsRow>
      <SettingsRow title={messages.weekStartRow}><span className="settings-value">{messages.weekdayPrefix}{weekdays[calendar.weekStart - 1]}</span></SettingsRow>
      <SettingsRow title={messages.cycleAnchorRow}><span className="settings-value tabular">{calendar.cycleAnchor}</span></SettingsRow>
    </SettingsGroup>
    <SettingsGroup title={messages.rolloverSettings} description={messages.policyFootnote}>
      {policies.map(policy => policy.horizon === 'cycle'
        ? <SettingsRow key={policy.horizon} title={horizonNames[policy.horizon]} note={messages.cyclePolicyNote}><span className="settings-hint">{messages.cycleAlwaysManual}</span></SettingsRow>
        : <SettingsRow key={policy.horizon} title={horizonNames[policy.horizon]} note={messages.policyEffective(policy.effectiveFromPeriodId.split(':').at(-1) ?? '')}>
          <Segmented label={horizonNames[policy.horizon]} value={policy.mode} options={modes} disabled={disabled}
            onChange={mode => void submit({ type: 'policy', horizon: policy.horizon, mode, expectedVersion: policy.version })} />
        </SettingsRow>)}
    </SettingsGroup>
    <SettingsGroup title={messages.rolloverRecords}>
      {!batches.length && <p className="settings-card-empty">{messages.noBatches}</p>}
      {batches.map(batch => {
        const expanded = open === batch.id
        return <div key={batch.id} className="settings-batch">
          <button type="button" className="settings-row settings-batch-toggle" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : batch.id)}>
            <Icon name="next" size={14} />
            <span className="settings-row-text tabular">{stamp(batch.at, calendar.timezone)}</span>
            <span className="settings-hint">{messages.batchSummary(batch.total, batch.undone)}</span>
          </button>
          {expanded && <div className="settings-batch-body">
            <ul>{batch.items.map(item => <li key={item.id}><span>{item.title}</span><small>{item.from} → {item.to}</small></li>)}</ul>
            <div className="settings-batch-actions">
              <small>{messages.batchUndoNote}</small>
              <button type="button" className="settings-button" disabled={disabled || batch.undone === batch.total} onClick={() => void submit({ type: 'undoBatch', originalOperationId: batch.id })}>{messages.undoBatch}</button>
            </div>
          </div>}
        </div>
      })}
    </SettingsGroup>
  </>
}
