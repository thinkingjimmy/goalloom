/**
 * [INPUT]: Review periods, current board facts, device review preferences and provider readiness.
 * [OUTPUT]: An entry-time cached summary with explicit refresh, retained text on refresh failure and retry feedback.
 * [POS]: The review drawer's summary card; shared persistence and request ownership live in state/review-summary.
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
import { boardDigest } from './signals'
import { reviewSignals, type ReviewDue } from './review'

export function ReviewSummary({ due, snapshot, flows, ready }: { due: ReviewDue; snapshot: Snapshot; flows: Flows; ready: boolean }) {
  const { prefs } = useInsightSettings()
  const prepared = prepareReviewSummary({ generation: snapshot.workspace.generation, scope: due.scope, board: boardDigest(snapshot, flows), signals: reviewSignals(snapshot, flows, due) },
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
  if (!ready) return null
  const { value, pending, error } = state
  return <div className="review-summary" aria-busy={pending}>
    <Icon name="smart" size={16} />
    <div className="review-summary-content">
      <div aria-live="polite">
        {value ? <><p className="review-headline">{value.headline}</p>{value.advice && <p>{value.advice}</p>}</> : pending && <p>{t.summaryPending}</p>}
        {error && <p className="review-summary-error" role="alert">{value ? t.summaryRefreshFailed : t.summaryFailed}</p>}
      </div>
      {(value || error) && <button type="button" className="review-summary-refresh" disabled={pending} onClick={() => { if (!working.current) load(true) }}>
        <Icon name="refresh" size={14} />{pending ? t.summaryPending : t.summaryRefresh}
      </button>}
    </div>
  </div>
}
