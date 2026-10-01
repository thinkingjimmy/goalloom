/**
 * [INPUT]: Review selection, current generation/revision, provider readiness and guarded workspace actions.
 * [OUTPUT]: Resumable modal review: historical progress, live unfinished items, destination plans and confirmed results.
 * [POS]: Review session owner; read contexts separate historical facts from current command versions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ItemSummary } from '../../../shared/contracts/entities'
import type { ReviewContext, Snapshot } from '../../../shared/contracts/queries'
import { insightMessages as t, messages } from '../../i18n'
import { desktopApi, type Action, type PreparedWrite, type WriteResult } from '../../state/use-workspace'
import { useFlows } from '../../state/flows'
import { markReviewed, requestDraft } from '../../state/insight'
import { periodDates, planningLabel } from '../../lib/periods'
import { Icon } from '../../components/icons'
import { boardDigest, periodText } from './signals'
import { planCandidates, type ReviewDue, type ReviewHorizon } from './review'
import { ReviewOverview } from './ReviewOverview'
import './insight.css'
import './review.css'
import '../composer/composer.css'

type Step = 'review' | 'close' | 'planMonth' | 'planWeek' | 'done'
type Decision = 'keep' | 'defer' | 'archive'
interface PlanRow { parent: ItemSummary; title: string; on: boolean; typed: boolean }

export function ReviewDrawer({ due, snapshot, open, ready, write, retryWrite, busy, setFilter, close }: {
  due: ReviewDue; snapshot: Snapshot; open: boolean; ready: boolean
  write: PreparedWrite; retryWrite: (generation: string) => Promise<WriteResult>; busy: boolean; setFilter: (id: string) => void; close: () => void
}) {
  const [context, setContext] = useState<ReviewContext | null>(null)
  const [contextReady, setContextReady] = useState(false)
  const [loadError, setLoadError] = useState(false), [saveError, setSaveError] = useState(false)
  const [step, setStep] = useState<Step>('review'), [started, setStarted] = useState(false)
  const [decisions, setDecisions] = useState(new Map<string, Decision>())
  const [plans, setPlans] = useState<Record<ReviewHorizon, PlanRow[] | null>>({ week: null, month: null })
  const [drafting, setDrafting] = useState(false), [working, setWorking] = useState(false)
  const [result, setResult] = useState({ kept: 0, deferred: 0, archived: 0, planned: { week: 0, month: 0 } })
  const [pendingWrite, setPendingWrite] = useState(false)
  const pendingCommit = useRef<(() => void) | null>(null)
  const dialog = useRef<HTMLDialogElement>(null), body = useRef<HTMLDivElement>(null)
  const alive = useRef(true), reading = useRef(0), writing = useRef(false), processed = useRef(new Set<string>())
  useEffect(() => { alive.current = true; return () => { alive.current = false; reading.current++ } }, [])
  const generation = snapshot.workspace.generation
  const target = due.month ?? due.week!, targets = [due.month, due.week].flatMap(value => value ? [value] : [])
  const periodName = (horizon: ReviewHorizon, next = false) => {
    const period = next ? due[horizon]!.next : due[horizon]!.period
    return horizon === 'month' ? periodDates(period, period.startDate.slice(0, 4) !== snapshot.observedAt.slice(0, 4)) : planningLabel(period, snapshot.workspace.calendar!, snapshot.observedAt)
  }
  const title = due.scope === 'both' ? t.reviewEntryAfter(`${periodName('week')} + ${periodName('month')}`)
    : due.month ? t.reviewEntryAfter(periodName('month')) : target.lastDay ? t.reviewTitle('week') : t.reviewEntryAfter(periodName('week'))
  const load = useCallback(async () => {
    const attempt = ++reading.current
    setLoadError(false)
    try {
      const value = await desktopApi().getReviewContext({ type: 'reviewContext', generation,
        periods: [due.month, due.week].flatMap(value => value ? [{ horizon: value.horizon, startDate: value.period.startDate }] : []) })
      if (!alive.current || attempt !== reading.current || value.board.workspace.generation !== generation) return null
      setContext(value); setContextReady(true)
      return value
    } catch { if (alive.current && attempt === reading.current) setLoadError(true); return null }
  }, [generation, due])
  useEffect(() => { if (open && !writing.current) void load(); if (!open) setContextReady(false) }, [open, snapshot.workspace.revision, load])
  useEffect(() => {
    const node = dialog.current!
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])
  useEffect(() => { if (body.current) body.current.scrollTop = 0 }, [step])
  const planning = context?.planning ?? null
  const flows = useFlows(planning, planning?.items ?? [])
  const historyAtEntry = useRef<boolean | null>(null)
  if (context && historyAtEntry.current === null) historyAtEntry.current = context.unknown > 0 || context.board.items.some(item => targets.some(value => item.placement.periodId === value.period.id))
  const hasHistory = historyAtEntry.current === true
  const hasClosing = !!context?.closing.length || processed.current.size > 0
  const steps: Step[] = [...(hasHistory ? ['review' as const] : []), ...(hasClosing ? ['close' as const] : []), ...(due.month ? ['planMonth' as const] : []), ...(due.week ? ['planWeek' as const] : []), 'done']
  useEffect(() => {
    if (!context || started) return
    setStarted(true)
    setStep(steps[0]!)
  }, [context, started])
  const stepName = (value: Step) => value === 'review' ? t.reviewLookBack(periodName(target.horizon)) : value === 'close' ? t.reviewHandle
    : value === 'planMonth' ? t.reviewArrange(periodName('month', true)) : value === 'planWeek' ? t.reviewArrange(periodName('week', true)) : t.stepDone

  // Initialize once per destination. Late model replies merge only into untouched titles.
  useEffect(() => {
    if (!open || !planning || !step.startsWith('plan')) return
    const horizon = step === 'planMonth' ? 'month' : 'week'
    if (plans[horizon]) return
    const parents = planCandidates(planning, horizon), next = due[horizon]!.next
    const rows = parents.map(parent => ({ parent, title: '', on: true, typed: false }))
    setPlans(previous => ({ ...previous, [horizon]: rows }))
    if (!ready || !rows.length) return
    setDrafting(true)
    void requestDraft({ generation, board: boardDigest(planning, flows), tasks: parents.map(parent => ({ id: parent.id, kind: 'next' as const,
      parent: parent.title, goal: flows.of(parent.id).find(flow => flow.id !== parent.id)?.title ?? null,
      target: periodText(next, next.id !== snapshot.periods.find(period => period.horizon === horizon)?.id), targetHorizon: horizon, siblings: [], children: [] })) })
      .then(reply => {
        if (!alive.current) return
        setDrafting(false)
        if (!reply.ok) return
        const titles = new Map(reply.value.map(value => [value.id, value.title]))
        setPlans(previous => ({ ...previous, [horizon]: previous[horizon]!.map(row => row.typed ? row : { ...row, title: titles.get(row.parent.id) ?? row.title }) }))
      })
  }, [open, step, planning, plans, ready, generation, due, flows])

  const commit = async (action: Action | (() => Promise<Action | null>), confirmed: () => void) => {
    const reply = await write(typeof action === 'function' ? action : async () => action, generation)
    if (!alive.current) return false
    if (reply.ok) { confirmed(); return true }
    if (reply.pending) { pendingCommit.current = confirmed; setPendingWrite(true) }
    setSaveError(true)
    return false
  }
  const finish = () => { targets.forEach(value => markReviewed(value.key)); setStep('done') }
  const primary = async () => {
    if (!context || writing.current || busy) return
    writing.current = true; setWorking(true); setSaveError(false)
    try {
      if (pendingCommit.current) {
        const reply = await retryWrite(generation)
        if (!alive.current) return
        if (!reply.ok) {
          if (!reply.pending) { pendingCommit.current = null; setPendingWrite(false) }
          setSaveError(true); return
        }
        pendingCommit.current(); pendingCommit.current = null; setPendingWrite(false)
        await load()
        return
      }
      if (step === 'close') {
        for (const item of context.closing) {
          if (!alive.current) return
          if (processed.current.has(item.id)) continue
          const { item: live } = await desktopApi().getItem(item.id)
          if (!alive.current) return
          // A rollover or another edit can win while this drawer is open.
          if (live.status !== 'todo' || live.archivedAt || live.deletedAt || live.placement.periodId !== item.placement.periodId) { processed.current.add(item.id); continue }
          const choice = decisions.get(item.id) ?? 'keep'
          const destination = due[live.placement.horizon as ReviewHorizon]!.next
          const confirmed = () => {
            processed.current.add(item.id)
            const count = choice === 'keep' ? 'kept' : choice === 'defer' ? 'deferred' : 'archived'
            setResult(previous => ({ ...previous, [count]: previous[count] + 1 }))
          }
          if (choice === 'keep') confirmed()
          else if (!await commit(choice === 'defer'
            ? { type: 'move', itemId: live.id, expectedVersion: live.version, expectedPlacementVersion: live.placement.version, horizon: live.placement.horizon, period: { kind: 'date', startDate: destination.startDate } }
            : { type: 'archive', itemId: live.id, expectedVersion: live.version, archived: true }, confirmed)) return
        }
      }
      if (step.startsWith('plan')) {
        const horizon = step === 'planMonth' ? 'month' : 'week', next = due[horizon]!.next
        const rows = (plans[horizon] ?? []).filter(row => row.on && row.title.trim())
        if (rows.length) {
          let plannedCount = 0
          const saved = await commit(async () => {
            const latest = await load()
            if (!latest) throw new Error('Review context unavailable')
            const candidates = new Map(planCandidates(latest.planning, horizon).map(parent => [parent.id, parent]))
            const selected = rows.filter(row => candidates.has(row.parent.id))
            plannedCount = selected.length
            if (!selected.length) return null
            return { type: 'createPlan', items: selected.map((row, index) => ({ draftId: `review-${horizon}-${index}`,
              title: row.title.trim(), description: '', dueDate: null, horizon, previewPeriodId: next.id, flowColor: null,
              period: { kind: 'date' as const, startDate: next.startDate }, parentRefs: [{ kind: 'existing' as const, itemId: row.parent.id, expectedVersion: candidates.get(row.parent.id)!.version }] })) }
          }, () => {
            setResult(previous => ({ ...previous, planned: { ...previous.planned, [horizon]: previous.planned[horizon] + plannedCount } }))
            setPlans(previous => ({ ...previous, [horizon]: [] }))
          })
          if (!saved) return
        }
      }
      if (!alive.current) return
      const refreshed = step === 'review' ? context : await load()
      if (!refreshed) return
      const next = steps[steps.indexOf(step) + 1]!
      if (next === 'done') finish(); else setStep(next)
    } catch { if (alive.current) setSaveError(true) }
    finally { writing.current = false; if (alive.current) setWorking(false) }
  }
  const rows = step === 'planMonth' ? plans.month : step === 'planWeek' ? plans.week : null
  const planHorizon: ReviewHorizon = step === 'planMonth' ? 'month' : 'week'
  const count = rows?.filter(row => row.on && row.title.trim()).length ?? 0
  const existing = planning?.items.filter(item => item.placement.periodId === due[planHorizon]?.next.id) ?? []
  const disabled = busy || working
  const setRow = (index: number, patch: Partial<PlanRow>) => setPlans(previous => ({ ...previous, [planHorizon]: previous[planHorizon]!.map((row, at) => at === index ? { ...row, ...patch } : row) }))
  const nextStep = steps[steps.indexOf(step) + 1]
  const label = step.startsWith('plan') ? count ? t.planConfirm(count) : nextStep === 'done' ? t.reviewFinish : t.nextStep(stepName(nextStep!)) : t.nextStep(stepName(nextStep ?? 'done'))

  return <dialog ref={dialog} className="review-drawer" aria-labelledby="review-title" onCancel={event => { event.preventDefault(); if (!working && !pendingWrite) close() }}>
    <div className="review-layout">
      <header className="review-head"><div><h2 id="review-title">{started && !hasHistory ? t.reviewArrange(periodName(target.horizon, true)) : title}</h2>
        <p>{started && !hasHistory ? periodDates(target.next) : target.lastDay ? t.reviewEnds(periodDates(target.period)) : t.reviewEnded(periodDates(target.period))}</p></div>
        <button className="icon-button" aria-label={t.closeReview} disabled={working || pendingWrite} onClick={close}><Icon name="close" size={18} /></button>
      </header>
      <ol className="review-steps">{steps.filter(value => value !== 'done').map((value, index) => <li key={value} aria-current={value === step ? 'step' : undefined} data-done={steps.indexOf(value) < steps.indexOf(step)}><span className="review-step-number">{index + 1}</span><span>{stepName(value)}</span></li>)}</ol>
      <div className="review-body" ref={body} aria-busy={!contextReady}>
        {loadError && <p className="review-note" role="alert">{t.reviewLoadFailed} <button className="text-button" onClick={() => void load()}>{messages.retry}</button></p>}
        {!contextReady && !loadError && <p className="review-note" role="status">{messages.opening}</p>}
        {context && started && <>
          {step === 'review' && open && contextReady && <ReviewOverview due={due} context={context} ready={ready} setFilter={id => { setFilter(id); close() }} />}
          {step === 'close' && <section className="review-section">
            <h3 className="review-intro">{t.reviewHandle}</h3><p className="review-note">{target.lastDay ? t.reviewKeepCurrentNote : t.reviewKeepNote}</p>
            {targets.map(value => <div className="review-close-group" key={value.horizon}>
              <button className="text-button review-bulk" disabled={disabled} onClick={() => setDecisions(previous => new Map([...previous, ...context.closing.filter(item => item.placement.horizon === value.horizon).map(item => [item.id, 'defer'] as const)]))}>{t.reviewMoveAll(periodName(value.horizon, true))}</button>
              {context.closing.filter(item => item.placement.horizon === value.horizon && !processed.current.has(item.id)).map(item => {
                const source = context.sourcePeriods.find(period => period.id === item.placement.periodId)!
                return <div key={item.id} className="review-close-row" data-choice={decisions.get(item.id) ?? 'keep'}>
                  <label htmlFor={`review-choice-${item.id}`} className="review-goal-title">{item.title}<small>{source.id === value.period.id ? periodDates(source) : t.reviewEarlier(periodDates(source))}</small></label>
                  <select id={`review-choice-${item.id}`} disabled={disabled} value={decisions.get(item.id) ?? 'keep'} onChange={event => setDecisions(previous => new Map(previous).set(item.id, event.target.value as Decision))}>
                    <option value="keep">{t.reviewKeep}</option><option value="defer">{t.reviewMove(periodName(value.horizon, true))}</option><option value="archive">{t.archive}</option>
                  </select>
                </div>
              })}
            </div>)}
          </section>}
          {step.startsWith('plan') && <section className="review-section">
            <h3 className="review-intro">{t.reviewArrange(periodName(planHorizon, true))}</h3>
            {!hasHistory && <p className="review-note">{t.reviewNoHistory}</p>}
            {existing.length > 0 && <div className="review-existing"><h3>{t.reviewExisting(periodName(planHorizon, true), existing.length)}</h3>{existing.map(item => <div key={item.id}><Icon name="check" size={14} /><span>{item.title}</span></div>)}</div>}
            {!!rows?.length && <h3>{t.reviewNewPlans}</h3>}
            <p className="review-note">{rows?.length ? ready ? t.planNote : t.planManual : t.planNone}</p>
            {rows?.map((row, index) => <div key={row.parent.id} className="review-plan-row" data-on={row.on}>
              <label><input type="checkbox" disabled={disabled} checked={row.on} onChange={event => setRow(index, { on: event.target.checked })} />{row.parent.title}</label>
              <input className="seed-title" disabled={disabled} aria-label={row.parent.title} value={row.title} maxLength={500} placeholder={drafting ? t.seedBatchPending : t.seedPlaceholder} onChange={event => setRow(index, { title: event.target.value, typed: true })} />
            </div>)}
          </section>}
          {step === 'done' && <section className="review-section review-done"><span className="review-check"><Icon name="check" size={24} /></span><h3>{t.doneTitle}</h3>
            {(result.kept + result.deferred + result.archived) > 0 && <p>{t.reviewSaved(result.kept, result.deferred, result.archived)}</p>}
            {(['month', 'week'] as const).filter(horizon => result.planned[horizon]).map(horizon => <p key={horizon}>{t.donePlanned(periodName(horizon, true), result.planned[horizon])}</p>)}
          </section>}
        </>}
        {saveError && <p className="review-note review-error" role="alert">{t.reviewSaveFailed}</p>}
      </div>
      <footer className="review-foot">
        {step !== 'done' && (steps.indexOf(step) > 0 ? <button className="settings-button subtle" disabled={disabled || pendingWrite} onClick={() => setStep(steps[steps.indexOf(step) - 1]!)}>{t.back}</button>
          : <button className="settings-button subtle" disabled={working || pendingWrite} onClick={close}>{t.later}</button>)}
        <span className="column-spacer" />
        {step === 'done' ? <button className="settings-button primary" onClick={close}>{t.reviewBackBoard}</button>
          : <button className="settings-button primary" disabled={disabled || !started || !contextReady || loadError || drafting} onClick={() => void primary()}>{pendingWrite ? messages.retry : label}</button>}
      </footer>
    </div>
  </dialog>
}
