/**
 * [INPUT]: Canonical changes, encrypted-op causal cursors and local sync receipts.
 * [OUTPUT]: Task-grouped lost local actions and durable per-task acknowledgements.
 * [POS]: Review metadata over sync_conflicts; business projections and receipt history stay intact.
 */
import { actionSchema, parseSyncOp, type Action, type SyncOp } from '@goalloom/contracts'
import type { CanonChange } from './apply'
import type { SqlDriver, SqlValue } from './driver'

interface Entry { itemId: string; actions: Action[]; seen: boolean }
interface Detail { review: 1; entries: Entry[] }
export interface PendingConflict { itemId: string; records: { opId: string; code: string; actions: Action[] }[] }
const editable = new Set(['item.create', 'item.set', 'item.status', 'item.place', 'item.nest', 'item.archive', 'rel.link', 'rel.unlink'])

export function actionItem(driver: SqlDriver, action: Action): string | null {
  if (action.t === 'rel.link') return action.childId
  if (action.t === 'rel.unlink') {
    const row = driver.prepare('SELECT childId FROM item_relations WHERE id=?').get(action.id)
    return row ? String(row.childId) : null
  }
  return 'id' in action ? action.id : null
}

function sourceEntries(driver: SqlDriver, payload: string): Entry[] {
  const op = parseSyncOp(JSON.parse(payload))
  if (op.creationOperationId || op.importedCalendar) return []
  const groups = new Map<string, Action[]>()
  for (const action of op.actions) {
    if (!editable.has(action.t) || action.t === 'item.place' && action.reason === 'rollover') continue
    const id = actionItem(driver, action)
    if (!id) continue
    groups.set(id, [...(groups.get(id) ?? []), action])
  }
  return [...groups].map(([itemId, actions]) => ({ itemId, actions, seen: false }))
}

function detail(driver: SqlDriver, row: Record<string, SqlValue>): Detail {
  if (String(row.detail ?? '').startsWith('{')) {
    const parsed = JSON.parse(String(row.detail)) as Detail
    if (parsed.review === 1 && Array.isArray(parsed.entries)) return { review: 1, entries: parsed.entries.map(entry => ({
      itemId: String(entry.itemId), actions: actionSchema.array().parse(entry.actions), seen: entry.seen === true,
    })) }
  }
  return { review: 1, entries: sourceEntries(driver, String(row.payload)) }
}

export function pendingConflicts(driver: SqlDriver): PendingConflict[] {
  const groups = new Map<string, PendingConflict>()
  const rows = driver.prepare(`SELECT c.*,o.payload FROM sync_conflicts c JOIN sync_ops o ON o.opId=c.opId
    WHERE c.seenAt IS NULL AND o.origin='local' ORDER BY o.localOrder,c.at,c.opId`).all()
  for (const row of rows) {
    const value = detail(driver, row)
    let updated = false
    for (const entry of value.entries) {
      if (entry.seen || !entry.actions.length) continue
      if (entry.actions.every(action => alreadyApplied(driver, action))) { entry.seen = true; updated = true; continue }
      const group = groups.get(entry.itemId) ?? { itemId: entry.itemId, records: [] }
      group.records.push({ opId: String(row.opId), code: String(row.code), actions: entry.actions })
      groups.set(entry.itemId, group)
    }
    if (updated) driver.prepare('UPDATE sync_conflicts SET detail=?,seenAt=? WHERE opId=?')
      .run(JSON.stringify(value), value.entries.every(entry => entry.seen) ? String(row.at) : null, String(row.opId))
  }
  return [...groups.values()].filter(group => driver.prepare('SELECT 1 FROM items WHERE id=?').get(group.itemId)
    || group.records.some(record => record.actions.some(action => action.t === 'item.create' && action.id === group.itemId)))
}

function alreadyApplied(driver: SqlDriver, action: Action): boolean {
  if (action.t === 'rel.link') return !!driver.prepare('SELECT 1 FROM item_relations WHERE parentId=? AND childId=? AND invalidatedAt IS NULL').get(action.parentId, action.childId)
  if (!('id' in action)) return false
  const item = driver.prepare('SELECT * FROM items WHERE id=? AND deletedAt IS NULL').get(action.id)
  if (!item) return false
  if (action.t === 'item.create') return item.title === action.title && item.description === action.description && (item.dueDate ?? null) === action.dueDate
  if (action.t === 'item.set') return Object.entries(action.fields).every(([key, value]) => (item[key] ?? null) === value)
  if (action.t === 'item.status') return item.status === action.status
  if (action.t === 'item.archive') return (item.archivedAt ?? null) === action.archivedAt
  return false
}

