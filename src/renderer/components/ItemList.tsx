import { useEffect, useState } from 'react'
import type { Query, ItemPage } from '../../shared/contracts/queries'
import { desktopApi } from '../lib/use-workspace'
import { Button } from './ui/button'
import { horizonNames } from './ItemDetail'

export type ListView = Extract<Query, { type: 'list' }>['view']
export const viewNames = { board: '时间看板', search: '搜索', done: '已完成', cancelled: '已取消', archived: '归档', trash: '回收站', backlog: '往期未完成' }
export function ItemList({ view, revision, select, timezone }: { view: ListView; revision: number; select: (id: string) => void; timezone: string }) {
  const [query, setQuery] = useState(''), [offset, setOffset] = useState(0)
  const [page, setPage] = useState<ItemPage>({ items: [], total: 0 }), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view, query, offset, limit: 50 }).then(value => { if (active) { setPage(value); setError('') } }).catch(() => { if (active) setError('无法读取列表，请重试') }), view === 'search' ? 180 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [view, query, offset, revision])
  let previousGroup = ''
  return <main className="list-page" aria-label={viewNames[view]}>
    <h1>{viewNames[view]}</h1>
    <label>搜索标题或说明<input autoFocus={view === 'search'} type="search" value={query} onChange={event => { setQuery(event.target.value); setOffset(0) }} placeholder="支持一个字、两个字和中英混合" /></label>
    {error && <p role="alert">{error}</p>}
    <p className="field-note">{view === 'trash' ? '还原保持原状态和位置，尝试找回本次删除失效的关联。' : view === 'archived' ? '归档只影响可见性，完成状态和关联保持不变。' : `${page.total} 个条目`}</p>
    {page.items.map(item => {
      const time = view === 'done' ? item.completedAt : view === 'cancelled' ? item.cancelledAt : null
      const group = ['done', 'cancelled'].includes(view) ? time ? new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time)) : '日期未记录' : ''
      const heading = group !== previousGroup ? group : ''; previousGroup = group
      return <div key={item.id}>{heading && <h2 className="date-group">{heading}</h2>}<button className="list-item" onClick={() => select(item.id)}><strong>{item.title}</strong><span>{horizonNames[item.placement.horizon]} · {{ todo: '未完成', done: '已完成', cancelled: '已取消' }[item.status]}{item.archivedAt ? ' · 已归档' : ''}</span></button></div>
    })}
    {!page.items.length && <p className="empty-column">{view === 'search' && !query.trim() ? '输入关键词，查找你的条目。' : '这里暂时没有条目。'}</p>}
    <div className="pagination"><Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>上一页</Button><span>{page.total ? `${offset + 1}–${Math.min(offset + 50, page.total)} / ${page.total}` : '0'}</span><Button variant="outline" disabled={offset + 50 >= page.total} onClick={() => setOffset(offset + 50)}>下一页</Button></div>
  </main>
}
