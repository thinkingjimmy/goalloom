/**
 * [INPUT]: 权威事务中的业务状态，不含正文。
 * [OUTPUT]: 版本化效果回执、事件和导入链字段；原回执不可变。
 * [POS]: domain 与 storage 共用的撤销/历史契约，renderer 不能提交这些类型。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { StatusGroup } from '../../domain/status'
import type { Item, ItemHorizon, Relation } from './entities'
import type { CommandResult } from './commands'

export interface PositionEffect { horizon: ItemHorizon; periodId: string | null; previousId: string | null; nextId: string | null }
export interface EdgeDelta { before: Relation | null; after: Relation }
export type Effect =
  | { kind: 'create'; itemId: string; status: StatusGroup; horizon: ItemHorizon; periodId: string | null; initialRelations: string[] }
  | { kind: 'status'; itemId: string; before: StatusGroup; after: StatusGroup }
  | { kind: 'position'; itemId: string; before: PositionEffect; after: PositionEffect }
  | { kind: 'archive'; itemId: string; before: string | null; after: string | null }
  | { kind: 'visibility'; itemId: string; before: { deletedAt: string | null; deletedBy: string | null }; after: { deletedAt: string | null; deletedBy: string | null }; edges: EdgeDelta[] }
  | { kind: 'relations'; itemId: string; edges: EdgeDelta[] }

export interface BusinessState extends StatusGroup {
  horizon: ItemHorizon; periodId: string | null; archivedAt: string | null; deletedAt: string | null;
  deletedBy: string | null; version: number; sortKey: number; holdPeriodId: string | null
}
export interface ItemEvent {
  seq: number; id: string; operationId: string; eventIndex: number; itemId: string;
  at: string; type: string; before: BusinessState | null; after: BusinessState; undoOf: string | null
}
export interface Operation {
  id: string; generation: string; requestHash: string; kind: string; source: 'user' | 'system'; at: string;
  effectsVersion: 1; effects: Effect[]; result: CommandResult
}
export function businessState(item: Item): BusinessState {
  return { status: item.status, completedAt: item.completedAt, cancelledAt: item.cancelledAt,
    archivedAt: item.archivedAt, deletedAt: item.deletedAt, deletedBy: item.deletedBy, version: item.version,
    horizon: item.placement.horizon, periodId: item.placement.periodId, sortKey: item.placement.sortKey, holdPeriodId: item.placement.holdPeriodId }
}
export function statusGroup(item: StatusGroup): StatusGroup { return { status: item.status, completedAt: item.completedAt, cancelledAt: item.cancelledAt } }
