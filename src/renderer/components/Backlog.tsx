import { useEffect, useState } from 'react'
import type { Item, ItemHorizon } from '../../shared/contracts/entities'
import type { ItemPage } from '../../shared/contracts/queries'
import { desktopApi, type Action } from '../lib/use-workspace'
import { Modal } from './Modal'
import { Button } from './ui/button'
import { horizonNames } from './ItemDetail'

export function Backlog({ horizon, revision, submit, busy, close, select }: { horizon: ItemHorizon; revision: number; submit: (action: Action) => Promise<unknown>; busy: boolean; close: () => void; select: (id: string) => void }) {
  const [page, setPage] = useState<ItemPage>({ items: [], total: 0 }), [offset, setOffset] = useState(0)
  const [selected, setSelected] = useState<Map<string, Item>>(new Map()), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void desktopApi().listItems({ type: 'list', view: 'backlog', horizon, query: '', offset, limit: 50 }).then(value => { if (active) setPage(value) }).catch(() => { if (active) setError('读取往期条目失败') })
    return () => { active = false }
  }, [horizon, revision, offset])
  const arrange = async (target: ItemHorizon) => {
    const result = await submit({ type: 'arrangeBacklog', horizon: target, items: [...selected.values()].map(item => ({ itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version })) })
    if (result) { setSelected(new Map()); setOffset(0) }
  }
  return <Modal title={`${horizonNames[horizon]} · 往期未完成`} close={close} wide>
    <p className="field-note">{page.total} 项仍保留原来的日期。暂不处理只关闭面板；系统不会自动归档或删除。</p>
    {error && <p role="alert">{error}</p>}
    <div className="detail-actions"><Button variant="outline" disabled={busy || !selected.size} onClick={() => void arrange(horizon)}>安排到当前{horizonNames[horizon]}</Button><Button variant="outline" disabled={busy || !selected.size} onClick={() => void arrange('later')}>移到 Later</Button><Button variant="ghost" onClick={() => setSelected(new Map(page.items.map(item => [item.id, item])))}>选择本页</Button></div>
    {page.items.map(item => <div className="backlog-row" key={item.id}><input type="checkbox" aria-label={`选择 ${item.title}`} checked={selected.has(item.id)} onChange={event => setSelected(previous => { const next = new Map(previous); if (event.target.checked) next.set(item.id, item); else next.delete(item.id); return next })} /><button onClick={() => { close(); select(item.id) }}>{item.title}<small>原计划 {item.placement.periodId?.split(':').at(-1)}</small></button></div>)}
    <div className="pagination"><Button variant="ghost" disabled={!offset} onClick={() => setOffset(offset - 50)}>上一页</Button><span>{selected.size} 项已选择</span><Button variant="ghost" disabled={offset + 50 >= page.total} onClick={() => setOffset(offset + 50)}>下一页</Button></div>
    <Button variant="outline" onClick={close}>暂不处理</Button>
  </Modal>
}
