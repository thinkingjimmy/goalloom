/**
 * [INPUT]: Real production preload/workspace state and an explicit month/combined review scope from this test-only renderer URL.
 * [OUTPUT]: Actual ReviewDrawer/Overview mounted outside calendar eligibility, with real guarded writes and observable completion callbacks.
 * [POS]: Native component harness only; it never changes the main clock, bridge, App entry rules or production bundle.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { precedingPeriod } from '../../../../src/domain/calendar'
import { ReviewDrawer } from '../../../../src/renderer/features/insight/ReviewDrawer'
import { reviewKey, type ReviewDue, type ReviewTarget } from '../../../../src/renderer/features/insight/review'
import { useWorkspace } from '../../../../src/renderer/state/use-workspace'
import { boardItemVisibility } from '../../../../src/renderer/features/board/visibility'
import { startLanguage } from '../../../../src/renderer/state/language'
import '../../../../src/renderer/styles.css'

function Harness() {
  const { snapshot, write, retryWrite, busy, pending } = useWorkspace(boardItemVisibility)
  const [due, setDue] = useState<ReviewDue | null>(null), [open, setOpen] = useState(false), [completed, setCompleted] = useState(0)
  const scope = new URLSearchParams(location.search).get('scope') === 'both' ? 'both' : 'month'
  const start = () => {
    if (!snapshot?.workspace.calendar) return
    const target = (horizon: 'month' | 'week'): ReviewTarget => {
      const next = snapshot.periods.find(period => period.horizon === horizon)!
      const period = precedingPeriod(snapshot.workspace.calendar!, next)!
      return { horizon, period, next, key: reviewKey(period), lastDay: false }
    }
    setDue({ scope, month: target('month'), week: scope === 'both' ? target('week') : null }); setOpen(true)
  }
  return <div className="app-shell" data-component-harness="review" data-completed={completed}>
    <button className="settings-button" disabled={!snapshot} onClick={due ? () => setOpen(true) : start}>Open review</button>
    {due && snapshot && <ReviewDrawer due={due} snapshot={snapshot} open={open} ready={false} write={write} retryWrite={retryWrite} busy={busy && !pending}
      close={() => setOpen(false)} complete={() => { setCompleted(value => value + 1); setOpen(false); setDue(null) }} />}
  </div>
}
void startLanguage().finally(() => createRoot(document.getElementById('root')!).render(<StrictMode><Harness /></StrictMode>))
