/**
 * [INPUT]: Generation/item identity, observed clock, write guard and bounded authoritative execution/activity reads.
 * [OUTPUT]: Stable facts/help/calendar rail, accessible daily records and frozen all-activity pagination.
 * [POS]: Read-only presentation; main computes all counts, pressure and elapsed time.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import type { ActivityEntries, ActivityMonth, ExecutionFacts } from '../../../shared/contracts/execution'
import { workspaceDate } from '../../../domain/calendar'
import { intlTags } from '../../../shared/i18n/locale'
import { messages, activityNames, horizonNames, useLocale } from '../../i18n'
import { assistanceMessages } from '../../i18n/assistance'
import { calendarDate, weekdayName, yearMonth } from '../../i18n/format'
import { desktopApi } from '../../state/use-workspace'
import { addDays, addMonths } from '../../lib/dates'
import { periodDates } from '../../lib/periods'
import { Icon } from '../../components/icons'
import { activityMonthGrid } from './activity-insight'
import './activity.css'

function FactsView({ facts, period }: { facts: ExecutionFacts; period: PlanningPeriod | null }) {
  const t = assistanceMessages(), count = facts.carryovers.currentEpisode.value, deadline = facts.deadlineNow.value
  const active = facts.current.status === 'todo' && !facts.current.archived && !facts.current.deleted
  const created = facts.createdAt.value ? calendarDate(workspaceDate(facts.timezone, facts.createdAt.value)) : t.incomplete
  const lead = deadline ? t.overdue(deadline.overdueDays) : active && count?.total ? t.carry(count.total)
    : facts.current.horizon === 'later' ? t.unscheduled : period && Date.parse(period.startAt) > Date.parse(facts.asOf) ? t.planned(periodDates(period))
      : period && Date.parse(period.endAt) <= Date.parse(facts.asOf) ? t.past : period ? t.scheduled(horizonNames[period.horizon]) : t.created(created)
  const duration = facts.current.horizon === 'later' ? null : facts.placementDurations[facts.current.horizon]
  const seconds = duration?.value
  const formatDuration = (seconds: number) => seconds < 3600 ? t.underHour : seconds < 86400 ? t.hours(Math.round(seconds / 3600 * 10) / 10) : t.days(Math.round(seconds / 86400 * 10) / 10)
  return <div className="activity-insight">
    <h3 className="activity-insight-lead" data-tone={facts.pressure.level.value ?? 'normal'}>{lead}</h3>
    {active && count?.total ? <p className="activity-insight-meta">{t.sources(count.bySource.user, count.bySource.system, count.bySource.unknown)}</p> : null}
    {seconds !== null && seconds !== undefined && seconds > 0 && <p className="activity-insight-meta" title={t.durationNote}>{t.cumulative(horizonNames[facts.current.horizon], formatDuration(seconds))}{duration?.quality !== 'complete' && ` · ${t.incomplete}`}</p>}
    {facts.coverage.quality !== 'complete' && <p className="activity-insight-meta">{t.incomplete}</p>}
    {active && facts.pressure.level.value === 'reconfirm' && <p className="execution-reconfirm">{t.reconfirm}</p>}
    <details className="execution-explanation"><summary>{t.facts}</summary>
      <p>{t.created(created)}</p>
      {facts.currentEpisode.value && <p>{t.episode(facts.currentEpisode.value.elapsedCalendarDays)}</p>}
      {facts.carryovers.lifetime.value && <p>{t.carry(facts.carryovers.lifetime.value.total)} · {t.sources(facts.carryovers.lifetime.value.bySource.user, facts.carryovers.lifetime.value.bySource.system, facts.carryovers.lifetime.value.bySource.unknown)}</p>}
      {Object.entries(facts.placementDurations).map(([horizon, value]) => value.value !== null && value.value > 0 && <p key={horizon}>{t.cumulative(horizonNames[horizon as keyof typeof horizonNames], formatDuration(value.value))}</p>)}
      <p>{t.durationNote}</p><p>{t.localOnly}</p>
    </details>
  </div>
}

export function ActivityDrawer({ itemId, generation, revision, observedAt, period, today, weekStart, assist, move, factsSnapshot, helpDisabled = false }: {
  itemId: string; generation: string; revision: number; observedAt: string; period: PlanningPeriod | null; today: string; weekStart: number; factsSnapshot: ExecutionFacts | null; assist: (() => void) | null; move: (() => void) | null; helpDisabled?: boolean
}) {
  const locale = useLocale(), t = assistanceMessages()
  const [facts, setFacts] = useState<ExecutionFacts | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [month, setMonth] = useState(`${today.slice(0, 7)}-01`), [calendar, setCalendar] = useState<ActivityMonth | null>(null), [calendarError, setCalendarError] = useState('')
  const [selection, setSelection] = useState<string | null>(null), [page, setPage] = useState<ActivityEntries | null>(null), [pageError, setPageError] = useState(''), [pageLoading, setPageLoading] = useState(false)
  const [pageNumber, setPageNumber] = useState(0), pageEpoch = useRef(0)
  useEffect(() => {
    const refresh = () => setRetry(value => value + 1)
    const visible = () => { if (document.visibilityState === 'visible') refresh() }
    window.addEventListener('focus', refresh); document.addEventListener('visibilitychange', visible)
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible) }
  }, [])
  useEffect(() => {
    let active = true
    setError('')
    void desktopApi().getExecutionSummary({ type: 'executionSummary', itemId, generation }).then(value => { if (active) setFacts(value) }).catch(() => { if (active) setError(t.failed) })
    return () => { active = false }
  }, [itemId, generation, revision, observedAt, retry])
  useEffect(() => {
    if (!facts) return
    let active = true
    setCalendar(null); setCalendarError('')
    void desktopApi().getActivityMonth({ type: 'activityMonth', itemId, generation, month }).then(value => { if (active && value.month === month) setCalendar(value) }).catch(() => { if (active) setCalendarError(t.failed) })
    return () => { active = false }
  }, [itemId, generation, month, facts?.sourceRevision, retry])
  useEffect(() => {
    if (!selection || !facts) return
    let active = true
    pageEpoch.current++; setPageNumber(0)
    setPage(null); setPageError(''); setPageLoading(true)
    const request = selection === 'all' ? desktopApi().getActivityPage({ type: 'activityPage', itemId, generation, limit: 50 })
      : desktopApi().getActivityDay({ type: 'activityDay', itemId, generation, date: selection, limit: 50 })
    void request.then(value => { if (active && value.selection === selection) setPage(value) }).catch(() => { if (active) setPageError(t.failed) }).finally(() => { if (active) setPageLoading(false) })
    return () => { active = false }
  }, [itemId, generation, selection, facts?.sourceRevision, retry])
  const loadMore = async () => {
    if (!page?.cursor || pageLoading) return
    const epoch = pageEpoch.current
    setPageLoading(true); setPageError('')
    try {
      const next = selection === 'all' ? await desktopApi().getActivityPage({ type: 'activityPage', itemId, generation, cursor: page.cursor, limit: 50 })
        : await desktopApi().getActivityDay({ type: 'activityDay', itemId, generation, date: selection!, cursor: page.cursor, limit: 50 })
      if (pageEpoch.current === epoch) { setPage(next); setPageNumber(value => value + 1) }
    } catch { if (pageEpoch.current === epoch) setPageError(t.stale) } finally { if (pageEpoch.current === epoch) setPageLoading(false) }
  }
  const displayedFacts = factsSnapshot && factsSnapshot.itemId === itemId && factsSnapshot.generation === generation && (!facts || facts.sourceRevision === factsSnapshot.sourceRevision) && workspaceDate(factsSnapshot.timezone, factsSnapshot.asOf) === today ? factsSnapshot : facts
  const cells = useMemo(() => activityMonthGrid(month, weekStart), [month, weekStart])
  const marks = new Map(calendar?.dates.map(date => [date.date, date]) ?? [])
  const weekdays = Array.from({ length: 7 }, (_, index) => (weekStart + index - 1) % 7 + 1)
  const firstMonth = `${facts?.createdAt.value ? workspaceDate(facts.timezone, facts.createdAt.value).slice(0, 7) : today.slice(0, 7)}-01`
  const when = (at: string) => new Intl.DateTimeFormat(intlTags[locale], { timeZone: facts?.timezone ?? 'UTC', dateStyle: 'short', timeStyle: 'short' }).format(new Date(at))
  return <div className="activity-drawer" data-insight="true" data-facts-as-of={displayedFacts?.asOf} data-facts-revision={displayedFacts?.sourceRevision}><div className="activity-scroll">
    {error && <p className="inline-error" role="alert">{error} {facts && t.notUpdated} <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>{t.retry}</button></p>}
    {displayedFacts ? <FactsView facts={displayedFacts} period={period} /> : !error && <p role="status">{t.loading}</p>}
    {(assist || move) && <div className="execution-help" data-emphasis={facts?.pressure.level.value === 'reconfirm'}>{assist && <button type="button" className="text-button" disabled={helpDisabled} onClick={assist}>{t.title}</button>}{move && <button type="button" className="text-button" disabled={helpDisabled} onClick={move}>{t.move}</button>}</div>}
    <hr className="activity-rule" />
    {selection !== 'all' ? <>
      <div className="activity-month"><button type="button" className="activity-month-button" aria-label={messages.duePreviousMonth} disabled={month <= firstMonth} onClick={() => { setMonth(addMonths(month, -1)); setSelection(null) }}><Icon name="previous" size={14} /></button>
        <span className="activity-month-label" aria-live="polite">{yearMonth(month)}</span><button type="button" className="activity-month-button" aria-label={messages.dueNextMonth} disabled={month >= `${today.slice(0, 7)}-01`} onClick={() => { setMonth(addMonths(month, 1)); setSelection(null) }}><Icon name="next" size={14} /></button></div>
      {calendarError && <p className="inline-error" role="alert">{calendarError}</p>}
      <div className="activity-calendar" role="grid" aria-label={yearMonth(month)} aria-busy={!calendar && !calendarError}>
        <div className="activity-weekdays" role="row">{weekdays.map(day => <span key={day} role="columnheader">{weekdayName(day, 'narrow')}</span>)}</div>
        {Array.from({ length: cells.length / 7 }, (_, row) => <div className="activity-week" role="row" key={row}>{cells.slice(row * 7, row * 7 + 7).map((date, index) => <span role="gridcell" key={date ?? `empty-${row}-${index}`} data-today={date === today}>
          {date && <button type="button" className="activity-date" aria-label={`${calendarDate(date)} · ${calendar ? t.records(marks.get(date)?.total ?? 0) : t.loading}`} aria-pressed={selection === date} data-date={date} onClick={() => setSelection(date)} onKeyDown={event => {
            const offset = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 } as Record<string, number>)[event.key]
            if (offset === undefined) return
            const next = event.currentTarget.closest('.activity-calendar')?.querySelector<HTMLButtonElement>(`[data-date="${addDays(date, offset)}"]`)
            if (next) { event.preventDefault(); next.focus() }
          }}><span className="activity-day-num">{Number(date.slice(8))}</span><span className="activity-dot" data-kind={marks.has(date) ? 'move' : undefined} aria-hidden="true" /></button>}
        </span>)}</div>)}
      </div><button type="button" className="activity-all text-button" onClick={() => setSelection('all')}>{t.all}</button>
    </> : <button type="button" className="activity-all text-button" onClick={() => setSelection(null)}><Icon name="previous" size={14} />{t.calendar}</button>}
    {selection && <section className="activity-day-details" aria-label={selection === 'all' ? t.all : calendarDate(selection)}>
      <h4>{selection === 'all' ? t.all : calendarDate(selection)}</h4>
      {pageError && <p className="inline-error" role="alert">{pageError}<button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>{t.retry}</button></p>}
      {pageLoading && <p role="status">{t.loading}</p>}{page && page.entries.length === 0 && !pageError && <p>{t.empty}</p>}
      <ol className="activity-list">{page?.entries.map(({ event, evidence }) => <li key={event.id}>
        <strong>{event.undoOf ? activityNames.undo : evidence.category === 'other' ? activityNames[event.type] : t.categories[evidence.category]} {evidence.effective === false && <em>{t.undone}</em>}</strong>
        <span><time dateTime={event.at}>{when(event.at)}</time> · {t.sources(evidence.source === 'user' ? 1 : 0, evidence.source === 'system' ? 1 : 0, evidence.source === 'unknown' ? 1 : 0)}</span>
        {(evidence.fromPeriod || evidence.toPeriod) && evidence.fromPeriodId !== evidence.toPeriodId && <span>{evidence.fromPeriod ? `${horizonNames[evidence.fromPeriod.horizon]} ${periodDates(evidence.fromPeriod)}` : 'Later'} → {evidence.toPeriod ? `${horizonNames[evidence.toPeriod.horizon]} ${periodDates(evidence.toPeriod)}` : 'Later'}</span>}
      </li>)}</ol>{pageNumber > 0 && <button type="button" className="text-button" onClick={() => setRetry(value => value + 1)}>{t.firstRecords}</button>}
      {page?.cursor && <button type="button" className="text-button" disabled={pageLoading} onClick={() => void loadMore()}>{t.more}</button>}
    </section>}
  </div></div>
}
