/**
 * [INPUT]: Summary pages of overdue items, current periods and guarded batch actions.
 * [OUTPUT]: Read-only selection and explicit current-period arrangement requests.
 * [POS]: Board backlog dialog; storage revalidates membership, versions and holds.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { messages, horizonNames } from '../../i18n'
import { useEffect, useState } from 'react'
import type { ItemSummary, ItemHorizon } from '../../../shared/contracts/entities'
import type { ItemPage } from '../../../shared/contracts/queries'
import { desktopApi, type Action } from '../../state/use-workspace'
import { Modal } from '../../components/Modal'
import { Button } from '../../components/ui/button'

export function Backlog({ horizon, revision, submit, busy, close, select }: { horizon: ItemHorizon; revision: number; submit: (action: Action) => Promise<unknown>; busy: boolean; close: () => void; select: (id: string) => void }) {
  const [page, setPage] = useState<ItemPage>({ items: [], total: 0 }), [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Map<string, ItemSummary>>(new Map()), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void desktopApi().listItems({ type: 'list', view: 'backlog', horizon, query: '', offset, limit: 50 }).then(value => { if (active) setPage(value) }).catch(() => { if (active) setError(messages.backlogFailed) })
    return () => { active = false }
  }, [horizon, revision, offset])
  const arrange = async (target: ItemHorizon) => {
    const result = await submit({ type: 'arrangeBacklog', horizon: target, items: [...selected.values()].map(item => ({ itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version })) })
    if (result) { setSelected(new Map()); setOffset(0) }
  }
  return <Modal title={messages.backlogTitle(horizonNames[horizon])} close={close} wide>
    <p className="field-note">{page.total}  {messages.backlogNote}</p>
    {error && <p role="alert">{error}</p>}
    <div className="detail-actions"><Button variant="outline" disabled={busy || !selected.size} onClick={() => void arrange(horizon)}>{messages.arrangeCurrent}{horizonNames[horizon]}</Button><Button variant="outline" disabled={busy || !selected.size} onClick={() => void arrange('later')}>{messages.moveLater}</Button><Button variant="ghost" onClick={() => setSelected(new Map(page.items.map(item => [item.id, item])))}>{messages.selectPage}</Button></div>
    {page.items.map(item => <div className="backlog-row" key={item.id}><input type="checkbox" aria-label={messages.selectItem(item.title)} checked={selected.has(item.id)} onChange={event => setSelected(previous => { const next = new Map(previous); if (event.target.checked) next.set(item.id, item); else next.delete(item.id); return next })} /><button onClick={() => { close(); select(item.id) }}>{item.title}<small>{messages.originalPlan} {item.placement.periodId?.split(':').at(-1)}</small></button></div>)}
    <div className="pagination"><Button variant="ghost" disabled={!offset} onClick={() => setOffset(offset - 50)}>{messages.previousPage}</Button><span>{selected.size}  {messages.selectedCount}</span><Button variant="ghost" disabled={offset + 50 >= page.total} onClick={() => setOffset(offset + 50)}>{messages.nextPage}</Button></div>
    <Button variant="outline" onClick={close}>{messages.deferBacklog}</Button>
  </Modal>
}
