/**
 * [INPUT]: Item identity/revision and summary/paged activity queries.
 * [OUTPUT]: Collapsed count/latest summary and lazily loaded event pages.
 * [POS]: Secondary detail view without business writes or eager full history.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { statusNames, messages, activityNames, horizonNames } from '../../i18n'
import { stamp } from '../../i18n/format'
import { useEffect, useState } from 'react'
import type { ActivitySummary } from '../../../shared/contracts/queries'
import type { Activity as ActivityPage } from '../../../shared/contracts/history'
import { desktopApi } from '../../state/use-workspace'
import { Button } from '../../components/ui/button'
import { Icon } from '../../components/icons'
export function Activity({ itemId, revision }: { itemId: string; revision: number }) {
  const [page, setPage] = useState<ActivityPage>({ events: [], more: false }), [error, setError] = useState(''), [open, setOpen] = useState(false)
  const [summary, setSummary] = useState<ActivitySummary>({ total: 0, latest: null })
  useEffect(() => {
    let active = true
    void desktopApi().getActivitySummary(itemId).then(value => { if (active) setSummary(value) }).catch(() => { if (active) setError(messages.activityFailed) })
    return () => { active = false }
  }, [itemId, revision])
  useEffect(() => {
    if (!open) { setPage({ events: [], more: false }); return }
    let active = true
    void desktopApi().getActivity({ type: 'activity', itemId, limit: 50 }).then(value => { if (active) setPage(value) }).catch(() => { if (active) setError(messages.activityFailed) })
    return () => { active = false }
  }, [itemId, revision, open])
  const more = async () => {
    try {
      const next = await desktopApi().getActivity({ type: 'activity', itemId, beforeSeq: page.events.at(-1)!.seq, limit: 50 })
      setPage({ events: [...page.events, ...next.events], more: next.more })
    } catch { setError(messages.activityFailed) }
  }
  const latest = summary.latest
  return <section className="activity-section">
    <button type="button" className="activity-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
      <Icon name="history" size={16} /><span>{messages.activity}</span><span className="activity-count">{summary.total}</span>
      <span className="activity-latest">{!open && latest && messages.latestActivity(activityNames[latest.type as keyof typeof activityNames] ?? latest.type, stamp(new Date(latest.at)))}</span>
      <Icon name={open ? 'expand' : 'next'} size={14} />
    </button>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {open && <>
      <ol className="activity-list">{page.events.map(event => <li key={event.id}><strong>{activityNames[event.type]}</strong><time dateTime={event.at}>{stamp(new Date(event.at))}</time><span>{statusNames[event.after.status]} · {horizonNames[event.after.horizon]}{event.after.periodId ? ` · ${event.after.periodId.split(':').at(-1)}` : ''}</span></li>)}</ol>
      {page.more && <Button variant="ghost" onClick={() => void more()}>{messages.olderActivity}</Button>}
    </>}
  </section>
}
