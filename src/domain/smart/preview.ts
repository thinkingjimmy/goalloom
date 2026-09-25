/**
 * [INPUT]: Question plans, normalized answers, precision metadata and current candidates.
 * [OUTPUT]: Editable drafts, schedule/date/parent suggestions and explicit unevaluated warnings.
 * [POS]: Pure preview assembly; contract violations become malformed-response failures.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { HorizonChoice, PreviewDraft, PreviewWarning, RelationSuggestion, SmartPreview } from '../../shared/contracts/smart-input'
import { planOrder } from '../plan'
import { booleanState, certainChoice, checkBoolean, checkChoice, type CheckedChoice, type Precision } from './distribution'
import { horizonOptions, inferOptions, layoutOptions, roleOptions, useOptions, type Pair, type QuestionPlan, type SmartContext } from './questions'
import { titleLimit } from './segments'
import { serverText } from '../../shared/i18n/server'

export interface Round { answers: Record<string, unknown>; precision: Precision }
const options = (criteria: Record<string, string>) => Object.keys(criteria)
const suggestion = <T>(value: T, checked: CheckedChoice | null, certain: boolean) => ({ value, certain, metrics: checked?.metrics ?? null })

export function taskSlots(plan: QuestionPlan, round: Round): string[] {
  return plan.slots.filter((slot, index) => index === 0 || checkChoice(round.answers[`role_${slot.id}`], options(roleOptions), round.precision).choice === 'task').map(slot => slot.id)
}

export function buildPreview(context: SmartContext, plan: QuestionPlan, first: Round, supplement: { round: Round; pairs: Pair[] } | null): SmartPreview {
  const choice = (id: string, criteria: Record<string, string>) => checkChoice(first.answers[id], options(criteria), first.precision)
  const warnings: PreviewWarning[] = []
  const layout = choice('layout', layoutOptions)
  const tasks = new Set(taskSlots(plan, first))
  // --- Each non-task fragment attaches to the preceding task, so no original wording is dropped. ---
  const owner = new Map<string, string>()
  let current = plan.slots[0]!.id
  for (const slot of plan.slots) { if (tasks.has(slot.id)) current = slot.id; owner.set(slot.id, current) }
  const drafts: PreviewDraft[] = plan.slots.filter(slot => tasks.has(slot.id)).map(slot => {
    const members = plan.slots.filter(row => owner.get(row.id) === slot.id)
    // The description is the user's own wording after the title, punctuation intact, not fragments re-joined.
    const last = members.at(-1)!, next = plan.slots[plan.slots.indexOf(last) + 1]
    // Include the closing mark after the last fragment ("…判断。"), but not a separator leading into the next item.
    const tail = context.text.slice(slot.end, next?.start ?? context.text.length).replace(/^[\s，,。；;、]+/, '').replace(/[\s，,；;、]+$/, '')
    const overflow = slot.text.length > titleLimit
    const role = choice(`role_${slot.id}`, roleOptions)
    const horizons = members.map(row => choice(`horizon_${row.id}`, horizonOptions))
    const own = horizons[0]!
    const pick = certainChoice(own) && own.choice !== 'later' ? own : horizons.find(row => certainChoice(row) && !['later', 'unclear'].includes(row.choice)) ?? own
    const horizon = (pick.choice === 'unclear' ? 'later' : pick.choice) as HorizonChoice
    if (horizon === 'future') warnings.push({ kind: 'future', draftId: slot.id, text: serverText().smart.futurePeriod })
    return {
      draftId: slot.id, source: slot.text, roleCertain: plan.slots[0]!.id === slot.id || certainChoice(role),
      title: overflow ? slot.text.slice(0, titleLimit) : slot.text,
      description: [overflow ? slot.text : '', tail].filter(Boolean).join('\n'),
      horizon: suggestion(horizon, pick, certainChoice(pick) || pick.choice === 'later'),
      due: dueFor(members.map(row => row.id)),
      inferredHorizon: inferFor(slot.id, horizon),
    }
  })
  // --- The draft's deadline comes from its most confident fragment (often the "周五前完成" modifier), never just the first one. ---
  // Only a text with no usable written time gets a guess; the guess is labelled, never passed off as written.
  function inferFor(slotId: string, written: HorizonChoice): PreviewDraft['inferredHorizon'] {
    if (written !== 'later') return null
    const guess = choice(`infer_${slotId}`, inferOptions)
    return guess.choice === 'later' ? null : suggestion(guess.choice as 'day' | 'week' | 'month' | 'cycle', guess, certainChoice(guess, []))
  }
  function dueFor(slotIds: string[]): PreviewDraft['due'] {
    const found = slotIds.flatMap(slotId => {
      const due = choice(`due_${slotId}`, { ...Object.fromEntries(plan.dates.map(date => [date.id, ''])), none: '', unclear: '' })
      const date = plan.dates.find(row => row.id === due.choice)
      if (!date) return []
      const use = choice(`use_${date.id}`, useOptions)
      if (use.choice !== 'deadline') return []
      return [{ date, due, certain: !!date.value && !date.ambiguous && certainChoice(due, ['none', 'unclear']) && certainChoice(use) }]
    }).sort((a, b) => Number(b.certain) - Number(a.certain) || (b.due.metrics?.top ?? 0) - (a.due.metrics?.top ?? 0))
    const best = found[0]
    if (!best) return { value: null, certain: true, metrics: null }
    if (best.date.ambiguous) warnings.push({ kind: 'ambiguous_date', draftId: slotIds[0]!, text: serverText().smart.ambiguousDate(best.date.text, best.date.value ?? null) })
    return suggestion(best.date.value, best.due, best.certain)
  }
  // The layout is only a label; its uncertainty matters to the user only when the text was split.
  if (!certainChoice(layout) && drafts.length > 1) warnings.push({ kind: 'layout', draftId: null, text: serverText().smart.layoutUncertain })
  for (const id of ['reminder', 'repeat', 'clock'] as const) {
    if (booleanState(checkBoolean(first.answers[id]), first.precision.decimals) !== 'no') warnings.push({ kind: id === 'clock' ? 'clock_time' : id, draftId: null, text: serverText().smart.unsupportedRequest(serverText().smart.unsupported[id]) })
  }
  const distributions = plan.slots.flatMap(slot => [choice(`role_${slot.id}`, roleOptions), choice(`horizon_${slot.id}`, horizonOptions)]).map(row => row.distribution)
  if (distributions.some(kind => kind === 'missing' || kind === 'unconfirmed')) warnings.push({ kind: 'precision', draftId: null, text: serverText().smart.precision })
  const relations = relationsFor(context, plan, first, supplement, owner, tasks)
  if (relations.some(row => row.state === 'not_evaluated')) warnings.push({ kind: 'relations_partial', draftId: null, text: serverText().smart.relationsPartial })
  const sent = new Set((plan.state.goals as { id: string }[]).map(goal => goal.id))
  const related = new Set(relations.flatMap(row => row.parent.kind === 'existing' ? [row.parent.itemId] : []))
  return { layout: suggestion(layout.choice as SmartPreview['layout']['value'], layout, certainChoice(layout)), referenceDate: context.referenceDate, periods: context.periods,
    drafts, candidates: context.candidates.filter(candidate => sent.has(candidate.ref) || related.has(candidate.itemId)), relations, warnings,
    questionCount: Object.keys(plan.questions).length + (supplement?.pairs.filter(pair => pair.key).length ?? 0), requests: supplement ? 2 : 1 }
}

function relationsFor(context: SmartContext, plan: QuestionPlan, first: Round, supplement: { round: Round; pairs: Pair[] } | null, owner: Map<string, string>, tasks: Set<string>): RelationSuggestion[] {
  const sources = supplement ? { pairs: supplement.pairs, round: supplement.round } : { pairs: plan.pairs, round: first }
  const merged = new Map<string, RelationSuggestion>()
  const rank = { yes: 3, maybe: 2, no: 1, not_evaluated: 0 }
  for (const pair of sources.pairs) {
    const child = owner.get(pair.childSlotId)!
    const ref = pair.parent.kind === 'existing' ? pair.parent.ref : null
    const parent = ref !== null ? { kind: 'existing' as const, itemId: context.candidates.find(candidate => candidate.ref === ref)!.itemId } : { kind: 'draft' as const, draftId: owner.get((pair.parent as { slotId: string }).slotId)! }
    if (parent.kind === 'draft' && (parent.draftId === child || !tasks.has(parent.draftId))) continue
    const probability = pair.key ? checkBoolean(sources.round.answers[pair.key]) : null
    const state = probability === null ? 'not_evaluated' : booleanState(probability, sources.round.precision.decimals)
    const key = `${parent.kind}:${parent.kind === 'existing' ? parent.itemId : parent.draftId}>${child}`
    const previous = merged.get(key)
    if (!previous || rank[state] > rank[previous.state] || (state === previous.state && (probability ?? 0) > (previous.probability ?? 0))) merged.set(key, { parent, childDraftId: child, state, probability })
  }
  // --- "关联「官网改版」" naming an existing goal is the user's own choice, not a judgement to second-guess. ---
  for (const candidate of context.candidates) {
    const quoted = new RegExp(`(?:关联|属于|归入|归到|加入|挂到|放到|放进)\\s*[「『“"【]${candidate.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[」』”"】]`)
    for (const slot of plan.slots.filter(row => quoted.test(row.text))) {
      const child = owner.get(slot.id)!, key = `existing:${candidate.itemId}>${child}`
      merged.set(key, { parent: { kind: 'existing', itemId: candidate.itemId }, childDraftId: child, state: 'yes', probability: merged.get(key)?.probability ?? null })
    }
  }
  // --- Suggested batch edges must stay acyclic: drop the weakest suggestion in each cycle. ---
  const rows = [...merged.values()]
  for (;;) {
    const active = rows.filter(row => row.parent.kind === 'draft' && row.state === 'yes')
    const drafts = [...tasks].map(id => ({ draftId: id, flowColor: null, parentRefs: active.filter(row => row.childDraftId === id).map(row => ({ kind: 'draft' as const, draftId: (row.parent as { draftId: string }).draftId })) }))
    if (planOrder(drafts)) break
    const weakest = active.sort((a, b) => (a.probability ?? 0) - (b.probability ?? 0))[0]!
    weakest.state = 'maybe'
  }
  return rows
}
