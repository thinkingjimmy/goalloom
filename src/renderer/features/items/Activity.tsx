/**
 * [INPUT]: Item identity/revision, workspace today/timezone/week start, and summary/paged activity queries.
 * [OUTPUT]: `useActivitySummary` and `ActivityDrawer`. Three or more counted events become a colored summary plus a month calendar; fewer stay on the latest-three timeline.
 * [POS]: Read-only activity inside the permanent detail rail. Item actions stay in ItemDetail.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { statusNames, messages, activityNames, horizonNames } from '../../i18n'
import { calendarDate, shortDate, stamp, weekdayName, yearMonth } from '../../i18n/format'
import { useEffect, useMemo, useState } from 'react'
import type { ActivitySummary } from '../../../shared/contracts/queries'
import type { Activity as ActivityPage } from '../../../shared/contracts/history'
import { desktopApi } from '../../state/use-workspace'
import { addDays, addMonths } from '../../lib/dates'
import { Icon } from '../../components/icons'
import { activityInsight, activityInsightMinimum, activityMonthGrid, type ActivityInsight } from './activity-insight'

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

function reopenedLine(reopened: NonNullable<ActivityInsight['reopened']>) {
  const done = shortDate(reopened.doneOn)
  if (reopened.againOn === reopened.doneOn) return messages.activityReopenedSameDay(done)
  if (reopened.againOn === addDays(reopened.doneOn, 1)) return messages.activityReopenedNextDay(done)
  return messages.activityReopened(done, shortDate(reopened.againOn))
}

function ActivityInsightView({ events, today, timezone, weekStart }: { events: ActivityPage['events']; today: string; timezone: string; weekStart: number }) {
  const insight = useMemo(() => activityInsight(events, timezone, today), [events, timezone, today])
  const [month, setMonth] = useState(insight.lastMonth)
  useEffect(() => { setMonth(insight.lastMonth) }, [insight.lastMonth])
  const shown = month < insight.firstMonth ? insight.firstMonth : month > insight.lastMonth ? insight.lastMonth : month
  const cells = activityMonthGrid(shown, weekStart)
  const weekdays = Array.from({ length: 7 }, (_, index) => (weekStart + index - 1) % 7 + 1)
  const tone = insight.rollovers > 0 ? 'rollover' : insight.stay ? 'stay' : 'open'
  const lead = insight.rollovers > 0 ? messages.activityRollovers(insight.rollovers) : insight.stay ? `${horizonNames[insight.stay.horizon]} ${messages.activityDays(insight.stay.days)}` : `${messages.activityOpenLabel} ${messages.activityDays(insight.openDays)}`
  return <div className="activity-insight">
    <h3 className="activity-insight-lead" data-tone={tone}>{lead}</h3>
    {tone !== 'open' && <p className="activity-insight-meta">
      {insight.rollovers > 0 && insight.stay && <>
        <span>{horizonNames[insight.stay.horizon]}</span> <span className="activity-insight-stay">{messages.activityDays(insight.stay.days)}</span>
        <span className="activity-insight-sep"> · </span>
      </>}
      <span>{messages.activityOpenLabel}</span> <span className="activity-insight-open">{messages.activityDays(insight.openDays)}</span>
    </p>}
    {insight.reopened && <p className="activity-insight-done">{reopenedLine(insight.reopened)}</p>}
    <hr className="activity-rule" />
    <div className="activity-month">
      <button type="button" className="activity-month-button" aria-label={messages.duePreviousMonth} disabled={shown <= insight.firstMonth} onClick={() => setMonth(addMonths(shown, -1))}><Icon name="previous" size={14} /></button>
      <span className="activity-month-label" aria-live="polite">{yearMonth(shown)}</span>
      <button type="button" className="activity-month-button" aria-label={messages.dueNextMonth} disabled={shown >= insight.lastMonth} onClick={() => setMonth(addMonths(shown, 1))}><Icon name="next" size={14} /></button>
    </div>
    <div className="activity-calendar" role="grid" aria-label={yearMonth(shown)}>
      <div className="activity-weekdays" role="row">{weekdays.map(day => <span key={day} role="columnheader">{weekdayName(day, 'narrow')}</span>)}</div>
      {Array.from({ length: cells.length / 7 }, (_, row) => <div className="activity-week" role="row" key={row}>
        {cells.slice(row * 7, row * 7 + 7).map((date, index) => {
          const mark = date ? insight.marks[date] : undefined
          return <span key={date ?? `empty-${row}-${index}`} role="gridcell" data-today={date === today} data-future={!!date && date > today} title={date && mark ? `${calendarDate(date)} · ${mark === 'rollover' ? messages.rollover : messages.activityMoveIn}` : undefined}>
            {date && <>
              <span className="activity-day-num">{Number(date.slice(8))}</span>
              <span className="activity-dot" data-kind={mark} aria-hidden="true" />
            </>}
          </span>
        })}
      </div>)}
    </div>
    <div className="activity-legend">
      <span className="activity-legend-item"><span className="activity-dot" data-kind="rollover" aria-hidden="true" />{messages.rollover}</span>
      <span className="activity-legend-item"><span className="activity-dot" data-kind="move" aria-hidden="true" />{messages.activityMoveIn}</span>
    </div>
  </div>
}

export function ActivityDrawer({ itemId, revision, total, today, timezone, weekStart }: { itemId: string; revision: number; total: number; today: string; timezone: string; weekStart: number }) {
  const [page, setPage] = useState<ActivityPage>({ events: [], more: false }), [error, setError] = useState(''), [expanded, setExpanded] = useState(false)
  useEffect(() => {
    let active = true
    setExpanded(false)
    setError('')
    void (async () => {
      const events: ActivityPage['events'] = []
      let beforeSeq: number | undefined
      let more = true
      while (active && more) {
        const next = await desktopApi().getActivity({ type: 'activity', itemId, limit: 100, ...(beforeSeq ? { beforeSeq } : {}) })
        events.push(...next.events)
        more = next.more && next.events.length > 0
        beforeSeq = next.events.at(-1)?.seq
      }
      if (active) setPage({ events, more: false })
    })().catch(() => { if (active) setError(messages.activityFailed) })
    return () => { active = false }
  }, [itemId, revision])
  const insight = useMemo(() => activityInsight(page.events, timezone, today), [page.events, timezone, today])
  if (!error && page.events.length === 0 && total >= activityInsightMinimum) return <div className="activity-drawer" data-insight="true" aria-busy="true" />
  if (insight.counted >= activityInsightMinimum) return <div className="activity-drawer" data-insight="true">
    <div className="activity-scroll">
      {error && <p className="inline-error" role="alert">{error}</p>}
      {!error && <ActivityInsightView events={page.events} today={today} timezone={timezone} weekStart={weekStart} />}
    </div>
  </div>
  const shown = expanded ? page.events : page.events.slice(0, 3)
  const canExpand = !expanded && page.events.length > 3
  return <div className="activity-drawer" data-expanded={expanded}>
    <h3 className="activity-drawer-title">{messages.activity}<span className="activity-count">{total}</span></h3>
    <div className="activity-scroll">
      {error && <p className="inline-error" role="alert">{error}</p>}
      <ol className="activity-list">{shown.map(event => {
        const when = stamp(new Date(event.at))
        const detail = `${when} · ${statusNames[event.after.status]} · ${horizonNames[event.after.horizon]}${event.after.periodId ? ` · ${event.after.periodId.split(':').at(-1)}` : ''}`
        return <li key={event.id}><strong>{activityNames[event.type]}</strong><span title={detail}><time dateTime={event.at}>{when}</time>{detail.slice(when.length)}</span></li>
      })}</ol>
      {canExpand && <button type="button" className="activity-earlier" onClick={() => setExpanded(true)}>{messages.earlier}</button>}
    </div>
  </div>
}
