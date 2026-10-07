/**
 * [INPUT]: A normalized dataset with immutable guidance effects and ordered events.
 * [OUTPUT]: Indexed guidance replay rejecting orphan/version/head/receipt/ABA mismatches; preserved tombstones and monotonic revisions.
 * [POS]: Guidance-specific import integrity folded into the shared dataset validator.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Dataset } from '../shared/contracts/transfer'
import type { GuidanceValue } from '../shared/contracts/assistance'
import type { Effect } from '../shared/contracts/effects'

export function validateGuidanceHistory(data: Dataset): void {
  const requireValid = (condition: unknown) => { if (!condition) throw new Error('Invalid guidance history') }
  const heads = data.guidance ?? []
  requireValid(data.schemaVersion >= 8 || heads.length === 0 && data.operations.every(op => op.effectsVersion === 1) && data.events.every(event => event.type !== 'guidance_changed'))
  requireValid(new Set(heads.map(head => head.itemId)).size === heads.length)
  const items = new Set(data.items.map(item => item.id)), operations = new Map(data.operations.map(op => [op.id, op]))
  const guidanceByOperation = new Map<string, Map<string, Extract<Effect, { kind: 'guidance' }>>>()
  for (const operation of data.operations) {
    const byItem = new Map<string, Extract<Effect, { kind: 'guidance' }>>()
    for (const effect of operation.effects) if (effect.kind === 'guidance') byItem.set(effect.itemId, effect)
    if (byItem.size) guidanceByOperation.set(operation.id, byItem)
  }
  const states = new Map<string, { value: GuidanceValue | null; identity: string | null; operationId: string; revision: number; at: string }>()
  for (const event of [...data.events].sort((a, b) => a.seq - b.seq)) {
    const unchangedPlace = event.before?.horizon === event.after.horizon && event.before?.periodId === event.after.periodId
    if (event.type !== 'guidance_changed' && !(event.type === 'undo' && unchangedPlace)) continue
    const operation = operations.get(event.operationId)
    if (!operation) continue
    const effect = guidanceByOperation.get(event.undoOf ?? operation.id)?.get(event.itemId)
    if (!effect) continue
    const previous = states.get(event.itemId)
    const before = event.undoOf ? effect.after : effect.before, after = event.undoOf ? effect.before : effect.after
    requireValid(JSON.stringify(previous?.value ?? null) === JSON.stringify(before.value) && (previous?.identity ?? null) === before.operationId)
    if (!event.undoOf) requireValid(effect.after.operationId === operation.id && operation.effectsVersion === 2)
    states.set(event.itemId, { value: after.value, identity: after.operationId, operationId: operation.id, revision: (previous?.revision ?? 0) + 1, at: event.at })
  }
  requireValid(states.size === heads.length)
  for (const head of heads) {
    const state = states.get(head.itemId)
    requireValid(items.has(head.itemId) && operations.has(head.operationId) && state && head.revision === state.revision
      && head.updatedAt === state.at && head.operationId === state.operationId && JSON.stringify(head.value) === JSON.stringify(state.value))
  }
  for (const operation of data.operations) for (const effect of operation.effects) if (effect.kind === 'guidance') {
    requireValid(data.schemaVersion >= 8 && operation.kind === 'applyAssistance' && operation.effectsVersion === 2 && items.has(effect.itemId)
      && effect.after.operationId === operation.id && (!effect.before.operationId || operations.has(effect.before.operationId)))
  }
}
