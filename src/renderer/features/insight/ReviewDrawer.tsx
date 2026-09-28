/**
 * [INPUT]: The open ReviewDue (week, month or both), snapshot, flows, board view, insight readiness, guarded submission and a flow-filter setter.
 * [OUTPUT]: A right-side review drawer with a period-aware title: look back (model summary + goal×period matrix or 3-month progress) → wrap up (push / postpone / archive)
 *           → plan the next month and/or week (drafted steps, editable, checked; createPlan into the next period) → done (result list, open next period).
 *           The matrix prioritizes readable goal titles and explains its cells with a visual legend. Finishing or skipping marks the reviewed periods on this device;
 *           ReviewSummary owns persistent summaries and refresh feedback.
 * [POS]: features/insight 的复盘流程；每个写入仍是独立命令（顺延/归档/createPlan），可按原有会话撤销。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ItemSummary } from '../../../shared/contracts/entities'
import type { Snapshot } from '../../../shared/contracts/queries'
import type { CommandResult } from '../../../shared/contracts/commands'
import { horizonNames, insightMessages as t, messages } from '../../i18n'
import type { Action } from '../../state/use-workspace'
import type { Flows } from '../../state/flows'
import type { BoardView } from '../../state/board-periods'
import { markReviewed, requestDraft } from '../../state/insight'
import { flowStroke } from '../../lib/colors'
import { periodDates, planningLabel } from '../../lib/periods'
import { Icon } from '../../components/icons'
import { boardDigest, periodText, type Planned } from './signals'
import { goalRows, planCandidates, reviewedOpen, type ReviewDue, type ReviewHorizon } from './review'
import { ReviewSummary } from './ReviewSummary'
import './insight.css'
import '../composer/composer.css'

type Step = 'review' | 'close' | 'planMonth' | 'planWeek' | 'done'
type Decision = 'keep' | 'defer' | 'archive'
interface PlanRow { parent: ItemSummary; title: string; on: boolean; typed: boolean; fresh: boolean }
const columns: Planned[] = ['cycle', 'month', 'week', 'day']

export function ReviewDrawer({ due, snapshot, flows, view, ready, submit, busy, setFilter, close }: {
  due: ReviewDue; snapshot: Snapshot; flows: Flows; view: BoardView; ready: boolean
  submit: (action: Action) => Promise<unknown>; busy: boolean; setFilter: (id: string) => void; close: () => void
}) {
  const steps = useMemo<Step[]>(() => due.scope === 'both' ? ['review', 'close', 'planMonth', 'planWeek', 'done'] : ['review', 'close', due.scope === 'week' ? 'planWeek' : 'planMonth', 'done'], [due.scope])
  const [step, setStep] = useState<Step>('review')
  const [decisions, setDecisions] = useState(new Map<string, Decision>())
  const [plans, setPlans] = useState<Record<ReviewHorizon, PlanRow[] | null>>({ week: null, month: null })
  const [drafting, setDrafting] = useState(false)
  const [fresh, setFresh] = useState<ItemSummary[]>([])
  const [result, setResult] = useState({ kept: 0, deferred: 0, archived: 0, planned: { week: 0, month: 0 } })
  const alive = useRef(true), working = useRef(false)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const calendar = snapshot.workspace.calendar!
  const target = due.month ?? due.week!
  const title = target.lastDay ? t.reviewTitle(due.scope) : t.reviewEntryAfter(
    [due.week, due.month].flatMap(value => value ? [planningLabel(value.period, calendar, snapshot.observedAt)] : []).join(' + '),
  )
  const range = due.scope === 'week' ? periodDates(due.week!.period) : periodDates(due.month!.period)
  const primaryTarget = (horizon: ReviewHorizon) => due[horizon]!
  const stepName = (value: Step) => value === 'review' ? t.stepReview : value === 'close' ? (due.scope === 'both' ? t.stepCloseBoth : t.stepClose(horizonNames[target.horizon]))
    : value === 'planMonth' ? t.stepPlan(messages.nextPeriodNames.month) : value === 'planWeek' ? t.stepPlan(messages.nextPeriodNames.week) : t.stepDone

  // --- Planning rows: drafted once per step; typed titles always win over a late draft. ---
  const openPlan = (horizon: ReviewHorizon) => {
    if (plans[horizon]) return
    const next = primaryTarget(horizon).next
    const parents = [...(horizon === 'week' ? fresh : []), ...planCandidates(snapshot, horizon)].slice(0, 8)
    const rows = parents.map(parent => ({ parent, title: '', on: true, typed: false, fresh: fresh.includes(parent) }))
    setPlans(previous => ({ ...previous, [horizon]: rows }))
    if (!ready || !rows.length) return
    setDrafting(true)
    void requestDraft({ generation: snapshot.workspace.generation, board: boardDigest(snapshot, flows), tasks: parents.map(parent => ({
      id: parent.id, kind: 'next' as const, parent: parent.title, goal: flows.of(parent.id).find(flow => flow.id !== parent.id)?.title ?? null,
      target: periodText(next, next.id !== snapshot.periods.find(period => period.horizon === horizon)?.id), targetHorizon: horizon, siblings: [], children: [] })) })
      .then(reply => {
        if (!alive.current) return
        setDrafting(false)
        if (!reply.ok) return
        const titles = new Map(reply.value.map(value => [value.id, value.title]))
        setPlans(previous => ({ ...previous, [horizon]: previous[horizon]!.map(row => row.typed ? row : { ...row, title: titles.get(row.parent.id) ?? row.title }) }))
      })
  }
  const go = (next: Step) => {
    setStep(next)
    if (next === 'planMonth') openPlan('month')
    if (next === 'planWeek') openPlan('week')
    if (next === 'done') { if (due.week) markReviewed(due.week.key); if (due.month) markReviewed(due.month.key) }
  }
  const advance = () => go(steps[steps.indexOf(step) + 1]!)

  const closing = [due.week, due.month].filter(value => value?.lastDay).flatMap(value => reviewedOpen(snapshot, value!.period))
  const applyClose = async () => {
    const counts = { kept: 0, deferred: 0, archived: 0 }
    for (const item of closing) {
      const choice = decisions.get(item.id) ?? 'keep'
      counts[choice === 'keep' ? 'kept' : choice === 'defer' ? 'deferred' : 'archived']++
      if (choice === 'defer') await submit({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: item.placement.horizon, period: { kind: 'next' } })
      if (choice === 'archive') await submit({ type: 'archive', itemId: item.id, expectedVersion: item.version, archived: true })
    }
    setResult(previous => ({ ...previous, ...counts }))
  }
  const applyPlan = async (horizon: ReviewHorizon) => {
    const next = primaryTarget(horizon).next
    const rows = (plans[horizon] ?? []).filter(row => row.on && row.title.trim())
    if (!rows.length) return
    const future = next.id !== snapshot.periods.find(period => period.horizon === horizon)?.id
    const reply = await submit({ type: 'createPlan', items: rows.map((row, index) => ({ draftId: `review-${horizon}-${index}`, title: row.title.trim(), description: '', dueDate: null, horizon, previewPeriodId: next.id, flowColor: null,
      ...(future ? { period: { kind: 'date' as const, startDate: next.startDate } } : {}), parentRefs: [{ kind: 'existing' as const, itemId: row.parent.id, expectedVersion: row.parent.version }] })) }) as CommandResult | null
    if (!reply) return
    setResult(previous => ({ ...previous, planned: { ...previous.planned, [horizon]: rows.length } }))
    // A month plan written into next month is not in this snapshot; the week step still offers it a first step.
    if (horizon === 'month' && reply.itemIds) setFresh(reply.itemIds.map((id, index) => ({ ...rows[index]!.parent, id, title: rows[index]!.title.trim(), version: 1, flowColor: null,
      placement: { itemId: id, horizon: 'month', periodId: next.id, sortKey: 0, version: 1, holdPeriodId: null } })))
  }
  const primary = async () => {
    if (working.current || busy) return
    working.current = true
    try {
      if (step === 'close') await applyClose()
      if (step === 'planMonth') await applyPlan('month')
      if (step === 'planWeek') await applyPlan('week')
      if (alive.current) advance()
    } finally { working.current = false }
  }
  const skip = () => { if (due.week) markReviewed(due.week.key); if (due.month) markReviewed(due.month.key); close() }

  const rows = step === 'planMonth' ? plans.month : step === 'planWeek' ? plans.week : null
  const planHorizon: ReviewHorizon = step === 'planMonth' ? 'month' : 'week'
  const count = rows?.filter(row => row.on && row.title.trim()).length ?? 0
  const primaryLabel = step === 'done' ? null : step.startsWith('plan') ? t.planConfirm(count) : t.nextStep(stepName(steps[steps.indexOf(step) + 1]!))
  const setRow = (index: number, patch: Partial<PlanRow>) => setPlans(previous => ({ ...previous, [planHorizon]: previous[planHorizon]!.map((row, at) => at === index ? { ...row, ...patch } : row) }))
  const goals = goalRows(snapshot, flows)

  return <aside className="review-drawer" role="dialog" aria-label={title} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); close() } }}>
    <header className="review-head">
      <div><h2>{title}</h2><p>{target.lastDay ? t.reviewEnds(range) : t.reviewEnded(range)}</p></div>
      <button className="icon-button" aria-label={t.closeReview} onClick={close}><Icon name="close" size={16} /></button>
    </header>
    <ol className="review-steps">{steps.map(value => <li key={value} aria-current={value === step ? 'step' : undefined}>{stepName(value)}</li>)}</ol>
    <div className="review-body">
      {step === 'review' && <>
        <ReviewSummary due={due} snapshot={snapshot} flows={flows} ready={ready} />
        {due.month && <section className="review-section"><h3>{t.goals(periodDates(snapshot.periods.find(period => period.horizon === 'cycle')!))}</h3>
          {goals.map(goal => <button key={goal.id} className="review-goal" onClick={() => setFilter(goal.id)}>
            <span className="review-mark" style={{ borderColor: flowStroke(goal.flowColor) }} /><span className="review-goal-title">{goal.title}</span>
            {goal.counts.month ? <span>{t.goalCount(goal.counts.month, goal.done.month)}</span> : <span className="review-empty-tag">{t.goalNone}</span>}
          </button>)}
        </section>}
        {due.week && <section className="review-section"><h3>{t.matrix}</h3>
          <div className="review-matrix" role="table">
            <div role="row"><span role="columnheader" />{columns.map(horizon => <span key={horizon} role="columnheader">{horizonNames[horizon]}</span>)}</div>
            {goals.map(goal => <div key={goal.id} role="row">
              <button role="rowheader" className="review-goal-title" onClick={() => setFilter(goal.id)}><span className="review-mark" style={{ borderColor: flowStroke(goal.flowColor) }} /><span>{goal.title}</span></button>
              {columns.map(horizon => <span key={horizon} role="cell" className="review-matrix-cell" data-empty={!goal.counts[horizon]} data-skip={horizon === 'week' && goal.skip}>{goal.counts[horizon] || t.matrixEmpty}</span>)}
            </div>)}
          </div>
          <ul className="review-matrix-legend">
            <li><span className="review-matrix-cell" data-empty="true" aria-hidden="true">{t.matrixEmpty}</span><span>{t.matrixLegendEmpty}</span></li>
            <li><span className="review-matrix-cell" data-skip="true" aria-hidden="true" /><span>{t.matrixLegendSkip}</span></li>
            <li><Icon name="info" size={14} /><span>{t.matrixFilterHint}</span></li>
          </ul>
        </section>}
      </>}
      {step === 'close' && <section className="review-section">
        {closing.length ? <>
          <h3>{t.closeLeft(horizonNames[target.horizon], closing.length)}</h3>
          {closing.map(item => <div key={item.id} className="review-close-row">
            <span className="review-goal-title">{item.title}</span>
            <div className="segmented small" role="radiogroup" aria-label={item.title}>
              {(['keep', 'defer', 'archive'] as const).map(choice => <button key={choice} role="radio" aria-checked={(decisions.get(item.id) ?? 'keep') === choice}
                onClick={() => setDecisions(previous => new Map(previous).set(item.id, choice))}>{t[choice]}</button>)}
            </div>
          </div>)}
          <p className="review-note">{t.closeNote}</p>
        </> : <p className="review-note">{[due.week, due.month].some(value => value && !value.lastDay) ? t.closePast : t.closeNone}</p>}
      </section>}
      {rows && <section className="review-section">
        <h3>{t.planHeading(planningLabel(primaryTarget(planHorizon).next, calendar, snapshot.observedAt), periodDates(primaryTarget(planHorizon).next))}</h3>
        <p className="review-note">{rows.length ? ready ? t.planNote : t.planManual : t.planNone}</p>
        {rows.map((row, index) => <div key={row.parent.id} className="seed-row review-plan-row" data-on={row.on}>
          <input type="checkbox" aria-label={row.parent.title} checked={row.on} onChange={event => setRow(index, { on: event.target.checked })} />
          <div className="review-plan-text">
            <input className="seed-title" aria-label={row.parent.title} value={row.title} maxLength={500} placeholder={drafting ? t.seedBatchPending : t.seedPlaceholder} onChange={event => setRow(index, { title: event.target.value, typed: true })} />
            <span className="seed-parent">{t.seedParent(row.parent.title)}{row.fresh && <em>{t.fresh}</em>}</span>
          </div>
        </div>)}
      </section>}
      {step === 'done' && <section className="review-section review-done">
        <span className="review-check"><Icon name="check" size={20} strokeWidth={2.2} /></span>
        <h3>{t.doneTitle}</h3>
        {closing.length > 0 && <p>{t.doneClosed(result.kept, result.deferred, result.archived)}</p>}
        {(['month', 'week'] as const).filter(horizon => result.planned[horizon]).map(horizon => <p key={horizon}>{t.donePlanned(planningLabel(primaryTarget(horizon).next, calendar, snapshot.observedAt), result.planned[horizon])}</p>)}
      </section>}
    </div>
    <footer className="review-foot">
      {step === 'review' ? <button className="settings-button subtle" onClick={skip}>{t.skipReview}</button>
        : step !== 'done' && <button className="settings-button subtle" onClick={() => setStep(steps[steps.indexOf(step) - 1]!)}>{t.back}</button>}
      <span className="column-spacer" />
      {step === 'done' ? <>
        {(result.planned.week > 0 && due.week && due.week.next.id !== snapshot.periods.find(period => period.horizon === 'week')?.id) && <button className="settings-button" onClick={() => { view.choose('week', due.week!.next); close() }}>{t.viewPeriod(planningLabel(due.week.next, calendar, snapshot.observedAt))}</button>}
        <button className="settings-button primary" onClick={close}>{t.closeReview}</button>
      </> : <button className="settings-button primary" disabled={busy || (step.startsWith('plan') && drafting)} onClick={() => void primary()}>{primaryLabel}</button>}
    </footer>
  </aside>
}
