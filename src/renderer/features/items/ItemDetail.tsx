/**
 * [INPUT]: 条目 ID、权威版本、流程视图、看板候选、受限提交和详情读取接口。
 * [OUTPUT]: 居中详情弹窗：页眉位置标签即移动、⋯ 收纳低频生命周期操作；标题行内流程标签；截止/上下级/拆解；说明草稿；折叠活动；仅在有修改时出现保存栏。
 * [POS]: 当前内容详情；草稿不随无关刷新丢失，业务校验仍由事务执行；仅正文滚动，页眉与保存栏固定。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import type { ItemDetail as Detail } from '../../../shared/contracts/queries'
import { horizons, type Item, type ItemHorizon } from '../../../shared/contracts/entities'
import { statusNames, messages, horizonNames } from '../../i18n/messages'
import { desktopApi, type Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import { flowRing } from '../../lib/colors'
import { Modal } from '../../components/Modal'
import { Popover } from '../../components/Popover'
import { FlowMark } from '../../components/FlowMark'
import { Icon } from '../../components/icons'
import { Activity } from './Activity'
import { DuePicker } from './DuePicker'
import { RelationPicker } from './RelationPicker'
import { FlowChip } from './FlowChip'

const draftOf = (item: Item) => ({ title: item.title, description: item.description, dueDate: item.dueDate ?? '' })
const nextHorizon: Record<ItemHorizon, ItemHorizon> = { later: 'later', cycle: 'month', month: 'week', week: 'day', day: 'day' }
type Pop = 'parent' | 'child' | 'move' | 'more' | 'flow' | null

export function ItemDetail({ itemId, close, select, submit, revision, busy, locate, flows, candidates, today, split }: {
  itemId: string; close: () => void; select: (id: string) => void; submit: (action: Action) => Promise<unknown>; revision: number; busy: boolean
  locate?: (() => void) | undefined; flows: Flows; candidates: Item[]; today: string; split: (parent: { id: string; title: string }, horizon: ItemHorizon) => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [draft, setDraft] = useState({ title: '', description: '', dueDate: '' })
  const baseline = useRef(draft), draftRef = useRef(draft); draftRef.current = draft
  const [pop, setPop] = useState<Pop>(null), [error, setError] = useState('')
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
    if (!detail || !dirty || !draft.title.trim()) return
    const result = await submit({ type: 'edit', itemId, expectedVersion: detail.item.version, ...draft, dueDate: draft.dueDate || null })
    if (result) { baseline.current = { ...draft }; setDraft({ ...draft }) }
  }
  const setField = (name: keyof typeof draft, value: string) => setDraft(previous => ({ ...previous, [name]: value }))
  const toggle = (next: Pop) => setPop(pop === next ? null : next)
  const item = detail?.item
  const readOnly = !!item?.deletedAt
  const parents = detail?.relations.filter(edge => edge.childId === itemId) ?? []
  const children = detail?.relations.filter(edge => edge.parentId === itemId) ?? []
  const done = item?.status === 'done'
  const ring = item && !done ? flowRing(flows.colorsOf(itemId)) : undefined
  const context = item && `${horizonNames[item.placement.horizon]}${item.placement.periodId ? ` · ${item.placement.periodId.split(':').at(-1)}` : ''}${item.status !== 'todo' ? ` · ${statusNames[item.status]}` : ''}${item.archivedAt ? messages.archivedSuffix : ''}${readOnly ? ` · ${messages.trash}` : ''}`
  const heading = item && (readOnly ? <p className="modal-context">{context}</p> : <div className="modal-context">
    <Popover open={pop === 'move'} onClose={() => setPop(null)} anchor={<button type="button" className="placement-chip" aria-label={`${messages.moveTo}：${context}`} aria-expanded={pop === 'move'} onClick={() => toggle('move')}>
      <span className="placement-text">{context}</span><Icon name="expand" size={14} />
    </button>}>
      <div className="menu" role="menu" aria-label={messages.moveTo}>
        {horizons.map(horizon => <button key={horizon} role="menuitemradio" aria-checked={item.placement.horizon === horizon} className="menu-item" disabled={busy} onClick={() => {
          setPop(null)
          if (item.placement.horizon !== horizon) void submit({ type: 'move', itemId, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon })
        }}><span className="menu-check">{item.placement.horizon === horizon && <Icon name="check" size={14} strokeWidth={2} />}</span>{horizonNames[horizon]}</button>)}
      </div>
    </Popover>
  </div>)
  const actions = item && detail && !readOnly && <Popover open={pop === 'more'} onClose={() => setPop(null)} align="end" anchor={<button className="icon-button" aria-label={messages.moreActions} aria-expanded={pop === 'more'} onClick={() => toggle('more')}><Icon name="more" size={18} /></button>}>
    <div className="menu" role="menu" aria-label={messages.moreActions}>
      {locate && <button role="menuitem" className="menu-item" onClick={() => { setPop(null); if (mayLeave()) locate() }}>{messages.locate}</button>}
      <button role="menuitem" className="menu-item" disabled={busy} onClick={() => { setPop(null); void submit({ type: 'status', itemId, expectedVersion: item.version, status: item.status === 'cancelled' ? 'todo' : 'cancelled' }) }}>{item.status === 'cancelled' ? messages.restoreTodo : messages.cancelItem}</button>
      <button role="menuitem" className="menu-item" disabled={busy} onClick={() => { setPop(null); void submit({ type: 'archive', itemId, expectedVersion: item.version, archived: !item.archivedAt }) }}>{item.archivedAt ? messages.unarchive : messages.archiveItem}</button>
      <div className="menu-separator" />
      <button role="menuitem" className="menu-item danger" disabled={busy} onClick={() => {
        setPop(null)
        if (mayLeave() && window.confirm(messages.deletePreview(detail.relations.length))) void submit({ type: 'delete', itemId, expectedVersion: item.version }).then(result => { if (result) close() })
      }}><Icon name="delete" size={16} />{messages.moveTrash}</button>
    </div>
  </Popover>
  return <Modal title={readOnly ? messages.trashItem : messages.currentItem} heading={heading} actions={actions} close={dismiss} className="detail">
    {error && <p className="inline-error" role="alert">{error}</p>}
    {item && detail && <>
      <form className="detail-body" onSubmit={event => { event.preventDefault(); void save() }} onKeyDown={event => {
        if (event.nativeEvent.isComposing && event.key === 'Enter') event.preventDefault()
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void save() }
      }}>
        <div className="detail-title">
          <button type="button" className="check large" data-checked={done} style={ring ? { '--flow-ring': ring } as CSSProperties : undefined} disabled={busy || readOnly || item.status === 'cancelled'}
            aria-label={done ? messages.reopenAction : messages.markDone} onClick={() => void submit({ type: 'status', itemId, expectedVersion: item.version, status: done ? 'todo' : 'done' })}>
            {done && <Icon name="check" size={14} strokeWidth={2.5} />}
          </button>
          <div className="title-line">
            <input className="title-input" aria-label={messages.title} value={draft.title} onChange={event => setField('title', event.target.value)} maxLength={500} required readOnly={readOnly} />
            <FlowChip item={item} hasParents={parents.length > 0} flows={flows} busy={busy} readOnly={readOnly} open={pop === 'flow'} setOpen={open => setPop(open ? 'flow' : null)} submit={submit} />
          </div>
        </div>
        <div className="fields">
          <span className="field-label">{messages.dueShort}</span>
          <div className="field-value"><DuePicker value={draft.dueDate} today={today} readOnly={readOnly} onChange={value => setField('dueDate', value)} /></div>

          {(['parent', 'child'] as const).map(side => {
            const edges = side === 'parent' ? parents : children
            const flowRoot = side === 'parent' && item.flowColor !== null
            return [<span key={`${side}-label`} className="field-label">{side === 'parent' ? messages.parents : messages.children}</span>,
              <div key={side} className="field-value relation-list">
                {edges.map(edge => {
                  const other = side === 'parent' ? edge.parentId : edge.childId
                  return <button type="button" key={edge.id} className="relation-link" onClick={() => navigate(other)}>
                    <FlowMark colors={flows.colorsOf(other)} /><span>{side === 'parent' ? edge.parentTitle : edge.childTitle}{(side === 'parent' ? edge.parentArchived : edge.childArchived) ? messages.archivedSuffix : ''}</span>
                  </button>
                })}
                {flowRoot && !edges.length && <span className="field-hint" title={messages.flowRootNoParent}>{messages.flowRootParent}<Icon name="info" size={14} /></span>}
                {!readOnly && !flowRoot && <div className="relation-actions">
                  {side === 'child' && <button type="button" className="chip-button" onClick={() => { if (mayLeave()) split({ id: item.id, title: item.title }, nextHorizon[item.placement.horizon]) }}><Icon name="split" size={14} />{messages.decompose}</button>}
                  <Popover open={pop === side} onClose={() => setPop(null)} anchor={
                    <button type="button" className={side === 'child' ? 'chip-button' : 'field-button'} data-empty="true" aria-expanded={pop === side} onClick={() => toggle(side)}>
                      {side === 'child' && <Icon name="link" size={14} />}{side === 'parent' ? messages.linkParent : messages.linkExisting}
                    </button>
                  }><RelationPicker side={side} detail={detail} flows={flows} candidates={candidates} submit={submit} onError={setError} /></Popover>
                </div>}
              </div>]
          })}
        </div>
        <label className="field-label" htmlFor="item-description">{messages.description}</label>
        <textarea id="item-description" className="note-input" value={draft.description} onChange={event => setField('description', event.target.value)} rows={5} maxLength={100_000} placeholder={messages.descriptionPlaceholder} readOnly={readOnly} />
        <Activity itemId={itemId} revision={revision} />
      </form>
      {readOnly ? <footer className="modal-footer">
        <span className="footer-spacer" />
        <button className="button" disabled={busy} onClick={() => void submit({ type: 'restoreItem', itemId, expectedVersion: item.version })}>{messages.restoreItemAction}</button>
      </footer> : dirty && <footer className="modal-footer save-bar">
        <span className="save-dot" aria-hidden="true" /><span className="save-note">{messages.unsavedChanges}</span>
        <span className="footer-spacer" />
        <button className="button quiet" disabled={busy} onClick={() => setDraft(baseline.current)}>{messages.discardChanges}</button>
        <button className="button primary" disabled={busy || !draft.title.trim()} onClick={() => void save()}>{messages.save}<kbd>{messages.saveHint}</kbd></button>
      </footer>}
    </>}
  </Modal>
}
