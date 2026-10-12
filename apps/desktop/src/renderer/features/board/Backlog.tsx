/**
 * [INPUT]: Summary pages of overdue items, current periods and guarded batch actions.
 * [OUTPUT]: Read-only saved-text links/previews, cross-page selection (select all loads every page) and explicit current-period arrangement requests; closes once an arrangement clears every item.
 * [POS]: Board backlog dialog; storage revalidates membership, versions and holds.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { messages, horizonNames } from '../../i18n'
import { fullDate, yearMonth, count } from '../../i18n/format'
import { useEffect, useRef, useState } from 'react'
import type { ItemSummary, ItemHorizon } from '../../../shared/contracts/entities'
import type { ItemPage } from '../../../shared/contracts/queries'
import { desktopApi, type Action } from '../../state/use-workspace'
import { Modal } from '../../components/Modal'
import { LinkTitle } from '../../components/links/LinkText'
import { LinkPreviews } from '../../components/links/LinkPreviews'
import { linkUrls } from '../../components/links/parse'

const pageSize = 50

export function Backlog({ horizon, revision, submit, busy, close, select }: { horizon: ItemHorizon; revision: number; submit: (action: Action) => Promise<unknown>; busy: boolean; close: () => void; select: (id: string) => void }) {
  const [page, setPage] = useState<ItemPage | null>(null), [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Map<string, ItemSummary>>(new Map()), [error, setError] = useState('')
  const allToggle = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let active = true
    void desktopApi().listItems({ type: 'list', view: 'backlog', horizon, query: '', offset, limit: pageSize }).then(value => { if (active) setPage(value) }).catch(() => { if (active) setError(messages.backlogFailed) })
    return () => { active = false }
  }, [horizon, revision, offset])
  const items = page?.items ?? [], total = page?.total ?? 0
  const allPicked = total > 0 && selected.size >= total
  useEffect(() => { if (allToggle.current) allToggle.current.indeterminate = selected.size > 0 && !allPicked }, [selected.size, allPicked])
  const toggle = (item: ItemSummary, on: boolean) => setSelected(previous => { const next = new Map(previous); if (on) next.set(item.id, item); else next.delete(item.id); return next })
  const toggleAll = async () => {
    if (allPicked) { setSelected(new Map()); return }
    if (total <= items.length) { setSelected(new Map(items.map(item => [item.id, item]))); return }
    try {
      const every: ItemSummary[] = []
      for (let from = 0; from < total; from += 100) every.push(...(await desktopApi().listItems({ type: 'list', view: 'backlog', horizon, query: '', offset: from, limit: 100 })).items)
      setSelected(new Map(every.map(item => [item.id, item])))
    } catch { setError(messages.backlogFailed) }
  }
  const open = (id: string) => { close(); select(id) }
  const planned = (item: ItemSummary) => { const date = item.placement.periodId?.split(':').at(-1); return date ? `${messages.originalPlan} ${horizon === 'month' ? yearMonth(date) : fullDate(date)}` : '' }
  const arrange = async (target: ItemHorizon) => {
    const clearsAll = selected.size >= total
    const result = await submit({ type: 'arrangeBacklog', horizon: target, items: [...selected.values()].map(item => ({ itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version })) })
    if (!result) return
    if (clearsAll) { close(); return }
    setSelected(new Map()); setOffset(0)
  }
  const empty = page !== null && total === 0
  return <Modal title={messages.backlogTitle(horizonNames[horizon])} close={close} wide className="backlog-modal">
    <p className="field-note backlog-note">{empty ? messages.backlogEmpty : `${count(total)} ${messages.backlogNote}`}</p>
    {error && <p className="backlog-error" role="alert">{error}</p>}
    {items.length > 0 && <div className="backlog-toolbar">
      <label className="backlog-check"><input ref={allToggle} type="checkbox" checked={allPicked} onChange={() => void toggleAll()} /><span>{messages.selectAll}</span></label>
      <span className="backlog-count" aria-live="polite">{count(selected.size)} {messages.selectedCount}</span>
    </div>}
    {items.length > 0 && <ul className="backlog-list">
      {items.map(item => {
        const hasLinks = linkUrls(item.title).length > 0, on = selected.has(item.id)
        return <li className="backlog-row" data-selected={on} key={item.id}>
          <label className="backlog-check"><input type="checkbox" aria-label={messages.selectItem(item.title)} checked={on} onChange={event => toggle(item, event.target.checked)} /></label>
          {hasLinks
            ? <div className="backlog-row-body"><LinkTitle text={item.title} onOpen={() => open(item.id)} /><small>{planned(item)}</small><LinkPreviews text={item.title} /></div>
            : <button type="button" className="backlog-row-body" onClick={() => open(item.id)}><span className="backlog-title">{item.title}</span><small>{planned(item)}</small></button>}
        </li>
      })}
    </ul>}
    {total > pageSize && <nav className="backlog-pages">
      <button type="button" className="button quiet" disabled={!offset} onClick={() => setOffset(offset - pageSize)}>{messages.previousPage}</button>
      <span>{count(offset + 1)}–{count(Math.min(offset + pageSize, total))} / {count(total)}</span>
      <button type="button" className="button quiet" disabled={offset + pageSize >= total} onClick={() => setOffset(offset + pageSize)}>{messages.nextPage}</button>
    </nav>}
    <footer className="modal-footer">
      <button type="button" className="button quiet" onClick={close}>{empty ? messages.close : messages.deferBacklog}</button>
      <span className="footer-spacer" />
      {!empty && <>
        <button type="button" className="button soft" disabled={busy || !selected.size} onClick={() => void arrange('later')}>{messages.moveLater}</button>
        <button type="button" className="button primary" disabled={busy || !selected.size} onClick={() => void arrange(horizon)}>{messages.arrangeCurrent}{horizonNames[horizon]}</button>
      </>}
    </footer>
  </Modal>
}
