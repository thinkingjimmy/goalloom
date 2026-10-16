/**
 * [INPUT]: Validated commands, current transaction context and explicit current/date/next targets.
 * [OUTPUT]: Atomic setup with six policies (only day defaults to automatic), placement and flow-valid links, including opt-in adoption or isolated-parent root promotion with one undo effect.
 *          Entering Later unlinks that item's parents in the same operation; child edges stay.
 *          Creation and changed ordering parents can place only the affected root, with explicit insertion taking priority.
 * [POS]: Workspace commands; next advances the original placement, and new edges require strictly longer parent horizons outside Later.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { changeNesting } from './nesting'
import { nestingText } from '../../../shared/i18n/nesting'
import { randomUUID } from 'node:crypto'
import { currentPeriod, workspaceDate } from '../../../domain/calendar'
import { horizonProblem, mayLinkFlows, promotedFlowColor, relationProblem } from '../../../domain/relations'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import { calendarSchema, type Item, type Relation } from '../../../shared/contracts/entities'
import { statusGroup } from '../../../shared/contracts/effects'
import { assertAvailable, assertFlowColorFree, hasActiveParent, hasFlow, nextSortKey, targetPeriod, touch, type Context } from '../context'
import { serverText } from '../../../shared/i18n/server'
import { writeEdges } from './lifecycle'
import { orderingParent, placeByParent } from './ordering'
import { policyHorizons } from '../../../shared/contracts/values'

export function confirmSetup(context: Context, command: CommandOf<'confirmSetup'>): boolean {
  if (context.workspace.setupConfirmedAt) throw new DomainError('setup', serverText().errors.calendarLocked)
  const today = workspaceDate(command.timezone, context.now)
  const cycleAnchor = command.mode === 'natural' ? `${today.slice(0, 4)}-01-01`
    : command.anchor.kind === 'date' ? command.anchor.date : command.anchor.kind === 'monthStart' ? `${today.slice(0, 8)}01` : today
  if (command.mode === 'natural' && command.anchor.kind === 'date') throw new DomainError('invalid', serverText().calendar.invalidCalendar)
  if (command.anchor.kind !== 'date' && command.anchor.expected !== cycleAnchor) throw new DomainError('stale_preview', serverText().errors.setupDateChanged)
  const calendar = calendarSchema.parse({ id: randomUUID(), mode: command.mode, timezone: command.timezone, weekStart: command.weekStart, cycleAnchor })
  if (calendar.cycleAnchor > workspaceDate(calendar.timezone, context.now)) throw new DomainError('invalid', serverText().errors.anchorAfterToday)
  context.workspace.calendar = calendar
  context.workspace.setupConfirmedAt = context.now
  for (const horizon of policyHorizons) {
    const period = currentPeriod(calendar, horizon, context.now)
    context.store.ensurePeriod(period)
    context.store.db.prepare('INSERT INTO rollover_policies VALUES (?,?,1,?)').run(horizon, horizon === 'day' ? 'auto' : 'manual', period.id)
  }
  context.label = serverText().labels.confirmSetup
  return true
}

export function createItem(context: Context, command: CommandOf<'create'>): boolean {
  const refs = [...(command.parentRefs ?? []), ...(command.parentId ? [{ itemId: command.parentId, expectedVersion: command.expectedParentVersion ?? -1 }] : [])]
  const parents = [...new Map(refs.flatMap(ref => {
    if ('automatic' in ref && ref.automatic) {
      if (!context.store.db.prepare('SELECT 1 FROM items WHERE id=?').get(ref.itemId)) return []
      const item = context.store.item(ref.itemId)
      if (item.version !== ref.expectedVersion || item.deletedAt || item.archivedAt || item.status !== 'todo' || horizonProblem(item.placement.horizon, command.horizon)) return []
      return [[item.id, item] as const]
    }
    const item = context.store.item(ref.itemId, ref.expectedVersion)
    assertAvailable(item)
    return [[item.id, item] as const]
  })).values()]
  const horizonIssue = parents.map(parent => horizonProblem(parent.placement.horizon, command.horizon)).find(Boolean) ?? (command.flowColor !== null && command.horizon === 'later' ? serverText().relations.laterEndpoint : null)
  if (horizonIssue) throw new DomainError('conflict', horizonIssue)
  if (command.flowColor !== null) {
    if (parents.length) throw new DomainError('invalid', serverText().errors.parentFollowsFlow)
    assertFlowColorFree(context, command.flowColor, null)
  }
  const id = randomUUID()
  const period = targetPeriod(context, command.horizon, command.period)
  const item: Item = { id, title: command.title, description: command.description, dueDate: command.dueDate,
    status: 'todo', completedAt: null, cancelledAt: null, archivedAt: null, deletedAt: null, deletedBy: null,
    createdAt: context.now, updatedAt: context.now, version: 1, flowColor: command.flowColor,
    placement: { itemId: id, horizon: command.horizon, periodId: period?.id ?? null, sortKey: nextSortKey(context, command.horizon, period?.id ?? null, command.beforeId ?? null), version: 1, holdPeriodId: null } }
  context.store.insertItem(item)
  const relations = parents.map(parent => newRelation(parent.id, id, context.now))
  for (const relation of relations) context.store.saveRelation(relation)
  for (const parent of parents) touch(context, parent)
  if (command.autoPlace && command.beforeId === undefined) placeByParent(context, item, false)
  context.effects.push({ kind: 'create', itemId: id, status: statusGroup(item), horizon: command.horizon, periodId: period?.id ?? null, initialRelations: relations.map(relation => relation.id) })
  context.store.event(command.operationId, context.now, 'created', null, item)
  context.itemId = id
  context.label = parents.length ? serverText().labels.decompose : serverText().labels.create
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
  if (item.placement.nestingParentId) throw new DomainError('conflict', nestingText().inherited)
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

export function moveItem(context: Context, command: CommandOf<'move'>, keepNesting = false): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if (item.placement.version !== command.expectedPlacementVersion) throw new DomainError('stale', serverText().errors.placementChanged)
  if (command.group && item.placement.nestingParentId) {
    if (command.beforeId) throw new DomainError('invalid', nestingText().changed)
    const root = context.store.item(item.placement.nestingParentId)
    const changed = moveItem(context, { ...command, itemId: root.id, expectedVersion: root.version, expectedPlacementVersion: root.placement.version })
    context.itemId = item.id
    return changed
  }
  const destinationPeriod = targetPeriod(context, command.horizon, command.period?.kind === 'next' ? undefined : command.period)
  const targetParent = command.beforeId ? context.store.item(command.beforeId).placement.nestingParentId ?? null : null
  const sameContainer = item.placement.nestingParentId && command.horizon === item.placement.horizon && destinationPeriod?.id === item.placement.periodId && (targetParent === item.placement.nestingParentId || command.keepNesting && !command.beforeId)
  if (command.keepNesting && !sameContainer) throw new DomainError('conflict', nestingText().changed)
  let nestingChanged = false
  if (item.placement.nestingParentId && !keepNesting && !sameContainer) {
    nestingChanged = changeNesting(context, item, null)
    // If unnesting and no specific position requested, changeNesting already handled the move
    if (!command.beforeId && item.placement.horizon === command.horizon) {
      context.itemId = item.id
      return nestingChanged
    }
  }
  const children = !item.placement.nestingParentId ? context.store.nestedItems(item.id) : []
  const before = structuredClone(item)
  const previous = context.store.position(item)
  let destination = command.period
  if (destination?.kind === 'next') {
    if ((item.status !== 'todo' && !children.some(child => child.status === 'todo' && !child.archivedAt)) || (item.archivedAt && !children.some(child => child.status === 'todo' && !child.archivedAt)) || item.placement.horizon === 'later' || item.placement.horizon !== command.horizon || !item.placement.periodId || command.beforeId !== null) {
      throw new DomainError('conflict', serverText().errors.cannotAdvancePeriod)
    }
    const source = context.store.period(item.placement.periodId)
    const next = currentPeriod(context.workspace.calendar!, source.horizon, source.endAt)
    destination = { kind: 'date', startDate: next.startDate }
  }
  const target = targetPeriod(context, command.horizon, destination)
  const periodId = target?.id ?? null
  if (command.beforeId === item.id) return false
  if (item.placement.horizon === command.horizon && item.placement.periodId === periodId && previous.nextId === command.beforeId) return false
  const key = nextSortKey(context, command.horizon, periodId, command.beforeId, item.id, item.placement.nestingParentId ?? null)
  const priorVersion = item.placement.version
  Object.assign(item.placement, { horizon: command.horizon, periodId, sortKey: key, version: priorVersion + 1, holdPeriodId: null })
  context.store.savePlacement(item.placement, priorVersion)
  touch(context, item)
  context.effects.push({ kind: 'position', itemId: item.id, before: previous, after: context.store.position(item) })
  const samePeriod = previous.horizon === command.horizon && previous.periodId === periodId
  const rollover = !samePeriod && previous.horizon === command.horizon && previous.periodId !== null && target !== null && context.store.period(previous.periodId).startAt < target.startAt
  if (!samePeriod) context.store.event(command.operationId, context.now, rollover ? 'rolled_over' : 'moved', before, item)
  if (!samePeriod) for (const child of children) {
    const prior = structuredClone(child), version = child.placement.version
    const childBefore = { horizon: child.placement.horizon, periodId: child.placement.periodId, nestingParentId: item.id }
    Object.assign(child.placement, { horizon: command.horizon, periodId, version: version + 1, holdPeriodId: null })
    context.store.savePlacement(child.placement, version); touch(context, child)
    context.effects.push({ kind: 'groupPlacement', itemId: child.id, before: childBefore, after: { horizon: command.horizon, periodId, nestingParentId: item.id } })
    context.store.event(command.operationId, context.now, rollover ? 'rolled_over' : 'moved', prior, child)
  }
  if (before.placement.horizon !== 'later'  && item.placement.horizon === 'later') releaseLaterParents(context, item)
  context.itemId = item.id
  context.label = samePeriod ? serverText().labels.sort : rollover ? serverText().labels.rollover : serverText().labels.move
  return true
}

function releaseLaterParents(context: Context, item: Item): void {
  const parents = context.store.relations().filter(edge => edge.childId === item.id).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  if (!parents.length) return
  const edges = parents.map(edge => ({ before: edge, after: { ...edge, invalidatedAt: context.now, invalidatedBy: context.command.operationId, reason: 'unlink' as const } }))
  writeEdges(context, edges.map(delta => delta.after), item.id)
  context.effects.push({ kind: 'relations', itemId: item.id, edges })
}

export function newRelation(parentId: string, childId: string, now: string): Relation {
  return { id: randomUUID(), parentId, childId, invalidatedAt: null, invalidatedBy: null, reason: null, createdAt: now }
}

export function linkItems(context: Context, command: CommandOf<'link'>): boolean {
  const parent = context.store.item(command.parentId, command.expectedParentVersion)
  const child = context.store.item(command.childId, command.expectedChildVersion)
  assertAvailable(parent); assertAvailable(child)
  if (child.placement.nestingParentId) throw new DomainError('conflict', nestingText().inherited)
  if (child.flowColor !== null && !command.adoptParentFlow) throw new DomainError('conflict', serverText().errors.childIsFlow(child.title))
  const edges = context.store.relations()
  const problem = horizonProblem(parent.placement.horizon, child.placement.horizon) ?? relationProblem(parent.id, child.id, [...edges, ...context.store.nestingLinks().map(link => ({ ...link, id: `nest:${link.childId}`, invalidatedAt: null, invalidatedBy: null, reason: null, createdAt: context.now }))])
  if (problem) throw new DomainError('conflict', problem)
  const previousParent = command.autoPlace ? orderingParent(context, child.id) : null
  if (!mayLinkFlows(hasFlow(context, parent.id), hasFlow(context, child.id))) throw new DomainError('conflict', serverText().relations.noFlowEndpoints)
  const promotion = promotedFlowColor(parent, child, edges)
  const flowColor = child.flowColor === null ? undefined : { before: child.flowColor, after: null, ...(promotion !== null ? { transferredTo: parent.id } : {}) }
  // Release the unique color before moving the root or adding an incoming edge.
  child.flowColor = null
  touch(context, child)
  if (promotion !== null) parent.flowColor = promotion
  const relation = newRelation(parent.id, child.id, context.now)
  context.store.saveRelation(relation)
  touch(context, parent)
  context.effects.push({ kind: 'relations', itemId: child.id, edges: [{ before: null, after: relation }], ...(flowColor ? { flowColor } : {}) })
  if (command.autoPlace && orderingParent(context, child.id) !== previousParent) placeByParent(context, child)
  context.itemId = child.id
  context.label = serverText().labels.link
  return true
}
