/**
 * [INPUT]: A validated focus command, the authoritative period/item rows and injected time.
 * [OUTPUT]: Guarded period focus writes and owned-field undo. An active daily focus must be cleared before another is set.
 * [POS]: Period focus transaction rules, revalidated inside Repository's write transaction and undo SAVEPOINT.
 */
import { compareInstants } from '../../../domain/calendar'
import { isFocusHorizon, isFocusItem } from '../../../domain/focus'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { Effect } from '../../../shared/contracts/effects'
import type { PlanningPeriod } from '../../../shared/contracts/entities'
import { serverText } from '../../../shared/i18n/server'
import type { Context } from '../context'

// Closed periods are read-only history; only month/week/day periods own a focus.
function openPeriod(context: Context, periodId: string, code: 'invalid' | 'conflict'): PlanningPeriod & { horizon: 'month' | 'week' | 'day' } {
  const period = context.store.period(periodId)
  if (!isFocusHorizon(period.horizon)) throw new DomainError('invalid', serverText().errors.invalidPlanningPeriod)
  if (compareInstants(period.endAt, context.now) <= 0) throw new DomainError(code, serverText().errors.focusClosed)
  return { ...period, horizon: period.horizon }
}

export function setFocus(context: Context, command: CommandOf<'focus'>): boolean {
  const period = openPeriod(context, command.periodId, 'invalid')
  const before = context.store.focusItem(period.id)
  if (before !== command.expectedItemId) throw new DomainError('stale', serverText().errors.focusChanged)
  if (command.itemId !== null && !isFocusItem(context.store.item(command.itemId), period.id)) throw new DomainError('invalid', serverText().errors.focusUnavailable)
  if (period.horizon === 'day' && before && command.itemId && before !== command.itemId && isFocusItem(context.store.item(before), period.id)) {
    throw new DomainError('invalid', serverText().errors.focusClearFirst)
  }
  context.label = serverText().labels.focus(period.horizon, command.itemId !== null)
  context.itemId = command.itemId ?? before
  if (before === command.itemId) return false
  context.store.saveFocus(period.id, command.itemId)
  context.effects.push({ kind: 'focus', itemId: (command.itemId ?? before)!, periodId: period.id, before, after: command.itemId })
  return true
}

/** Compares only the owned pointer; unrelated item edits and versions never block the undo. */
export function reverseFocus(context: Context, effect: Extract<Effect, { kind: 'focus' }>): void {
  openPeriod(context, effect.periodId, 'conflict')
  if (context.store.focusItem(effect.periodId) !== effect.after) throw new DomainError('conflict', serverText().undo.focusChanged)
  context.store.saveFocus(effect.periodId, effect.before)
}
