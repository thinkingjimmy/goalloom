/**
 * [INPUT]: Complete local receipts/events interleaved with finite external guidance checkpoints, or a baseline copy.
 * [OUTPUT]: Strict before/after, logical-identity, operation-boundary and final-head validation without origin fabrication.
 * [POS]: Guidance-specific portable integrity. Checkpoints observe state; only real local events prove local execution.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { canonicalJson } from '@goalloom/contracts'
import type { Dataset } from '../shared/contracts/transfer'
import type { Effect } from '../shared/contracts/effects'
import type { GuidanceState } from '../shared/contracts/provenance'

export function validateGuidanceHistory(data: Dataset): void {
  const valid = (condition: unknown) => { if (!condition) throw new Error('Invalid guidance history') }
  const heads = data.guidance ?? [], checkpoints = data.guidanceCheckpoints ?? []
  const items = new Set(data.items.map(row => row.id)), operations = new Map(data.operations.map(row => [row.id, row]))
  valid(data.schemaVersion >= 8 || heads.length === 0 && data.operations.every(op => op.effectsVersion === 1) && data.events.every(event => event.type !== 'guidance_changed'))
  valid(new Set(heads.map(row => row.itemId)).size === heads.length)
  if (data.historyMode === 'baseline') {
    valid(data.operations.length === 0 && data.events.length === 0 && data.undoEffects.length === 0 && checkpoints.length === 0)
    for (const head of heads) valid(items.has(head.itemId))
    return
  }
  valid(data.schemaVersion >= 13 || checkpoints.length === 0)
  const eventsByOperation = new Map<string, Dataset['events']>()
  const allEvents = [...data.events].sort((a, b) => a.seq - b.seq)
  for (const event of allEvents) {
    const events = eventsByOperation.get(event.operationId) ?? []
    events.push(event); eventsByOperation.set(event.operationId, events)
  }
  const logicalIdentity = (head: GuidanceState['head']): string | null => {
    const operation = operations.get(head.operationId)
    if (operation?.kind !== 'undo' || !operation.result.originalOperationId) return head.operationId
    const effect = operations.get(operation.result.originalOperationId)?.effects.find(effect => effect.kind === 'guidance' && effect.itemId === head.itemId)
    return effect?.kind === 'guidance' ? effect.before.operationId : head.operationId
  }
  const states = new Map<string, GuidanceState>(), externalIds = new Set<string>(), seen = new Set<string>()
  const sourceCursors = new Map<string, number>()
  const lastEvent = new Map<string, number>()
  for (const event of allEvents) lastEvent.set(event.operationId, event.seq)
  const firstEvent = new Map<string, number>()
  for (const event of allEvents) if (!firstEvent.has(event.operationId)) firstEvent.set(event.operationId, event.seq)
  const completeBoundaries = new Set([0])
  let openOperations = 0
  for (const event of allEvents) {
    if (firstEvent.get(event.operationId) === event.seq) openOperations++
    if (lastEvent.get(event.operationId) === event.seq) openOperations--
    if (openOperations === 0) completeBoundaries.add(event.seq)
  }
  const boundaryOperations = new Map(allEvents.filter(event => lastEvent.get(event.operationId) === event.seq).map(event => [event.seq, event.operationId]))
  let checkpointIndex = 0, previousBoundary = 0
  const applyCheckpoints = (boundary: number) => {
    while (checkpointIndex < checkpoints.length) {
      const checkpoint = checkpoints[checkpointIndex]!
      valid(checkpoint.afterEventSeq >= previousBoundary)
      if (checkpoint.afterEventSeq !== boundary) break
      valid(completeBoundaries.has(boundary) && checkpoint.afterOperationId === (boundary === 0 ? null : boundaryOperations.get(boundary)))
      valid(!seen.has(checkpoint.id) && checkpoint.order === checkpointIndex + 1)
      seen.add(checkpoint.id); previousBoundary = boundary
      if (checkpoint.cause === 'baseline') valid(checkpointIndex === 0 && boundary === 0 && checkpoint.source === null)
      else valid(checkpoint.source !== null)
      if (checkpoint.source) {
        const key = `${checkpoint.source.workspaceId}|${checkpoint.source.generation}`, previous = sourceCursors.get(key)
        valid(previous === undefined || checkpoint.source.seq >= previous)
        sourceCursors.set(key, checkpoint.source.seq)
      }
      let previousItem = ''
      for (const change of checkpoint.changes) {
        valid(items.has(change.itemId) && previousItem < change.itemId && canonicalJson(change.before) !== canonicalJson(change.after))
        previousItem = change.itemId
        valid(canonicalJson(states.get(change.itemId) ?? null) === canonicalJson(change.before))
        for (const state of [change.before, change.after]) if (state) {
          valid(state.head.itemId === change.itemId && state.identity === logicalIdentity(state.head))
          for (const id of [state.head.operationId, state.identity]) if (id && operations.has(id)) valid((lastEvent.get(id) ?? 0) <= boundary)
          externalIds.add(state.head.operationId)
          if (state.identity) externalIds.add(state.identity)
        }
        if (checkpoint.cause === 'baseline') valid(change.before === null)
        if (change.after) states.set(change.itemId, change.after); else states.delete(change.itemId)
      }
      checkpointIndex++
    }
  }
  applyCheckpoints(0)
  for (const event of allEvents) {
    const operation = operations.get(event.operationId)
    valid(operation)
    const unchangedPlace = event.before?.horizon === event.after.horizon && event.before?.periodId === event.after.periodId
    if (operation && (event.type === 'guidance_changed' || event.type === 'undo' && unchangedPlace)) {
      const owner = operations.get(event.undoOf ?? operation.id)
      const effect = owner?.effects.find((effect): effect is Extract<Effect, { kind: 'guidance' }> => effect.kind === 'guidance' && effect.itemId === event.itemId)
      if (event.type === 'guidance_changed') valid(effect && owner?.kind === 'applyAssistance')
      if (effect) {
        const previous = states.get(event.itemId)
        const before = event.undoOf ? effect.after : effect.before, after = event.undoOf ? effect.before : effect.after
        valid(canonicalJson(previous?.head.value ?? null) === canonicalJson(before.value) && (previous?.identity ?? null) === before.operationId)
        if (!event.undoOf) valid(effect.after.operationId === operation.id && operation.effectsVersion >= 2)
        states.set(event.itemId, { head: { itemId: event.itemId, value: after.value, operationId: operation.id, revision: (previous?.head.revision ?? 0) + 1, updatedAt: event.at }, identity: after.operationId })
      }
    }
    if (lastEvent.get(event.operationId) === event.seq) applyCheckpoints(event.seq)
  }
  valid(checkpointIndex === checkpoints.length && states.size === heads.length)
  for (const head of heads) valid(items.has(head.itemId) && canonicalJson(states.get(head.itemId)?.head) === canonicalJson(head))
  for (const operation of data.operations) for (const effect of operation.effects) if (effect.kind === 'guidance') {
    valid(data.schemaVersion >= 8 && operation.kind === 'applyAssistance' && operation.effectsVersion >= 2 && items.has(effect.itemId)
      && effect.after.operationId === operation.id && (eventsByOperation.get(operation.id) ?? []).filter(event => event.type === 'guidance_changed' && event.itemId === effect.itemId).length === 1
      && (!effect.before.operationId || operations.has(effect.before.operationId) || externalIds.has(effect.before.operationId)))
  }
}
