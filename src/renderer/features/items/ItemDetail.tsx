/**
 * [INPUT]: Item ID, authoritative detail/period, workspace clock, visible candidates, flow views and actions.
 * [OUTPUT]: Editable details: rich title with an aligned checkbox, one horizontal property row (deadline, flow, 上级/下级, 拆解), a description that takes the remaining height,
 *           a header-toggled activity drawer beside the body, real-period controls and revision-safe saves.
 * [POS]: Full-body detail boundary; refresh and save receipts preserve newer drafts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ItemDetail as Detail } from '../../../shared/contracts/queries'
import { horizons } from '../../../shared/contracts/values'
import type { CalendarConfig, Item, ItemSummary, ItemHorizon, PlanningPeriod } from '../../../shared/contracts/entities'
import { compareInstants } from '../../../domain/calendar'
import { periodDates, planningLabel } from '../../lib/periods'
import { statusNames, messages, horizonNames } from '../../i18n'
import { desktopApi, type Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { flowVars } from '../../lib/colors'
import { Modal } from '../../components/Modal'
import { Popover } from '../../components/Popover'
import { Icon } from '../../components/icons'
import { formatCombo, matches, useShortcuts } from '../../state/shortcuts'
import { ActivityDrawer, useActivitySummary } from './Activity'
import { DuePicker } from './DuePicker'
import { DetailTitle } from './DetailTitle'
import { RelationChip } from './RelationChip'
import { FlowPicker } from './FlowPicker'
import { DescriptionEditor } from '../../components/description/DescriptionEditor'
import { linkUrls } from '../../components/links/parse'

const draftOf = (item: Item) => ({ title: item.title, description: item.description, dueDate: item.dueDate ?? '' })
const nextHorizon: Record<ItemHorizon, ItemHorizon> = { later: 'later', cycle: 'month', month: 'week', week: 'day', day: 'day' }
type Pop = 'parent' | 'child' | 'move' | 'more' | 'flow' | null

export function ItemDetail({ itemId, close, select, submit, revision, busy, locate, flows, candidates, today, calendar, observedAt, split }: {
  itemId: string; close: () => void; select: (id: string) => void; submit: (action: Action) => Promise<unknown>; revision: number; busy: boolean
  locate?: ((item: Item, period: PlanningPeriod | null) => void) | undefined; flows: Flows; candidates: ItemSummary[]; today: string; calendar: CalendarConfig; observedAt: string; split: (parent: { id: string; title: string }, horizon: ItemHorizon) => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const { bindings } = useShortcuts()
  const [draft, setDraft] = useState({ title: '', description: '', dueDate: '' })
  const baseline = useRef(draft), draftRef = useRef(draft); draftRef.current = draft
  const inputRevision = useRef(0), saving = useRef(false)
  const [pop, setPop] = useState<Pop>(null), [error, setError] = useState(''), [history, setHistory] = useState(false)
  const activity = useActivitySummary(itemId, revision)
  // Keep the drawer mounted while the dialog narrows so closing reverses the opening motion instead of cutting it off.
  const [drawer, setDrawer] = useState(false)
  useEffect(() => {
    if (history) { setDrawer(true); return }
    const timer = setTimeout(() => setDrawer(false), 280)
    return () => clearTimeout(timer)
  }, [history])
  useEffect(() => {
    const guardClose = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(draftRef.current) === JSON.stringify(baseline.current)) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', guardClose)
    return () => window.removeEventListener('beforeunload', guardClose)
  }, [])
  useEffect(() => {
    let active = true
    void desktopApi().getItem(itemId).then(value => {
      if (!active) return
      const untouched = JSON.stringify(draftRef.current) === JSON.stringify(baseline.current)
      setDetail(value); baseline.current = draftOf(value.item)
      if (untouched) setDraft(baseline.current)
    }).catch(() => { if (active) setError(messages.itemFailed) })
    return () => { active = false }
  }, [itemId, revision])
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.current)
  const mayLeave = () => !dirty || window.confirm(messages.discardDraft)
  const dismiss = () => { if (mayLeave()) close() }
  const navigate = (id: string) => { if (mayLeave()) select(id) }
  const save = async () => {
    if (!detail || !dirty || !draft.title.trim() || draft.description.length > 100_000 || busy || saving.current) return
    const submitted = { ...draft, title: draft.title.trim() }, revision = inputRevision.current
    saving.current = true
    try {
      const result = await submit({ type: 'edit', itemId, expectedVersion: detail.item.version, ...submitted, dueDate: submitted.dueDate || null })
      if (result) {
        baseline.current = submitted
        setDraft(current => inputRevision.current === revision ? submitted : { ...current })
      }
    } finally { saving.current = false }
  }
  const setField = (name: keyof typeof draft, value: string) => { inputRevision.current++; setDraft(previous => ({ ...previous, [name]: value })) }
  const toggle = (next: Pop) => setPop(pop === next ? null : next)
  const item = detail?.item
  const savedUrls = useMemo(() => new Set(linkUrls(item?.description ?? '')), [item?.description])
  const readOnly = !!item?.deletedAt
  const parents = detail?.relations.filter(edge => edge.childId === itemId) ?? []
  const done = item?.status === 'done'
  // Later is a parking lot: no flow colour and no links; existing edges still show and open. 今天 is the shortest horizon, so it has nothing to split into.
  const later = item?.placement.horizon === 'later'
  const ring = item && !done ? flowVars(flows.colorsOf(itemId)) : undefined
  const inCurrent = (horizon: ItemHorizon) => !!item && item.placement.horizon === horizon && (horizon === 'later' || !!detail?.period && compareInstants(detail.period.startAt, observedAt) <= 0 && compareInstants(detail.period.endAt, observedAt) > 0)
  const canLocate = item && !item.deletedAt && !item.archivedAt && item.status !== 'cancelled' && (!detail?.period || compareInstants(detail.period.endAt, observedAt) > 0)
  const context = item && `${detail?.period ? `${planningLabel(detail.period, calendar, observedAt)} · ${periodDates(detail.period)}` : horizonNames[item.placement.horizon]}${item.status !== 'todo' ? ` · ${statusNames[item.status]}` : ''}${item.archivedAt ? messages.archivedSuffix : ''}${readOnly ? ` · ${messages.trash}` : ''}`
  const heading = item && (readOnly ? <p className="modal-context">{context}</p> : <div className="modal-context">
    <Popover open={pop === 'move'} onClose={() => setPop(null)} anchor={<button type="button" className="placement-chip" aria-label={messages.labelled(messages.moveTo, context ?? '')} aria-expanded={pop === 'move'} onClick={() => toggle('move')}>
      <span className="placement-text">{context}</span><Icon name="expand" size={14} />
    </button>}>
      <div className="menu" role="menu" aria-label={messages.moveTo}>
        {horizons.map(horizon => <button key={horizon} role="menuitemradio" aria-checked={inCurrent(horizon)} className="menu-item" disabled={busy} onClick={() => {
          setPop(null)
          if (!inCurrent(horizon)) void submit({ type: 'move', itemId, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon })
        }}><span className="menu-check">{inCurrent(horizon) && <Icon name="check" size={14} strokeWidth={2} />}</span>{horizonNames[horizon]}</button>)}
      </div>
    </Popover>
  </div>)
  const actions = item && detail && !readOnly && <Popover open={pop === 'more'} onClose={() => setPop(null)} align="end" anchor={<button className="icon-button" aria-label={messages.moreActions} aria-expanded={pop === 'more'} onClick={() => toggle('more')}><Icon name="more" size={18} /></button>}>
    <div className="menu" role="menu" aria-label={messages.moreActions}>
      {locate && canLocate && <button role="menuitem" className="menu-item" onClick={() => { setPop(null); if (mayLeave()) locate(item, detail.period) }}>{messages.locate}</button>}
      <button role="menuitem" className="menu-item" disabled={busy} onClick={() => { setPop(null); void submit({ type: 'status', itemId, expectedVersion: item.version, status: item.status === 'cancelled' ? 'todo' : 'cancelled' }) }}>{item.status === 'cancelled' ? messages.restoreTodo : messages.cancelItem}</button>
      <button role="menuitem" className="menu-item" disabled={busy} onClick={() => { setPop(null); void submit({ type: 'archive', itemId, expectedVersion: item.version, archived: !item.archivedAt }) }}>{item.archivedAt ? messages.unarchive : messages.archiveItem}</button>
      <div className="menu-separator" />
      <button role="menuitem" className="menu-item danger" disabled={busy} onClick={() => {
        setPop(null)
        if (mayLeave() && window.confirm(messages.deletePreview(detail.relations.length))) void submit({ type: 'delete', itemId, expectedVersion: item.version }).then(result => { if (result) close() })
      }}><Icon name="delete" size={16} />{messages.moveTrash}</button>
    </div>
  </Popover>
  const activityToggle = <button type="button" className="icon-button" aria-label={`${messages.activity} ${activity.total}`} title={activity.latest ?? messages.activity} aria-expanded={history} aria-pressed={history} onClick={() => setHistory(!history)}><Icon name="history" size={18} /></button>
  return <Modal title={readOnly ? messages.trashItem : messages.currentItem} heading={heading} actions={<>{actions}{item && activityToggle}</>} close={dismiss} className={`detail${history ? ' with-activity' : ''}`}>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {item && detail && <div className="detail-layout">
      <div className="detail-main">
        <form className="detail-body" onSubmit={event => { event.preventDefault(); void save() }} onKeyDown={event => {
          if (event.nativeEvent.isComposing) return
          // Saving from the keyboard also ends editing, so the title and description return to their reading state.
          if (matches(event, bindings.submit)) { event.preventDefault(); void save(); if (event.target instanceof HTMLElement) event.target.blur() }
        }}>
          <div className="detail-title">
            {/* Native disabling during save would move keyboard focus out of the dialog. */}
            <button type="button" className="check large" data-checked={done} style={ring} disabled={readOnly || item.status === 'cancelled'} aria-disabled={busy || readOnly || item.status === 'cancelled'}
              aria-label={done ? messages.reopenAction : messages.markDone} onClick={() => { if (!busy) void submit({ type: 'status', itemId, expectedVersion: item.version, status: done ? 'todo' : 'done' }) }}>
              {done && <Icon name="check" size={14} strokeWidth={2.5} />}
            </button>
            <DetailTitle key={itemId} value={draft.title} savedValue={item.title} onChange={value => setField('title', value)} readOnly={readOnly} />
          </div>
          <div className="detail-props">
            <DuePicker value={draft.dueDate} today={today} weekStart={calendar.weekStart} readOnly={readOnly} onChange={value => setField('dueDate', value)} />
            {!later && <FlowPicker item={item} hasParents={parents.length > 0} flows={flows} busy={busy} readOnly={readOnly} open={pop === 'flow'} setOpen={open => setPop(open ? 'flow' : null)} submit={submit} />}
            {(['parent', 'child'] as const).map(side => <RelationChip key={side} side={side} self={{ id: item.id, horizon: item.placement.horizon }} edges={detail.relations}
              open={pop === side} setOpen={open => setPop(open ? side : null)} canLink={!readOnly && !later && !(side === 'parent' && item.flowColor !== null)}
              flows={flows} candidates={candidates} navigate={navigate} submit={submit} onError={setError} />)}
            {!readOnly && !later && item.placement.horizon !== 'day' && <button type="button" className="detail-chip" data-ghost="true" onClick={() => { if (mayLeave()) split({ id: item.id, title: item.title }, nextHorizon[item.placement.horizon]) }}><Icon name="add" size={14} />{messages.decompose}</button>}
          </div>
          <DescriptionEditor key={itemId} value={draft.description} savedValue={item.description} savedUrls={savedUrls} onChange={value => setField('description', value)} readOnly={readOnly} />
          {/* The latest event stays readable at the foot of the body; the editor must not be the form's last node (Chromium then moves a focused checklist marker's Space to the text). */}
          <button type="button" className="detail-latest" aria-expanded={history} onClick={() => setHistory(!history)}>{activity.latest ?? messages.activity}</button>
        </form>
        {readOnly ? <footer className="modal-footer">
          <span className="footer-spacer" />
          <button className="button" disabled={busy} onClick={() => void submit({ type: 'restoreItem', itemId, expectedVersion: item.version })}>{messages.restoreItemAction}</button>
        </footer> : dirty && <footer className="modal-footer save-bar">
          <span className="save-dot" aria-hidden="true" /><span className="save-note">{messages.unsavedChanges}</span>
          <span className="footer-spacer" />
          <button className="button quiet" disabled={busy} onClick={() => setDraft(baseline.current)}>{messages.discardChanges}</button>
          <button className="button primary" disabled={busy || !draft.title.trim() || draft.description.length > 100_000} onClick={() => void save()}>{messages.save}{bindings.submit && <kbd>{formatCombo(bindings.submit)}</kbd>}</button>
        </footer>}
      </div>
      {(history || drawer) && <ActivityDrawer itemId={itemId} revision={revision} total={activity.total} />}
    </div>}
  </Modal>
}
