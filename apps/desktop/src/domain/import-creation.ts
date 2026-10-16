/**
 * [INPUT]: Parsed v11 receipts, their events and undo markers.
 * [OUTPUT]: Validated capture provenance and net creation effects for grouped inverses.
 * [POS]: Import extension for immutable asynchronous creation; forward history remains unchanged.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Dataset } from '../shared/contracts/transfer'
import type { Effect } from '../shared/contracts/effects'
import { creationEffects } from './creation'
import { serverText } from '../shared/i18n/server'

type Operation = Dataset['operations'][number]
export function validateCreationHistory(data: Dataset, operations: Map<string | number, Operation>): Map<string, Effect[]> {
  const valid = (condition: unknown) => { if (!condition) throw new Error(serverText().import.invalidInverseReference) }
  const completed = new Map<string, Operation[]>()
  const originalEvents = new Map(data.events.filter(event => event.type === 'created').map(event => [event.itemId, event]))
  for (const operation of data.operations) {
    const { capture, creationOperationId, captureRequestId } = operation.result
    if (capture) {
      valid(data.schemaVersion >= 11 && ['create', 'createPlan'].includes(operation.kind) && operation.source === 'user' && operation.result.changed)
      const created = operation.effects.find(effect => effect.kind === 'create' && effect.itemId === capture.itemId)
      valid(operation.effects.length === 1 && created && operation.result.itemId === capture.itemId && originalEvents.get(capture.itemId)?.after.version === capture.itemVersion)
    }
    if (operation.kind !== 'completeCreation') { valid(creationOperationId === undefined && captureRequestId === undefined); continue }
    valid(data.schemaVersion >= 11 && creationOperationId && captureRequestId && operation.source === 'system' && !operation.result.undoable)
    const original = operations.get(creationOperationId!), guard = original?.result.capture
    valid(original && guard?.pending && original.generation === operation.generation && guard.requestId === captureRequestId && guard.itemId === operation.result.itemId)
    const effects = operation.effects, positions = effects.filter(effect => effect.kind === 'position'), relations = effects.filter(effect => effect.kind === 'relations')
    valid(effects.every(effect => effect.itemId === guard!.itemId && ['position', 'relations'].includes(effect.kind)) && positions.length <= 2 && relations.length <= 1)
    valid(!relations.length || guard!.allowParents)
    for (const effect of positions) valid(!effect.before.nestingParentId && !effect.after.nestingParentId
      && (guard!.allowPlacement || effect.before.horizon === effect.after.horizon && effect.before.periodId === effect.after.periodId))
    for (const effect of relations) valid(!effect.flowColor && effect.edges.length > 0 && effect.edges.every(delta => !delta.before && delta.after.childId === guard!.itemId
      && delta.after.createdAt === operation.at && !delta.after.invalidatedAt && !delta.after.invalidatedBy && !delta.after.reason))
    if (!operation.result.changed) continue
    const group = completed.get(original!.id) ?? []
    valid(group.length === 0)
    group.push(operation); completed.set(original!.id, group)
  }
  const inverse = new Map<string, Effect[]>()
  const markerGroups = new Map<string, string>()
  for (const marker of data.undoEffects) {
    const original = operations.get(marker.originalId)
    const owner = original?.kind === 'completeCreation' ? original.result.creationOperationId! : original?.id
    const undo = operations.get(marker.undoId)
    if (original?.kind === 'completeCreation') valid(undo?.kind === 'undo' && undo.result.originalOperationId === owner)
    if (owner && original && ['create', 'createPlan', 'completeCreation'].includes(original.kind)) {
      const previous = markerGroups.get(owner)
      valid(!previous || previous === marker.undoId)
      markerGroups.set(owner, marker.undoId)
    }
  }
  const markers = new Map(data.undoEffects.map(marker => [`${marker.originalId}:${marker.effectIndex}`, marker.undoId]))
  for (const [id, completions] of completed) {
    const original = operations.get(id)!
    inverse.set(id, creationEffects(original, completions))
    const undoId = markerGroups.get(id)
    if (undoId) for (const member of [original, ...completions]) member.effects.forEach((_, index) => valid(markers.get(`${member.id}:${index}`) === undoId))
  }
  return inverse
}
