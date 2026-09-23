/**
 * [INPUT]: 事务中的当前条目、严格命令和注入时刻。
 * [OUTPUT]: 独立状态/归档/软删除/定向还原与关系差量，原子事件。
 * [POS]: 生命周期命令库；不变更计划、不联动关联项状态或恢复暂停。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { changeStatus } from '../../../domain/status'
import { relationProblem } from '../../../domain/relations'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import { statusGroup, type EdgeDelta } from '../../../shared/contracts/effects'
import type { Item, Relation } from '../../../shared/contracts/entities'
import { assertAvailable, flowColorOwner, touch, type Context } from '../context'

export function setStatus(context: Context, command: CommandOf<'status'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if (item.status === command.status) return false
  const before = structuredClone(item)
  Object.assign(item, changeStatus(command.status, context.now))
  touch(context, item)
  context.effects.push({ kind: 'status', itemId: item.id, before: statusGroup(before), after: statusGroup(item) })
  context.store.event(command.operationId, context.now, 'status_changed', before, item)
  context.itemId = item.id
  context.label = { todo: '重开', done: '完成', cancelled: '取消' }[command.status]
  return true
}
export function setArchive(context: Context, command: CommandOf<'archive'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  if ((item.archivedAt !== null) === command.archived) return false
  const before = structuredClone(item)
  item.archivedAt = command.archived ? context.now : null
  touch(context, item)
  context.effects.push({ kind: 'archive', itemId: item.id, before: before.archivedAt, after: item.archivedAt })
  context.store.event(command.operationId, context.now, command.archived ? 'archived' : 'unarchived', before, item)
  context.itemId = item.id
  context.label = command.archived ? '归档' : '解除归档'
  return true
}
export function invalidateEdges(context: Context, itemId: string): EdgeDelta[] {
  return context.store.relations().filter(edge => edge.parentId === itemId || edge.childId === itemId).map(edge => ({
    before: edge, after: { ...edge, invalidatedAt: context.now, invalidatedBy: context.command.operationId, reason: 'delete' },
  }))
}
export function writeEdges(context: Context, edges: Relation[], exceptId?: string): void {
  // --- 先失效再恢复，数据库防环约束始终成立。端点版本只保护本次写入。 ---
  for (const edge of [...edges].sort((a, b) => Number(a.invalidatedAt === null) - Number(b.invalidatedAt === null))) context.store.saveRelation(edge)
  const ids = new Set(edges.flatMap(edge => [edge.parentId, edge.childId]))
  for (const id of ids) if (id !== exceptId) touch(context, context.store.item(id))
}
export function deleteItem(context: Context, command: CommandOf<'delete'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  assertAvailable(item)
  const before = structuredClone(item)
  const edges = invalidateEdges(context, item.id)
  writeEdges(context, edges.map(delta => delta.after), item.id)
  Object.assign(item, { deletedAt: context.now, deletedBy: command.operationId })
  touch(context, item)
  visibilityEffect(context, before, item, edges)
  context.store.event(command.operationId, context.now, 'deleted', before, item)
  context.label = '删除'
  return true
}
export function restoreItem(context: Context, command: CommandOf<'restoreItem'>): boolean {
  const item = context.store.item(command.itemId, command.expectedVersion)
  if (!item.deletedAt || (command.deletionSource !== null && item.deletedBy !== command.deletionSource)) throw new DomainError('conflict', '这次删除已失效，请在回收站查看当前条目')
  const before = structuredClone(item)
  const candidates = context.store.relations(false).filter(edge => edge.reason === 'delete' && edge.invalidatedBy === item.deletedBy && (edge.parentId === item.id || edge.childId === item.id))
  Object.assign(item, { deletedAt: null, deletedBy: null })
  // A colour reused while this flow was in the trash stays with its new owner.
  const owner = item.flowColor !== null ? flowColorOwner(context, item.flowColor, item.id) : null
  if (owner !== null) { item.flowColor = null; context.warnings.push(`流程颜色已被「${owner}」使用，已移除本条目的流程颜色`) }
  touch(context, item)
  const edges: EdgeDelta[] = []
  for (const edge of candidates) {
    const other = context.store.item(edge.parentId === item.id ? edge.childId : edge.parentId)
    const child = edge.childId === item.id ? item : other
    const problem = other.deletedAt ? '关联端点仍在回收站' : child.flowColor !== null ? '下级已设为流程' : relationProblem(edge.parentId, edge.childId, context.store.relations())
    if (problem) { context.warnings.push(`未恢复一条关联：${problem}`); continue }
    const restored: Relation = { ...edge, invalidatedAt: null, invalidatedBy: null, reason: null }
    writeEdges(context, [restored], item.id)
    edges.push({ before: edge, after: restored })
  }
  visibilityEffect(context, before, item, edges)
  context.store.event(command.operationId, context.now, 'item_restored', before, item)
  context.label = '还原'
  return true
}
function visibilityEffect(context: Context, before: Item, after: Item, edges: EdgeDelta[]): void {
  context.effects.push({ kind: 'visibility', itemId: after.id, before: { deletedAt: before.deletedAt, deletedBy: before.deletedBy }, after: { deletedAt: after.deletedAt, deletedBy: after.deletedBy }, edges })
  context.itemId = after.id
}
export function unlinkItems(context: Context, command: CommandOf<'unlink'>): boolean {
  const edge = context.store.relations().find(row => row.id === command.relationId)
  if (!edge) throw new DomainError('conflict', '该关联已经解除')
  assertAvailable(context.store.item(edge.parentId, command.expectedParentVersion))
  assertAvailable(context.store.item(edge.childId, command.expectedChildVersion))
  const after: Relation = { ...edge, invalidatedAt: context.now, invalidatedBy: command.operationId, reason: 'unlink' }
  writeEdges(context, [after])
  context.effects.push({ kind: 'relations', itemId: edge.childId, edges: [{ before: edge, after }] })
  context.itemId = edge.childId
  context.label = '解除关联'
  return true
}
