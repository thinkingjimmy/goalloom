/**
 * [INPUT]: 已校验 createPlan 命令（1–8 项、ParentRef 带预览版本）与最新事务 Context。
 * [OUTPUT]: 写入前统一复核去重后的既有上级/周期/颜色，再按稳定拓扑序每项一个 create 效果、入边归下级、created 事件与有序 itemIds。
 * [POS]: 智能输入确认后的唯一批量创建命令；与单项 createItem 共用位置/关系原语，失败由 repository 事务整体回滚。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { randomUUID } from 'node:crypto'
import { planOrder, planProblem } from '../../../domain/plan'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { Item } from '../../../shared/contracts/entities'
import { statusGroup } from '../../../shared/contracts/effects'
import { assertAvailable, assertFlowColorFree, nextSortKey, targetPeriod, touch, type Context } from '../context'
import { newRelation } from './items'

export function createPlan(context: Context, command: CommandOf<'createPlan'>): boolean {
  const problem = planProblem(command.items)
  if (problem) throw new DomainError('invalid', problem)
  // --- Every guard runs before the first write, so a parent touched by child one never looks stale to child two. ---
  const parents = new Map<string, Item>()
  for (const ref of command.items.flatMap(item => item.parentRefs)) {
    if (ref.kind !== 'existing' || parents.has(ref.itemId)) continue
    const parent = context.store.item(ref.itemId, ref.expectedVersion)
    assertAvailable(parent)
    parents.set(parent.id, parent)
  }
  for (const item of command.items) {
    const period = targetPeriod(context, item.horizon)
    if ((period?.id ?? null) !== item.previewPeriodId) throw new DomainError('stale', '预览所在的周期已变化，请刷新预览后重新确认')
    if (item.flowColor !== null) assertFlowColorFree(context, item.flowColor, null)
  }
  const ids = new Map<string, string>()
  for (const draft of planOrder(command.items)!) {
    const id = randomUUID()
    ids.set(draft.draftId, id)
    const period = targetPeriod(context, draft.horizon)
    const item: Item = { id, title: draft.title, description: draft.description, dueDate: draft.dueDate,
      status: 'todo', completedAt: null, cancelledAt: null, archivedAt: null, deletedAt: null, deletedBy: null,
      createdAt: context.now, updatedAt: context.now, version: 1, flowColor: draft.flowColor,
      placement: { itemId: id, horizon: draft.horizon, periodId: period?.id ?? null, sortKey: nextSortKey(context, draft.horizon, period?.id ?? null, null), version: 1, holdPeriodId: null } }
    context.store.insertItem(item)
    const edges = draft.parentRefs.map(ref => newRelation(ref.kind === 'existing' ? ref.itemId : ids.get(ref.draftId)!, id, context.now))
    for (const edge of edges) context.store.saveRelation(edge)
    context.effects.push({ kind: 'create', itemId: id, status: statusGroup(item), horizon: draft.horizon, periodId: period?.id ?? null, initialRelations: edges.map(edge => edge.id) })
    context.store.event(command.operationId, context.now, 'created', null, item)
  }
  for (const parent of parents.values()) touch(context, context.store.item(parent.id))
  context.itemIds = context.effects.map(effect => effect.itemId)
  context.itemId = context.itemIds.length === 1 ? context.itemIds[0]! : null
  context.label = context.itemIds.length === 1 ? '创建事项' : `创建 ${context.itemIds.length} 个事项`
  return true
}
