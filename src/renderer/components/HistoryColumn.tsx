import { statusNames, messages, activityNames } from '../lib/messages'
import { useEffect, useState } from 'react'
import type { PlanningPeriod } from '../../shared/contracts/entities'
import type { HistoryPage } from '../../shared/contracts/history'
import { desktopApi } from '../lib/use-workspace'
import { Button } from './ui/button'

export function HistoryColumn({ period, revision, select }: { period: PlanningPeriod; revision: number; select: (id: string) => void }) {
  const [page, setPage] = useState<HistoryPage | null>(null), [offset, setOffset] = useState(0), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void desktopApi().getHistory({ type: 'history', horizon: period.horizon, startDate: period.startDate, offset, limit: 50 }).then(value => { if (active) { setPage(value); setError('') } }).catch(() => { if (active) setError(messages.historyFailed) })
    return () => { active = false }
  }, [period.id, revision, offset])
  return <div className="history-rows">
    <p className="field-note">{messages.historyReadOnly}</p>
    {error && <p role="alert">{error}</p>}
    {page?.rows.map(row => <button className="history-item" key={row.item.id} onClick={() => select(row.item.id)}>
      <strong>{row.item.title}</strong>
      <span>{messages.endState}{row.endState ? `${statusNames[row.endState.status]}${row.endState.archivedAt ? messages.archivedSuffix : ''}${row.endState.deletedAt ? messages.deletedSuffix : ''}${row.endState.periodId !== period.id ? messages.movedOutSuffix : ''}` : messages.historyUnknown}{row.anomalous ? messages.clockReversed : ''}</span>
      {row.laterCount > 0 && <small>{messages.laterOutcome}{row.later.map(event => activityNames[event.type]).join(' → ')}{row.laterCount > 5 ? messages.laterActivityCount(row.laterCount) : ''}</small>}
      <small>{messages.currentOutcome}{statusNames[row.item.status]}{row.item.deletedAt ? messages.trashSuffix : ''}</small>
    </button>)}
    {page?.total === 0 && <p className="empty-column">{messages.emptyHistory}</p>}
    {page && page.total > 50 && <div className="pagination"><Button variant="ghost" disabled={!offset} onClick={() => setOffset(offset - 50)}>{messages.previousShort}</Button><span>{offset + 1}/{page.total}</span><Button variant="ghost" disabled={offset + 50 >= page.total} onClick={() => setOffset(offset + 50)}>{messages.nextShort}</Button></div>}
  </div>
}
