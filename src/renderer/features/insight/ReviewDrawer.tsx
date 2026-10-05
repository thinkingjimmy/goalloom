/**
 * [INPUT]: Review selection, generation/revision, shared Select/link rendering, cached drafting and guarded writes.
 * [OUTPUT]: Resumable review with guarded closing/confirm/skip and a completion callback after all writes and receipts succeed.
 * [POS]: Review session owner; read contexts separate historical facts from current command versions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { ItemSummary } from '../../../shared/contracts/entities'
import type { ReviewContext, Snapshot } from '../../../shared/contracts/queries'
import { insightMessages as t, messages, horizonNames } from '../../i18n'
import { desktopApi, type Action, type PreparedWrite, type WriteResult } from '../../state/use-workspace'
import { useFlows } from '../../state/flows'
import { requestReviewDraft } from '../../state/review-drafts'
import { periodDates, planningLabel } from '../../lib/periods'
import { flowVars } from '../../lib/colors'
import { Icon } from '../../components/icons'
import { LinkText } from '../../components/links/LinkText'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { boardDigest, periodText } from './signals'
import { planCandidates, type ReviewDue, type ReviewHorizon } from './review'
import { ReviewOverview } from './ReviewOverview'
import './insight.css'
import './review.css'
import '../composer/composer.css'

type Step = 'review' | 'close' | 'planMonth' | 'planWeek'
type Decision = 'keep' | 'defer' | 'archive'
interface PlanRow { parent: ItemSummary; title: string; on: boolean; typed: boolean }

export function ReviewDrawer({ due, snapshot, open, ready, write, retryWrite, busy, close, complete }: {
  due: ReviewDue; snapshot: Snapshot; open: boolean; ready: boolean
  write: PreparedWrite; retryWrite: (generation: string) => Promise<WriteResult>; busy: boolean; close: () => void; complete: () => void
}) {
  const [context, setContext] = useState<ReviewContext | null>(null)
  const [contextReady, setContextReady] = useState(false)
  const [loadError, setLoadError] = useState(false), [saveError, setSaveError] = useState(false)
  const [step, setStep] = useState<Step>('review'), [started, setStarted] = useState(false)
  const [decisions, setDecisions] = useState(new Map<string, Decision>())
  const choiceFor = (id: string): Decision => decisions.get(id) ?? 'defer'
  const [plans, setPlans] = useState<Record<ReviewHorizon, PlanRow[] | null>>({ week: null, month: null })
  const [drafting, setDrafting] = useState<Record<ReviewHorizon, boolean>>({ week: false, month: false }), [working, setWorking] = useState(false)
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
  const steps: Step[] = [...(hasHistory ? ['review' as const] : []), ...(hasClosing ? ['close' as const] : []), ...(due.month ? ['planMonth' as const] : []), ...(due.week ? ['planWeek' as const] : [])]
  useEffect(() => {
    if (!context || started) return
    setStarted(true)
    setStep(steps[0]!)
  }, [context, started])
  const stepName = (value: Step) => value === 'review' ? t.reviewLookBack(periodName(target.horizon)) : value === 'close' ? t.reviewHandle
    : value === 'planMonth' ? t.reviewArrange(periodName('month', true)) : t.reviewArrange(periodName('week', true))

  // Initialize once per destination. Late model replies merge only into untouched titles.
  useEffect(() => {
    if (!open || !planning || !step.startsWith('plan')) return
    const horizon = step === 'planMonth' ? 'month' : 'week'
    if (plans[horizon]) return
    const parents = planCandidates(planning, horizon), next = due[horizon]!.next
    const rows = parents.map(parent => ({ parent, title: '', on: true, typed: false }))
    setPlans(previous => ({ ...previous, [horizon]: rows }))
    if (!ready || !rows.length) return
    setDrafting(previous => ({ ...previous, [horizon]: true }))
    void requestReviewDraft({ generation, board: boardDigest(planning, flows), tasks: parents.map(parent => ({ id: parent.id,
      parent: parent.title, goal: flows.of(parent.id).find(flow => flow.id !== parent.id)?.title ?? null,
      target: periodText(next, next.id !== snapshot.periods.find(period => period.horizon === horizon)?.id), targetHorizon: horizon, siblings: [] })) }, `${horizon}:${next.startDate}`)
      .then(reply => {
        if (!alive.current) return
        setDrafting(previous => ({ ...previous, [horizon]: false }))
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
  const advance = () => {
    const next = steps[steps.indexOf(step) + 1]
    if (next) setStep(next); else complete()
  }
  const primary = async (skipPlan = false) => {
    if (!context || writing.current || busy) return
    if (skipPlan && (!step.startsWith('plan') || pendingWrite || pendingCommit.current)) return
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
        if (await load() && step.startsWith('plan')) advance()
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
          const choice = choiceFor(item.id)
          const destination = due[live.placement.horizon as ReviewHorizon]!.next
          const confirmed = () => { processed.current.add(item.id) }
          if (choice === 'keep') confirmed()
          else if (!await commit(choice === 'defer'
            ? { type: 'move', itemId: live.id, expectedVersion: live.version, expectedPlacementVersion: live.placement.version, horizon: live.placement.horizon, period: { kind: 'date', startDate: destination.startDate } }
            : { type: 'archive', itemId: live.id, expectedVersion: live.version, archived: true }, confirmed)) return
        }
      }
      if (step.startsWith('plan') && !skipPlan) {
        const horizon = step === 'planMonth' ? 'month' : 'week', next = due[horizon]!.next
        const rows = (plans[horizon] ?? []).filter(row => row.on && row.title.trim())
        if (rows.length) {
          const saved = await commit(async () => {
            const latest = await load()
            if (!latest) throw new Error('Review context unavailable')
            const candidates = new Map(planCandidates(latest.planning, horizon).map(parent => [parent.id, parent]))
            const selected = rows.filter(row => candidates.has(row.parent.id))
            if (!selected.length) return null
            return { type: 'createPlan', items: selected.map((row, index) => ({ draftId: `review-${horizon}-${index}`,
              title: row.title.trim(), description: '', dueDate: null, horizon, previewPeriodId: next.id, flowColor: null,
              period: { kind: 'date' as const, startDate: next.startDate }, parentRefs: [{ kind: 'existing' as const, itemId: row.parent.id, expectedVersion: candidates.get(row.parent.id)!.version }] })) }
          }, () => {
            setPlans(previous => ({ ...previous, [horizon]: [] }))
          })
          if (!saved) return
        }
      }
      if (!alive.current) return
      const refreshed = step === 'review' ? context : await load()
      if (!refreshed) return
      advance()
    } catch { if (alive.current) setSaveError(true) }
    finally { writing.current = false; if (alive.current) setWorking(false) }
  }
  const rows = step === 'planMonth' ? plans.month : step === 'planWeek' ? plans.week : null
  const planHorizon: ReviewHorizon = step === 'planMonth' ? 'month' : 'week'
  const count = rows?.filter(row => row.on && row.title.trim()).length ?? 0
  const parentHorizon = planHorizon === 'week' ? 'month' : 'cycle'
  const parentPeriod = planning?.periods.find(period => period.horizon === parentHorizon)
  const parentName = parentPeriod ? planningLabel(parentPeriod, snapshot.workspace.calendar!, snapshot.observedAt) : horizonNames[parentHorizon]
  const currentDrafting = step.startsWith('plan') && drafting[planHorizon]
  const disabled = busy || working
  const setRow = (index: number, patch: Partial<PlanRow>) => setPlans(previous => ({ ...previous, [planHorizon]: previous[planHorizon]!.map((row, at) => at === index ? { ...row, ...patch } : row) }))
  const nextStep = steps[steps.indexOf(step) + 1]
  const label = step.startsWith('plan') && count ? t.planConfirm(count) : nextStep ? t.nextStep(stepName(nextStep)) : t.reviewFinish

  return <dialog ref={dialog} className="review-drawer" aria-labelledby="review-title" onCancel={event => { event.preventDefault(); if (!working && !pendingWrite) close() }}>
    <div className="review-layout">
      <header className="review-head"><div><h2 id="review-title">{started && !hasHistory ? t.reviewArrange(periodName(target.horizon, true)) : title}</h2>
        <p>{started && !hasHistory ? periodDates(target.next) : target.lastDay ? t.reviewEnds(periodDates(target.period)) : t.reviewEnded(periodDates(target.period))}</p></div>
        <button className="icon-button" aria-label={t.closeReview} disabled={working || pendingWrite} onClick={close}><Icon name="close" size={18} /></button>
      </header>
      <ol className="review-steps">{steps.map((value, index) => <li key={value} aria-current={value === step ? 'step' : undefined} data-done={steps.indexOf(value) < steps.indexOf(step)}><span className="review-step-number">{index + 1}</span><span>{stepName(value)}</span></li>)}</ol>
      <div className="review-body" ref={body} aria-busy={!contextReady}>
        {loadError && <p className="review-note" role="alert">{t.reviewLoadFailed} <button className="text-button" onClick={() => void load()}>{messages.retry}</button></p>}
        {!contextReady && !loadError && <p className="review-note" role="status">{messages.opening}</p>}
        {context && started && <>
          {step === 'review' && open && contextReady && <ReviewOverview due={due} context={context} ready={ready} />}
          {step === 'close' && <section className="review-section">
            <h3 className="review-intro">{t.reviewHandle}</h3><p className="review-note">{t.reviewMoveNote}</p>
            {targets.map(value => <div className="review-close-group" key={value.horizon}>
              {context.closing.filter(item => item.placement.horizon === value.horizon && !processed.current.has(item.id)).map(item => {
                return <div key={item.id} className="review-close-row" data-choice={choiceFor(item.id)}>
                  <div id={`review-choice-title-${item.id}`} className="review-goal-title"><span className="check review-todo-check" aria-hidden="true" style={flowVars(flows.colorsOf(item.id))} /><span className="review-item-title"><LinkText text={item.title} /></span></div>
                  <Select disabled={disabled} value={choiceFor(item.id)} onValueChange={choice => setDecisions(previous => new Map(previous).set(item.id, choice as Decision))}>
                    <SelectTrigger className="review-choice" aria-labelledby={`review-choice-title-${item.id}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="defer">{t.reviewMove(periodName(value.horizon, true))}</SelectItem>
                      <SelectItem value="keep">{t.reviewKeep}</SelectItem>
                      <SelectItem value="archive">{t.archive}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              })}
            </div>)}
          </section>}
          {step.startsWith('plan') && <section className="review-section">
            <h3 className="review-intro">{t.reviewArrange(periodName(planHorizon, true))}</h3>
            {!hasHistory && <p className="review-note">{t.reviewNoHistory}</p>}
            <h3>{t.reviewNewPlans}</h3>
            <p className="review-note">{rows?.length ? ready ? t.planNote(parentName, periodName(planHorizon, true)) : t.planManual(parentName, periodName(planHorizon, true)) : t.planNone}</p>
            <div className="review-plan-list">{rows?.map((row, index) => <div key={row.parent.id} className="review-plan-row" data-on={row.on}>
              <div className="review-plan-head">
                <div className="review-plan-source"><span className="check review-todo-check" aria-hidden="true" style={flowVars(flows.colorsOf(row.parent.id))} /><span id={`review-plan-title-${row.parent.id}`} className="review-item-title"><LinkText text={row.parent.title} /></span></div>
                <Select disabled={disabled} value={row.on ? 'include' : 'exclude'} onValueChange={value => setRow(index, { on: value === 'include' })}>
                  <SelectTrigger className="review-choice" aria-labelledby={`review-plan-title-${row.parent.id}`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="include">{t.planInclude(planningLabel(due[planHorizon]!.next, snapshot.workspace.calendar!, snapshot.observedAt))}</SelectItem>
                    <SelectItem value="exclude">{t.planSkip}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="review-plan-child" style={flowVars(flows.colorsOf(row.parent.id))}><span className="check review-todo-check" aria-hidden="true" /><input className="seed-title" disabled={disabled} aria-label={row.parent.title} value={row.title} maxLength={500} placeholder={currentDrafting ? t.seedBatchPending : t.seedPlaceholder} onChange={event => setRow(index, { title: event.target.value, typed: true })} /></div>
            </div>)}</div>
          </section>}
        </>}
        {saveError && <p className="review-note review-error" role="alert">{t.reviewSaveFailed}</p>}
      </div>
      <footer className="review-foot">
        {steps.indexOf(step) > 0 ? <button className="settings-button review-text-button" disabled={disabled || pendingWrite} onClick={() => setStep(steps[steps.indexOf(step) - 1]!)}>{t.back}</button>
          : <button className="settings-button review-text-button" disabled={working || pendingWrite} onClick={close}>{t.later}</button>}
        <span className="column-spacer" />
        {step.startsWith('plan') && <button className="settings-button review-text-button review-skip-plan" disabled={disabled || pendingWrite || !started || !contextReady || loadError} onClick={() => void primary(true)}>{t.planSkip}</button>}
        <button className="settings-button primary" disabled={disabled || !started || !contextReady || loadError || currentDrafting} onClick={() => void primary()}>{pendingWrite ? messages.retry : label}</button>
      </footer>
    </div>
  </dialog>
}
