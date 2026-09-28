/**
 * [INPUT]: Store and item identities participating in a board read or ordering transaction.
 * [OUTPUT]: Body-free placement metadata for these items and their active ancestors.
 * [POS]: Ordering read path; UNION bounds duplicate DAG paths and retains archived ancestors.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { OrderNode } from '../../shared/contracts/queries'
import type { Store } from '../storage/store'

export function orderNodes(store: Store, ids: readonly string[]): OrderNode[] {
  if (!ids.length) return []
  return store.prepare(`WITH RECURSIVE ancestors(id) AS (
    SELECT value FROM json_each(?)
    UNION SELECT r.parentId FROM item_relations r JOIN ancestors a ON a.id=r.childId WHERE r.invalidatedAt IS NULL
  ) SELECT i.id,p.horizon,p.periodId,p.sortKey,pp.startDate AS periodStart,pp.endAt AS periodEnd
    FROM ancestors a JOIN items i ON i.id=a.id JOIN item_placements p ON p.itemId=i.id
    LEFT JOIN planning_periods pp ON pp.id=p.periodId WHERE i.deletedAt IS NULL ORDER BY i.id`)
    .all(JSON.stringify(ids)) as unknown as OrderNode[]
}
