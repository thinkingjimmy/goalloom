import { useEffect, useState } from 'react'
import type { Activity as ActivityPage } from '../../shared/contracts/history'
import { desktopApi } from '../lib/use-workspace'
import { activityNames } from './HistoryColumn'
import { Button } from './ui/button'
export function Activity({ itemId, revision }: { itemId: string; revision: number }) {
  const [page, setPage] = useState<ActivityPage>({ events: [], more: false }), [error, setError] = useState('')
  useEffect(() => {
    let active = true
    void desktopApi().getActivity({ type: 'activity', itemId, limit: 50 }).then(value => { if (active) setPage(value) }).catch(() => { if (active) setError('活动读取失败') })
    return () => { active = false }
  }, [itemId, revision])
  const more = async () => {
    try {
      const next = await desktopApi().getActivity({ type: 'activity', itemId, beforeSeq: page.events.at(-1)!.seq, limit: 50 })
      setPage({ events: [...page.events, ...next.events], more: next.more })
    } catch { setError('活动读取失败') }
  }
  return <section className="relations-section"><h3>活动</h3>{error && <p role="alert">{error}</p>}
    <ol className="activity-list">{page.events.map(event => <li key={event.id}><strong>{activityNames[event.type]}</strong><time dateTime={event.at}>{event.at.replace('T', ' ')}</time><span>{{ todo: '未完成', done: '已完成', cancelled: '已取消' }[event.after.status]} · {event.after.horizon === 'later' ? 'Later' : event.after.periodId?.split(':').slice(-2).join(' · ')}</span></li>)}</ol>
    {page.more && <Button variant="ghost" onClick={() => void more()}>更早活动</Button>}
  </section>
}
