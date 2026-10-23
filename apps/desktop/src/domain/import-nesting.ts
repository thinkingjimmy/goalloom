/**
 * [INPUT]: Parsed operation receipts, physical edge identities and the complete operation index.
 * [OUTPUT]: Source-aware validation of cross-period leaf/group ownership, atomic nested creation/restore, detached inherited links and group placement ownership.
 * [POS]: Import integrity extension; neither a client nor an imported receipt may invent inheritance provenance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Dataset } from '../shared/contracts/transfer'
import type { Relation } from '../shared/contracts/entities'
import type { Effect } from '../shared/contracts/effects'
import { sameEdge, inverseEdges } from './undo'
import { serverText } from '../shared/i18n/server'
import { creationCompletions, creationNestingRestore } from './creation'

type Operation = Dataset['operations'][number]
export function validateNestingOperation(operation: Operation, operations: Map<string | number, Operation>): void {
  const valid = (condition: unknown) => { if (!condition) throw new Error(serverText().import.effectKindNotAllowed) }
  if (operation.kind === 'nest' && operation.effects.length) {
    const root = operation.effects.at(-1)!
    valid(root.kind === 'nesting' && root.itemId === operation.result.itemId)
    valid(new Set(operation.effects.map(effect => effect.itemId)).size === operation.effects.length)
    if (root.kind === 'nesting') for (const child of operation.effects.slice(0, -1)) {
      valid(child.kind === 'nesting' && !root.before.nestingParentId
        && child.before.nestingParentId === root.itemId
        && child.after.nestingParentId === root.after.nestingParentId
        && child.after.horizon === root.after.horizon && child.after.periodId === root.after.periodId)
    }
  }
  const groups = operation.effects.filter(effect => effect.kind === 'groupPlacement')
  valid(new Set(groups.map(effect => effect.itemId)).size === groups.length)
  for (const effect of groups) {
    const root = operation.effects.find(candidate => candidate.kind === 'position' && candidate.itemId === effect.before.nestingParentId)
    valid(root?.kind === 'position' && effect.itemId !== root.itemId && effect.before.nestingParentId === effect.after.nestingParentId
      && !root.before.nestingParentId && !root.after.nestingParentId
      && effect.before.horizon === root.before.horizon && effect.before.periodId === root.before.periodId
      && effect.after.horizon === root.after.horizon && effect.after.periodId === root.after.periodId)
  }
  for (const effect of operation.effects) if (effect.kind === 'nesting') {
    valid(effect.before.nestingParentId !== effect.after.nestingParentId)
    valid(!effect.flowColor || !effect.before.nestingParentId && effect.after.nestingParentId !== null)
    if (operation.kind === 'nest') valid(effect.after.nestingParentId !== null)
    if (operation.kind === 'create' || operation.kind === 'createPlan') {
      const created = operation.effects[0]
      valid(operation.effects.length === 2 && created?.kind === 'create' && operation.effects[1] === effect
        && created.itemId === effect.itemId && operation.result.itemId === effect.itemId && !created.initialRelations.length
        && effect.before.nestingParentId === null && effect.after.nestingParentId !== null
        && effect.before.horizon === created.horizon && effect.after.horizon === created.horizon
        && effect.before.periodId === created.periodId && effect.after.periodId === created.periodId && !effect.flowColor && !effect.edges.length)
    }
    if (operation.kind === 'completeCreation') valid(effect.before.nestingParentId === null && effect.after.nestingParentId !== null
      && effect.before.horizon === effect.after.horizon && effect.before.periodId === effect.after.periodId && !effect.edges.length && !effect.flowColor)
    if (operation.kind === 'unnest') valid(effect.before.nestingParentId !== null && effect.after.nestingParentId === null)
    if (['move', 'applyAssistance', 'arrangeBacklog'].includes(operation.kind)) valid(effect.after.nestingParentId === null && operation.effects.some(candidate => candidate.kind === 'position'
      && (candidate.itemId === effect.itemId || candidate.itemId === effect.before.nestingParentId && candidate.after.horizon === 'later' && candidate.before.horizon !== 'later'
        && (effect.before.horizon !== candidate.before.horizon || effect.before.periodId !== candidate.before.periodId))))
    if (operation.kind === 'delete') valid(effect.after.nestingParentId === null && operation.effects.some(candidate => candidate.kind === 'visibility' && [effect.itemId, effect.before.nestingParentId].includes(candidate.itemId)))
    if (operation.kind === 'restoreItem') {
      const restored = operation.effects.find(candidate => candidate.kind === 'visibility')
      const original = restored?.kind === 'visibility' && restored.before.deletedBy ? operations.get(restored.before.deletedBy) : undefined
      const creation = original?.result.originalOperationId ? operations.get(original.result.originalOperationId) : undefined
      const fromCreation = creationNestingRestore(original, creation, effect.itemId, creation ? creationCompletions(creation, operations.values()) : [])
      valid(effect.before.nestingParentId === null && effect.after.nestingParentId !== null && (original?.effects.some(candidate => candidate.kind === 'nesting' && candidate.itemId === effect.itemId && candidate.before.nestingParentId === effect.after.nestingParentId)
        || fromCreation?.before.nestingParentId === effect.after.nestingParentId))
    }
    if (effect.before.nestingParentId && !effect.after.nestingParentId) valid(effect.inheritedFrom?.rootId === effect.before.nestingParentId)
    const inherited = new Set(effect.inheritedFrom?.relations.map(edge => edge.parentId) ?? [])
    const added = effect.edges.filter(delta => delta.before === null)
    valid(added.length === inherited.size && added.every(delta => inherited.has(delta.after.parentId)))
    for (const delta of effect.edges) valid(delta.before
      ? delta.before.invalidatedAt === null && delta.after.invalidatedAt === operation.at && delta.after.invalidatedBy === operation.id && delta.after.reason === 'unlink'
      : delta.after.createdAt === operation.at && delta.after.invalidatedAt === null && delta.after.invalidatedBy === null && delta.after.reason === null)
  }
}

/** Exported operation order, rather than wall time, remains valid across clock rollback. */
export function validateNestingHistory(data: Dataset, creationInverses = new Map<string, Effect[]>()): void {
  if (!data.operations.some(operation => operation.effectsVersion === 3)) return
  const physical = new Map(data.relations.map(edge => [edge.id, edge])), state = new Map<string, Relation>()
  const operations = new Map(data.operations.map(operation => [operation.id, operation]))
  const created = new Set<string>(), initial = new Map<string, Relation>()
  const deltas = (effect: Effect) => effect.kind === 'nesting' || effect.kind === 'visibility' || effect.kind === 'relations' ? effect.edges : []
  for (const operation of data.operations) for (const effect of operation.effects) {
    if (effect.kind === 'create') for (const id of effect.initialRelations) created.add(id)
    for (const delta of deltas(effect)) {
      if (!delta.before) created.add(delta.after.id)
      else if (!initial.has(delta.after.id)) initial.set(delta.after.id, delta.before)
    }
  }
  for (const edge of data.relations) if (!created.has(edge.id)) state.set(edge.id, initial.get(edge.id) ?? edge)
  const events = new Map<string, typeof data.events>()
  for (const event of data.events) {
    const group = events.get(event.operationId) ?? []; group.push(event); events.set(event.operationId, group)
  }
  const markers = new Map<string, typeof data.undoEffects>()
  for (const marker of data.undoEffects) {
    const group = markers.get(marker.undoId) ?? []; group.push(marker); markers.set(marker.undoId, group)
  }
  const alive = new Set<string>()
  const valid = (condition: unknown) => { if (!condition) throw new Error(serverText().import.relationEffectIdentityMismatch) }
  for (const operation of data.operations) {
    for (const event of events.get(operation.id) ?? []) if (event.before === null && !event.after.deletedAt) alive.add(event.itemId)
    for (const effect of operation.effects) {
      if (effect.kind === 'nesting') {
        valid(alive.has(effect.itemId))
        for (const parent of [effect.before.nestingParentId, effect.after.nestingParentId]) if (parent) valid(alive.has(parent))
        for (const source of effect.inheritedFrom?.relations ?? []) valid(sameEdge(state.get(source.id), source))
      }
      if (effect.kind === 'create') for (const id of effect.initialRelations) {
        const edge = physical.get(id)
        if (edge) state.set(id, { ...edge, invalidatedAt: null, invalidatedBy: null, reason: null })
      }
      for (const delta of deltas(effect)) state.set(delta.after.id, delta.after)
      if (effect.kind === 'visibility') effect.after.deletedAt ? alive.delete(effect.itemId) : alive.add(effect.itemId)
    }
    for (const marker of [...markers.get(operation.id) ?? []].sort((a, b) => b.effectIndex - a.effectIndex)) {
      const original = operations.get(marker.originalId)
      if (original?.kind === 'completeCreation') continue
      const effect = (creationInverses.get(marker.originalId) ?? original?.effects)?.[marker.effectIndex]
      if (!effect) continue
      for (const edge of inverseEdges(deltas(effect), operation.id, operation.at)) state.set(edge.id, edge)
      if (effect.kind === 'visibility') effect.before.deletedAt ? alive.delete(effect.itemId) : alive.add(effect.itemId)
      if (effect.kind === 'create') {
        alive.delete(effect.itemId)
        for (const id of effect.initialRelations) {
          const edge = state.get(id)
          if (edge) state.set(id, { ...edge, invalidatedAt: operation.at, invalidatedBy: operation.id, reason: 'delete' })
        }
      }
    }
  }
}
