/**
 * [INPUT]: Strict applyAssistance, authoritative versions/guards and the current transaction.
 * [OUTPUT]: Atomic note rewrites, immutable owned effects and ordered events.
 * [POS]: Limited task assistance writer; uses the existing receipt/undo infrastructure.
 */
import { workspaceDate } from '../../../domain/calendar'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import { assistanceServerText } from '../../../shared/i18n/assistance'
import { assertAvailable, touch, type Context } from '../context'
import { ExecutionQueries } from '../execution'

export function applyAssistance(context: Context, command: CommandOf<'applyAssistance'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  const t = assistanceServerText()
  if (item.status !== 'todo' || item.archivedAt) throw new DomainError('conflict', t.inactive)
  const calendar = context.workspace.calendar!
  {
    const guard = command.guard
    const incoming = context.store.effectiveRelations().filter(edge => edge.childId === item.id)
    const parents = incoming.map(edge => edge.id).sort().slice(0, 3)
    if (guard.today !== workspaceDate(calendar.timezone, context.now) || guard.calendarId !== calendar.id
      || guard.sourceRevision !== new ExecutionQueries(context.store).revision(item.id, context.workspace.generation)
      || guard.parentRelationCount !== incoming.length
      || JSON.stringify(parents) !== JSON.stringify(guard.parentRelationIds)) throw new DomainError('stale_preview', t.contextChanged)
    for (const dependency of guard.dependencies) context.store.item(dependency.itemId, dependency.version)
  }
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
