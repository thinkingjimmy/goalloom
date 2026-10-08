/**
 * [INPUT]: Strict applyAssistance, authoritative versions/guards and the current transaction.
 * [OUTPUT]: Atomic note rewrites or legacy guidance/moves, immutable owned effects and ordered events.
 * [POS]: Limited task assistance writer; reuses movement and the existing receipt/undo infrastructure.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { currentPeriod, parseDate, workspaceDate } from '../../../domain/calendar'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { GuidanceRecord } from '../../../shared/contracts/assistance'
import { assistanceServerText } from '../../../shared/i18n/assistance'
import { assertAvailable, touch, type Context } from '../context'
import { ExecutionQueries } from '../execution'
import { moveItem } from './items'
import type { Store } from '../../storage/store'

export function guidanceIdentity(store: Store, record: GuidanceRecord | null): string | null {
  if (!record) return null
  const operation = store.operation(record.operationId)
  if (operation?.kind !== 'undo' || !operation.result.originalOperationId) return record.operationId
  const original = store.operation(operation.result.originalOperationId)
  const effect = original?.effects.find(effect => effect.kind === 'guidance' && effect.itemId === record.itemId)
  return effect?.kind === 'guidance' ? effect.before.operationId : record.operationId
}
export function applyAssistance(context: Context, command: CommandOf<'applyAssistance'>): boolean {
  let item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  const t = assistanceServerText()
  if (item.status !== 'todo' || item.archivedAt) throw new DomainError('conflict', t.inactive)
  const record = context.store.guidance(item.id)
  if ((record?.revision ?? 0) !== command.expectedGuidanceRevision) throw new DomainError('stale', t.guidanceChanged)
  const calendar = context.workspace.calendar!
  if (command.guard) {
    const guard = command.guard
    const parents = context.store.prepare('SELECT id FROM item_relations WHERE childId=? AND invalidatedAt IS NULL ORDER BY id LIMIT 3').all(item.id).map(row => String(row.id))
    if (guard.today !== workspaceDate(calendar.timezone, context.now) || guard.calendarId !== calendar.id
      || guard.sourceRevision !== new ExecutionQueries(context.store).revision(item.id, context.workspace.generation)
      || guard.parentRelationCount !== Number(context.store.prepare('SELECT count(*) AS n FROM item_relations WHERE childId=? AND invalidatedAt IS NULL').get(item.id)!.n)
      || guard.guidanceRevision !== (record?.revision ?? 0) || JSON.stringify(parents) !== JSON.stringify(guard.parentRelationIds)) throw new DomainError('stale_preview', t.contextChanged)
    for (const dependency of guard.dependencies) context.store.item(dependency.itemId, dependency.version)
  }
  if (command.move) {
    const move = command.move
    if (move.horizon === 'later' ? move.startDate !== null || move.previewPeriodId !== null || !move.confirmedLater : move.startDate === null) throw new DomainError('invalid', t.contextChanged)
    const target = move.horizon === 'later' ? null : currentPeriod(calendar, move.horizon, parseDate(move.startDate!).toZonedDateTime(calendar.timezone).toInstant().toString())
    if (target && (target.id !== move.previewPeriodId || target.startDate !== move.startDate)) throw new DomainError('stale_preview', t.contextChanged)
  }
  if (command.description !== undefined) {
    context.itemId = item.id
    context.label = t.notesRewritten
    if (item.description === command.description) return false
    const before = structuredClone(item)
    context.effects.push({ kind: 'description', itemId: item.id, before: item.description, after: command.description })
    item.description = command.description
    touch(context, item)
    context.store.event(command.operationId, context.now, 'description_changed', before, item)
    return true
  }
  const value = command.guidance.kind === 'keep' ? record?.value ?? null : command.guidance.kind === 'set' ? command.guidance.value : null
  const guidanceChanged = JSON.stringify(value) !== JSON.stringify(record?.value ?? null)
  if (guidanceChanged) {
    const before = structuredClone(item)
    context.store.saveGuidance({ itemId: item.id, revision: (record?.revision ?? 0) + 1, value, updatedAt: context.now, operationId: command.operationId })
    touch(context, item)
    context.effects.push({ kind: 'guidance', itemId: item.id, before: { value: record?.value ?? null, operationId: guidanceIdentity(context.store, record) }, after: { value, operationId: command.operationId } })
    context.store.event(command.operationId, context.now, 'guidance_changed', before, item)
  }
  let moved = false
  if (command.move) {
    item = context.store.item(item.id)
    const move = command.move
    if (item.placement.horizon !== move.horizon || item.placement.periodId !== move.previewPeriodId) moved = moveItem(context, { ...command, type: 'move', expectedVersion: item.version, expectedPlacementVersion: move.expectedPlacementVersion,
      horizon: move.horizon, ...(move.startDate ? { period: { kind: 'date', startDate: move.startDate } as const } : {}), beforeId: null })
  }
  context.itemId = item.id
  context.label = command.guidance.kind === 'clear' ? t.cleared : moved ? t.appliedAndMoved : t.saved
  return guidanceChanged || moved
}
