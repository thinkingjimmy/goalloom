/**
 * [INPUT]: Item identity/revision and summary/paged activity queries.
 * [OUTPUT]: `useActivitySummary` (count + latest event for the header toggle) and `ActivityDrawer`, a full-height side panel with a dotted timeline that loads event pages only while open.
 * [POS]: Secondary detail view without business writes or eager full history; ItemDetail owns the open state and the header toggle.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { statusNames, messages, activityNames, horizonNames } from '../../i18n'
import { stamp } from '../../i18n/format'
import { useEffect, useState } from 'react'
import type { ActivitySummary } from '../../../shared/contracts/queries'
import type { Activity as ActivityPage } from '../../../shared/contracts/history'
import { desktopApi } from '../../state/use-workspace'
import { Button } from '../../components/ui/button'

export function useActivitySummary(itemId: string, revision: number) {
  const [summary, setSummary] = useState<ActivitySummary>({ total: 0, latest: null })
  useEffect(() => {
    let active = true
    void desktopApi().getActivitySummary(itemId).then(value => { if (active) setSummary(value) }).catch(() => { if (active) setSummary({ total: 0, latest: null }) })
    return () => { active = false }
  }, [itemId, revision])
  const latest = summary.latest
  return { total: summary.total, latest: latest && messages.latestActivity(activityNames[latest.type as keyof typeof activityNames] ?? latest.type, stamp(new Date(latest.at))) }
}

export function ActivityDrawer({ itemId, revision, total }: { itemId: string; revision: number; total: number }) {
  const [page, setPage] = useState<ActivityPage>({ events: [], more: false }), [error, setError] = useState('')
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
  return <aside className="activity-drawer" aria-label={messages.activity}>
    <h3 className="activity-drawer-title">{messages.activity}<span className="activity-count">{total}</span></h3>
    {error && <p className="inline-error" role="alert">{error}</p>}
    <ol className="activity-list">{page.events.map(event => <li key={event.id}><strong>{activityNames[event.type]}</strong><span><time dateTime={event.at}>{stamp(new Date(event.at))}</time> · {statusNames[event.after.status]} · {horizonNames[event.after.horizon]}{event.after.periodId ? ` · ${event.after.periodId.split(':').at(-1)}` : ''}</span></li>)}</ol>
    {page.more && <Button variant="ghost" onClick={() => void more()}>{messages.olderActivity}</Button>}
  </aside>
}
