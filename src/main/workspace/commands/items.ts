/**
 * [INPUT]: Validated commands, current transaction context and explicit current/date/next targets.
 * [OUTPUT]: Atomic setup, group-checked placement and relationship changes, including opt-in flow adoption with one undo effect.
 * [POS]: Workspace commands; next advances the original placement, and new edges require strictly longer parent horizons outside Later.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { currentPeriod, workspaceDate } from '../../../domain/calendar'
import { horizonProblem, relationProblem } from '../../../domain/relations'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import { calendarSchema, type Item, type Relation } from '../../../shared/contracts/entities'
import { statusGroup } from '../../../shared/contracts/effects'
import { assertAvailable, assertFlowColorFree, hasActiveParent, nextSortKey, targetPeriod, touch, type Context } from '../context'
import { serverText } from '../../../shared/i18n/server'
import { assertParentOrderTarget } from './ordering'

export function confirmSetup(context: Context, command: CommandOf<'confirmSetup'>): boolean {
  if (context.workspace.setupConfirmedAt) throw new DomainError('setup', serverText().errors.calendarLocked)
  const calendar = calendarSchema.parse({ id: randomUUID(), timezone: command.timezone, weekStart: command.weekStart, cycleAnchor: command.cycleAnchor })
  if (calendar.cycleAnchor > workspaceDate(calendar.timezone, context.now)) throw new DomainError('invalid', serverText().errors.anchorAfterToday)
  context.workspace.calendar = calendar
  context.workspace.setupConfirmedAt = context.now
  for (const horizon of ['cycle', 'month', 'week', 'day'] as const) {
    const period = currentPeriod(calendar, horizon, context.now)
    context.store.ensurePeriod(period)
    context.store.db.prepare('INSERT INTO rollover_policies VALUES (?,?,1,?)').run(horizon, horizon === 'day' ? 'auto' : 'manual', period.id)
  }
  context.label = serverText().labels.confirmSetup
  return true
}

export function createItem(context: Context, command: CommandOf<'create'>): boolean {
  const parent = command.parentId ? context.store.item(command.parentId, command.expectedParentVersion ?? -1) : null
  if (parent) assertAvailable(parent)
  const horizonIssue = parent ? horizonProblem(parent.placement.horizon, command.horizon) : command.flowColor !== null && command.horizon === 'later' ? serverText().relations.laterEndpoint : null
  if (horizonIssue) throw new DomainError('conflict', horizonIssue)
  if (command.flowColor !== null) {
    if (parent) throw new DomainError('invalid', serverText().errors.parentFollowsFlow)
    assertFlowColorFree(context, command.flowColor, null)
  }
  const id = randomUUID()
  const period = targetPeriod(context, command.horizon, command.period)
  const item: Item = { id, title: command.title, description: command.description, dueDate: command.dueDate,
    status: 'todo', completedAt: null, cancelledAt: null, archivedAt: null, deletedAt: null, deletedBy: null,
    createdAt: context.now, updatedAt: context.now, version: 1, flowColor: command.flowColor,
    placement: { itemId: id, horizon: command.horizon, periodId: period?.id ?? null, sortKey: nextSortKey(context, command.horizon, period?.id ?? null, null), version: 1, holdPeriodId: null } }
  context.store.insertItem(item)
  const relation = parent ? newRelation(parent.id, id, context.now) : null
  if (relation) context.store.saveRelation(relation)
  if (parent) touch(context, parent)
  context.effects.push({ kind: 'create', itemId: id, status: statusGroup(item), horizon: command.horizon, periodId: period?.id ?? null, initialRelations: relation ? [relation.id] : [] })
  context.store.event(command.operationId, context.now, 'created', null, item)
  context.itemId = id
  context.label = parent ? serverText().labels.decompose : serverText().labels.create
  return true
}

export function editItem(context: Context, command: CommandOf<'edit'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if (item.title === command.title && item.description === command.description && item.dueDate === command.dueDate) return false
  Object.assign(item, { title: command.title, description: command.description, dueDate: command.dueDate })
  touch(context, item)
  context.itemId = item.id
  context.label = serverText().labels.save
  return true
}

export function setFlowColor(context: Context, command: CommandOf<'flowColor'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if ((item.flowColor ?? null) === command.flowColor) return false
  if (command.flowColor !== null) {
    if (item.placement.horizon === 'later') throw new DomainError('conflict', serverText().relations.laterEndpoint)
    if (hasActiveParent(context, item.id)) throw new DomainError('invalid', serverText().errors.parentFollowsFlow)
    assertFlowColorFree(context, command.flowColor, item.id)
  }
  item.flowColor = command.flowColor
  touch(context, item)
  context.itemId = item.id
  context.label = serverText().labels.flowColor
  return true
}

export function moveItem(context: Context, command: CommandOf<'move'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if (item.placement.version !== command.expectedPlacementVersion) throw new DomainError('stale', serverText().errors.placementChanged)
  const before = structuredClone(item)
  const previous = context.store.position(item)
  let destination = command.period
  if (destination?.kind === 'next') {
    if (item.status !== 'todo' || item.archivedAt || item.placement.horizon === 'later' || item.placement.horizon !== command.horizon || !item.placement.periodId || command.beforeId !== null) {
      throw new DomainError('conflict', serverText().errors.cannotAdvancePeriod)
    }
    const source = context.store.period(item.placement.periodId)
    const next = currentPeriod(context.workspace.calendar!, source.horizon, source.endAt)
    destination = { kind: 'date', startDate: next.startDate }
  }
  const target = targetPeriod(context, command.horizon, destination)
  const periodId = target?.id ?? null
  if (command.beforeId === item.id) return false
  if (command.parentOrder) assertParentOrderTarget(context, item, command.horizon, target, command.beforeId)
  if (item.placement.horizon === command.horizon && item.placement.periodId === periodId && previous.nextId === command.beforeId) return false
  const key = nextSortKey(context, command.horizon, periodId, command.beforeId, item.id)
  const priorVersion = item.placement.version
  Object.assign(item.placement, { horizon: command.horizon, periodId, sortKey: key, version: priorVersion + 1, holdPeriodId: null })
  context.store.savePlacement(item.placement, priorVersion)
  touch(context, item)
  context.effects.push({ kind: 'position', itemId: item.id, before: previous, after: context.store.position(item) })
  const samePeriod = previous.horizon === command.horizon && previous.periodId === periodId
  const rollover = !samePeriod && previous.horizon === command.horizon && previous.periodId !== null && target !== null && context.store.period(previous.periodId).startAt < target.startAt
  if (!samePeriod) context.store.event(command.operationId, context.now, rollover ? 'rolled_over' : 'moved', before, item)
  context.itemId = item.id
  context.label = samePeriod ? serverText().labels.sort : rollover ? serverText().labels.rollover : serverText().labels.move
  return true
}

export function newRelation(parentId: string, childId: string, now: string): Relation {
  return { id: randomUUID(), parentId, childId, invalidatedAt: null, invalidatedBy: null, reason: null, createdAt: now }
}

export function linkItems(context: Context, command: CommandOf<'link'>): boolean {
  const parent = context.store.item(command.parentId, command.expectedParentVersion)
  const child = context.store.item(command.childId, command.expectedChildVersion)
  assertAvailable(parent); assertAvailable(child)
  if (child.flowColor !== null && !command.adoptParentFlow) throw new DomainError('conflict', serverText().errors.childIsFlow(child.title))
  const problem = horizonProblem(parent.placement.horizon, child.placement.horizon) ?? relationProblem(parent.id, child.id, context.store.relations())
  if (problem) throw new DomainError('conflict', problem)
  const flowColor = child.flowColor === null ? undefined : { before: child.flowColor, after: null }
  // Persist the cleared color before adding an incoming edge so the root trigger stays authoritative.
  child.flowColor = null
  touch(context, child)
  const relation = newRelation(parent.id, child.id, context.now)
  context.store.saveRelation(relation)
  touch(context, parent)
  context.effects.push({ kind: 'relations', itemId: child.id, edges: [{ before: null, after: relation }], ...(flowColor ? { flowColor } : {}) })
  context.itemId = child.id
  context.label = serverText().labels.link
  return true
}
