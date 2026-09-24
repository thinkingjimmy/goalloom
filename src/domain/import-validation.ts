/**
 * [INPUT]: Untrusted v1-v5 datasets or exclusively owned normalized rows, plus an observation time.
 * [OUTPUT]: Entity, date, DAG, effect, marker/inverse and event-chain integrity validation.
 * [POS]: Shared JSON/SQLite import rules; indexed references and one event ordering, without IO.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { datasetSchema, type Dataset } from '../shared/contracts/transfer'
import type { BusinessState, Effect, ItemEvent } from '../shared/contracts/effects'
import type { ItemHorizon, PlanningPeriod, Relation } from '../shared/contracts/entities'
import { compareInstants, currentPeriod, parseDate, workspaceDate } from './calendar'
import { validateDag } from './relations'
import { matchesStatus } from './status'
import { planLimit } from '../shared/contracts/commands'
import { serverText } from '../shared/i18n/server'

function requireValid(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
function unique<T>(rows: T[], identity: (row: T) => string | number, label: string): Map<string | number, T> {
  const map = new Map(rows.map(row => [identity(row), row]))
  requireValid(map.size === rows.length, serverText().import.duplicateIdentity(label))
  return map
}
function sameBusiness(a: BusinessState, b: BusinessState): boolean {
  return matchesStatus(a, b) && a.horizon === b.horizon && a.periodId === b.periodId && a.archivedAt === b.archivedAt && a.deletedAt === b.deletedAt && a.deletedBy === b.deletedBy
}
function validState(state: Pick<BusinessState, 'status' | 'completedAt' | 'cancelledAt' | 'deletedAt' | 'deletedBy'>, unknownTime = false): void {
  requireValid((state.deletedAt === null) === (state.deletedBy === null), serverText().import.deletionIncomplete)
  const valid = state.status === 'todo' ? state.completedAt === null && state.cancelledAt === null : state.status === 'done' ? state.cancelledAt === null && (unknownTime || state.completedAt !== null) : state.completedAt === null && (unknownTime || state.cancelledAt !== null)
  requireValid(valid, serverText().import.statusTimeMismatch)
}
function placement(horizon: ItemHorizon, periodId: string | null, periods: Map<string | number, PlanningPeriod>): void {
  requireValid(horizon === 'later' ? periodId === null : periodId !== null && periods.get(periodId)?.horizon === horizon, serverText().import.placementMismatch)
}
function edgeIdentity(a: Relation, b: Relation): boolean { return a.id === b.id && a.parentId === b.parentId && a.childId === b.childId && a.createdAt === b.createdAt }

export function validateImport(input: unknown, observedAt: string): Dataset {
  return validateDataset(datasetSchema.parse(input), observedAt)
}

/** Internal, exclusively owned DTOs have already passed the wire schema. Recheck business integrity without cloning their text. */
export function validateDataset(data: Dataset, observedAt: string): Dataset {
  // --- 无历史旧数据缺策略时，只从恢复当天的来源周期启用默认策略。 ---
  if (data.historyMode === 'baseline' && data.workspace.calendar && data.policies.length === 0) {
    for (const horizon of ['cycle', 'month', 'week', 'day'] as const) {
      const period = currentPeriod(data.workspace.calendar, horizon, observedAt)
      if (!data.periods.some(row => row.id === period.id)) data.periods.push(period)
      data.policies.push({ horizon, mode: horizon === 'day' ? 'auto' : 'manual', version: 1, effectiveFromPeriodId: period.id })
    }
  }
  const items = unique(data.items, row => row.id, serverText().import.labels.items), places = unique(data.placements, row => row.itemId, serverText().import.labels.placements)
  const periods = unique(data.periods, row => row.id, serverText().import.labels.periods), edges = unique(data.relations, row => row.id, serverText().import.labels.relations)
  const operations = unique(data.operations, row => row.id, serverText().import.labels.operations), policies = unique(data.policies, row => row.horizon, serverText().import.labels.policies)
  const eventsByOperation = new Map<string, ItemEvent[]>()
  const eventsByItem = new Map<string, Map<string, ItemEvent[]>>()
  const effectsByItem = new Map<string, Map<string, Array<{ effect: Effect; index: number }>>>()
  for (const operation of data.operations) {
    const byItem = new Map<string, Array<{ effect: Effect; index: number }>>()
    operation.effects.forEach((effect, index) => {
      const group = byItem.get(effect.itemId) ?? []
      group.push({ effect, index }); byItem.set(effect.itemId, group)
    })
    effectsByItem.set(operation.id, byItem)
  }
  const orderedEvents = [...data.events].sort((a, b) => a.seq - b.seq)
  for (const event of orderedEvents) {
    const group = eventsByOperation.get(event.operationId) ?? []
    group.push(event); eventsByOperation.set(event.operationId, group)
    const byItem = eventsByItem.get(event.operationId) ?? new Map<string, ItemEvent[]>()
    const itemEvents = byItem.get(event.itemId) ?? []
    itemEvents.push(event); byItem.set(event.itemId, itemEvents); eventsByItem.set(event.operationId, byItem)
  }
  unique(data.events, row => row.id, serverText().import.labels.events); unique(data.events, row => row.seq, serverText().import.labels.eventSequence)
  unique(data.events, row => `${row.operationId}:${row.eventIndex}`, serverText().import.labels.operationEvents)
  const markers = unique(data.undoEffects, row => `${row.originalId}:${row.effectIndex}`, serverText().import.labels.undoEffects)
  const calendar = data.workspace.calendar
  requireValid((calendar === null) === (data.workspace.setupConfirmedAt === null), serverText().import.setupMarkerIncomplete)
  requireValid(calendar || (!data.items.length && !data.periods.length && !data.policies.length && !data.events.length), serverText().import.unconfirmedWorkspaceHasData)
  if (calendar) requireValid(calendar.cycleAnchor <= workspaceDate(calendar.timezone, observedAt), serverText().import.anchorAfterToday)
  for (const period of data.periods) {
    requireValid(calendar, serverText().import.periodWithoutCalendar)
    const expected = currentPeriod(calendar, period.horizon, parseDate(period.startDate).toZonedDateTime(calendar.timezone).toInstant().toString())
    requireValid(JSON.stringify(period) === JSON.stringify(expected), serverText().import.periodBoundaryMismatch)
  }
  if (calendar) requireValid(policies.size === 4, serverText().import.missingRolloverPolicies)
  for (const policy of data.policies) requireValid(periods.get(policy.effectiveFromPeriodId)?.horizon === policy.horizon && (policy.horizon !== 'cycle' || policy.mode === 'manual'), serverText().import.invalidPolicy)
  requireValid(items.size === places.size, serverText().import.itemPlacementCount)
  const baselines = new Set(data.events.filter(event => event.type === 'baseline').map(event => event.itemId))
  for (const item of data.items) {
    const p = places.get(item.id); requireValid(p, serverText().import.itemMissingPlacement)
    placement(p.horizon, p.periodId, periods)
    validState(item, data.historyMode === 'baseline' || baselines.has(item.id))
    validateHold(p.horizon, p.periodId, p.holdPeriodId, periods)
  }
  for (const p of data.placements) requireValid(items.has(p.itemId), serverText().import.danglingPlacement)
  validateDag(new Set(data.items.map(item => item.id)), data.relations, new Set(data.items.filter(item => item.deletedAt).map(item => item.id)))
  const children = new Set(data.relations.filter(edge => edge.invalidatedAt === null).map(edge => edge.childId))
  const colours = data.items.filter(item => item.flowColor !== null && item.deletedAt === null).map(item => item.flowColor)
  requireValid(new Set(colours).size === colours.length, serverText().import.duplicateFlowColor)
  requireValid(data.items.every(item => item.flowColor === null || !children.has(item.id)), serverText().import.flowRootHasParent)
  for (const edge of data.relations) requireValid((edge.invalidatedAt === null) === (edge.invalidatedBy === null) && (edge.invalidatedAt === null) === (edge.reason === null), serverText().import.relationInvalidationIncomplete)
  if (data.historyMode === 'baseline') {
    requireValid(!data.events.length && !data.operations.length && !data.undoEffects.length, serverText().import.baselineHasHistory)
    return data
  }
  for (const operation of data.operations) {
    requireValid(operation.result.operationId === operation.id && operation.result.generation === operation.generation, serverText().import.receiptIdentityMismatch)
    requireValid(!operation.result.itemId || items.has(operation.result.itemId), serverText().import.operationDanglingItem)
    requireValid(operation.result.undoable === (operation.source === 'user' && operation.effects.length > 0), serverText().import.undoableFlagMismatch)
    requireValid(operation.result.outcome !== 'conflict_skipped' || (!operation.result.changed && !operation.effects.length && operation.kind === 'undo'), serverText().import.conflictReceiptChanged)
    validateKind(operation, data.schemaVersion)
    for (const effect of operation.effects) validateEffect(effect, items, periods, edges)
    if (operation.kind === 'createPlan') validatePlan(operation, edges)
    validateItemIds(operation, operations)
  }
  for (const marker of data.undoEffects) {
    const original = operations.get(marker.originalId), inverse = operations.get(marker.undoId)
    requireValid(original?.effects[marker.effectIndex] && inverse && inverse.result.changed && inverse.result.originalOperationId === original.id && ['undo', 'undoBatch'].includes(inverse.kind), serverText().import.undoMarkerDangling)
    requireValid(original.id !== inverse.id, serverText().import.selfUndo)
    // A plan is reversed only as a whole: every original effect marked, all by one inverse operation.
    if (original.kind === 'createPlan') requireValid(inverse.kind === 'undo' && original.effects.every((_, index) => markers.get(`${original.id}:${index}`)?.undoId === inverse.id), serverText().import.planUndoIncomplete)
    const effect = original.effects[marker.effectIndex]!
    const inverseEvents = eventsByItem.get(inverse.id)?.get(effect.itemId) ?? []
    requireValid(inverseEvents.length === (needsEvent(effect) ? 1 : 0), serverText().import.effectMissingEvent)
    for (const event of inverseEvents) {
      requireValid(event.type === 'undo' && event.undoOf === original.id, serverText().import.invalidInverseReference)
      validateInverse(event, effect, inverse.id)
    }
  }
  for (const inverse of data.operations.filter(operation => ['undo', 'undoBatch'].includes(operation.kind) && operation.result.changed)) {
    const original = operations.get(inverse.result.originalOperationId!)
    requireValid(original && original.effects.some((_, index) => markers.get(`${original.id}:${index}`)?.undoId === inverse.id), serverText().import.inverseMissingMarker)
    if (original.kind === 'createPlan') requireValid(original.effects.every((_, index) => markers.get(`${original.id}:${index}`)?.undoId === inverse.id), serverText().import.planUndoIncomplete)
  }
  const chains = new Map<string, ItemEvent>()
  const clockConfirmed = data.workspace.clockAnomaly || data.operations.some(operation => operation.kind === 'confirmClock')
  for (const event of orderedEvents) {
    const operation = operations.get(event.operationId)
    requireValid(items.has(event.itemId) && operation, serverText().import.danglingEventReference)
    requireValid(compareInstants(operation.at, event.at) === 0, serverText().import.eventTimeMismatch)
    const previous = chains.get(event.itemId)
    requireValid(previous ? event.before && sameBusiness(previous.after, event.before) && event.before.version >= previous.after.version : event.before === null && ['created', 'baseline'].includes(event.type), serverText().import.brokenEventChain)
    for (const state of [event.before, event.after].filter(state => state !== null)) {
      placement(state.horizon, state.periodId, periods); validState(state, baselines.has(event.itemId)); validateHold(state.horizon, state.periodId, state.holdPeriodId, periods)
    }
    if (event.before) requireValid(event.after.version > event.before.version, serverText().import.eventVersionNotIncreasing)
    if (previous && compareInstants(previous.at, event.at) > 0) requireValid(clockConfirmed, serverText().import.clockRollbackUnconfirmed)
    validateEvent(event, operation, effectsByItem, markers, periods)
    chains.set(event.itemId, event)
  }
  for (const item of data.items) {
    const last = chains.get(item.id), p = places.get(item.id)!
    const current: BusinessState = { ...item, horizon: p.horizon, periodId: p.periodId, sortKey: p.sortKey, holdPeriodId: p.holdPeriodId }
    requireValid(last && sameBusiness(last.after, current) && item.version >= last.after.version, serverText().import.eventTailMismatch)
  }
  for (const operation of data.operations) {
    const events = eventsByOperation.get(operation.id) ?? []
    requireValid(events.every((event, index) => event.eventIndex === index), serverText().import.eventIndexGap)
    if (operation.kind === 'createPlan') requireValid(events.length === operation.effects.length && events.every((event, index) => event.type === 'created' && event.itemId === operation.effects[index]?.itemId), serverText().import.planEventsMismatch)
    for (const effect of operation.effects) {
      if (needsEvent(effect)) {
        const event = eventsByItem.get(operation.id)?.get(effect.itemId)?.[0]
        requireValid(event, serverText().import.effectMissingEvent)
        validateOwnedFields(effect, event)
      }
      if (effect.kind === 'relations' || effect.kind === 'visibility') for (const delta of effect.edges) {
        if (['delete', 'unlink'].includes(operation.kind)) requireValid(delta.after.invalidatedBy === operation.id && delta.after.invalidatedAt === operation.at && delta.after.reason === (operation.kind === 'delete' ? 'delete' : 'unlink'), serverText().import.relationInvalidationSourceMismatch)
        if (['link', 'restoreItem'].includes(operation.kind)) requireValid(delta.after.invalidatedAt === null && delta.after.invalidatedBy === null && delta.after.reason === null, serverText().import.linkEffectInvalidEdge)
      }
    }
  }
  return data
}
function needsEvent(effect: Effect): boolean {
  return effect.kind !== 'relations' && !(effect.kind === 'position' && effect.before.periodId === effect.after.periodId && effect.before.horizon === effect.after.horizon)
}
function validateHold(horizon: ItemHorizon, periodId: string | null, hold: string | null, periods: Map<string | number, PlanningPeriod>): void {
  if (!hold) return
  requireValid(periodId && periods.get(hold)?.horizon === horizon && compareInstants(periods.get(periodId)!.endAt, periods.get(hold)!.startAt) <= 0, serverText().import.invalidHold)
}
function validateEffect(effect: Effect, items: Map<string | number, unknown>, periods: Map<string | number, PlanningPeriod>, edges: Map<string | number, Relation>): void {
  requireValid(items.has(effect.itemId), serverText().import.danglingEffectItem)
  if (effect.kind === 'create') { placement(effect.horizon, effect.periodId, periods); requireValid(effect.status.status === 'todo' && effect.initialRelations.every(id => { const edge = edges.get(id); return edge && (edge.parentId === effect.itemId || edge.childId === effect.itemId) }), serverText().import.invalidCreateEffect) }
  if (effect.kind === 'position') for (const p of [effect.before, effect.after]) {
    placement(p.horizon, p.periodId, periods)
    requireValid([p.previousId, p.nextId].every(id => id === null || (id !== effect.itemId && items.has(id))) && (!p.previousId || p.previousId !== p.nextId), serverText().import.invalidOrderNeighbors)
  }
  if (effect.kind === 'relations' || effect.kind === 'visibility') {
    unique(effect.edges, edge => edge.after.id, serverText().import.labels.edgeDeltas)
    for (const delta of effect.edges) requireValid(edges.has(delta.after.id) && edgeIdentity(edges.get(delta.after.id)!, delta.after) && (!delta.before || edgeIdentity(delta.before, delta.after)), serverText().import.relationEffectIdentityMismatch)
  }
}
function validateKind(operation: Dataset['operations'][number], version: Dataset['schemaVersion']): void {
  requireValid(operation.kind !== 'createPlan' || version >= 3, serverText().import.legacyPlan)
  const allowed: Record<string, Effect['kind'][]> = { create: ['create'], createPlan: ['create'], edit: [], flowColor: [], move: ['position'], link: ['relations'], status: ['status'], archive: ['archive'], delete: ['visibility'], restoreItem: ['visibility'], unlink: ['relations'], undo: [], undoBatch: [], arrangeBacklog: ['position'], rollover: ['position'], baseline: [], confirmSetup: [], preferences: [], policy: [], confirmClock: [], confirmRollover: [], backupPreferences: [] }
  requireValid(allowed[operation.kind] && operation.effects.every(effect => allowed[operation.kind]!.includes(effect.kind)), serverText().import.effectKindNotAllowed)
  requireValid(operation.source === (['rollover', 'baseline'].includes(operation.kind) ? 'system' : 'user'), serverText().import.operationSourceMismatch)
  const inverse = ['undo', 'undoBatch'].includes(operation.kind)
  requireValid(inverse === (operation.result.originalOperationId !== null), serverText().import.inverseReferenceMismatch)
  requireValid(operation.result.changed || !operation.effects.length, serverText().import.unchangedWithEffects)
  if (operation.result.changed && allowed[operation.kind]!.length) requireValid(operation.effects.length > 0, serverText().import.changedWithoutEffects)
  if (operation.kind === 'createPlan') requireValid(!operation.result.changed || (operation.effects.length >= 1 && operation.effects.length <= planLimit && new Set(operation.effects.map(effect => effect.itemId)).size === operation.effects.length), serverText().import.invalidPlanSize)
  else if (!['rollover', 'arrangeBacklog'].includes(operation.kind)) requireValid(operation.effects.length <= 1, serverText().import.extraEffects)
}
// --- Creation-time ownership: each new edge is the child's incoming edge, its parent existing or an earlier new item. ---
function validatePlan(operation: Dataset['operations'][number], edges: Map<string | number, Relation>): void {
  const order = operation.effects.map(effect => effect.itemId), owned = new Set<string>()
  operation.effects.forEach((effect, index) => {
    if (effect.kind !== 'create') return
    for (const id of effect.initialRelations) {
      const edge = edges.get(id)
      requireValid(edge && edge.childId === effect.itemId && edge.createdAt === operation.at && !owned.has(id), serverText().import.planRelationOwnership)
      const parentIndex = order.indexOf(edge.parentId)
      requireValid(parentIndex < index, serverText().import.planParentOrder)
      owned.add(id)
    }
  })
}
function validateItemIds(operation: Dataset['operations'][number], operations: Map<string | number, Dataset['operations'][number]>): void {
  const { itemIds, itemId } = operation.result
  const original = operation.kind === 'undo' && operation.result.originalOperationId ? operations.get(operation.result.originalOperationId) : undefined
  if (operation.kind === 'createPlan' && operation.result.changed) {
    const expected = operation.effects.map(effect => effect.itemId)
    requireValid(itemIds && JSON.stringify(itemIds) === JSON.stringify(expected) && itemId === (expected.length === 1 ? expected[0] : null), serverText().import.planReceiptItemsMismatch)
  } else if (original?.kind === 'createPlan') {
    requireValid(itemIds && (operation.result.outcome === 'conflict_skipped' ? !itemIds.length && itemId === null && operation.result.restoreSource === null : JSON.stringify(itemIds) === JSON.stringify(original.result.itemIds) && itemId === original.result.itemId), serverText().import.planUndoReceiptItemsMismatch)
  } else requireValid(itemIds === undefined, serverText().import.unexpectedItemIds)
}
function validateEvent(event: ItemEvent, operation: Dataset['operations'][number], effectsByItem: Map<string, Map<string, Array<{ effect: Effect; index: number }>>>, markers: Map<string | number, Dataset['undoEffects'][number]>, periods: Map<string | number, PlanningPeriod>): void {
  const a = event.before, b = event.after
  const types: Record<string, string[]> = { created: ['create', 'createPlan'], baseline: ['baseline'], moved: ['move', 'arrangeBacklog'], rolled_over: ['move', 'arrangeBacklog', 'rollover'], status_changed: ['status'], archived: ['archive'], unarchived: ['archive'], deleted: ['delete'], item_restored: ['restoreItem'], undo: ['undo', 'undoBatch'] }
  requireValid(types[event.type]?.includes(operation.kind), serverText().import.eventTypeMismatch)
  if (event.type === 'baseline') { requireValid(!a && !event.undoOf, serverText().import.baselineNotOrigin); return }
  if (event.type === 'created') { requireValid(!a && b.status === 'todo' && !b.archivedAt && !b.deletedAt && !b.holdPeriodId, serverText().import.invalidCreatedEvent); return }
  requireValid(a, serverText().import.changeEventMissingBefore)
  if (event.type === 'undo') {
    const originalId = event.undoOf!
    requireValid(effectsByItem.has(originalId) && operation.result.originalOperationId === originalId, serverText().import.invalidInverseReference)
    const effects = effectsByItem.get(originalId)?.get(event.itemId) ?? []
    requireValid(effects.length === 1, serverText().import.inverseMissingOriginalEffect)
    const { effect, index } = effects[0]!
    validateInverse(event, effect, operation.id)
    requireValid(markers.get(`${originalId}:${index}`)?.undoId === operation.id, serverText().import.inverseMissingMarker)
    return
  }
  requireValid(!event.undoOf, serverText().import.ordinaryEventWithUndo)
  const expected = { ...a }
  if (['moved', 'rolled_over'].includes(event.type)) {
    requireValid(a.horizon !== b.horizon || a.periodId !== b.periodId, serverText().import.reorderMadeMoveEvent)
    if (event.type === 'rolled_over') requireValid(a.periodId && b.periodId && a.horizon === b.horizon && compareInstants(periods.get(a.periodId)!.startAt, periods.get(b.periodId)!.startAt) < 0, serverText().import.invalidRolloverDirection)
    Object.assign(expected, { horizon: b.horizon, periodId: b.periodId })
    requireValid(b.holdPeriodId === null, serverText().import.moveKeepsHold)
  }
  if (event.type === 'status_changed') {
    requireValid(a.status !== b.status && (b.status === 'todo' || compareInstants((b.status === 'done' ? b.completedAt : b.cancelledAt)!, event.at) === 0), serverText().import.statusChangeWithoutTime)
    Object.assign(expected, { status: b.status, completedAt: b.completedAt, cancelledAt: b.cancelledAt })
  }
  if (event.type === 'archived' || event.type === 'unarchived') { requireValid(event.type === 'archived' ? a.archivedAt === null && b.archivedAt === event.at : a.archivedAt !== null && b.archivedAt === null, serverText().import.invalidArchiveEvent); expected.archivedAt = b.archivedAt }
  if (event.type === 'deleted' || event.type === 'item_restored') {
    requireValid(event.type === 'deleted' ? a.deletedAt === null && b.deletedAt === event.at && b.deletedBy === operation.id : a.deletedAt !== null && b.deletedAt === null && b.deletedBy === null, serverText().import.invalidDeleteRestoreEvent)
    Object.assign(expected, { deletedAt: b.deletedAt, deletedBy: b.deletedBy })
  }
  requireValid(sameBusiness(expected, b), serverText().import.eventTouchedUnownedFields)
}
function validateInverse(event: ItemEvent, effect: Effect, inverseId: string): void {
  const expected = { ...event.before! }
  if (effect.kind === 'status') requireValid(matchesStatus(expected, effect.after), serverText().import.statusInverseMismatch)
  if (effect.kind === 'position') requireValid(expected.horizon === effect.after.horizon && expected.periodId === effect.after.periodId, serverText().import.positionInverseMismatch)
  if (effect.kind === 'archive') requireValid(expected.archivedAt === effect.after, serverText().import.archiveInverseMismatch)
  if (effect.kind === 'visibility') requireValid(expected.deletedAt === effect.after.deletedAt && expected.deletedBy === effect.after.deletedBy, serverText().import.visibilityInverseMismatch)
  if (effect.kind === 'create') requireValid(matchesStatus(expected, effect.status) && expected.horizon === effect.horizon && expected.periodId === effect.periodId && !expected.archivedAt && !expected.deletedAt, serverText().import.createInverseMismatch)
  switch (effect.kind) {
    case 'create': Object.assign(expected, { deletedAt: event.at, deletedBy: inverseId }); break
    case 'status': Object.assign(expected, effect.before); break
    case 'position': Object.assign(expected, { horizon: effect.before.horizon, periodId: effect.before.periodId }); break
    case 'archive': expected.archivedAt = effect.before; break
    case 'visibility': Object.assign(expected, effect.before); break
    case 'relations': throw new Error(serverText().import.relationInverseMadeEvent)
  }
  requireValid(sameBusiness(expected, event.after), serverText().import.inverseOverwroteFields)
}
function validateOwnedFields(effect: Effect, event: ItemEvent): void {
  const a = event.before, b = event.after
  if (effect.kind === 'create') requireValid(!a && matchesStatus(effect.status, b) && effect.horizon === b.horizon && effect.periodId === b.periodId, serverText().import.createReceiptMismatch)
  if (effect.kind === 'status') requireValid(a && matchesStatus(effect.before, a) && matchesStatus(effect.after, b), serverText().import.statusReceiptMismatch)
  if (effect.kind === 'position') requireValid(a && effect.before.horizon === a.horizon && effect.before.periodId === a.periodId && effect.after.horizon === b.horizon && effect.after.periodId === b.periodId, serverText().import.positionReceiptMismatch)
  if (effect.kind === 'archive') requireValid(a && effect.before === a.archivedAt && effect.after === b.archivedAt, serverText().import.archiveReceiptMismatch)
  if (effect.kind === 'visibility') requireValid(a && effect.before.deletedAt === a.deletedAt && effect.before.deletedBy === a.deletedBy && effect.after.deletedAt === b.deletedAt && effect.after.deletedBy === b.deletedBy, serverText().import.visibilityReceiptMismatch)
}
