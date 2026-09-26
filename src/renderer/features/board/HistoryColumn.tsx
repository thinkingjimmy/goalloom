/**
 * [INPUT]: 过去周期、工作区修订号、详情打开回调；主进程只读历史分页（含期末结果汇总）与往期索引。
 * [OUTPUT]: Read-only paged history with saved-text links, preview cards, outcome summaries and period navigation.
 *           PeriodPicker 列头周期标题与往期选择浮层。
 * [POS]: board 的历史视图，由 Board 列头的历史导航驱动；期末状态与当前内容分离，不提供编辑入口。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { horizonNames, statusNames, messages } from '../../i18n'
import { count } from '../../i18n/format'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import type { HistoryIndex, HistoryOutcome, HistoryPage } from '../../../shared/contracts/history'
import { desktopApi } from '../../state/use-workspace'
import { Button } from '../../components/ui/button'
import { Icon } from '../../components/icons'
import { Popover } from '../../components/Popover'
import { historyLabel } from './period-labels'
import { LinkTitle } from '../../components/links/LinkText'
import { LinkPreviews } from '../../components/links/LinkPreviews'
import { linkUrls } from '../../components/links/parse'

type Row = HistoryPage['rows'][number]
const pageSize = 50
// Bar and legend order; unknown rows stay out of the bar but keep their own group.
const segments = ['done', 'open', 'moved', 'cancelled'] as const

export interface HistoryState { page: HistoryPage | null; error: string; offset: number; setOffset: (offset: number) => void }

/** One page of a past period; a new revision refreshes in place, while a new period or page starts empty. */
export function useHistoryPage(period: PlanningPeriod | null, revision: number): HistoryState {
  const [loaded, setLoaded] = useState<{ key: string; page: HistoryPage | null; error: string }>({ key: '', page: null, error: '' })
  const [paging, setPaging] = useState({ periodId: '', offset: 0 })
  const offset = period && paging.periodId === period.id ? paging.offset : 0
  const key = period ? `${period.id}:${offset}` : ''
  useEffect(() => {
    if (!period) return
    let active = true
    void desktopApi().getHistory({ type: 'history', horizon: period.horizon, startDate: period.startDate, offset, limit: pageSize })
      .then(page => { if (active) setLoaded({ key, page, error: '' }) })
      .catch(() => { if (active) setLoaded({ key, page: null, error: messages.historyFailed }) })
    return () => { active = false }
  }, [key, revision])
  const fresh = loaded.key === key
  return { page: fresh ? loaded.page : null, error: fresh ? loaded.error : '', offset, setOffset: next => { if (period) setPaging({ periodId: period.id, offset: next }) } }
}

function EndMark({ outcome }: { outcome: HistoryOutcome }) {
  return <span className="history-mark" data-outcome={outcome} aria-hidden="true">
    {outcome === 'done' && <Icon name="check" size={12} strokeWidth={2.4} />}
    {outcome === 'cancelled' && <Icon name="close" size={12} strokeWidth={2.4} />}
  </span>
}

function HistoryRow({ row, select }: { row: Row; select: (id: string) => void }) {
  const { item, endState: end, outcome } = row
  const changed = !end || item.status !== end.status || !!item.deletedAt !== !!end.deletedAt
  const notes = [end?.archivedAt && messages.archivedTag, end?.deletedAt && messages.deletedTag,
    changed && `${messages.nowState}${statusNames[item.status]}${item.deletedAt ? messages.trashSuffix : ''}`].filter(Boolean)
  if (linkUrls(item.title).length) return <article className="history-item history-item-links" data-outcome={outcome}>
    <EndMark outcome={outcome} />
    <div className="history-body">
      <LinkTitle className="history-title" text={item.title} onOpen={() => select(item.id)} />
      {notes.length > 0 && <span className="history-notes">{notes.join(' · ')}</span>}
      <LinkPreviews text={item.title} />
    </div>
    {outcome === 'moved' && end && <span className="history-to" title={messages.movedTo(horizonNames[end.horizon])}><Icon name="forward" size={12} strokeWidth={2} />{horizonNames[end.horizon]}</span>}
    {row.anomalous && <span className="history-clock" title={messages.clockTag}><Icon name="warning" size={14} /><span className="sr-only">{messages.clockTag}</span></span>}
  </article>
  return <button className="history-item" data-outcome={outcome} onClick={() => select(item.id)}>
    <EndMark outcome={outcome} />
    <span className="history-body">
      <span className="history-title">{item.title}</span>
      {notes.length > 0 && <span className="history-notes">{notes.join(' · ')}</span>}
    </span>
    {outcome === 'moved' && end && <span className="history-to" title={messages.movedTo(horizonNames[end.horizon])}><Icon name="forward" size={12} strokeWidth={2} />{horizonNames[end.horizon]}</span>}
    {row.anomalous && <span className="history-clock" title={messages.clockTag}><Icon name="warning" size={14} /><span className="sr-only">{messages.clockTag}</span></span>}
  </button>
}

