/**
 * [INPUT]: Item content/lifecycle fields and the active relation count; the caller owns the empty-title draft.
 * [OUTPUT]: Deterministic eligibility for discarding a cleared title-only todo.
 * [POS]: Shared detail/transaction guard; never treats placement or an old saved title as additional content.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Item } from '../shared/contracts/entities'

export function canDiscardEmptyTitle(item: Pick<Item, 'description' | 'dueDate' | 'flowColor' | 'status' | 'archivedAt' | 'deletedAt'>, relationCount: number, hasGuidance = false): boolean {
  return !item.description.trim() && !item.dueDate && item.flowColor === null && item.status === 'todo'
    && item.archivedAt === null && item.deletedAt === null && relationCount === 0 && !hasGuidance
}
