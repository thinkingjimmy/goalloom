/**
 * [INPUT]: Authoritative saved detail/guidance, workspace clock and the shared prepared writer.
 * [OUTPUT]: Persistent editors, intent-scoped assistance subviews, facts/calendar rail and visible guarded lifecycle controls.
 * [POS]: Detail boundary; entry flushes drafts, unknown writes block closing and guidance never overwrites Markdown.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { horizons } from '../../../shared/contracts/values'
import type { ExecutionFacts } from '../../../shared/contracts/execution'
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
import { ActivityDrawer } from './Activity'
import { DuePicker } from './DuePicker'
import { DetailTitle } from './DetailTitle'
import { useItemAutosave } from './use-item-autosave'
import { DetailFlowChip } from './DetailFlowChip'
import { DescriptionEditor } from '../../components/description/DescriptionEditor'
import { linkUrls } from '../../components/links/parse'
import { intlTags } from '../../../shared/i18n/locale'
import { currentLocale } from '../../i18n'
import { assistanceMessages } from '../../i18n/assistance'
import '../assistance/assistance.css'
const AssistancePanel = lazy(() => import('../assistance/AssistancePanel').then(module => ({ default: module.AssistancePanel })))

export function ItemDetail({ itemId, generation, close, write, retryWrite, revision, blocked, flows, candidates, today, calendar, observedAt, connect, decompose, initialAssistance = false }: {
  decompose?: (() => void) | undefined
  connect?: (() => void) | undefined
  initialAssistance?: boolean
  itemId: string; generation: string; close: () => void; write: PreparedWrite; retryWrite: (generation: string) => Promise<WriteResult>; revision: number; blocked: boolean
  flows: Flows; candidates: ItemSummary[]; today: string; calendar: CalendarConfig; observedAt: string
}) {
  const { bindings } = useShortcuts()
  const autosave = useItemAutosave({ itemId, generation, revision, write, retryWrite })
  const { detail, draft, error, setError, submit } = autosave
  const t = assistanceMessages()
  const [help, setHelp] = useState(initialAssistance), [helpEditing, setHelpEditing] = useState(false), [rescheduling, setRescheduling] = useState(false), [helpLocked, setHelpLocked] = useState(false)
  const [assistanceFacts, setAssistanceFacts] = useState<ExecutionFacts | null>(null)
  const busy = blocked || autosave.actionBusy || helpLocked
  const helpReturn = useRef<HTMLElement | null>(null)
  const wasHelp = useRef(initialAssistance)
  useLayoutEffect(() => {
    if (wasHelp.current && !help) { const target = helpReturn.current?.isConnected ? helpReturn.current : document.querySelector<HTMLElement>('.execution-help button, .detail .placement-chip, .detail .modal-header .icon-button'); target?.focus({ preventScroll: true }) }
    wasHelp.current = help
  }, [help])
  const closeHelp = () => setHelp(false)
  const openHelp = async (editing = false, schedule = false) => {
    if (busy) return
    helpReturn.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    helpReturn.current?.blur()
    if (!await autosave.flush()) return
    setRescheduling(schedule); setHelpEditing(editing); setHelp(true)
  }
  const [moving, setMoving] = useState(false)
  const dismiss = () => { if (help) { if (!helpLocked) closeHelp(); return }; void autosave.dismiss().then(ready => { if (ready) close() }) }
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
          if (horizon === 'later' && detail.relations.some(edge => edge.childId === itemId) && !window.confirm(t.laterImpact(detail.relations.filter(edge => edge.childId === itemId).length))) return
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
        <form hidden={help} className="detail-body" data-save-state={error ? 'error' : autosave.saving ? 'saving' : autosave.dirty ? 'pending' : 'saved'} onCompositionStart={() => autosave.composition(true)} onCompositionEnd={() => autosave.composition(false)}
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
          {detail.guidance?.value && <section className="saved-guidance" aria-label={t.guidance}><h3>{t.guidance}</h3>
            <p className="assistance-note">{detail.guidance.value.authorship === 'ai_assisted' ? t.aiAssisted : t.userWritten} · <time dateTime={detail.guidance.updatedAt}>{t.updated(new Intl.DateTimeFormat(intlTags[currentLocale()], { timeZone: calendar.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(detail.guidance.updatedAt)))}</time></p>
            <p>{detail.guidance.value.nextAction}</p>{detail.guidance.value.contextNote && <p>{detail.guidance.value.contextNote}</p>}{detail.guidance.value.scopeNote && <p>{detail.guidance.value.scopeNote}</p>}
            {!readOnly && item.status === 'todo' && !item.archivedAt && <div className="saved-guidance-actions"><button type="button" className="text-button" disabled={busy} onClick={() => void openHelp(true)}>{t.edit}</button>
              <button type="button" className="text-button" disabled={busy} onClick={() => void submit({ type: 'applyAssistance', itemId, expectedVersion: item.version, expectedGuidanceRevision: detail.guidance!.revision, guidance: { kind: 'clear' } })}>{t.clear}</button></div>}
          </section>}
          <DescriptionEditor key={itemId} value={draft.description} savedUrls={savedUrls} onChange={(value, immediate) => autosave.change('description', value, immediate)} readOnly={readOnly || autosave.discarding} />
          {/* The editor must not be the form's last node: Chromium then sends a focused checklist marker's Space into the text. */}
          <div className="detail-sentinel" aria-hidden="true" />
        </form>
        {help && <Suspense fallback={<p role="status">{t.loading}</p>}><AssistancePanel key={rescheduling ? 'schedule' : helpEditing ? 'guidance' : 'help'} itemId={itemId} generation={generation} calendar={calendar} write={write} retryWrite={retryWrite} close={closeHelp} editing={helpEditing} rescheduling={rescheduling} onGuardChange={setHelpLocked} connect={connect} factsReady={setAssistanceFacts} active={item.status === 'todo' && !item.archivedAt && !item.deletedAt} decompose={decompose} /></Suspense>}
        {readOnly && <footer className="modal-footer">
          <span className="footer-spacer" />
          <button className="button" disabled={busy} onClick={() => void submit({ type: 'restoreItem', itemId, expectedVersion: item.version })}>{messages.restoreItemAction}</button>
        </footer>}
      </div>
      <aside className="detail-rail">
        <ActivityDrawer itemId={itemId} generation={generation} revision={revision} observedAt={observedAt} period={detail.period} factsSnapshot={help ? assistanceFacts : null} today={today} weekStart={calendar.weekStart} helpDisabled={busy}
          assist={!readOnly && item.status === 'todo' && !item.archivedAt ? () => void openHelp() : null} move={!readOnly && item.status === 'todo' && !item.archivedAt ? () => void openHelp(false, true) : null} />
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
