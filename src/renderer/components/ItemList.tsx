import { statusNames, messages, viewNames } from '../lib/messages'
import { useEffect, useState } from 'react'
import type { Query, ItemPage } from '../../shared/contracts/queries'
import { desktopApi } from '../lib/use-workspace'
import { Button } from './ui/button'
import { horizonNames } from '../lib/messages'

export type ListView = Extract<Query, { type: 'list' }>['view']
export function ItemList({ view, revision, select, timezone }: { view: ListView; revision: number; select: (id: string) => void; timezone: string }) {
  const [query, setQuery] = useState(''), [offset, setOffset] = useState(0)
  const [page, setPage] = useState<ItemPage>({ items: [], total: 0 }), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view, query, offset, limit: 50 }).then(value => { if (active) { setPage(value); setError('') } }).catch(() => { if (active) setError(messages.listFailed) }), view === 'search' ? 180 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [view, query, offset, revision])
  let previousGroup = ''
  return <main className="list-page" aria-label={viewNames[view]}>
    <h1>{viewNames[view]}</h1>
    <label>{messages.searchText}<input autoFocus={view === 'search'} type="search" value={query} onChange={event => { setQuery(event.target.value); setOffset(0) }} placeholder={messages.searchHint} /></label>
    {error && <p role="alert">{error}</p>}
    <p className="field-note">{view === 'trash' ? messages.restoreNote : view === 'archived' ? messages.archiveNote : messages.itemCount(page.total)}</p>
    {page.items.map(item => {
      const time = view === 'done' ? item.completedAt : view === 'cancelled' ? item.cancelledAt : null
      const group = ['done', 'cancelled'].includes(view) ? time ? new Intl.DateTimeFormat('zh-CN', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(time)) : messages.unknownDate : ''
      const heading = group !== previousGroup ? group : ''; previousGroup = group
      return <div key={item.id}>{heading && <h2 className="date-group">{heading}</h2>}<button className="list-item" onClick={() => select(item.id)}><strong>{item.title}</strong><span>{horizonNames[item.placement.horizon]} · {statusNames[item.status]}{item.archivedAt ? messages.archivedSuffix : ''}</span></button></div>
    })}
    {!page.items.length && <p className="empty-column">{view === 'search' && !query.trim() ? messages.emptySearch : messages.emptyList}</p>}
    <div className="pagination"><Button variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>{messages.previousPage}</Button><span>{page.total ? `${offset + 1}–${Math.min(offset + 50, page.total)} / ${page.total}` : '0'}</span><Button variant="outline" disabled={offset + 50 >= page.total} onClick={() => setOffset(offset + 50)}>{messages.nextPage}</Button></div>
  </main>
}
