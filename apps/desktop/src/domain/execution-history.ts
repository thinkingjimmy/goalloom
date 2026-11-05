/**
 * [INPUT]: Validated operation effects, period metadata, undo markers and ordered task events.
 * [OUTPUT]: Indexed event ownership and effect-specific undo ownership.
 * [POS]: Shared execution-history primitives for current facts, historical facts and activity pages.
 */
import type { BusinessState, Effect, ItemEvent, Operation } from '../shared/contracts/effects'
import type { PlanningPeriod } from '../shared/contracts/entities'
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
      case 'description': return event.type === 'description_changed'
      case 'nesting': return event.type === 'nesting_changed'
      case 'groupPlacement':
      case 'position': return !!a && !samePlace(a, b) && effect.before.horizon === a.horizon && effect.before.periodId === a.periodId && effect.after.horizon === b.horizon && effect.after.periodId === b.periodId
      case 'relations': return false
    }
  })
}
