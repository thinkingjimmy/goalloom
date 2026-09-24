/**
 * [INPUT]: Workspace calendar, policies, batch summaries and guarded actions.
 * [OUTPUT]: Read-only calendar, rollover policies and expanded paged batch members.
 * [POS]: Calendar settings; batch identities and undo are revalidated in storage.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState } from 'react'
import type { CalendarConfig, Policy } from '../../../../shared/contracts/entities'
import type { BatchPage, BatchSummary } from '../../../../shared/contracts/transfer'
import { horizonNames, messages, settingsMessages as s } from '../../../i18n'
import { weekdayName } from '../../../i18n/format'
import { desktopApi, type Action } from '../../../state/use-workspace'
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
            <BatchItems key={batch.id} id={batch.id} undone={batch.undone} />
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

function BatchItems({ id, undone }: { id: string; undone: number }) {
  const [offset, setOffset] = useState(0), [page, setPage] = useState<BatchPage | null>(null), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void desktopApi().getBatchItems({ type: 'batchItems', operationId: id, offset, limit: 50 }).then(next => { if (active) setPage(next) }).catch(() => { if (active) setError(messages.listFailed) })
    return () => { active = false }
  }, [id, offset, undone])
  return <>
    {error && <p role="alert">{error}</p>}
    <ul>{page?.items.map(item => <li key={item.id}><span>{item.title}</span><small>{item.from} → {item.to}</small></li>)}</ul>
    {page && page.total > 50 && <div className="items-pagination">
      <button type="button" className="settings-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>{messages.previousPage}</button>
      <span>{offset + 1}–{Math.min(offset + 50, page.total)} / {page.total}</span>
      <button type="button" className="settings-button" disabled={offset + 50 >= page.total} onClick={() => setOffset(offset + 50)}>{messages.nextPage}</button>
    </div>}
  </>
}
