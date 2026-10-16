/**
 * [INPUT]: Immutable creation receipts and their causally owned system completions.
 * [OUTPUT]: A read-only net creation projection and the receipts resolved by one creation undo.
 * [POS]: Shared undo/import ownership; never edits persisted effects or rolls versions back.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Effect, Operation } from '../shared/contracts/effects'

export function creationCompletions(original: Operation, operations: Iterable<Operation>): Operation[] {
  return [...operations].filter(operation => operation.kind === 'completeCreation' && operation.source === 'system'
    && operation.generation === original.generation && operation.result.creationOperationId === original.id && operation.result.changed)
}
export function creationEffects(original: Operation, completions: readonly Operation[]): Effect[] {
  return original.effects.map(effect => {
    if (effect.kind !== 'create') return effect
    const changes = completions.flatMap(operation => operation.effects).filter(change => change.itemId === effect.itemId)
    const position = changes.findLast(change => change.kind === 'position')
    const relations = changes.flatMap(change => change.kind === 'relations' ? change.edges.filter(delta => !delta.before && !delta.after.invalidatedAt).map(delta => delta.after.id) : [])
    return { ...effect, ...(position?.kind === 'position' ? { horizon: position.after.horizon, periodId: position.after.periodId } : {}), initialRelations: [...effect.initialRelations, ...relations] }
  })
}
