/**
 * [INPUT]: Review periods, historical period-scoped facts, device review preferences and provider readiness.
 * [OUTPUT]: Persistent review heading, optional cached AI content and accessible refresh with retained text on failure.
 * [POS]: Summary-first review brief header/content; persistence and request ownership live in state/review-summary.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useRef, useState } from 'react'
import type { Snapshot } from '../../../shared/contracts/queries'
import type { ReviewText } from '../../../shared/contracts/smart-input'
import { Icon } from '../../components/icons'
import { insightMessages as t } from '../../i18n'
import type { Flows } from '../../state/flows'
import { useInsightSettings } from '../../state/insight'
import { loadReviewSummary, prepareReviewSummary } from '../../state/review-summary'
import { reviewDigest, reviewSignals, type ReviewDue } from './review'

export function ReviewSummary({ due, snapshot, flows, ready }: { due: ReviewDue; snapshot: Snapshot; flows: Flows; ready: boolean }) {
  const { prefs } = useInsightSettings()
  const prepared = prepareReviewSummary({ generation: snapshot.workspace.generation, scope: due.scope, board: reviewDigest(snapshot, flows), signals: reviewSignals(snapshot, flows, due), evidenceRequests: snapshot.items.slice(0, 8).flatMap(item => { const period = [due.week?.period, due.month?.period].find(period => period?.id === item.placement.periodId); return period ? [{ itemId: item.id, cutoff: period.endAt < snapshot.observedAt ? period.endAt : snapshot.observedAt }] : [] }) },
    [due.week?.key, due.month?.key].filter((key): key is string => !!key), prefs)
  const [state, setState] = useState<{ value: ReviewText | null; pending: boolean; error: boolean }>({ value: null, pending: ready, error: false })
  const sequence = useRef(0), working = useRef(false)
  const load = (refresh = false) => {
    const attempt = ++sequence.current
    working.current = true
    setState(previous => ({ value: refresh ? previous.value : null, pending: true, error: false }))
    void loadReviewSummary(prepared, refresh).then(reply => {
      if (sequence.current !== attempt) return
      working.current = false
      setState(previous => ({ value: reply.ok ? reply.value : previous.value, pending: false, error: !reply.ok }))
    })
  }
  useEffect(() => {
    // Revalidate on entry; editing preferences behind Settings must not send a request per keystroke.
    if (ready) load()
    return () => { sequence.current++; working.current = false }
  }, [ready])
  const { value, pending, error } = state
  return <div className="review-summary" aria-busy={ready && pending}>
    <div className="review-summary-header">
      <h3><Icon name="smart" size={14} />{t.summaryTitle}</h3>
      {ready && <button type="button" className="review-summary-refresh" disabled={pending}
        aria-label={pending ? t.summaryPending : t.summaryRefresh} title={pending ? t.summaryPending : t.summaryRefresh}
        onClick={() => { if (!working.current) load(true) }}><Icon name="refresh" size={14} /></button>}
    </div>
    {ready && <div className="review-summary-content" aria-live="polite">
      {value ? <><p className="review-headline">{value.headline}</p>{value.advice && <p className="review-advice">{value.advice}</p>}</> : pending && <p>{t.summaryPending}</p>}
      {error && <p className="review-summary-error" role="alert"><Icon name="warning" size={14} />{value ? t.summaryRefreshFailed : t.summaryFailed}</p>}
    </div>}
  </div>
}
