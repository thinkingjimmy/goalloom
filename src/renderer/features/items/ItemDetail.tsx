/**
 * [INPUT]: 条目 ID、权威版本、受限提交和详情读取接口。
 * [OUTPUT]: 文本草稿、独立状态操作、上下级双入口与拆解；草稿不随无关刷新丢失。
 * [POS]: 当前内容详情，关系导航复用抽屉；业务校验仍由事务执行。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { statusNames, messages, horizonNames } from '../../i18n/messages'
import { useEffect, useRef, useState } from 'react'
import type { ItemDetail as Detail, ItemPage } from '../../../shared/contracts/queries'
import { horizons, type ItemHorizon, type Item } from '../../../shared/contracts/entities'
import { desktopApi, type Action } from '../../state/use-workspace'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui/button'
import { Icon } from '../../components/icons'
import { Activity } from './Activity'

const draftOf = (item: Item) => ({ title: item.title, description: item.description, dueDate: item.dueDate ?? '' })
export function ItemDetail({ itemId, close, select, submit, revision, busy, locate }: { itemId: string; close: () => void; select: (id: string) => void; submit: (action: Action) => Promise<unknown>; revision: number; busy: boolean; locate?: (() => void) | undefined }) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [draft, setDraft] = useState({ title: '', description: '', dueDate: '' })
  const baseline = useRef(draft), draftRef = useRef(draft); draftRef.current = draft
  useEffect(() => {
    const guardClose = (event: BeforeUnloadEvent) => {
      if (JSON.stringify(draftRef.current) === JSON.stringify(baseline.current)) return
      event.preventDefault(); event.returnValue = ''
    }
    window.addEventListener('beforeunload', guardClose)
    return () => window.removeEventListener('beforeunload', guardClose)
  }, [])
  const [query, setQuery] = useState(''), [results, setResults] = useState<ItemPage>({ items: [], total: 0 })
  const [direction, setDirection] = useState<'parent' | 'child'>('parent')
  const [searching, setSearching] = useState(false), [decomposing, setDecomposing] = useState(false)
  const [nextTitle, setNextTitle] = useState(''), [nextHorizon, setNextHorizon] = useState<ItemHorizon>('day')
  const [error, setError] = useState('')
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
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view: 'search', query, offset: 0, limit: 50 }).then(value => { if (active) setResults(value) }).catch(() => { if (active) setError(messages.relationSearchFailed) }), 180)
    return () => { active = false; clearTimeout(timer) }
  }, [query, revision])
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.current)
  const mayLeave = () => !dirty || window.confirm(messages.discardDraft)
  const dismiss = () => { if (mayLeave()) close() }
  const navigate = (id: string) => { if (mayLeave()) select(id) }
  const save = async () => {
    if (!detail) return
    const result = await submit({ type: 'edit', itemId, expectedVersion: detail.item.version, ...draft, dueDate: draft.dueDate || null })
    if (result) { baseline.current = { ...draft }; setDraft({ ...draft }) }
  }
  const setField = (name: keyof typeof draft, value: string) => setDraft(previous => ({ ...previous, [name]: value }))
  return <Modal title={detail?.item.deletedAt ? messages.trashItem : messages.currentItem} close={dismiss} wide>
    {error && <p role="alert">{error}</p>}
    {detail && <>
      <form onSubmit={event => { event.preventDefault(); void save() }} onKeyDown={event => {
        if (event.nativeEvent.isComposing && event.key === 'Enter') event.preventDefault()
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void save() }
      }}>
        <label>{messages.title}<input value={draft.title} onChange={event => setField('title', event.target.value)} maxLength={500} required readOnly={!!detail.item.deletedAt} /></label>
        <label htmlFor="item-description">{messages.description}</label><textarea id="item-description" value={draft.description} onChange={event => setField('description', event.target.value)} rows={6} maxLength={100_000} placeholder={messages.descriptionPlaceholder} readOnly={!!detail.item.deletedAt} />
        <label>{messages.dueDate}<input type="date" value={draft.dueDate} onChange={event => setField('dueDate', event.target.value)} readOnly={!!detail.item.deletedAt} /></label>
        <p className="field-note">{messages.dueDateNote}</p>
        {!detail.item.deletedAt && <Button type="submit" disabled={!dirty || busy || !draft.title.trim()}>{messages.save}</Button>}
      </form>
      <div className="detail-actions">
        {locate && <Button variant="outline" onClick={() => { if (mayLeave()) locate() }}>{messages.locate}</Button>}
        {detail.item.deletedAt ? <Button disabled={busy} onClick={() => void submit({ type: 'restoreItem', itemId, expectedVersion: detail.item.version })}>{messages.restoreItemAction}</Button> : <>
          <Button variant="outline" disabled={busy} onClick={() => void submit({ type: 'status', itemId, expectedVersion: detail.item.version, status: detail.item.status === 'done' ? 'todo' : 'done' })}><Icon name="done" />{detail.item.status === 'done' ? messages.reopenAction : messages.markDone}</Button>
          <Button variant="outline" disabled={busy} onClick={() => void submit({ type: 'status', itemId, expectedVersion: detail.item.version, status: detail.item.status === 'cancelled' ? 'todo' : 'cancelled' })}>{detail.item.status === 'cancelled' ? messages.restoreTodo : messages.cancelItem}</Button>
          <Button variant="outline" disabled={busy} onClick={() => void submit({ type: 'archive', itemId, expectedVersion: detail.item.version, archived: !detail.item.archivedAt })}>{detail.item.archivedAt ? messages.unarchive : messages.archiveItem}</Button>
          <Button variant="ghost" disabled={busy} onClick={() => { if (mayLeave() && window.confirm(messages.deletePreview(detail.relations.length))) void submit({ type: 'delete', itemId, expectedVersion: detail.item.version }).then(result => { if (result) close() }) }}><Icon name="delete" />{messages.moveTrash}</Button>
        </>}
      </div>
      <p className="field-note">{statusNames[detail.item.status]}{detail.item.archivedAt ? messages.archivedSuffix : ''} · {horizonNames[detail.item.placement.horizon]}{detail.item.placement.periodId ? ` · ${detail.item.placement.periodId.split(':').at(-1)}` : ''}</p>
      {!detail.item.deletedAt && <>
        <label>{messages.moveTo}<select aria-label={messages.moveTo} value={detail.item.placement.horizon} onChange={event => void submit({ type: 'move', itemId, expectedVersion: detail.item.version, expectedPlacementVersion: detail.item.placement.version, horizon: event.target.value as ItemHorizon })} disabled={busy}>
          {horizons.map(horizon => <option key={horizon} value={horizon}>{horizonNames[horizon]}</option>)}
        </select></label>
        {(['parent', 'child'] as const).map(side => <section className="relations-section" key={side}><h3>{side === 'parent' ? messages.parents : messages.children}</h3>
          {detail.relations.filter(edge => (side === 'parent' ? edge.childId : edge.parentId) === itemId).map(edge => <div className="relation-row" key={edge.id}><button onClick={() => navigate(side === 'parent' ? edge.parentId : edge.childId)}>{side === 'parent' ? edge.parentTitle : edge.childTitle}{(side === 'parent' ? edge.parentArchived : edge.childArchived) ? messages.archivedSuffix : ''}</button><Button size="icon" variant="ghost" aria-label={messages.unlinkLabel(side === 'parent' ? edge.parentTitle : edge.childTitle)} disabled={busy} onClick={async () => {
            try {
              const parent = await desktopApi().getItem(edge.parentId), child = await desktopApi().getItem(edge.childId)
              await submit({ type: 'unlink', relationId: edge.id, expectedParentVersion: parent.item.version, expectedChildVersion: child.item.version })
            } catch { setError(messages.unlinkFailed) }
          }}><Icon name="close" size={16} /></Button></div>)}
          <Button variant="outline" onClick={() => { setDirection(side); setSearching(true) }}>{side === 'parent' ? messages.linkParent : messages.linkChild}</Button>
          {side === 'child' && <Button variant="ghost" onClick={() => { setNextHorizon(({ later: 'later', cycle: 'month', month: 'week', week: 'day', day: 'day' } as const)[detail.item.placement.horizon]); setDecomposing(true) }}>{messages.decompose}</Button>}
        </section>)}
        {searching && <section className="relation-picker"><label>{direction === 'parent' ? messages.searchParents : messages.searchChildren}<input value={query} onChange={event => setQuery(event.target.value)} autoFocus /></label>
          {results.items.filter(item => item.id !== itemId).map(item => <button type="button" key={item.id} disabled={busy} onClick={async () => {
            const parent = direction === 'parent' ? item : detail.item, child = direction === 'child' ? item : detail.item
            const result = await submit({ type: 'link', parentId: parent.id, childId: child.id, expectedParentVersion: parent.version, expectedChildVersion: child.version })
            if (result) { setSearching(false); setQuery('') }
          }}>{item.title}{item.archivedAt ? messages.archivedSuffix : ''}</button>)}
          <Button variant="ghost" onClick={() => setSearching(false)}>{messages.cancelLink}</Button>
        </section>}
        {decomposing && <form className="relation-picker" onSubmit={async event => {
          event.preventDefault()
          const result = await submit({ type: 'create', title: nextTitle, horizon: nextHorizon, parentId: itemId, expectedParentVersion: detail.item.version })
          if (result) { setDecomposing(false); setNextTitle('') }
        }}><label>{messages.nextTitle}<input autoFocus required value={nextTitle} maxLength={500} onChange={event => setNextTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault() }} /></label><label>{messages.arrangeTo}<select value={nextHorizon} onChange={event => setNextHorizon(event.target.value as ItemHorizon)}>{horizons.map(horizon => <option key={horizon} value={horizon}>{horizonNames[horizon]}</option>)}</select></label><Button type="submit" disabled={busy || !nextTitle.trim()}>{messages.createNext}</Button><Button variant="ghost" onClick={() => setDecomposing(false)}>{messages.cancelDecompose}</Button></form>}
      </>}
      <Activity itemId={itemId} revision={revision} />
    </>}
  </Modal>
}
