/**
 * [INPUT]: List view, workspace revision/date, navigation and guarded restore action.
 * [OUTPUT]: Searchable paged summaries with offset clamping after removal or restore.
 * [POS]: Settings item browser; restoreItem remains an authoritative command.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useState } from 'react'
import type { ItemPage, ListView } from '../../../../shared/contracts/queries'
import { horizonNames, messages, statusNames, settingsMessages } from '../../../i18n'
import { desktopApi, type Action } from '../../../state/use-workspace'
import { Icon } from '../../../components/icons'
import { relativeDay } from './parts'

export type ItemsView = Exclude<ListView, 'search'>
const limit = 50

export function ItemsPane({ view, revision, timezone, today, disabled, select, submit }: { view: ItemsView; revision: number; timezone: string; today: string; disabled: boolean; select: (id: string) => void; submit: (action: Action) => Promise<unknown> }) {
  const [query, setQuery] = useState(''), [offset, setOffset] = useState(0)
  const [page, setPage] = useState<ItemPage | null>(null), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const timer = setTimeout(() => void desktopApi().listItems({ type: 'list', view, query, offset, limit })
      .then(value => {
        if (!active) return
        const lastOffset = Math.max(0, Math.ceil(value.total / limit) - 1) * limit
        if (offset > lastOffset) { setOffset(lastOffset); return }
        setPage(value); setError('')
      }).catch(() => { if (active) setError(messages.listFailed) }), query ? 180 : 0)
    return () => { active = false; clearTimeout(timer) }
  }, [view, query, offset, revision])
  const day = (instant: string | null) => instant ? relativeDay(instant, today, timezone, settingsMessages) : messages.unknownDate
  // Done/cancelled group by when they ended; archive and trash keep one flat card.
  const groups = new Map<string, NonNullable<typeof page>['items']>()
  for (const item of page?.items ?? []) {
    const heading = view === 'done' ? day(item.completedAt) : view === 'cancelled' ? day(item.cancelledAt) : ''
    groups.set(heading, [...groups.get(heading) ?? [], item])
  }
  // The done/cancelled views already say the status, so their rows only name the column.
  const meta = (item: NonNullable<typeof page>['items'][number]) => view === 'done' || view === 'cancelled'
    ? `${horizonNames[item.placement.horizon]}${item.archivedAt ? messages.archivedSuffix : ''}`
    : `${horizonNames[item.placement.horizon]} · ${statusNames[item.status]}${item.archivedAt ? messages.archivedSuffix : ''}`
  const total = page?.total ?? 0
  return <>
    {view === 'archived' && <p className="settings-footnote">{messages.archiveNote}</p>}
    <label className="items-search">
      <Icon name="search" size={14} />
      <input type="search" aria-label={messages.searchText} placeholder={messages.searchText} value={query} onChange={event => { setQuery(event.target.value); setOffset(0) }} />
      {page && <span className="tabular">{messages.itemCount(total)}</span>}
    </label>
    {error && <p className="settings-alert" role="alert">{error}</p>}
    {[...groups].map(([heading, items]) => <section key={heading || view} className="items-group">
      {heading && <h3>{heading}</h3>}
      <div className="settings-card">
        {items.map(item => <div key={item.id} className="items-row">
          <button type="button" className="items-open" onClick={() => select(item.id)}>
            {view !== 'trash' && <span className="items-mark" data-status={item.status} aria-hidden="true">{item.status === 'done' && <Icon name="check" size={12} strokeWidth={2.6} />}</span>}
            <span className="items-title">{item.title}</span>
            <span className="items-meta">{meta(item)}</span>
          </button>
          {view === 'trash' && <button type="button" className="settings-button" disabled={disabled} onClick={() => void submit({ type: 'restoreItem', itemId: item.id, expectedVersion: item.version })}><Icon name="refresh" size={14} />{messages.restoreItem}</button>}
        </div>)}
      </div>
    </section>)}
    {page && !total && <p className="settings-empty">{query.trim() ? messages.noResults : messages.emptyList}</p>}
    {view === 'trash' && page && total > 0 && <p className="settings-footnote">{settingsMessages.trashNote}</p>}
    {(total > limit || offset > 0) && <div className="items-pagination">
      <button type="button" className="settings-button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>{messages.previousPage}</button>
      <span className="tabular">{offset + 1}–{Math.min(offset + limit, total)} / {total}</span>
      <button type="button" className="settings-button" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>{messages.nextPage}</button>
    </div>}
  </>
}
