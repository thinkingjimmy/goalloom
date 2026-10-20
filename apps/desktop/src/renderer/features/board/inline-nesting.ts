/**
 * [INPUT]: Displayed placement-local outline rows and an insertion/editing index.
 * [OUTPUT]: The eligible preceding root shared by inline creation and title editing.
 * [POS]: Board-only keyboard target selection; authoritative nesting commands revalidate topology and versions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemSummary } from '../../../shared/contracts/entities'
import { sameOutlinePeriod } from '../../../domain/nesting'

export function precedingNestingRoot(rows: ItemSummary[], index = rows.length): ItemSummary | null {
  const previous = rows[index - 1]
  if (!previous) return null
  const root = previous.placement.nestingParentId ? rows.find(item => item.id === previous.placement.nestingParentId) : previous
  return root && !root.archivedAt && !root.deletedAt && root.status !== 'cancelled' && !root.placement.nestingParentId
    && sameOutlinePeriod(previous.placement, root.placement) ? root : null
}
