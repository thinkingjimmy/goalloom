/**
 * [INPUT]: A Store owned by the serial storage queue and validated page coordinates.
 * [OUTPUT]: Count-only summaries and bounded rollover detail pages without item bodies.
 * [POS]: Read projections for Settings and collapsed Activity; no business writes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Store } from '../storage/store'
import type { BatchPage, BatchSummary } from '../../shared/contracts/transfer'
import type { ActivitySummary, ItemCounts } from '../../shared/contracts/queries'

export function itemCounts(store: Store): ItemCounts {
  const row = store.db.prepare(`SELECT
    count(*) FILTER (WHERE deletedAt IS NULL AND status='done') AS done,
    count(*) FILTER (WHERE deletedAt IS NULL AND status='cancelled') AS cancelled,
    count(*) FILTER (WHERE deletedAt IS NULL AND archivedAt IS NOT NULL) AS archived,
    count(*) FILTER (WHERE deletedAt IS NOT NULL) AS trash FROM items`).get()!
  return { done: Number(row.done), cancelled: Number(row.cancelled), archived: Number(row.archived), trash: Number(row.trash) }
}

export function activitySummary(store: Store, itemId: string): ActivitySummary {
  const total = Number(store.db.prepare('SELECT count(*) AS n FROM item_events WHERE itemId=?').get(itemId)!.n)
  const latest = store.db.prepare('SELECT type,at FROM item_events WHERE itemId=? ORDER BY seq DESC LIMIT 1').get(itemId)
  return { total, latest: latest ? { type: String(latest.type), at: String(latest.at) } : null }
}

export function batchSummaries(store: Store): BatchSummary[] {
  return store.db.prepare(`SELECT o.id,o.at,json_array_length(o.effects) AS total,
    (SELECT count(*) FROM undo_effects u WHERE u.originalId=o.id) AS undone
    FROM operations o WHERE kind='rollover' AND source='system' ORDER BY o.rowid DESC LIMIT 50`).all()
    .map(row => ({ id: String(row.id), at: String(row.at), total: Number(row.total), undone: Number(row.undone) }))
}

export function batchPage(store: Store, operationId: string, offset: number, limit: number): BatchPage {
  // JSON1 pages the immutable effects in SQL, then joins each distinct key once; no whole-item decoding.
  const total = Number(store.db.prepare("SELECT count(*) AS n FROM operations o,json_each(o.effects) e WHERE o.id=? AND o.kind='rollover' AND json_extract(e.value,'$.kind')='position'").get(operationId)!.n)
  const rows = store.db.prepare(`SELECT i.id,i.title,coalesce(p.startDate,'Later') AS beforeDate,coalesce(n.startDate,'Later') AS afterDate
    FROM (SELECT e.value,e.key FROM operations o,json_each(o.effects) e WHERE o.id=? AND o.kind='rollover'
      AND json_extract(e.value,'$.kind')='position' ORDER BY e.key LIMIT ? OFFSET ?) e
    JOIN items i ON i.id=json_extract(e.value,'$.itemId')
    LEFT JOIN planning_periods p ON p.id=json_extract(e.value,'$.before.periodId')
    LEFT JOIN planning_periods n ON n.id=json_extract(e.value,'$.after.periodId') ORDER BY e.key`).all(operationId, limit, offset)
  return { total, items: rows.map(row => ({ id: String(row.id), title: String(row.title), from: String(row.beforeDate), to: String(row.afterDate) })) }
}
