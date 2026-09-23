import { useEffect, useState } from 'react'
import type { PlanningPeriod } from '../../shared/contracts/entities'
import type { HistoryPage } from '../../shared/contracts/history'
import { desktopApi } from '../lib/use-workspace'
import { Button } from './ui/button'

export const activityNames: Record<string, string> = { created: '创建', baseline: '历史起点', moved: '移动', rolled_over: '顺延', status_changed: '状态变化', archived: '归档', unarchived: '解除归档', deleted: '删除', item_restored: '还原', undo: '撤销' }
export function HistoryColumn({ period, revision, select }: { period: PlanningPeriod; revision: number; select: (id: string) => void }) {
  const [page, setPage] = useState<HistoryPage | null>(null), [offset, setOffset] = useState(0), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void desktopApi().getHistory({ type: 'history', horizon: period.horizon, startDate: period.startDate, offset, limit: 50 }).then(value => { if (active) { setPage(value); setError('') } }).catch(() => { if (active) setError('历史读取失败，请返回当前后重试') })
    return () => { active = false }
  }, [period.id, revision, offset])
  return <div className="history-rows">
    <p className="field-note">历史只读 · 标题为当前内容，点击查看当前条目。</p>
    {error && <p role="alert">{error}</p>}
    {page?.rows.map(row => <button className="history-item" key={row.item.id} onClick={() => select(row.item.id)}>
      <strong>{row.item.title}</strong>
      <span>期末：{row.endState ? `${{ todo: '未完成', done: '已完成', cancelled: '已取消' }[row.endState.status]}${row.endState.archivedAt ? ' · 已归档' : ''}${row.endState.deletedAt ? ' · 已删除' : ''}${row.endState.periodId !== period.id ? ' · 已移出本期' : ''}` : '历史不完整，无法确认'}{row.anomalous ? '（时钟回拨）' : ''}</span>
      {row.laterCount > 0 && <small>后来：{row.later.map(event => activityNames[event.type]).join(' → ')}{row.laterCount > 5 ? ` · 共 ${row.laterCount} 次活动` : ''}</small>}
      <small>当前：{{ todo: '未完成', done: '已完成', cancelled: '已取消' }[row.item.status]}{row.item.deletedAt ? ' · 回收站' : ''}</small>
    </button>)}
    {page?.total === 0 && <p className="empty-column">这个周期没有安排过条目。</p>}
    {page && page.total > 50 && <div className="pagination"><Button variant="ghost" disabled={!offset} onClick={() => setOffset(offset - 50)}>上页</Button><span>{offset + 1}/{page.total}</span><Button variant="ghost" disabled={offset + 50 >= page.total} onClick={() => setOffset(offset + 50)}>下页</Button></div>}
  </div>
}