function Summary({ page }: { page: HistoryPage | null }) {
  const total = page?.total ?? 0
  return <div className="history-summary">
    <p className="history-headline">
      {total > 0 && <strong className="tabular">{messages.historyDone(count(page!.summary.done), count(total))}</strong>}
      <span className="history-lock"><Icon name="lock" size={12} />{messages.readOnly}</span>
    </p>
    {total > 0 && <>
      <div className="history-bar" aria-hidden="true">
        {segments.filter(outcome => page!.summary[outcome]).map(outcome => <span key={outcome} data-outcome={outcome} style={{ flexGrow: page!.summary[outcome] } as CSSProperties} />)}
      </div>
      <p className="history-legend">
        {segments.filter(outcome => page!.summary[outcome]).map(outcome => <span key={outcome} data-outcome={outcome}>{messages.outcomes[outcome]} <span className="tabular">{count(page!.summary[outcome])}</span></span>)}
      </p>
    </>}
  </div>
}

/** Rows arrive sorted by outcome; consecutive runs become the visible groups of this page. */
function groups(rows: Row[]): { outcome: HistoryOutcome; rows: Row[] }[] {
  const result: { outcome: HistoryOutcome; rows: Row[] }[] = []
  for (const row of rows) {
    if (result.at(-1)?.outcome === row.outcome) result.at(-1)!.rows.push(row)
    else result.push({ outcome: row.outcome, rows: [row] })
  }
  return result
}

export function HistoryColumn({ history, select, onEarlier }: { history: HistoryState; select: (id: string) => void; onEarlier: (() => void) | null }) {
  const { page, error, offset, setOffset } = history
  const last = page ? offset + pageSize >= page.total : false
  return <div className="history-rows">
    <Summary page={page} />
    {error && <p className="inline-error" role="alert">{error}</p>}
    {groups(page?.rows ?? []).map(group => <section key={group.outcome} className="history-group" aria-label={messages.outcomes[group.outcome]}>
      <h3 className="history-group-title">{messages.outcomes[group.outcome]} · <span className="tabular">{count(page!.summary[group.outcome])}</span></h3>
      {group.rows.map(row => <HistoryRow key={row.item.id} row={row} select={select} />)}
    </section>)}
    {page?.total === 0 && <div className="history-empty">
      <p>{messages.emptyHistory}</p>
      {onEarlier && <button type="button" className="settings-button" onClick={onEarlier}>{messages.earlierPeriod}</button>}
    </div>}
    {page && !page.previous && last && <p className="history-end">{messages.noEarlier}</p>}
    {page && page.total > pageSize && <div className="pagination"><Button variant="ghost" disabled={!offset} onClick={() => setOffset(offset - pageSize)}>{messages.previousShort}</Button><span className="tabular">{offset + 1}/{page.total}</span><Button variant="ghost" disabled={last} onClick={() => setOffset(offset + pageSize)}>{messages.nextShort}</Button></div>}
  </div>
}

/** The period title in a history header; it opens recent past periods of this column with their completion, plus the way back to current. */
export function PeriodPicker({ period, revision, onPick }: { period: PlanningPeriod; revision: number; onPick: (period: PlanningPeriod | null) => void }) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState<HistoryIndex | null>(null)
  const horizon = period.horizon
  useEffect(() => {
    if (!open) return
    let active = true
    void desktopApi().getHistoryIndex(horizon).then(value => { if (active) setIndex(value) }).catch(() => { if (active) setIndex({ periods: [] }) })
    return () => { active = false }
  }, [open, horizon, revision])
  const close = useCallback(() => setOpen(false), [])
  const pick = (next: PlanningPeriod | null) => { setOpen(false); onPick(next) }
  const label = messages.choosePeriod(horizonNames[horizon])
  return <Popover floating open={open} onClose={close} anchor={
    <button type="button" className="period-title" aria-haspopup="menu" aria-expanded={open} title={label} onClick={() => setOpen(!open)}>
      <span className="tabular">{historyLabel(horizon, period)}</span><Icon name="expand" size={12} strokeWidth={2} />
    </button>
  }>
    <div className="menu period-menu" role="menu" aria-label={label}>
      <button type="button" role="menuitemradio" aria-checked="false" className="menu-item" onClick={() => pick(null)}>
        <span className="menu-text">{horizonNames[horizon]}</span><span className="menu-hint">{messages.inProgress}</span>
      </button>
      {index && index.periods.length > 0 && <div className="menu-separator" />}
      {index?.periods.map(entry => <button key={entry.period.id} type="button" role="menuitemradio" aria-checked={entry.period.id === period.id} className="menu-item period-option" onClick={() => pick(entry.period)}>
        <span className="period-option-label tabular">{historyLabel(horizon, entry.period)}</span>
        <span className="period-option-bar" aria-hidden="true"><span style={{ width: `${entry.done / entry.total * 100}%` }} /></span>
        <span className="menu-hint tabular">{count(entry.done)}/{count(entry.total)}</span>
      </button>)}
    </div>
  </Popover>
}
