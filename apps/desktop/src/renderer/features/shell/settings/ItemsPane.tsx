/**
 * [INPUT]: List view, workspace revision/date, navigation and guarded restore action.
 * [OUTPUT]: Searchable saved-text links/previews and paged summaries with offset clamping after removal or restore.
 * [POS]: Settings item browser; restoreItem remains an authoritative command.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { IconButton, SettingsButton } from '../../../components/ui/button'
import { Input } from '../../../components/ui/fields'
import { cn } from '../../../lib/utils'
import { useEffect, useState } from 'react'
import type { ItemPage, ListView } from '../../../../shared/contracts/queries'
import { horizonNames, messages, statusNames, settingsMessages } from '../../../i18n'
import { desktopApi, type Action } from '../../../state/use-workspace'
import { Icon } from '../../../components/icons'
import { relativeDay } from './parts'
import { LinkTitle } from '../../../components/links/LinkText'
import { LinkPreviews } from '../../../components/links/LinkPreviews'
import { linkUrls } from '../../../components/links/parse'

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
    <label className="items-search shrink-0 h-9 m-0 px-3 py-0 flex items-center gap-2 rounded-[9px] bg-raised text-muted-foreground text-[13px] font-normal">
      <Icon name="search" size={14} />
      <Input type="search" aria-label={messages.searchText} placeholder={messages.searchText} value={query} onChange={event => { setQuery(event.target.value); setOffset(0) }} />
      {page && <span className="tabular">{messages.itemCount(total)}</span>}
    </label>
    {error && <div className="settings-alert m-0 flex items-start gap-2 px-3.5 py-2.5 rounded-[10px] bg-destructive-tint text-destructive text-[12.5px] leading-[1.6]" role="alert"><span>{error}</span><IconButton size="small" type="button" aria-label={messages.dismissNotice} onClick={() => setError('')}><Icon name="close" size={16} /></IconButton></div>}
    {[...groups].map(([heading, items]) => <section key={heading || view} className="items-group flex flex-col gap-1.5">
      {heading && <h3>{heading}</h3>}
      <div className={cn(cn('settings-card', 'flex flex-col bg-raised rounded-[12px]'), 'rounded-settings-card shadow-settings-card')}>
        {items.map(item => {
          const hasLinks = linkUrls(item.title).length > 0
          return <div key={item.id} className={cn(`items-row${hasLinks ? ' items-row-links' : ''}`, 'min-h-11.5 pt-0 pr-3 pb-0 pl-0 flex items-center gap-3')}>
          {hasLinks ? <div className="items-link-content">
            <div className="items-link-heading">
              {view !== 'trash' && <span className="items-mark" data-status={item.status} aria-hidden="true">{item.status === 'done' && <Icon name="check" size={12} strokeWidth={2.6} />}</span>}
              <LinkTitle className="items-title flex-1 min-w-0 text-[14px] text-soft [overflow-wrap:anywhere]" text={item.title} onOpen={() => select(item.id)} />
              <span className="items-meta shrink-0 text-[12px] text-muted-foreground">{meta(item)}</span>
            </div>
            <LinkPreviews text={item.title} />
          </div> : <button type="button" className="items-open flex-1 min-w-0 self-stretch pt-2 pr-0 pb-2 pl-4.5 flex items-center gap-3 text-left rounded-[11px]" onClick={() => select(item.id)}>
            {view !== 'trash' && <span className="items-mark" data-status={item.status} aria-hidden="true">{item.status === 'done' && <Icon name="check" size={12} strokeWidth={2.6} />}</span>}
            <span className="items-title flex-1 min-w-0 text-[14px] text-soft [overflow-wrap:anywhere]">{item.title}</span>
            <span className="items-meta shrink-0 text-[12px] text-muted-foreground">{meta(item)}</span>
          </button>}
          {view === 'trash' && <SettingsButton type="button" disabled={disabled} onClick={() => void submit({ type: 'restoreItem', itemId: item.id, expectedVersion: item.version })}><Icon name="refresh" size={14} />{messages.restoreItem}</SettingsButton>}
        </div>})}
      </div>
    </section>)}
    {page && !total && <p className="settings-empty mx-0 my-6 text-center text-[13px] text-muted-foreground">{query.trim() ? messages.noResults : messages.emptyList}</p>}
    {(total > limit || offset > 0) && <div className="items-pagination flex items-center justify-center gap-3 text-[12px] text-muted-foreground">
      <SettingsButton type="button" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))}>{messages.previousPage}</SettingsButton>
      <span className="tabular">{offset + 1}–{Math.min(offset + limit, total)} / {total}</span>
      <SettingsButton type="button" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>{messages.nextPage}</SettingsButton>
    </div>}
  </>
}
