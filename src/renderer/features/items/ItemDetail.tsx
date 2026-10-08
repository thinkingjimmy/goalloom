/**
 * [INPUT]: Authoritative task/notes, workspace clock and the shared guarded autosave writer.
 * [OUTPUT]: One detail sheet with header lifecycle actions, inline AI note rewrites and a persistent Markdown editor.
 * [POS]: Detail boundary; ordinary edits stay local while generating, guarded rewrites own only the description.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useMemo } from 'react'
import type { CalendarConfig, ItemSummary } from '../../../shared/contracts/entities'
import { periodDates, planningLabel } from '../../lib/periods'
import { statusNames, messages, horizonNames } from '../../i18n'
import { type PreparedWrite, type WriteResult } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { flowVars } from '../../lib/colors'
import { Modal } from '../../components/Modal'
import { Icon } from '../../components/icons'
import { matches, useShortcuts } from '../../state/shortcuts'
import { DuePicker } from './DuePicker'
import { DetailTitle } from './DetailTitle'
import { useItemAutosave } from './use-item-autosave'
import { DetailFlowChip } from './DetailFlowChip'
import { DescriptionEditor } from '../../components/description/DescriptionEditor'
import { linkUrls } from '../../components/links/parse'
import { AssistancePanel } from '../assistance/AssistancePanel'

export function ItemDetail({ itemId, generation, close, write, retryWrite, revision, blocked, flows, candidates, today, calendar, observedAt, connect, initialAssistance = false }: {
  decompose?: (() => void) | undefined
  connect?: (() => void) | undefined
  initialAssistance?: boolean
  itemId: string; generation: string; close: () => void; write: PreparedWrite; retryWrite: (generation: string) => Promise<WriteResult>; revision: number; blocked: boolean
  flows: Flows; candidates: ItemSummary[]; today: string; calendar: CalendarConfig; observedAt: string
}) {
  const { bindings } = useShortcuts()
  const autosave = useItemAutosave({ itemId, generation, revision, write, retryWrite })
  const { detail, draft, error, setError, submit } = autosave
  const busy = blocked || autosave.actionBusy || autosave.rewriting
  const dismiss = () => { void autosave.dismiss().then(ready => { if (ready) close() }) }
  const item = detail?.item
  const savedUrls = useMemo(() => new Set(linkUrls(item?.description ?? '')), [item?.description])
  const readOnly = !!item?.deletedAt
  const done = item?.status === 'done'
  const later = item?.placement.horizon === 'later'
  const ring = item && !done && !later ? flowVars(flows.colorsOf(itemId)) : undefined
  const context = item && `${detail?.period ? `${planningLabel(detail.period, calendar, observedAt)} · ${periodDates(detail.period)}` : horizonNames[item.placement.horizon]}${item.status !== 'todo' ? ` · ${statusNames[item.status]}` : ''}${item.archivedAt ? messages.archivedSuffix : ''}${readOnly ? ` · ${messages.trash}` : ''}`
  const heading = <p className="modal-context detail-context" title={context}>{context}</p>
  const remove = () => {
    if (!item || !detail || !window.confirm(messages.deletePreview(detail.relations.length))) return
    void submit({ type: 'delete', itemId, expectedVersion: item.version }).then(result => { if (result) close() })
  }
  const actions = item && !readOnly && <div className="detail-management">
    <button type="button" className="detail-rail-action" disabled={busy} title={item.status === 'cancelled' ? messages.restoreTodo : messages.cancel} aria-label={item.status === 'cancelled' ? messages.restoreTodo : messages.cancel}
      onClick={() => void submit({ type: 'status', itemId, expectedVersion: item.version, status: item.status === 'cancelled' ? 'todo' : 'cancelled' })}>
      <Icon name={item.status === 'cancelled' ? 'refresh' : 'cancel'} size={16} /><span>{item.status === 'cancelled' ? messages.restoreTodo : messages.cancel}</span>
    </button>
    <button type="button" className="detail-rail-action" disabled={busy} title={item.archivedAt ? messages.unarchive : messages.archive} aria-label={item.archivedAt ? messages.unarchive : messages.archive}
      onClick={() => void submit({ type: 'archive', itemId, expectedVersion: item.version, archived: !item.archivedAt })}>
      <Icon name={item.archivedAt ? 'unarchive' : 'archive'} size={16} /><span>{item.archivedAt ? messages.unarchive : messages.archive}</span>
    </button>
    <button type="button" className="detail-rail-action danger" disabled={busy} title={messages.deleteVerb} aria-label={messages.deleteVerb} onClick={remove}><Icon name="delete" size={16} /><span>{messages.deleteVerb}</span></button>
  </div>
  return <Modal title={readOnly ? messages.trashItem : messages.currentItem} heading={heading} actions={actions} close={dismiss} className="detail">
    {error && <p className="inline-error detail-save-error" role="alert">{error} <button type="button" className="text-button" disabled={autosave.saving} onClick={() => void autosave.retry().then(discarded => { if (discarded) close() })}>{messages.retryAutosave}</button></p>}
    {item && detail && <div className="detail-layout"><div className="detail-main">
      <div className="detail-body" data-save-state={error ? 'error' : autosave.saving ? 'saving' : autosave.dirty ? 'pending' : 'saved'} onCompositionStart={() => autosave.composition(true)} onCompositionEnd={() => autosave.composition(false)}
        onBlur={event => { if ((event.target as HTMLElement).closest('.title-input, .description-editor')) queueMicrotask(() => { void autosave.flush() }) }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing || (event.target as HTMLElement).closest('.assistance-panel')) return
          if (matches(event, bindings.submit)) { event.preventDefault(); void autosave.flush(); if (event.target instanceof HTMLElement) event.target.blur() }
        }}>
        <div className="detail-title">
          <button type="button" className="check large" data-checked={done} style={ring} disabled={readOnly || item.status === 'cancelled'} aria-disabled={busy || readOnly || item.status === 'cancelled'}
            aria-label={done ? messages.reopenAction : messages.markDone} onClick={() => { if (!busy) void submit({ type: 'status', itemId, expectedVersion: item.version, status: done ? 'todo' : 'done' }) }}>
            {done && <Icon name="check" size={14} strokeWidth={2.5} />}
          </button>
          <DetailTitle key={itemId} value={draft.title} savedValue={item.title} onChange={value => autosave.change('title', value)} readOnly={readOnly || autosave.discarding || autosave.rewriting} />
        </div>
        <div className="detail-props">
          <DuePicker value={draft.dueDate} today={today} weekStart={calendar.weekStart} readOnly={readOnly || autosave.discarding || autosave.rewriting} onChange={value => autosave.change('dueDate', value, true)} />
          <DetailFlowChip item={item} edges={detail.relations} flows={flows} candidates={candidates} busy={busy} readOnly={readOnly} submit={submit} onError={setError} />
        </div>
        <AssistancePanel itemId={itemId} generation={generation} revision={revision} observedAt={observedAt} initialOpen={initialAssistance} assisted={!!detail.assistedNotes}
          locked={busy} active={!readOnly && item.status === 'todo' && !item.archivedAt} flush={autosave.flush} captureRevision={autosave.captureRevision} rewrite={autosave.rewrite} connect={connect}>
          <DescriptionEditor key={itemId} value={draft.description} savedUrls={savedUrls} onChange={(value, immediate) => autosave.change('description', value, immediate)} readOnly={readOnly || autosave.discarding || autosave.rewriting} />
        </AssistancePanel>
        {/* Keep a node after the editor so Chromium sends checklist Space to its marker. */}
        <div className="detail-sentinel" aria-hidden="true" />
      </div>
      {readOnly && <footer className="modal-footer"><span className="footer-spacer" /><button className="button" disabled={busy} onClick={() => void submit({ type: 'restoreItem', itemId, expectedVersion: item.version })}>{messages.restoreItemAction}</button></footer>}
    </div></div>}
  </Modal>
}
