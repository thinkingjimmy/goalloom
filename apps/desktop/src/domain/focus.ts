/**
 * [INPUT]: Raw period focus pointers and current item summaries (placement and lifecycle).
 * [OUTPUT]: focusHorizons, isFocusItem and effectiveFocus (periodId -> itemId) for main and renderer.
 * [POS]: Pure period focus rule. A pointer never cascades; it is only dormant while its item is elsewhere or unavailable.
 */
import type { Focus, ItemSummary } from '../shared/contracts/entities'

export const focusHorizons = ['month', 'week', 'day'] as const
export type FocusHorizon = typeof focusHorizons[number]
export function isFocusHorizon(horizon: string): horizon is FocusHorizon { return (focusHorizons as readonly string[]).includes(horizon) }

type FocusCandidate = Pick<ItemSummary, 'status' | 'archivedAt' | 'deletedAt'> & { placement: Pick<ItemSummary['placement'], 'periodId'> }
/** Done stays effective; cancelled, archived, deleted or placed in another period does not. */
export function isFocusItem(item: FocusCandidate, periodId: string): boolean {
  return item.placement.periodId === periodId && item.deletedAt === null && item.archivedAt === null && item.status !== 'cancelled'
}

export function effectiveFocus(focus: Focus[] | undefined, items: ItemSummary[]): Map<string, string> {
  const result = new Map<string, string>()
  if (!focus?.length) return result
  const byId = new Map(items.map(item => [item.id, item]))
  for (const pointer of focus) {
    const item = byId.get(pointer.itemId)
    if (item && isFocusItem(item, pointer.periodId)) result.set(pointer.periodId, pointer.itemId)
  }
  return result
}
