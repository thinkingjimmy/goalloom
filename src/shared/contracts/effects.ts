/**
 * [INPUT]: Authoritative business states, relation deltas, bounded guidance and original/rewritten note text.
 * [OUTPUT]: Immutable v1/v2 owned effects (including description-only undo) and body-free business-state events.
 * [POS]: Shared transaction, undo and import contract; models cannot supply effects.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { StatusGroup } from '../../domain/status'
import type { Item, ItemHorizon, Relation } from './entities'
import type { CommandResult } from './commands'
import type { GuidanceValue } from './assistance'

export interface PositionEffect { horizon: ItemHorizon; periodId: string | null; previousId: string | null; nextId: string | null }
export interface EdgeDelta { before: Relation | null; after: Relation }
export type Effect =
  | { kind: 'description'; itemId: string; before: string; after: string }
  | { kind: 'guidance'; itemId: string; before: { value: GuidanceValue | null; operationId: string | null }; after: { value: GuidanceValue | null; operationId: string } }
  | { kind: 'create'; itemId: string; status: StatusGroup; horizon: ItemHorizon; periodId: string | null; initialRelations: string[] }
  | { kind: 'status'; itemId: string; before: StatusGroup; after: StatusGroup }
  | { kind: 'position'; itemId: string; before: PositionEffect; after: PositionEffect }
  | { kind: 'archive'; itemId: string; before: string | null; after: string | null }
  | { kind: 'visibility'; itemId: string; before: { deletedAt: string | null; deletedBy: string | null }; after: { deletedAt: string | null; deletedBy: string | null }; edges: EdgeDelta[] }
  | { kind: 'relations'; itemId: string; edges: EdgeDelta[]; flowColor?: { before: number; after: null; transferredTo?: string | undefined } | undefined }

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
  effectsVersion: 1 | 2; effects: Effect[]; result: CommandResult
}
export function businessState(item: Item): BusinessState {
  return { status: item.status, completedAt: item.completedAt, cancelledAt: item.cancelledAt,
    archivedAt: item.archivedAt, deletedAt: item.deletedAt, deletedBy: item.deletedBy, version: item.version,
    horizon: item.placement.horizon, periodId: item.placement.periodId, sortKey: item.placement.sortKey, holdPeriodId: item.placement.holdPeriodId }
}
export function statusGroup(item: StatusGroup): StatusGroup { return { status: item.status, completedAt: item.completedAt, cancelledAt: item.cancelledAt } }
