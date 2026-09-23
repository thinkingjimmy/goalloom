/**
 * [INPUT]: 条目 ID、刷新版本与 desktopApi 活动分页读取。
 * [OUTPUT]: 默认折叠的活动区：一行摘要（数量与最近一次），展开后显示时间线与更早活动分页。
 * [POS]: items 详情的次要信息，仅在需要时查看；不参与任何写入。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { statusNames, messages } from '../../i18n/messages'
import { useEffect, useState } from 'react'
import type { Activity as ActivityPage } from '../../../shared/contracts/history'
import { desktopApi } from '../../state/use-workspace'
import { activityNames, horizonNames } from '../../i18n/messages'
import { Button } from '../../components/ui/button'
import { Icon } from '../../components/icons'
const stamp = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
export function Activity({ itemId, revision }: { itemId: string; revision: number }) {
  const [page, setPage] = useState<ActivityPage>({ events: [], more: false }), [error, setError] = useState(''), [open, setOpen] = useState(false)
  useEffect(() => {
    let active = true
    void desktopApi().getActivity({ type: 'activity', itemId, limit: 50 }).then(value => { if (active) setPage(value) }).catch(() => { if (active) setError(messages.activityFailed) })
    return () => { active = false }
  }, [itemId, revision])
  const more = async () => {
    try {
      const next = await desktopApi().getActivity({ type: 'activity', itemId, beforeSeq: page.events.at(-1)!.seq, limit: 50 })
      setPage({ events: [...page.events, ...next.events], more: next.more })
    } catch { setError(messages.activityFailed) }
  }
  const latest = page.events[0]
  return <section className="activity-section">
    <button type="button" className="activity-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon name="history" size={16} /><span>{messages.activity}</span><span className="activity-count">{page.events.length}{page.more ? '+' : ''}</span>
      <span className="activity-latest">{!open && latest && messages.latestActivity(activityNames[latest.type] ?? latest.type, stamp.format(new Date(latest.at)))}</span>
      <Icon name={open ? 'expand' : 'next'} size={14} />
    </button>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {open && <>
      <ol className="activity-list">{page.events.map(event => <li key={event.id}><strong>{activityNames[event.type]}</strong><time dateTime={event.at}>{stamp.format(new Date(event.at))}</time><span>{statusNames[event.after.status]} · {horizonNames[event.after.horizon]}{event.after.periodId ? ` · ${event.after.periodId.split(':').at(-1)}` : ''}</span></li>)}</ol>
      {page.more && <Button variant="ghost" onClick={() => void more()}>{messages.olderActivity}</Button>}
    </>}
  </section>
}