export function acknowledgeConflict(driver: SqlDriver, group: PendingConflict, at: string): void {
  for (const record of group.records) {
    const row = driver.prepare('SELECT c.*,o.payload FROM sync_conflicts c JOIN sync_ops o ON o.opId=c.opId WHERE c.opId=?').get(record.opId)
    if (!row) continue
    const value = detail(driver, row)
    for (const entry of value.entries) if (entry.itemId === group.itemId) entry.seen = true
    driver.prepare('UPDATE sync_conflicts SET detail=?,seenAt=? WHERE opId=?')
      .run(JSON.stringify(value), value.entries.every(entry => entry.seen) ? at : null, record.opId)
  }
}

function actionFor(op: SyncOp, itemId: string, dim: string): Action[] {
  return op.actions.flatMap(action => {
    if (action.t === 'item.set' && action.id === itemId && Object.hasOwn(action.fields, dim)) {
      return [{ ...action, fields: { [dim]: action.fields[dim as keyof typeof action.fields] } } as Action]
    }
    if (dim === 'placement' && (action.t === 'item.place' && action.reason !== 'rollover' || action.t === 'item.nest') && action.id === itemId) return [action]
    if (dim === 'status' && action.t === 'item.status' && action.id === itemId) return [action]
    if (dim === 'archive' && action.t === 'item.archive' && action.id === itemId) return [action]
    if (dim === 'relation' && action.t === 'rel.link' && action.childId === itemId) return [action]
    return []
  })
}

/** A causally later edit is ordinary synchronization. Only an unseen predecessor can lose a local edit. */
export function recordOverwrittenConflicts(driver: SqlDriver, incoming: SyncOp, changes: CanonChange[]): void {
  if (incoming.basisSeq === undefined) return
  const found = new Set<string>()
  for (const change of changes) {
    if (!change.itemId) continue
    const dimensions = change.dim === 'delete' ? ['title', 'description', 'dueDate', 'status', 'archive', 'placement'] : [change.dim]
    for (const dim of dimensions) {
      const prior = driver.prepare(`SELECT c.seq,o.opId,o.payload,o.origin,o.deviceId FROM canon_changes c
        JOIN canon_ops co ON co.seq=c.seq JOIN sync_ops o ON o.opId=co.opId
        WHERE c.itemId=? AND c.dim=? ORDER BY c.seq DESC,c.idx DESC LIMIT 1`).get(change.itemId, dim)
      if (!prior || Number(prior.seq) <= incoming.basisSeq || prior.origin !== 'local' || prior.deviceId === incoming.deviceId) continue
      const source = parseSyncOp(JSON.parse(String(prior.payload)))
      if (source.creationOperationId) continue
      const actions = actionFor(source, change.itemId, dim)
      const key = `${source.opId}:${change.itemId}:${dim}`
      if (!actions.length || found.has(key)) continue
      found.add(key)
      const old = driver.prepare('SELECT c.*,o.payload FROM sync_conflicts c JOIN sync_ops o ON o.opId=c.opId WHERE c.opId=?').get(source.opId)
      const value = old ? detail(driver, old) : { review: 1 as const, entries: [] }
      let entry = value.entries.find(entry => entry.itemId === change.itemId)
      if (entry?.actions.some(action => JSON.stringify(action) === JSON.stringify(actions[0]))) continue
      if (!entry) { entry = { itemId: change.itemId, actions: [], seen: false }; value.entries.push(entry) }
      if (entry.seen) entry.actions = []
      entry.actions.push(...actions); entry.seen = false
      driver.prepare(`INSERT INTO sync_conflicts (opId,seq,code,itemId,detail,at,seenAt) VALUES (?,?,?,?,?,?,NULL)
        ON CONFLICT(opId) DO UPDATE SET detail=excluded.detail,seenAt=NULL`)
        .run(source.opId, Number(prior.seq), 'concurrent_change', change.itemId, JSON.stringify(value), incoming.at)
    }
  }
}
