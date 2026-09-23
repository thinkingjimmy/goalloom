/**
 * [INPUT]: 过去周期、工作区修订号、详情打开回调；主进程只读历史分页。
 * [OUTPUT]: 只读历史列：锁定提示与条目数、期末状态标记 + 标签（移出/归档/删除/时钟回拨）、仅在变化时显示的当前状态、分页。
 * [POS]: board 的历史视图，由 Board 列头的周期切换条驱动；期末状态与当前内容分离，不提供编辑入口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { horizonNames, statusNames, messages } from '../../i18n/messages'
import { useEffect, useState } from 'react'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import type { HistoryPage } from '../../../shared/contracts/history'
import { desktopApi } from '../../state/use-workspace'
import { Button } from '../../components/ui/button'
import { Icon } from '../../components/icons'

type Row = HistoryPage['rows'][number]

function EndMark({ status }: { status: Row['item']['status'] | null }) {
  return <span className="history-mark" data-status={status ?? 'unknown'} aria-hidden="true">
    {status === 'done' && <Icon name="check" size={12} strokeWidth={2.4} />}
    {status === 'cancelled' && <Icon name="close" size={12} strokeWidth={2.4} />}
  </span>
}

function HistoryRow({ row, period, select }: { row: Row; period: PlanningPeriod; select: (id: string) => void }) {
  const { item, endState: end } = row
  const changed = !end || item.status !== end.status || !!item.deletedAt !== !!end.deletedAt
  return <button className="history-item" onClick={() => select(item.id)}>
    <EndMark status={end?.status ?? null} />
    <span className="history-body">
      <span className="history-title">{item.title}</span>
      <span className="history-tags">
        <span className="history-tag" data-tone={end?.status ?? 'unknown'}>{end ? statusNames[end.status] : messages.historyUnknown}</span>
        {end && end.periodId !== period.id && <span className="history-tag" data-tone="moved">{messages.movedTo(horizonNames[end.horizon])}</span>}
        {end?.archivedAt && <span className="history-tag">{messages.archivedTag}</span>}
        {end?.deletedAt && <span className="history-tag">{messages.deletedTag}</span>}
        {row.anomalous && <span className="history-tag" data-tone="warning">{messages.clockTag}</span>}
        {changed && <span className="history-now">{messages.nowState}{statusNames[item.status]}{item.deletedAt ? messages.trashSuffix : ''}</span>}
      </span>
    </span>
  </button>
}

export function HistoryColumn({ period, revision, select }: { period: PlanningPeriod; revision: number; select: (id: string) => void }) {
  const [page, setPage] = useState<HistoryPage | null>(null), [offset, setOffset] = useState(0), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void desktopApi().getHistory({ type: 'history', horizon: period.horizon, startDate: period.startDate, offset, limit: 50 }).then(value => { if (active) { setPage(value); setError('') } }).catch(() => { if (active) setError(messages.historyFailed) })
    return () => { active = false }
  }, [period.id, revision, offset])
  return <div className="history-rows">
    <p className="history-meta"><Icon name="lock" size={12} />{page?.total ? messages.historyMeta(page.total) : messages.readOnly}</p>
    {error && <p role="alert">{error}</p>}
    {page?.rows.map(row => <HistoryRow key={row.item.id} row={row} period={period} select={select} />)}
    {page?.total === 0 && <p className="empty-column">{messages.emptyHistory}</p>}
    {page && page.total > 50 && <div className="pagination"><Button variant="ghost" disabled={!offset} onClick={() => setOffset(offset - 50)}>{messages.previousShort}</Button><span>{offset + 1}/{page.total}</span><Button variant="ghost" disabled={offset + 50 >= page.total} onClick={() => setOffset(offset + 50)}>{messages.nextShort}</Button></div>}
  </div>
}
