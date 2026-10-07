/**
 * [INPUT]: One item's ordered events, bounded operation/period metadata, undo markers and an injected cutoff.
 * [OUTPUT]: Shared execution facts, effect-specific effective counts, actual state seconds and explainable pressure.
 * [POS]: Pure projection for workspace, assistance and historical reviews; no IO or global clock.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { compareInstants, currentPeriod, parseDate, workspaceDate } from './calendar'
import type { BusinessState, ItemEvent, Operation } from '../shared/contracts/effects'
import type { CalendarConfig, Item, PlanningPeriod } from '../shared/contracts/entities'
import type { GuidanceRecord } from '../shared/contracts/assistance'
import type { CountBreakdown, ExecutionEvidence, ExecutionFacts, Fact, FactQuality } from '../shared/contracts/execution'
import { periodHorizons, type PeriodHorizon } from '../shared/contracts/values'
import { indexExecutionHistory, ownedExecutionEffect, replayExecutionGuidance, type ExecutionHistory } from './execution-history'

export interface ExecutionInput {
  item: Item; calendar: CalendarConfig; generation: string; sourceRevision: string
  events: ItemEvent[]; operations: Operation[]; periods: PlanningPeriod[]
  undo: { originalId: string; effectIndex: number; undoId: string; at: string; seq: number }[]
  clockAnomaly?: boolean; guidance: GuidanceRecord | null; scanLimited: boolean; effectsLimited: boolean
}
const active = (state: Pick<BusinessState, 'status' | 'archivedAt' | 'deletedAt'>) => state.status === 'todo' && !state.archivedAt && !state.deletedAt
const ms = (at: string) => Date.parse(at)
const samePlace = (a: BusinessState, b: BusinessState) => a.horizon === b.horizon && a.periodId === b.periodId
const fact = <T>(value: T | null, quality: FactQuality = 'complete', reason: string | null = null): Fact<T> => ({ value, quality, reason })
const days = (timezone: string, since: string, until: string) => parseDate(workspaceDate(timezone, since)).until(parseDate(workspaceDate(timezone, until)), { largestUnit: 'days' }).days
const emptyCounts = (): CountBreakdown => ({ total: 0, bySource: { user: 0, system: 0, unknown: 0 }, byHorizon: Object.fromEntries(periodHorizons.map(h => [h, { user: 0, system: 0, unknown: 0 }])) as CountBreakdown['byHorizon'] })
function addCount(counts: CountBreakdown, event: ExecutionEvidence, horizon: PeriodHorizon) {
  counts.total++; counts.bySource[event.source]++; counts.byHorizon[horizon][event.source]++
}

export function classifyExecutionEvent(event: ItemEvent, input: Pick<ExecutionInput, 'operations' | 'periods' | 'undo'>, asOf: string, history = indexExecutionHistory(input)): ExecutionEvidence {
  const operation = history.operations.get(event.operationId)
  const fromPeriod = event.before?.periodId ? history.periods.get(event.before.periodId) ?? null : null
  const toPeriod = event.after.periodId ? history.periods.get(event.after.periodId) ?? null : null
  const owned = ownedExecutionEffect(event, history)
  const marker = owned ? history.undo.get(`${event.operationId}:${owned.index}`) : null
  const undone = !!marker && compareInstants(marker.at, asOf) <= 0
  let category: ExecutionEvidence['category'] = event.type === 'guidance_changed' ? 'guidance'
    : ['status_changed', 'archived', 'unarchived', 'deleted', 'item_restored'].includes(event.type) ? 'state' : 'other'
  let effective: boolean | null = owned ? !undone : operation && (event.undoOf || event.type === 'baseline') ? true : null
  if (event.before && !samePlace(event.before, event.after) && !event.undoOf) {
    category = 'placement_change'
    if (active(event.before) && event.before.horizon !== 'later' && event.before.horizon === event.after.horizon
      && fromPeriod && toPeriod && ms(toPeriod.startAt) > ms(fromPeriod.startAt) && owned) {
      category = ms(fromPeriod.endAt) <= ms(event.at) ? 'carry_after_period' : 'advance_reschedule'
    }
  }
  return { eventId: event.id, operationId: event.operationId, category, source: operation?.source ?? 'unknown', at: event.at, effective,
    fromPeriodId: event.before?.periodId ?? null, toPeriodId: event.after.periodId, fromPeriod, toPeriod }
}

export function calculateExecutionFacts(input: ExecutionInput, asOf: string, historical = false): ExecutionFacts { return prepareExecutionFacts(input, asOf, historical).facts }

export function prepareExecutionFacts(input: ExecutionInput, asOf: string, historical = false): ExecutionProjection {
  const { item, calendar } = input, timezone = calendar.timezone, today = workspaceDate(timezone, asOf)
  const events = input.events.filter(event => historical ? compareInstants(event.at, asOf) < 0 : compareInstants(event.at, asOf) <= 0)
  const classificationInput = historical ? { ...input, undo: input.undo.filter(marker => compareInstants(marker.at, asOf) < 0) } : input
  const history: ExecutionHistory = indexExecutionHistory(classificationInput), { periods, operations } = history
  const reasons: string[] = []
  const baseline = events[0]?.type !== 'created'
  if (baseline) reasons.push('incomplete_origin')
  if (input.scanLimited) reasons.push('event_budget')
  if (input.effectsLimited) reasons.push('effect_budget')
  if (events.some(event => !operations.has(event.operationId))) reasons.push('missing_operation')
  if (events.some(event => [event.before?.periodId, event.after.periodId].some(id => id && !periods.has(id)))) reasons.push('missing_period')
  const anomalous = !!input.clockAnomaly || events.some((event, index) => index > 0 && compareInstants(event.at, events[index - 1]!.at) < 0)
    || (!historical && input.events.some(event => compareInstants(event.at, asOf) > 0)) || compareInstants(item.createdAt, asOf) > 0
  if (anomalous) reasons.push('clock_anomaly')
  const bounded = input.scanLimited || input.effectsLimited
  const missing = reasons.some(reason => reason.startsWith('missing_'))
  const quality: FactQuality = anomalous ? 'anomalous' : reasons.length ? 'partial' : 'complete'
  let unknownCounts = bounded || missing || anomalous && input.events.some(event => compareInstants(event.at, asOf) > 0)
  const countQuality: FactQuality = anomalous ? 'anomalous' : unknownCounts || baseline ? 'partial' : 'complete'
  const currentState = historical ? events.at(-1)?.after ?? null : {
    status: item.status, horizon: item.placement.horizon, periodId: item.placement.periodId, archivedAt: item.archivedAt, deletedAt: item.deletedAt,
  }
  if (historical && !currentState) unknownCounts = true
  const current = { quality: historical && !currentState ? 'unknown' as const : 'complete' as const, status: currentState?.status ?? (historical ? 'todo' as const : item.status), horizon: currentState?.horizon ?? (historical ? 'later' as const : item.placement.horizon),
    periodId: currentState?.periodId ?? (historical ? null : item.placement.periodId), dueDate: historical ? null : item.dueDate,
    archived: !!currentState?.archivedAt, deleted: !!currentState?.deletedAt }
  let episodeAt: string | null = null, episodeSeq: number | null = null, enteredAt: string | null = null
  let state: BusinessState | null = null, intervalAt: string | null = null
  let episodeKnown = false, enteredKnown = false
  const durationSeconds = Object.fromEntries(periodHorizons.map(h => [h, 0])) as Record<PeriodHorizon, number>
  function accumulate(until: string) {
    if (!state || !intervalAt || !active(state) || state.horizon === 'later') return
    const period = state.periodId ? periods.get(state.periodId) : null
    if (!period) return
    const start = Math.max(ms(intervalAt), ms(period.startAt))
    if (ms(until) > start) durationSeconds[state.horizon] += (ms(until) - start) / 1000
  }
  for (const event of events) {
    accumulate(event.at)
    if (!state || !samePlace(state, event.after)) { enteredAt = event.at; enteredKnown = !!state || event.type === 'created' }
    if (active(event.after) && (!state || !active(state))) {
      episodeAt = event.at; episodeSeq = event.seq
      episodeKnown = !!state || event.type === 'created'
    } else if (!active(event.after)) { episodeAt = null; episodeSeq = null; episodeKnown = true }
    state = event.after; intervalAt = event.at
  }
  accumulate(asOf)
  const live = currentState !== null && active(currentState)
  if (!live) { episodeAt = null; episodeSeq = null }
  const evidence = events.map(event => classifyExecutionEvent(event, classificationInput, asOf, history))
  const lifetime = emptyCounts(), episode = emptyCounts(), advances = emptyCounts()
  let changes = 0
  const carries: { evidence: ExecutionEvidence; seq: number; horizon: PeriodHorizon }[] = []
  evidence.forEach((record, index) => {
    const event = events[index]!, horizon = event.before?.horizon
    if (!record.effective) return
    if (record.category === 'carry_after_period' && horizon && horizon !== 'later') {
      addCount(lifetime, record, horizon)
      if (episodeSeq !== null && event.seq >= episodeSeq) { addCount(episode, record, horizon); carries.push({ evidence: record, seq: event.seq, horizon }) }
    } else if (record.category === 'advance_reschedule' && horizon && horizon !== 'later') addCount(advances, record, horizon)
    else if (record.category === 'placement_change') changes++
  })
  const currentCountQuality: FactQuality = unknownCounts || (live && !episodeKnown) ? 'unknown' : 'complete'
  const period = current.periodId ? periods.get(current.periodId) : null
  const eligibleSince = live && enteredAt && period && ms(period.startAt) <= ms(asOf) ? new Date(Math.max(ms(enteredAt), ms(period.startAt))).toISOString().replace('.000Z', 'Z') : null
  const episodeFact = historical && !currentState ? fact<NonNullable<ExecutionFacts['currentEpisode']['value']>>(null, 'unknown', 'historical_state_missing') : !live ? fact<NonNullable<ExecutionFacts['currentEpisode']['value']>>(null)
    : episodeKnown && episodeAt && !bounded && !anomalous ? fact({ since: episodeAt, elapsedCalendarDays: days(timezone, episodeAt, asOf) })
      : fact<NonNullable<ExecutionFacts['currentEpisode']['value']>>(null, anomalous ? 'anomalous' : 'unknown', 'incomplete_episode')
  const deadline = historical ? fact<NonNullable<ExecutionFacts['deadlineNow']['value']>>(null, 'unknown', 'historical_deadline_unrecorded')
    : live && item.dueDate && item.dueDate < today ? fact({ overdueDays: parseDate(item.dueDate).until(parseDate(today), { largestUnit: 'days' }).days }) : fact<NonNullable<ExecutionFacts['deadlineNow']['value']>>(null)
  const windowQuality: FactQuality = currentCountQuality !== 'complete' || anomalous ? anomalous ? 'anomalous' : 'unknown' : 'complete'
  // A guidance confirmation suppresses the same source periods, rather than the six displayed examples.
  const { boundary } = replayExecutionGuidance(events, history)
  const projection = { calendar, period: period ?? null, live, episodeTotal: episode.total, windowQuality, boundary, historical, createdAt: item.createdAt,
    carries: carries.map(row => ({ seq: row.seq, horizon: row.horizon, at: row.evidence.at, fromPeriodId: row.evidence.fromPeriodId })) }
  const pressure = projectPressure(projection, asOf, current.horizon, deadline.value !== null)
  if (historical && !currentState) { pressure.level = fact(null, 'unknown', 'historical_state_missing'); reasons.push('historical_state_missing') }
  const createdAge = days(timezone, item.createdAt, asOf)
  const facts: ExecutionFacts = {
    calculationVersion: 1, itemId: item.id, generation: input.generation, asOf, timezone, sourceRevision: input.sourceRevision,
    coverage: { quality, earliestKnownAt: events[0]?.at ?? null, reasons }, current,
    createdAt: fact(item.createdAt), createdAgeDays: createdAge >= 0 ? fact(createdAge, anomalous ? 'anomalous' : 'complete', anomalous ? 'clock_anomaly' : null) : fact(null, 'anomalous', 'creation_after_observation'),
    currentEpisode: episodeFact, currentPlacement: enteredKnown && enteredAt && !bounded && !anomalous ? fact({ enteredAt, eligibleSince }) : fact(null, anomalous ? 'anomalous' : 'unknown', 'incomplete_placement'),
    carryovers: { currentEpisode: unknownCounts || live && !episodeKnown ? fact(null, currentCountQuality, 'incomplete_episode') : fact(episode, currentCountQuality),
      lifetime: unknownCounts ? fact(null, 'unknown', 'incomplete_effect_history') : fact(lifetime, countQuality, baseline ? 'incomplete_origin' : null) },
    scheduleChanges: { advanceReschedule: unknownCounts ? fact(null, 'unknown', 'incomplete_effect_history') : fact(advances, countQuality), otherPlacementChanges: unknownCounts ? fact(null, 'unknown', 'incomplete_effect_history') : fact(changes, countQuality) },
    placementDurations: Object.fromEntries(periodHorizons.map(h => [h, anomalous || bounded || missing || !events.length ? fact(null, anomalous ? 'anomalous' : 'unknown', 'incomplete_intervals') : fact(durationSeconds[h], baseline ? 'partial' : 'complete', baseline ? 'since_earliest_known_event' : null)])) as ExecutionFacts['placementDurations'],
    deadlineNow: deadline, pressure, evidence: evidence.slice(-6).reverse(),
  }
  return { ...projection, facts }
}

export interface ExecutionProjection {
  facts: ExecutionFacts; calendar: CalendarConfig; period: PlanningPeriod | null; live: boolean; historical: boolean
  createdAt: string; episodeTotal: number; windowQuality: FactQuality
  boundary: { eventSeq: number; at: string } | null
  carries: { seq: number; horizon: PeriodHorizon; at: string; fromPeriodId: string | null }[]
}
function projectPressure(projection: Omit<ExecutionProjection, 'facts'>, asOf: string, horizon: ExecutionFacts['current']['horizon'], overdue: boolean): ExecutionFacts['pressure'] {
  const { calendar, carries, boundary, windowQuality } = projection, timezone = calendar.timezone, today = workspaceDate(timezone, asOf)
  function window(horizon: 'day' | 'week', start: string, end: string, threshold: number): ExecutionFacts['pressure']['windows']['day'] {
    if (windowQuality !== 'complete') return fact(null, windowQuality, 'incomplete_pressure')
    const selected = carries.filter(row => row.horizon === horizon && workspaceDate(timezone, row.at) >= start && workspaceDate(timezone, row.at) < end)
    const distinctSourcePeriods = new Set(selected.map(row => row.fromPeriodId)).size
    const distinctOperationDates = new Set(selected.map(row => workspaceDate(timezone, row.at))).size
    return fact({ startLocalDate: start, endLocalDateExclusive: end, distinctSourcePeriods, distinctOperationDates, thresholdMet: distinctSourcePeriods >= threshold && distinctOperationDates >= 2 })
  }
  const week = currentPeriod(calendar, 'week', asOf)
  const dayWindow = window('day', parseDate(today).subtract({ days: 13 }).toString(), parseDate(today).add({ days: 1 }).toString(), 3)
  const weekWindow = window('week', parseDate(week.startDate).subtract({ weeks: 7 }).toString(), week.endDate, 2)
  const priorPeriods = new Set(carries.filter(row => boundary && row.seq <= boundary.eventSeq).map(row => row.fromPeriodId))
  const hasNewSourcePeriod = !!boundary && carries.some(row => row.seq > boundary.eventSeq && !priorPeriods.has(row.fromPeriodId))
  const reconfirmationSuppressed = !!boundary && !hasNewSourcePeriod
  const suppression = windowQuality === 'complete' ? fact({ guidanceBoundary: boundary, hasNewSourcePeriod, reconfirmationSuppressed })
    : fact<NonNullable<ExecutionFacts['pressure']['suppression']['value']>>(null, windowQuality, 'incomplete_guidance_boundary')
  let level: ExecutionFacts['pressure']['level']
  if (!projection.live) level = fact('normal')
  else if (overdue) level = fact('overdue')
  else if (horizon === 'later' || projection.period && ms(projection.period.startAt) > ms(asOf)) level = fact('normal')
  else if (windowQuality !== 'complete') level = fact(null, windowQuality, 'incomplete_pressure')
  else level = fact((dayWindow.value?.thresholdMet || weekWindow.value?.thresholdMet) && !reconfirmationSuppressed ? 'reconfirm' : projection.episodeTotal ? 'carryover' : 'normal')
  return { level, windows: { day: dayWindow, week: weekWindow }, suppression }
}
/** Reproject time only: closed intervals stay frozen, and the open interval adds seconds once from the base. */
export function projectExecutionFacts(projection: ExecutionProjection, asOf: string): ExecutionFacts {
  if (projection.historical || asOf === projection.facts.asOf) return projection.facts
  if (compareInstants(asOf, projection.facts.asOf) < 0) throw new Error('Execution clock precedes cache baseline')
  const facts = structuredClone(projection.facts), timezone = projection.calendar.timezone, today = workspaceDate(timezone, asOf)
  facts.asOf = asOf
  const age = days(timezone, projection.createdAt, asOf)
  facts.createdAgeDays = age >= 0 ? fact(age) : fact(null, 'anomalous', 'creation_after_observation')
  if (facts.currentEpisode.value) facts.currentEpisode.value.elapsedCalendarDays = days(timezone, facts.currentEpisode.value.since, asOf)
  if (facts.currentPlacement.value) {
    facts.currentPlacement.value.eligibleSince = projection.live && projection.period && ms(projection.period.startAt) <= ms(asOf)
      ? new Date(Math.max(ms(facts.currentPlacement.value.enteredAt), ms(projection.period.startAt))).toISOString().replace('.000Z', 'Z') : null
  }
  if (projection.live && projection.period && facts.current.horizon !== 'later') {
    const value = facts.placementDurations[facts.current.horizon]
    const start = Math.max(ms(projection.facts.asOf), ms(projection.period.startAt))
    if (value.value !== null && ms(asOf) > start) value.value += (ms(asOf) - start) / 1000
  }
  facts.deadlineNow = projection.live && facts.current.dueDate && facts.current.dueDate < today
    ? fact({ overdueDays: parseDate(facts.current.dueDate).until(parseDate(today), { largestUnit: 'days' }).days }) : fact(null)
  facts.pressure = projectPressure(projection, asOf, facts.current.horizon, facts.deadlineNow.value !== null)
  return facts
}
