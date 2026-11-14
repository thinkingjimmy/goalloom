/**
 * [INPUT]: A due review (day, week, month or merged month+week), the board snapshot, guarded/prepared writes, model readiness and the review context query.
 * [OUTPUT]: A content-sized review dialog of single-action screens per horizon — look back (replayed steps), sort unfinished items (move to the next period / to Later, add drafted next steps), choose the period's focus — then complete().
 *           An effective daily focus preselects that task and disables other focus picks.
 * [POS]: Review session owner; historical facts come from the review projection and every write re-reads live versions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ItemSummary, PlanningPeriod } from '../../../shared/contracts/entities'
import type { ReviewContext, Snapshot } from '../../../shared/contracts/queries'
import { combinedTopology } from '../../../domain/nesting'
import { effectiveFocus } from '../../../domain/focus'
import { insightMessages as t, messages, horizonNames } from '../../i18n'
import { desktopApi, type Action, type PreparedWrite, type WriteResult } from '../../state/use-workspace'
import { useFlows } from '../../state/flows'
import { aiScope } from '../../state/ai-scope'
import { requestReviewDraft } from '../../state/review-drafts'
import { periodDates, planningLabel } from '../../lib/periods'
import { Icon } from '../../components/icons'
import { IconButton, SettingsButton } from '../../components/ui/button'
import { FocusMark } from '../../components/focus/FocusMark'
import { boardDigest, periodText } from './signals'
import { childHorizon, dueTargets, parentHorizon, planCandidates, type ReviewDue, type ReviewHorizon } from './review'
import { ReviewChoice, ReviewColumn, ReviewPick, ReviewRow, flowColorOf } from './ReviewBoard'
import './review.css'
import './review-dialog.css'

type Stage = { kind: 'look' | 'pick' | 'focus'; horizon: ReviewHorizon }
interface DraftRow { parent: ItemSummary; title: string; on: boolean }
const contextHorizons = { month: ['half', 'cycle'], week: ['cycle', 'month'], day: ['week'] } as const

function stagesFor(due: ReviewDue): Stage[] {
  const run = (horizon: ReviewHorizon, look = true): Stage[] => [...(look ? [{ kind: 'look' as const, horizon }] : []), { kind: 'pick', horizon }, { kind: 'focus', horizon }]
  // The monthly look already lists its weeks; the merged review then plans the month and the week.
  if (due.scope === 'both') return [...run('month'), ...run('week', false)]
  return run(due.day ? 'day' : due.month ? 'month' : 'week')
}

export function ReviewDialog({ due, snapshot, open, ready, write, retryWrite, busy, close, complete }: {
  due: ReviewDue; snapshot: Snapshot; open: boolean; ready: boolean
  write: PreparedWrite; retryWrite: (generation: string) => Promise<WriteResult>; busy: boolean; close: () => void; complete: () => void
}) {
  const generation = snapshot.workspace.generation, calendar = snapshot.workspace.calendar!
  const stages = useMemo(() => stagesFor(due), [due])
  const [at, setAt] = useState(0)
  const stage = stages[at]!, target = due[stage.horizon]!
  const [context, setContext] = useState<ReviewContext | null>(null)
  const [loadError, setLoadError] = useState(false), [saveError, setSaveError] = useState(false), [working, setWorking] = useState(false)
  const [choices, setChoices] = useState(new Map<string, boolean>())
  const [drafts, setDrafts] = useState<Partial<Record<ReviewHorizon, DraftRow[]>>>({})
  const [picked, setPicked] = useState<Partial<Record<ReviewHorizon, string>>>({})
  const [pending, setPending] = useState<(() => void) | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const alive = useRef(true), reading = useRef(0), processed = useRef(new Set<string>()), drafted = useRef(new Set<string>())
  useEffect(() => { alive.current = true; return () => { alive.current = false; reading.current++ } }, [])

  const load = useCallback(async () => {
    const attempt = ++reading.current
    setLoadError(false)
    try {
      const value = await desktopApi().getReviewContext({ type: 'reviewContext', generation, periods: dueTargets(due).map(value => ({ horizon: value.horizon, startDate: value.period.startDate })) })
      if (!alive.current || attempt !== reading.current || value.board.workspace.generation !== generation) return null
      setContext(value)
      return value
    } catch { if (alive.current && attempt === reading.current) setLoadError(true); return null }
  }, [generation, due])
  useEffect(() => { if (open) void load() }, [open, load])
  useEffect(() => {
    const node = dialog.current!
    if (open && !node.open) node.showModal()
    if (!open && node.open) node.close()
  }, [open])

  // Relative names start capitalized; copy that embeds one mid-sentence uses the lowered form.
  const name = (period: PlanningPeriod, sentence = false) => period.horizon === 'month' ? periodDates(period, period.startDate.slice(0, 4) !== snapshot.observedAt.slice(0, 4)) : planningLabel(period, calendar, snapshot.observedAt, sentence)
  const nextName = name(target.next), nextInSentence = name(target.next, true)

  // ---- Look back: the reviewed period, its child-horizon steps under their parents, and a step replay.
  const board = context?.board ?? null
  const steps = useMemo(() => context?.steps ?? [], [context])
  const flows = useFlows(board, useMemo(() => [...board?.items ?? [], ...steps], [board, steps]))
  const records = useMemo(() => board?.items.filter(item => item.placement.periodId === target.period.id) ?? [], [board, target.period.id])
  const children = useMemo(() => {
    const child = childHorizon[stage.horizon]
    return child ? steps.filter(item => item.placement.horizon === child) : []
  }, [steps, stage.horizon])
  const parentOf = useMemo(() => {
    const ids = new Set(records.map(item => item.id)), map = new Map<string, string>()
    const edges = combinedTopology(board?.relations ?? [], board?.nesting ?? [])
    for (const item of children) {
      const nested = item.placement.nestingParentId
      const parent = nested && ids.has(nested) ? nested : edges.find(edge => edge.childId === item.id && ids.has(edge.parentId))?.parentId
      if (parent) map.set(item.id, parent)
    }
    return map
  }, [records, children, board])
  const replayOrder = useMemo(() => [...children, ...records].filter(item => item.status === 'done').map(item => item.id), [children, records])
  const [lit, setLit] = useState(0), [replayRun, setReplayRun] = useState(0)
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  useEffect(() => {
    if (stage.kind !== 'look' || !context) return
    if (reduced) { setLit(replayOrder.length); return }
    setLit(0)
    const timers = replayOrder.map((_, index) => window.setTimeout(() => setLit(index + 1), 360 + index * 180))
    return () => timers.forEach(window.clearTimeout)
  }, [stage.kind, context, replayOrder, replayRun, reduced])
  const litSet = new Set(replayOrder.slice(0, lit)), settled = lit >= replayOrder.length
  const goalSteps = flows.all.filter(flow => !flow.archived).map(flow => [flow, replayOrder.filter(id => flows.of(id).some(value => value.id === flow.id)).length] as const).filter(([, count]) => count > 0)
  const pastFocusId = board ? effectiveFocus(board.focus, [...board.items, ...steps]).get(target.period.id) ?? null : null
  const pastFocus = pastFocusId ? records.find(item => item.id === pastFocusId) ?? null : null

  // ---- Sort unfinished items and drafted next steps for the destination period.
  const planning = context?.planning ?? null
  const planFlows = useFlows(planning, planning?.items ?? [])
  const closing = (context?.closing ?? []).filter(item => item.placement.horizon === stage.horizon && !processed.current.has(item.id))
  const keep = (id: string) => choices.get(id) ?? true
  const rows = drafts[stage.horizon] ?? []
  useEffect(() => {
    if (!open || !planning || stage.kind !== 'pick' || !ready) return
    const horizon = stage.horizon, key = `${horizon}:${target.next.startDate}`
    if (drafted.current.has(key)) return
    drafted.current.add(key)
    const parents = planCandidates(planning, horizon)
    if (!parents.length) return
    const owner = aiScope(), next = target.next
    void requestReviewDraft({ generation, board: boardDigest(planning, planFlows), tasks: parents.map(parent => ({ id: parent.id, parent: parent.title,
      goal: planFlows.of(parent.id).find(flow => flow.id !== parent.id)?.title ?? null, target: periodText(next, true), targetHorizon: horizon, siblings: [] })) }, key).then(reply => {
      if (!alive.current || owner !== aiScope() || !reply.ok) return
      const titles = new Map(reply.value.map(value => [value.id, value.title]))
      setDrafts(previous => ({ ...previous, [horizon]: parents.flatMap(parent => titles.get(parent.id)?.trim() ? [{ parent, title: titles.get(parent.id)!.trim(), on: false }] : []) }))
    })
  }, [open, planning, stage, ready, generation, target.next, planFlows])

  // ---- Focus of the destination period.
  const candidates = planning?.items.filter(item => item.placement.periodId === target.next.id && !item.archivedAt && !item.deletedAt && item.status !== 'cancelled') ?? []
  const currentFocus = planning ? effectiveFocus(planning.focus, planning.items).get(target.next.id) ?? null : null
  const lockedFocus = stage.horizon === 'day' ? currentFocus : null
  const chosen = lockedFocus ?? picked[stage.horizon] ?? currentFocus
  const chosenItem = candidates.find(item => item.id === chosen) ?? null

  // ---- Writes. A pending (unknown) receipt keeps the step until it is confirmed.
  const commit = async (action: Action | (() => Promise<Action | null>), confirmed: () => void) => {
    const reply = await write(typeof action === 'function' ? action : async () => action, generation)
    if (!alive.current) return false
    if (reply.ok) { confirmed(); return true }
    if (reply.pending) setPending(() => confirmed)
    setSaveError(true)
    return false
  }
  const savePick = async () => {
    for (const item of closing) {
      const { item: live } = await desktopApi().getItem(item.id)
      if (!alive.current) return false
      // A rollover or another edit can win while the dialog is open.
      if (live.status !== 'todo' || live.archivedAt || live.deletedAt || live.placement.periodId !== item.placement.periodId) { processed.current.add(item.id); continue }
      const done = () => { processed.current.add(item.id) }
      const action: Action = keep(item.id)
        ? { type: 'move', group: true, itemId: live.id, expectedVersion: live.version, expectedPlacementVersion: live.placement.version, horizon: live.placement.horizon, period: { kind: 'date', startDate: target.next.startDate } }
        : { type: 'move', itemId: live.id, expectedVersion: live.version, expectedPlacementVersion: live.placement.version, horizon: 'later' }
      if (!await commit(action, done)) return false
    }
    const accepted = rows.filter(row => row.on)
    if (accepted.length) {
      const horizon = stage.horizon, next = target.next
      const saved = await commit(async () => {
        const latest = await load()
        if (!latest) throw new Error('Review context unavailable')
        const live = new Map(planCandidates(latest.planning, horizon).map(parent => [parent.id, parent]))
        const selected = accepted.filter(row => live.has(row.parent.id))
        if (!selected.length) return null
        return { type: 'createPlan', items: selected.map((row, index) => ({ draftId: `review-${horizon}-${index}`, title: row.title, description: '', dueDate: null, horizon, previewPeriodId: next.id, flowColor: null,
          period: { kind: 'date' as const, startDate: next.startDate }, parentRefs: [{ kind: 'existing' as const, itemId: row.parent.id, expectedVersion: live.get(row.parent.id)!.version }] })) }
      }, () => setDrafts(previous => ({ ...previous, [horizon]: [] })))
      if (!saved) return false
    }
    return !!await load()
  }
  // Re-read before writing: a resolved receipt or another edit may already have set the pointer.
  const saveFocus = async () => {
    if (!chosen) return true
    const latest = await load()
    if (!latest) return false
    if (effectiveFocus(latest.planning.focus, latest.planning.items).get(target.next.id) === chosen) return true
    const stored = latest.planning.focus?.find(value => value.periodId === target.next.id)?.itemId ?? null
    return commit({ type: 'focus', periodId: target.next.id, itemId: chosen, expectedItemId: stored }, () => undefined)
  }
  const advance = async () => {
    if (!context || working || busy) return
    setWorking(true); setSaveError(false)
    try {
      if (pending) {
        const reply = await retryWrite(generation)
        if (!alive.current) return
        if (!reply.ok) { if (!reply.pending) setPending(null); setSaveError(true); return }
        pending(); setPending(null)
      }
      const ok = stage.kind === 'pick' ? await savePick() : stage.kind === 'focus' ? await saveFocus() : true
      if (!ok || !alive.current) return
      if (at + 1 < stages.length) setAt(at + 1); else complete()
    } catch { if (alive.current) setSaveError(true) }
    finally { if (alive.current) setWorking(false) }
  }

  const disabled = busy || working
  // A focus is required whenever there is something to choose; an empty period can still finish.
  const needsFocus = stage.kind === 'focus' && !chosen && candidates.length > 0
  const total = stages.length, last = at === total - 1
  const kind = t.reviewKind[stage.horizon]
  const eyebrow = stage.kind === 'look' ? `${kind} · ${t.reviewLookBack(name(target.period, true))}` : `${kind} · ${t.reviewArrange(nextInSentence)}`
  const title = stage.kind === 'look' ? (stage.horizon === 'day' ? t.reviewStepsDay(lit) : t.reviewSteps(lit)) : stage.kind === 'pick' ? t.reviewPendingTitle : t.focusName[stage.horizon]
  const parentPeriod = planning?.periods.find(period => period.horizon === parentHorizon[stage.horizon])
  const parentColumn = parentPeriod && <ReviewColumn title={horizonNames[parentPeriod.horizon]} meta={periodDates(parentPeriod)} quiet>
    {(planning?.items ?? []).filter(item => item.placement.periodId === parentPeriod.id && !item.archivedAt && item.status !== 'cancelled').map(item => <ReviewRow key={item.id} item={item} flows={planFlows} />)}
  </ReviewColumn>

  return <dialog ref={dialog} className="review-dialog" aria-labelledby="review-title" onCancel={event => { event.preventDefault(); if (!working && !pending) close() }}>
    <header className="rv-head">
      <div className="rv-head-text">
        <p className="rv-eyebrow"><span className="rv-step">{t.reviewStep(at + 1, total)}</span>{eyebrow}</p>
        <h2 id="review-title" className="rv-title-h">{title}</h2>
        {stage.kind === 'look' && settled && goalSteps.length > 0 && <p className="rv-meta">{goalSteps.map(([flow, count]) => <span key={flow.id}><i style={{ background: flowColorOf(flows, flow.id) }} />{t.reviewGoalSteps(flow.title, count)}</span>)}</p>}
      </div>
      <IconButton aria-label={t.closeReview} disabled={working || !!pending} onClick={close}><Icon name="close" size={18} /></IconButton>
    </header>

    <main className="rv-board" data-kind={stage.kind} data-columns={stage.kind === 'look' ? contextHorizons[stage.horizon].length + 1 : 2} aria-busy={!context}>
      {!context && !loadError && <p className="rv-note" role="status">{messages.opening}</p>}
      {loadError && <p className="rv-note" role="alert">{t.reviewLoadFailed} <button type="button" className="rv-link" onClick={() => void load()}>{messages.retry}</button></p>}
      {context && board && stage.kind === 'look' && <>
        {contextHorizons[stage.horizon].map(horizon => {
          const period = board.periods.find(value => value.horizon === horizon)
          if (!period) return null
          const focusId = effectiveFocus(board.focus, board.items).get(period.id)
          return <ReviewColumn key={horizon} title={horizonNames[horizon]} meta={periodDates(period)} quiet={stage.horizon === 'day'}>
            {board.items.filter(item => item.placement.periodId === period.id).map(item => <ReviewRow key={item.id} item={item} flows={flows} lit={item.status === 'done' ? litSet.has(item.id) || !replayOrder.includes(item.id) : false}>
              {focusId === item.id && horizon !== 'half' && horizon !== 'cycle' && <FocusMark scope={horizon} color={flowColorOf(flows, item.id)} />}
            </ReviewRow>)}
          </ReviewColumn>
        })}
        <ReviewColumn title={name(target.period)} meta={[periodDates(target.period), t.reviewChildren[stage.horizon]].filter(Boolean).join(' · ')} wide>
          {records.map(item => <div key={item.id} className="rv-group">
            <ReviewRow item={item} flows={flows} lit={litSet.has(item.id)}>{settled && pastFocusId === item.id && <FocusMark scope={stage.horizon} past color={flowColorOf(flows, item.id)} />}</ReviewRow>
            {children.filter(child => parentOf.get(child.id) === item.id).map(child => <ReviewRow key={child.id} item={child} flows={flows} lit={litSet.has(child.id)} step />)}
          </div>)}
          {children.some(child => !parentOf.has(child.id)) && <div className="rv-group rv-loose"><p className="rv-group-label">{t.reviewLoose[stage.horizon]}</p>
            {children.filter(child => !parentOf.has(child.id)).map(child => <ReviewRow key={child.id} item={child} flows={flows} lit={litSet.has(child.id)} step />)}</div>}
          {!records.length && !children.length && <p className="rv-note">{t.reviewGoalEmpty}</p>}
        </ReviewColumn>
      </>}
      {context && stage.kind === 'pick' && <>
        {parentColumn}
        <ReviewColumn title={nextName} meta={periodDates(target.next)} wide>
          {closing.map(item => <ReviewRow key={item.id} item={item} flows={planFlows} lit={false}>
            <ReviewChoice value={keep(item.id)} disabled={disabled} label={item.title} yes={t.reviewMove(nextInSentence)} no={t.reviewMoveLater} onChange={value => setChoices(previous => new Map(previous).set(item.id, value))} />
          </ReviewRow>)}
          {rows.map((row, index) => <ReviewRow key={row.parent.id} item={{ id: row.parent.id, title: row.title }} flows={planFlows} draft>
            <ReviewChoice value={row.on} disabled={disabled} label={row.title} yes={t.reviewAddTo(nextInSentence)} no={t.reviewNoAdd} onChange={value => setDrafts(previous => ({ ...previous, [stage.horizon]: rows.map((value2, at2) => at2 === index ? { ...value2, on: value } : value2) }))} />
          </ReviewRow>)}
          {!closing.length && !rows.length && <p className="rv-note">{t.reviewPickEmpty}</p>}
        </ReviewColumn>
      </>}
      {context && stage.kind === 'focus' && <>
        {parentColumn}
        <ReviewColumn title={nextName} meta={periodDates(target.next)} wide>
          <div role="radiogroup" aria-label={t.focusName[stage.horizon]}>
            {candidates.map(item => <ReviewPick key={item.id} item={item} flows={planFlows} on={chosen === item.id} label={t.focusSet(t.focusName[stage.horizon])}
              disabled={!!lockedFocus && lockedFocus !== item.id}
              hint={t.focusSet(t.focusName[stage.horizon])} onPick={() => setPicked(previous => ({ ...previous, [stage.horizon]: item.id }))}
              mark={<FocusMark scope={stage.horizon} color={flowColorOf(planFlows, item.id)} />} />)}
          </div>
          {!candidates.length && <p className="rv-note">{t.reviewFocusEmpty(nextName)}</p>}
        </ReviewColumn>
      </>}
    </main>

    <footer className="rv-foot">
      <div className="rv-message" key={`${at}`} aria-live="polite">
        {saveError ? <p className="rv-error" role="alert"><Icon name="warning" size={14} />{t.reviewSaveFailed}</p>
          : stage.kind === 'look' ? <p>{!settled ? t.reviewReplaying : pastFocus ? <><b className={pastFocus.status === 'done' ? 'rv-done' : undefined}>{(pastFocus.status === 'done' ? t.reviewFocusDone : t.reviewFocusOpen)(t.focusPast[stage.horizon], pastFocus.title)}</b></> : t.reviewFocusNone}</p>
          : stage.kind === 'pick' ? <p>{t.reviewPickSay(nextInSentence)}</p>
          : <p>{chosenItem ? t.reviewFocusChosen(chosenItem.title, t.focusName[stage.horizon]) : t.reviewFocusSay(nextInSentence, t.focusName[stage.horizon])}</p>}
      </div>
      <div className="rv-actions">
        {stage.kind === 'look'
          ? <SettingsButton className="rv-secondary" disabled={!settled || !context} onClick={() => setReplayRun(value => value + 1)}>{t.reviewReplay}</SettingsButton>
          : at > 0 && <SettingsButton className="rv-secondary" disabled={disabled || !!pending} onClick={() => { setSaveError(false); setAt(at - 1) }}>{t.reviewPrevious}</SettingsButton>}
        <SettingsButton variant="primary" disabled={disabled || !context || loadError || (stage.kind === 'look' && !settled) || needsFocus}
          title={needsFocus ? t.reviewFocusSay(nextInSentence, t.focusName[stage.horizon]) : undefined} onClick={() => void advance()}>
          {pending ? messages.retry : stage.kind === 'look' ? t.reviewArrange(nextInSentence) : last ? t.reviewFinish : t.reviewNextStep}
          {!last && !pending && <Icon name="forward" size={16} />}
        </SettingsButton>
      </div>
    </footer>
  </dialog>
}
