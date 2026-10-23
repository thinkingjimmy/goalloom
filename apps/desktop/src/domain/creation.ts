/**
 * [INPUT]: Immutable creation receipts and their causally owned system completions.
 * [OUTPUT]: A read-only net creation projection, creation-owned nesting restore provenance and receipts resolved by one creation undo.
 * [POS]: Shared undo/import ownership; never edits persisted effects or rolls versions back.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Effect, Operation } from '../shared/contracts/effects'

/** A creation undo detaches before deletion; its original receipt retains the group's identity. */
export function creationNestingRestore(deletion: Operation | null | undefined, original: Operation | null | undefined, itemId: string, completions: readonly Operation[] = []): Extract<Effect, { kind: 'nesting' }> | undefined {
  if (deletion?.kind !== 'undo' || !deletion.result.changed || deletion.result.originalOperationId !== original?.id || !original || !['create', 'createPlan'].includes(original.kind)) return
  const effect = creationEffects(original, completions).find(effect => effect.kind === 'nesting' && effect.itemId === itemId)
  if (effect?.kind !== 'nesting' || effect.before.nestingParentId || !effect.after.nestingParentId) return
  return { ...effect, before: effect.after, after: effect.before }
}

export function creationCompletions(original: Operation, operations: Iterable<Operation>): Operation[] {
  return [...operations].filter(operation => operation.kind === 'completeCreation' && operation.source === 'system'
    && operation.generation === original.generation && operation.result.creationOperationId === original.id && operation.result.changed)
}
export function creationEffects(original: Operation, completions: readonly Operation[]): Effect[] {
  return [...original.effects.map(effect => {
    if (effect.kind !== 'create') return effect
    const changes = completions.flatMap(operation => operation.effects).filter(change => change.itemId === effect.itemId)
    const position = changes.findLast(change => change.kind === 'position')
    const relations = changes.flatMap(change => change.kind === 'relations' ? change.edges.filter(delta => !delta.before && !delta.after.invalidatedAt).map(delta => delta.after.id) : [])
    return { ...effect, ...(position?.kind === 'position' ? { horizon: position.after.horizon, periodId: position.after.periodId } : {}), initialRelations: [...effect.initialRelations, ...relations] }
  }), ...completions.flatMap(operation => operation.effects.filter(effect => effect.kind === 'nesting'))]
}
