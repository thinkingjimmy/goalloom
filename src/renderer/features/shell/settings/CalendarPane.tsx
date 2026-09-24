/**
 * [INPUT]: 工作区日历、顺延策略、自动顺延批次、受限提交与禁用状态。
 * [OUTPUT]: 三栏只读日历卡（时区/一周开始/周期起点，锁定说明与前往重置）、逐列手动/自动顺延（说明随选择变化，3个月固定手动）、可展开并撤销的顺延记录。
 * [POS]: settings 的日历与顺延分类；策略版本与批次撤销仍由主进程事务复核。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useState } from 'react'
import type { CalendarConfig, Policy } from '../../../../shared/contracts/entities'
import type { BatchSummary } from '../../../../shared/contracts/transfer'
import { horizonNames, messages, settingsMessages as s } from '../../../i18n'
import { weekdayName } from '../../../i18n/format'
import type { Action } from '../../../state/use-workspace'
import { gmtOffset } from '../../../lib/timezones'
import { cycleRange, parseDate } from '../../../../domain/calendar'
import { Icon } from '../../../components/icons'
import { SettingsGroup, Segmented, stamp } from './parts'

const modes = () => [{ value: 'manual', label: messages.manualShort }, { value: 'auto', label: messages.autoMode }] as const

export function CalendarPane({ calendar, policies, batches, today, disabled, submit, goReset }: { calendar: CalendarConfig; policies: Policy[]; batches: BatchSummary[]; today: string; disabled: boolean; submit: (action: Action) => Promise<unknown>; goReset: () => void }) {
  const [open, setOpen] = useState<string | null>(null)
  // The cycle end is exclusive, so it is already the next cycle's first day.
  const next = cycleRange(calendar.cycleAnchor, parseDate(today))[1].toString()
  return <>
    <section className="settings-group">
      <div className="settings-card">
        <dl className="calendar-facts">
          <div><dt>{messages.timezone}</dt><dd>{calendar.timezone}</dd><dd className="tabular">{gmtOffset(calendar.timezone)}</dd></div>
          <div><dt>{messages.weekStartRow}</dt><dd>{weekdayName(calendar.weekStart)}</dd></div>
          <div><dt>{messages.cycleAnchorRow}</dt><dd className="tabular">{calendar.cycleAnchor}</dd><dd className="tabular">{s.nextCycle(next)}</dd></div>
        </dl>
        <p className="settings-card-foot"><Icon name="lock" size={12} strokeWidth={1.8} /><span>{s.lockedNote}</span><button type="button" className="inline-link" onClick={goReset}>{messages.goReset}</button></p>
      </div>
    </section>
    <SettingsGroup title={s.overdue} aside={<small>{messages.policyFootnote}</small>}>
      {policies.map(policy => {
        const name = horizonNames[policy.horizon]
        return <div key={policy.horizon} className="settings-row policy-row">
          <span className="policy-name">{name}</span>
          {policy.horizon === 'cycle'
            ? <><span className="settings-hint policy-note">{messages.cyclePolicyNote}</span><span className="settings-hint">{messages.cycleAlwaysManual}</span></>
            : <><span className="settings-hint policy-note">{s.policyNotes[policy.horizon][policy.mode]}</span>
              <Segmented label={name} value={policy.mode} options={modes()} disabled={disabled}
                onChange={mode => void submit({ type: 'policy', horizon: policy.horizon, mode, expectedVersion: policy.version })} /></>}
        </div>
      })}
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
              <button type="button" className="settings-button" disabled={disabled || batch.undone === batch.total} onClick={() => void submit({ type: 'undoBatch', originalOperationId: batch.id })}>{s.undoRollover}</button>
            </div>
          </div>}
        </div>
      })}
    </SettingsGroup>
  </>
}
