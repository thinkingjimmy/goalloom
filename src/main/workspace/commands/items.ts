/**
 * [INPUT]: 已校验命令与最新事务 Context。
 * [OUTPUT]: 首次确认、创建、编辑、流程颜色、移动和关联的原子字段/边差量及真实事件。
 * [POS]: workspace 的条目与首次配置命令库；关系为多父 DAG，流程根颜色唯一且无上级，各条目状态/位置独立。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { randomUUID } from 'node:crypto'
import { currentPeriod, workspaceDate } from '../../../domain/calendar'
import { relationProblem } from '../../../domain/relations'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import { calendarSchema, type Item, type Relation } from '../../../shared/contracts/entities'
import { statusGroup } from '../../../shared/contracts/effects'
import { assertAvailable, assertFlowColorFree, hasActiveParent, nextSortKey, targetPeriod, touch, type Context } from '../context'

export function confirmSetup(context: Context, command: CommandOf<'confirmSetup'>): boolean {
  if (context.workspace.setupConfirmedAt) throw new DomainError('setup', '日历已锁定，重新配置需先备份并重置工作区')
  const calendar = calendarSchema.parse({ id: randomUUID(), timezone: command.timezone, weekStart: command.weekStart, cycleAnchor: command.cycleAnchor })
  if (calendar.cycleAnchor > workspaceDate(calendar.timezone, context.now)) throw new DomainError('invalid', '周期起点不能晚于今天')
  context.workspace.calendar = calendar
  context.workspace.setupConfirmedAt = context.now
  for (const horizon of ['cycle', 'month', 'week', 'day'] as const) {
    const period = currentPeriod(calendar, horizon, context.now)
    context.store.ensurePeriod(period)
    context.store.db.prepare('INSERT INTO rollover_policies VALUES (?,?,1,?)').run(horizon, horizon === 'day' ? 'auto' : 'manual', period.id)
  }
  context.label = '确认工作区配置'
  return true
}

export function createItem(context: Context, command: CommandOf<'create'>): boolean {
  const parent = command.parentId ? context.store.item(command.parentId, command.expectedParentVersion ?? -1) : null
  if (parent) assertAvailable(parent)
  if (command.flowColor !== null) {
    if (parent) throw new DomainError('invalid', '有上级的条目跟随上级流程，不能单独设置颜色')
    assertFlowColorFree(context, command.flowColor, null)
  }
  const id = randomUUID()
  const period = targetPeriod(context, command.horizon)
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
  context.label = parent ? '拆解下一步' : '创建'
  return true
}

export function editItem(context: Context, command: CommandOf<'edit'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if (item.title === command.title && item.description === command.description && item.dueDate === command.dueDate) return false
  Object.assign(item, { title: command.title, description: command.description, dueDate: command.dueDate })
  touch(context, item)
  context.itemId = item.id
  context.label = '保存'
  return true
}

export function setFlowColor(context: Context, command: CommandOf<'flowColor'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if ((item.flowColor ?? null) === command.flowColor) return false
  if (command.flowColor !== null) {
    if (hasActiveParent(context, item.id)) throw new DomainError('invalid', '有上级的条目跟随上级流程，不能单独设置颜色')
    assertFlowColorFree(context, command.flowColor, item.id)
  }
  item.flowColor = command.flowColor
  touch(context, item)
  context.itemId = item.id
  context.label = '流程颜色'
  return true
}

export function moveItem(context: Context, command: CommandOf<'move'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if (item.placement.version !== command.expectedPlacementVersion) throw new DomainError('stale', '位置已变化，请刷新后重试')
  const before = structuredClone(item)
  const previous = context.store.position(item)
  const target = targetPeriod(context, command.horizon)
  const periodId = target?.id ?? null
  if (command.beforeId === item.id) return false
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
  context.label = samePeriod ? '排序' : rollover ? '顺延' : '移动'
  return true
}

export function newRelation(parentId: string, childId: string, now: string): Relation {
  return { id: randomUUID(), parentId, childId, invalidatedAt: null, invalidatedBy: null, reason: null, createdAt: now }
}

export function linkItems(context: Context, command: CommandOf<'link'>): boolean {
  const parent = context.store.item(command.parentId, command.expectedParentVersion)
  const child = context.store.item(command.childId, command.expectedChildVersion)
  assertAvailable(parent); assertAvailable(child)
  if (child.flowColor !== null) throw new DomainError('conflict', `「${child.title}」是一个流程，请先移除它的流程颜色`)
  const problem = relationProblem(parent.id, child.id, context.store.relations())
  if (problem) throw new DomainError('conflict', problem)
  const relation = newRelation(parent.id, child.id, context.now)
  context.store.saveRelation(relation)
  touch(context, parent); touch(context, child)
  context.effects.push({ kind: 'relations', itemId: child.id, edges: [{ before: null, after: relation }] })
  context.itemId = child.id
  context.label = '关联'
  return true
}
