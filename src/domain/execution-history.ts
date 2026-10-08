/**
 * [INPUT]: Validated operation effects, period metadata, undo markers and ordered task events.
 * [OUTPUT]: Indexed event ownership including note rewrites, and replayed guidance with its original confirmation boundary.
 * [POS]: Shared execution-history primitives for current facts, historical facts and activity pages.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { BusinessState, Effect, ItemEvent, Operation } from '../shared/contracts/effects'
import type { PlanningPeriod } from '../shared/contracts/entities'
import type { GuidanceValue } from '../shared/contracts/assistance'
import { matchesStatus } from './status'

interface UndoMarker { originalId: string; effectIndex: number; undoId: string; at: string; seq: number }
export interface ExecutionHistory {
  operations: Map<string, Operation>; periods: Map<string, PlanningPeriod>; undo: Map<string, UndoMarker>
  effects: Map<string, Map<string, { effect: Effect; index: number }[]>>
}
export function indexExecutionHistory(input: { operations: Operation[]; periods: PlanningPeriod[]; undo: UndoMarker[] }): ExecutionHistory {
  const effects: ExecutionHistory['effects'] = new Map()
  for (const operation of input.operations) {
    const items = new Map<string, { effect: Effect; index: number }[]>()
    operation.effects.forEach((effect, index) => {
      const rows = items.get(effect.itemId) ?? []
      rows.push({ effect, index }); items.set(effect.itemId, rows)
    })
    effects.set(operation.id, items)
  }
  return { operations: new Map(input.operations.map(operation => [operation.id, operation])), periods: new Map(input.periods.map(period => [period.id, period])),
    undo: new Map(input.undo.map(marker => [`${marker.originalId}:${marker.effectIndex}`, marker])), effects }
}
const samePlace = (a: BusinessState, b: BusinessState) => a.horizon === b.horizon && a.periodId === b.periodId
export function ownedExecutionEffect(event: ItemEvent, history: ExecutionHistory) {
  if (event.undoOf || event.type === 'baseline') return undefined
  const a = event.before, b = event.after
  return history.effects.get(event.operationId)?.get(event.itemId)?.find(({ effect }) => {
    switch (effect.kind) {
      case 'create': return event.type === 'created' && !a && matchesStatus(effect.status, b) && effect.horizon === b.horizon && effect.periodId === b.periodId
      case 'status': return event.type === 'status_changed' && !!a && matchesStatus(effect.before, a) && matchesStatus(effect.after, b)
      case 'archive': return ['archived', 'unarchived'].includes(event.type) && a?.archivedAt === effect.before && b.archivedAt === effect.after
      case 'visibility': return ['deleted', 'item_restored'].includes(event.type) && a?.deletedAt === effect.before.deletedAt && a?.deletedBy === effect.before.deletedBy && b.deletedAt === effect.after.deletedAt && b.deletedBy === effect.after.deletedBy
      case 'guidance': return event.type === 'guidance_changed'
      case 'description': return event.type === 'description_changed'
      case 'position': return !!a && !samePlace(a, b) && effect.before.horizon === a.horizon && effect.before.periodId === a.periodId && effect.after.horizon === b.horizon && effect.after.periodId === b.periodId
      case 'relations': return false
    }
  })
}

export function replayExecutionGuidance(events: ItemEvent[], history: ExecutionHistory): {
  value: GuidanceValue | null; known: boolean; boundary: { eventSeq: number; at: string } | null
} {
  let value: GuidanceValue | null = null, identity: string | null = null, known = events[0]?.type === 'created'
  const confirmations = new Map<string, ItemEvent>()
  for (const event of events) {
    const guidanceUndo = event.type === 'undo' && !!event.before && samePlace(event.before, event.after)
    if (event.type !== 'guidance_changed' && !guidanceUndo) continue
    const effect = history.effects.get(event.undoOf ?? event.operationId)?.get(event.itemId)?.find(row => row.effect.kind === 'guidance')?.effect
    if (effect?.kind !== 'guidance') {
      if (event.type === 'guidance_changed' || !history.operations.has(event.undoOf ?? event.operationId)) { value = null; identity = null; known = false }
      continue
    }
    const state = guidanceUndo ? effect.before : effect.after
    value = state.value; identity = state.operationId; known = true
    if (!guidanceUndo) confirmations.set(effect.after.operationId, event)
  }
  const confirmation = value && identity ? confirmations.get(identity) : null
  return { value, known, boundary: confirmation ? { eventSeq: confirmation.seq, at: confirmation.at } : null }
}
