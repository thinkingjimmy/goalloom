/**
 * [INPUT]: Selected closed period, workspace generation/revision, live task pages and guarded item actions.
 * [OUTPUT]: Always-expanded live groups with completion/reopening, restore, detail editing, focus retention and bounded paging.
 * [POS]: Past-period task view; edits real items through existing commands while history projections remain immutable.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import type { PastPeriodPage } from '../../../shared/contracts/history'
import { messages } from '../../i18n'
import { count } from '../../i18n/format'
import { desktopApi, type Action } from '../../state/use-workspace'
import { Button } from '../../components/ui/button'
import { Icon } from '../../components/icons'
import { LinkTitle } from '../../components/links/LinkText'
import { LinkPreviews } from '../../components/links/LinkPreviews'
import { linkUrls } from '../../components/links/parse'

const pageSize = 50

export function usePastPeriod(period: PlanningPeriod | null, generation: string, revision: number) {
  const [loaded, setLoaded] = useState<{ key: string; request: string; page: PastPeriodPage | null; failed: boolean }>({ key: '', request: '', page: null, failed: false })
  const [paging, setPaging] = useState({ periodId: '', offset: 0 })
  const [attempt, setAttempt] = useState(0)
  const offset = period && paging.periodId === period.id ? paging.offset : 0
  const key = period ? `${generation}:${period.id}:${offset}` : ''
  const request = `past:${key}:${revision}:${attempt}`
  useEffect(() => {
    if (!period || loaded.request === request) return
    let active = true
    void desktopApi().getPastPeriod({ type: 'pastPeriod', generation, horizon: period.horizon, startDate: period.startDate, offset, limit: pageSize })
      .then(page => {
        if (!active || page.generation !== generation || page.revision < revision) return
        const pageKey = `${generation}:${period.id}:${page.offset}`
        setLoaded({ key: pageKey, request: `past:${pageKey}:${revision}:${attempt}`, page, failed: false })
        if (page.offset !== offset) setPaging({ periodId: period.id, offset: page.offset })
      })
      .catch(() => { if (active) setLoaded({ key, request, page: null, failed: true }) })
    return () => { active = false }
  }, [request])
  return {
    page: loaded.key === key ? loaded.page : null,
    loading: !!period && loaded.request !== request,
    failed: loaded.request === request && loaded.failed,
    offset: loaded.key === key ? loaded.page?.offset ?? offset : offset,
    setOffset: (next: number) => { if (period) setPaging({ periodId: period.id, offset: next }) },
    retry: () => setAttempt(value => value + 1),
  }
}

type PeriodOutcome = 'done' | 'open' | 'deleted'
const outcomeOf = (item: ItemSummary): PeriodOutcome => item.deletedAt ? 'deleted' : item.status === 'done' ? 'done' : 'open'

function PastRow({ item, outcome, disabled, select, act }: { item: ItemSummary; outcome: PeriodOutcome; disabled: boolean; select: (id: string) => void; act: (item: ItemSummary, control: HTMLElement) => void }) {
  const done = outcome === 'done'
  const hasLinks = linkUrls(item.title).length > 0
  return <article id={`item-${item.id}`} className="task-row past-period-row" data-item-id={item.id} data-past-item-id={item.id} data-done={done} data-outcome={outcome}>
    {outcome === 'deleted' ? <span className="check" role="img" aria-label={messages.periodOutcomes.deleted}><Icon name="close" size={12} /></span> : <button className="check" data-state-action data-checked={done} aria-disabled={disabled}
      aria-label={`${done ? messages.reopen : messages.complete} ${item.title}`} onClick={event => act(item, event.currentTarget)}>
      {done && <Icon name="check" size={12} strokeWidth={2.5} />}
    </button>}
    <div className="task-content">
      <div className="task-line">
        {hasLinks ? <LinkTitle text={item.title} onOpen={() => select(item.id)} /> : <button className="task-title" title={item.title} onClick={() => select(item.id)}><span>{item.title}</span></button>}
      </div>
      {hasLinks && <LinkPreviews text={item.title} />}
    </div>
    {outcome === 'deleted' && <button className="text-button past-period-restore" data-state-action aria-disabled={disabled} onClick={event => act(item, event.currentTarget)}>{messages.restoreItem}</button>}
  </article>
}

export function PastPeriod({ history, select, submit, busy }: { history: ReturnType<typeof usePastPeriod>; select: (id: string) => void; submit: (action: Action) => Promise<unknown>; busy: boolean }) {
  const { page, loading, failed, offset, setOffset, retry } = history
  const root = useRef<HTMLDivElement | null>(null), focus = useRef<{ id: string; control: HTMLElement } | null>(null)
  const disabled = busy || loading || failed
  const act = (item: ItemSummary, control: HTMLElement) => {
    if (disabled) return
    if (control === document.activeElement) focus.current = { id: item.id, control }
    const action: Action = item.deletedAt ? { type: 'restoreItem', itemId: item.id, expectedVersion: item.version }
      : { type: 'status', itemId: item.id, expectedVersion: item.version, status: item.status === 'done' ? 'todo' : 'done' }
    void submit(action).then(result => { if (!result) focus.current = null })
  }
  useLayoutEffect(() => {
    const pending = focus.current
    if (!pending || disabled) return
    if (document.activeElement === pending.control || document.activeElement === document.body) {
      const target = root.current?.querySelector<HTMLElement>(`[data-past-item-id="${pending.id}"] [data-state-action]`)
        ?? root.current?.closest('.board-column')?.querySelector<HTMLElement>('.period-title')
      target?.focus({ preventScroll: true })
    }
    focus.current = null
  }, [page, disabled])
  const items = page?.items ?? []
  const groups = { open: items.filter(item => outcomeOf(item) === 'open'), done: items.filter(item => outcomeOf(item) === 'done'), deleted: items.filter(item => outcomeOf(item) === 'deleted') }
  return <div className="past-period-rows" ref={root}>
    {loading && !page && <p className="period-loading" role="status">{messages.loadingPeriod}</p>}
    {failed && <p className="inline-error" role="alert">{messages.planningLoadFailed} <button className="text-button" onClick={retry}>{messages.retryPeriod}</button></p>}
    {(['open', 'done', 'deleted'] as const).map(outcome => groups[outcome].length > 0 && <section className="past-period-group" data-outcome={outcome} aria-label={messages.periodOutcomes[outcome]} key={outcome}>
      <h3>{messages.periodOutcomes[outcome]} <span>{count(groups[outcome].length)}</span></h3>
      {groups[outcome].map(item => <PastRow key={item.id} item={item} outcome={outcome} disabled={disabled} select={select} act={act} />)}
    </section>)}
    {page?.total === 0 && <div className="empty-column"><Icon name="empty" size={44} strokeWidth={1.1} /><p>{messages.emptyHistory}</p></div>}
    {page && page.total > pageSize && <div className="pagination">
      <Button variant="ghost" disabled={!offset || loading} onClick={() => setOffset(offset - pageSize)}>{messages.previousShort}</Button>
      <span className="tabular">{count(offset + 1)}–{count(Math.min(offset + pageSize, page.total))}/{count(page.total)}</span>
      <Button variant="ghost" disabled={offset + pageSize >= page.total || loading} onClick={() => setOffset(offset + pageSize)}>{messages.nextShort}</Button>
    </div>}
  </div>
}
