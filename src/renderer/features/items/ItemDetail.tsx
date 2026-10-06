/**
 * [INPUT]: Item ID, authoritative detail/period, workspace clock, visible candidates, flow views and actions.
 * [OUTPUT]: Editable details: rich title with an aligned checkbox, a due chip and one flow chip (parent title, a root dot, or join-flow), a description that takes the remaining height,
 *           and a permanent right rail with scrolling activity above icon-and-text cancel, archive and delete. Silent autosave.
 * [POS]: Full-body detail boundary; autosave drains navigation and removes cleared title-only todos on explicit dismissal.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useMemo, useState } from 'react'
import { horizons } from '../../../shared/contracts/values'
import type { CalendarConfig, ItemSummary, ItemHorizon } from '../../../shared/contracts/entities'
import { compareInstants } from '../../../domain/calendar'
import { horizonName, periodDates, planningLabel } from '../../lib/periods'
import { statusNames, messages, horizonNames } from '../../i18n'
import { type PreparedWrite, type WriteResult } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { flowVars } from '../../lib/colors'
import { Modal } from '../../components/Modal'
import { Popover } from '../../components/Popover'
import { Icon } from '../../components/icons'
import { matches, useShortcuts } from '../../state/shortcuts'
import { ActivityDrawer, useActivitySummary } from './Activity'
import { DuePicker } from './DuePicker'
import { DetailTitle } from './DetailTitle'
import { useItemAutosave } from './use-item-autosave'
import { DetailFlowChip } from './DetailFlowChip'
import { DescriptionEditor } from '../../components/description/DescriptionEditor'
import { linkUrls } from '../../components/links/parse'

export function ItemDetail({ itemId, generation, close, write, retryWrite, revision, blocked, flows, candidates, today, calendar, observedAt }: {
  itemId: string; generation: string; close: () => void; write: PreparedWrite; retryWrite: (generation: string) => Promise<WriteResult>; revision: number; blocked: boolean
  flows: Flows; candidates: ItemSummary[]; today: string; calendar: CalendarConfig; observedAt: string
}) {
  const { bindings } = useShortcuts()
  const autosave = useItemAutosave({ itemId, generation, revision, write, retryWrite })
  const { detail, draft, error, setError, submit } = autosave
  const busy = blocked || autosave.actionBusy
  const activity = useActivitySummary(itemId, revision)
  const [moving, setMoving] = useState(false)
  const dismiss = () => { void autosave.dismiss().then(ready => { if (ready) close() }) }
  const item = detail?.item
  const savedUrls = useMemo(() => new Set(linkUrls(item?.description ?? '')), [item?.description])
  const readOnly = !!item?.deletedAt
  const done = item?.status === 'done'
  const later = item?.placement.horizon === 'later'
  const ring = item && !done && !later ? flowVars(flows.colorsOf(itemId)) : undefined
  const inCurrent = (horizon: ItemHorizon) => !!item && item.placement.horizon === horizon && (horizon === 'later' || !!detail?.period && compareInstants(detail.period.startAt, observedAt) <= 0 && compareInstants(detail.period.endAt, observedAt) > 0)
  const context = item && `${detail?.period ? `${planningLabel(detail.period, calendar, observedAt)} · ${periodDates(detail.period)}` : horizonNames[item.placement.horizon]}${item.status !== 'todo' ? ` · ${statusNames[item.status]}` : ''}${item.archivedAt ? messages.archivedSuffix : ''}${readOnly ? ` · ${messages.trash}` : ''}`
  const heading = item && (readOnly ? <p className="modal-context">{context}</p> : <div className="modal-context">
    <Popover open={moving} onClose={() => setMoving(false)} anchor={<button type="button" className="placement-chip" aria-label={messages.labelled(messages.moveTo, context ?? '')} aria-expanded={moving} onClick={() => setMoving(open => !open)}>
      <span className="placement-text">{context}</span><Icon name="expand" size={14} />
    </button>}>
      <div className="menu" role="menu" aria-label={messages.moveTo}>
        {horizons.map(horizon => <button key={horizon} role="menuitemradio" aria-checked={inCurrent(horizon)} className="menu-item" disabled={busy} onClick={() => {
          setMoving(false)
          if (!inCurrent(horizon)) void submit({ type: 'move', itemId, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon })
        }}><span className="menu-check">{inCurrent(horizon) && <Icon name="check" size={14} strokeWidth={2} />}</span>{horizonName(horizon, calendar)}</button>)}
      </div>
    </Popover>
  </div>)
  const remove = () => {
    if (!item || !detail || !window.confirm(messages.deletePreview(detail.relations.length))) return
    void submit({ type: 'delete', itemId, expectedVersion: item.version }).then(result => { if (result) close() })
  }
  return <Modal title={readOnly ? messages.trashItem : messages.currentItem} heading={heading} close={dismiss} className="detail">
    {error && <p className="inline-error detail-save-error" role="alert">{error} <button type="button" className="text-button" disabled={autosave.saving} onClick={() => void autosave.retry().then(discarded => { if (discarded) close() })}>{messages.retryAutosave}</button></p>}
    {item && detail && <div className="detail-layout">
      <div className="detail-main">
        <form className="detail-body" data-save-state={error ? 'error' : autosave.saving ? 'saving' : autosave.dirty ? 'pending' : 'saved'} onCompositionStart={() => autosave.composition(true)} onCompositionEnd={() => autosave.composition(false)}
          onBlur={event => { if ((event.target as HTMLElement).closest('.title-input, .description-editor')) queueMicrotask(() => { void autosave.flush() }) }}
          onSubmit={event => { event.preventDefault(); void autosave.flush() }} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          // Saving from the keyboard also ends editing, so the title and description return to their reading state.
          if (matches(event, bindings.submit)) { event.preventDefault(); void autosave.flush(); if (event.target instanceof HTMLElement) event.target.blur() }
        }}>
          <div className="detail-title">
            {/* Native disabling during save would move keyboard focus out of the dialog. */}
            <button type="button" className="check large" data-checked={done} style={ring} disabled={readOnly || item.status === 'cancelled'} aria-disabled={busy || readOnly || item.status === 'cancelled'}
              aria-label={done ? messages.reopenAction : messages.markDone} onClick={() => { if (!busy) void submit({ type: 'status', itemId, expectedVersion: item.version, status: done ? 'todo' : 'done' }) }}>
              {done && <Icon name="check" size={14} strokeWidth={2.5} />}
            </button>
            <DetailTitle key={itemId} value={draft.title} savedValue={item.title} onChange={value => autosave.change('title', value)} readOnly={readOnly || autosave.discarding} />
          </div>
          <div className="detail-props">
            <DuePicker value={draft.dueDate} today={today} weekStart={calendar.weekStart} readOnly={readOnly || autosave.discarding} onChange={value => autosave.change('dueDate', value, true)} />
            <DetailFlowChip item={item} edges={detail.relations} flows={flows} candidates={candidates} busy={busy} readOnly={readOnly} submit={submit} onError={setError} />
          </div>
          <DescriptionEditor key={itemId} value={draft.description} savedUrls={savedUrls} onChange={(value, immediate) => autosave.change('description', value, immediate)} readOnly={readOnly || autosave.discarding} />
          {/* The editor must not be the form's last node: Chromium then sends a focused checklist marker's Space into the text. */}
          <div className="detail-sentinel" aria-hidden="true" />
        </form>
        {readOnly && <footer className="modal-footer">
          <span className="footer-spacer" />
          <button className="button" disabled={busy} onClick={() => void submit({ type: 'restoreItem', itemId, expectedVersion: item.version })}>{messages.restoreItemAction}</button>
        </footer>}
      </div>
      <aside className="detail-rail">
        <ActivityDrawer itemId={itemId} revision={revision} total={activity.total} today={today} timezone={calendar.timezone} weekStart={calendar.weekStart} />
        {!readOnly && <div className="detail-rail-actions">
          <button type="button" className="detail-rail-action" disabled={busy} onClick={() => void submit({ type: 'status', itemId, expectedVersion: item.version, status: item.status === 'cancelled' ? 'todo' : 'cancelled' })}>
            <Icon name={item.status === 'cancelled' ? 'refresh' : 'cancel'} size={16} />{item.status === 'cancelled' ? messages.restoreTodo : messages.cancel}
          </button>
          <button type="button" className="detail-rail-action" disabled={busy} onClick={() => void submit({ type: 'archive', itemId, expectedVersion: item.version, archived: !item.archivedAt })}>
            <Icon name={item.archivedAt ? 'unarchive' : 'archive'} size={16} />{item.archivedAt ? messages.unarchive : messages.archive}
          </button>
          <button type="button" className="detail-rail-action danger" disabled={busy} onClick={remove}>
            <Icon name="delete" size={16} />{messages.deleteVerb}
          </button>
        </div>}
      </aside>
    </div>}
  </Modal>
}
