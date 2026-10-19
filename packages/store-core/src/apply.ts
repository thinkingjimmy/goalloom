/**
 * [INPUT]: A validated SyncOp, a base_ or visible table prefix, and a period materializer.
 * [OUTPUT]: Atomic canonical changes with cross-period ownership, placement-local sorting, parent lifecycle/two-level/Later validation, safe tombstones and causal creation preflight, or a stable business error.
 * [POS]: Reference applier. It does not touch operations, item_events or undo_effects.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Action, SyncOp } from '@goalloom/contracts'
import { parseSetting, parseSyncOp } from '@goalloom/contracts'
import type { ApplyHost, SqlDriver, SqlValue } from './driver'
import { SyncApplyError } from './driver'
import { writeSetting } from './settings'
import { checkCreationCompletion, checkUndoCreate } from './undo-create'
import { alignImportAction, canAdoptCalendar, followsImportedPlacement } from './import-calendar'
import { localParentSql } from './outline'

export interface CanonChange { itemId: string | null; dim: string; before: unknown; after: unknown }
export interface AppliedOp { kind: string; outcome: 'applied' | 'partial'; changes: CanonChange[] }

type Row = Record<string, SqlValue>

function text(row: Row | undefined, key: string): string | null {
  const value = row?.[key]
  return value === null || value === undefined ? null : String(value)
}
function num(row: Row, key: string): number { return Number(row[key]) }

export function applySyncOp(driver: SqlDriver, input: unknown, scope: 'base' | 'visible', host: ApplyHost): AppliedOp {
  const op = parseSyncOp(input)
  const prefix = scope === 'base' ? 'base_' : ''
  const changes: CanonChange[] = []
  let partial = false
  checkCreationCompletion(driver, prefix, op)
  for (const action of op.actions) if (action.t === 'item.undoCreate') checkUndoCreate(driver, prefix, op, action)
  for (const original of op.actions) {
    const action = alignImportAction(driver, prefix, op, original, host)
    if (!action) continue
    const result = applyAction(driver, prefix, op, action, host, changes)
    if (result === 'partial') partial = true
  }
  const outlineItems = [...new Set(changes.flatMap(change => change.itemId && ['placement', 'create', 'delete', 'restore'].includes(change.dim) ? [change.itemId] : []))]
  if (outlineItems.length && driver.prepare(`SELECT 1 FROM ${prefix}item_placements p
    JOIN ${prefix}item_placements parent ON parent.itemId=p.nestingParentId JOIN ${prefix}items i ON i.id=p.itemId
    JOIN ${prefix}items owner ON owner.id=parent.itemId
    WHERE i.deletedAt IS NULL AND (p.itemId IN (SELECT value FROM json_each(?)) OR p.nestingParentId IN (SELECT value FROM json_each(?)))
    AND (p.itemId=p.nestingParentId OR parent.nestingParentId IS NOT NULL OR owner.deletedAt IS NOT NULL OR (p.horizon='later') != (parent.horizon='later'))
    LIMIT 1`).get(JSON.stringify(outlineItems), JSON.stringify(outlineItems))) throw new SyncApplyError('outline_conflict')
  return { kind: op.actions[0]?.t ?? 'empty', outcome: partial ? 'partial' : 'applied', changes }
}

function applyAction(driver: SqlDriver, prefix: string, op: SyncOp, action: Action, host: ApplyHost, changes: CanonChange[]): 'applied' | 'partial' {
  switch (action.t) {
    case 'item.create': return createItem(driver, prefix, op, action, host, changes)
    case 'item.set': return setFields(driver, prefix, op, action, changes)
    case 'item.status': return setStatus(driver, prefix, op, action, changes)
    case 'item.place': return placeItem(driver, prefix, op, action, host, changes, action.reason)
    case 'item.nest': return nestItem(driver, prefix, op, action, host, changes)
    case 'item.archive': return setArchive(driver, prefix, op, action, changes)
    case 'item.delete': return deleteItem(driver, prefix, op, action.id, changes)
    case 'item.undoCreate': return deleteItem(driver, prefix, op, action.id, changes)
    case 'item.discardIfEmpty': return discardIfEmpty(driver, prefix, op, action, changes)
    case 'item.restore': return restoreItem(driver, prefix, op, action, changes)
    case 'item.rollover': return rolloverItem(driver, prefix, op, action, host, changes)
    case 'rel.link': return link(driver, prefix, op, action, changes)
    case 'rel.unlink': return unlink(driver, prefix, op, action, changes)
    case 'guidance.set': return setGuidance(driver, prefix, op, action, changes)
    case 'policy.set': return setPolicy(driver, prefix, op, action, host, changes)
    case 'calendar.setup': return setupCalendar(driver, prefix, op, action, changes)
    case 'pref.set': return setPreference(driver, op, action)
    case 'revert': return revert(driver, prefix, op, action, host, changes)
    default: throw new SyncApplyError('unsupported_version')
  }
}

function setPreference(driver: SqlDriver, op: SyncOp, action: Extract<Action, { t: 'pref.set' }>): 'applied' {
  const setting = parseSetting(action.key, action.value)
  writeSetting(driver, setting.key, setting.value, op.at, op.opId)
  return 'applied'
}

function requireItem(driver: SqlDriver, prefix: string, id: string): Row {
  const row = driver.prepare(`SELECT * FROM ${prefix}items WHERE id=?`).get(id)
  if (!row) throw new SyncApplyError('item_deleted')
  if (text(row, 'deletedAt')) throw new SyncApplyError('item_deleted')
  return row
}

function ensurePeriod(driver: SqlDriver, prefix: string, host: ApplyHost, horizon: string, startDate: string | null): string | null {
  if (horizon === 'later') return null
  if (!startDate) throw new SyncApplyError('period_scale_mismatch')
  const existing = driver.prepare(`SELECT id FROM ${prefix}planning_periods WHERE horizon=? AND startDate=?`).get(horizon, startDate)
  if (existing) return String(existing.id)
  const calendar = text(driver.prepare(`SELECT calendar FROM ${prefix}workspace WHERE id=1`).get(), 'calendar')
  const period = host.materializePeriod(horizon, startDate, calendar ?? undefined)
  if (period.horizon !== horizon || period.startDate !== startDate) throw new SyncApplyError('period_scale_mismatch')
  driver.prepare(`INSERT INTO ${prefix}planning_periods (id,horizon,startDate,endDate,startAt,endAt) VALUES (?,?,?,?,?,?)`)
    .run(period.id, period.horizon, period.startDate, period.endDate, period.startAt, period.endAt)
  return period.id
}

function sortKey(driver: SqlDriver, prefix: string, horizon: string, periodId: string | null, afterId: string | null, beforeId: string | null, excluded: string | null, nestingParentId: string | null): number {
  if (nestingParentId && !driver.prepare(`SELECT 1 FROM ${prefix}item_placements WHERE itemId=? AND horizon=? AND periodId IS ?`).get(nestingParentId, horizon, periodId)) nestingParentId = null
  const rows = driver.prepare(`SELECT p.itemId AS itemId, p.sortKey AS sortKey FROM ${prefix}item_placements p JOIN ${prefix}items i ON i.id=p.itemId
    WHERE i.deletedAt IS NULL AND p.horizon=? AND p.periodId IS ? AND ${localParentSql(prefix)} IS ? AND p.itemId IS NOT ? ORDER BY p.sortKey, p.itemId`).all(horizon, periodId, nestingParentId, excluded)
  const ids = rows.map(row => String(row.itemId))
  const indexOf = (id: string | null) => id && ids.includes(id) ? ids.indexOf(id) : -1
  const before = indexOf(beforeId)
  const after = indexOf(afterId)
  const slot = before >= 0 ? before : after >= 0 ? after + 1 : rows.length
  const prev = slot > 0 ? Number(rows[slot - 1]?.sortKey) : undefined
  const next = slot < rows.length ? Number(rows[slot]?.sortKey) : undefined
  if (prev === undefined && next === undefined) return 0
  if (prev === undefined) return (next ?? 0) - 1024
  if (next === undefined) return prev + 1024
  return prev + (next - prev) / 2
}

function createItem(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'item.create' }>, host: ApplyHost, changes: CanonChange[]): 'applied' {
  if (driver.prepare(`SELECT 1 FROM ${prefix}items WHERE id=?`).get(action.id)) throw new SyncApplyError('item_exists')
  if (action.horizon === 'later' && action.flowColor !== undefined && action.flowColor !== null) throw new SyncApplyError('horizon_order')
  const periodId = ensurePeriod(driver, prefix, host, action.horizon, action.periodKey?.startDate ?? null)
  const key = sortKey(driver, prefix, action.horizon, periodId, action.sortHint.afterId, action.sortHint.beforeId, null, null)
  const color = action.parentId ? null : action.flowColor ?? null
  driver.prepare(`INSERT INTO ${prefix}items (id,title,description,dueDate,status,completedAt,cancelledAt,archivedAt,deletedAt,deletedBy,createdAt,updatedAt,version,flowColor)
    VALUES (?,?,?,?,'todo',NULL,NULL,NULL,NULL,NULL,?,?,1,?)`).run(action.id, action.title, action.description, action.dueDate, op.at, op.at, color)
  driver.prepare(`INSERT INTO ${prefix}item_placements (itemId,horizon,periodId,sortKey,version,holdPeriodId) VALUES (?,?,?,?,1,NULL)`).run(action.id, action.horizon, periodId, key)
  changes.push({ itemId: action.id, dim: 'create', before: null, after: { title: action.title, horizon: action.horizon, periodId } })
  changes.push({ itemId: action.id, dim: 'placement', before: null, after: { horizon: action.horizon, periodId, sortKey: key, nestingParentId: null } })
  if (action.parentId && !op.actions.some(other => other.t === 'rel.link' && other.parentId === action.parentId && other.childId === action.id)) {
    link(driver, prefix, op, { t: 'rel.link', id: `rel-${op.opId}`, parentId: action.parentId, childId: action.id }, changes)
  }
  return 'applied'
}

function setFields(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'item.set' }>, changes: CanonChange[]): 'applied' {
  const item = requireItem(driver, prefix, action.id)
  const fields = action.fields
  if (fields.title !== undefined && fields.title !== text(item, 'title')) changes.push({ itemId: action.id, dim: 'title', before: text(item, 'title'), after: fields.title })
  if (fields.description !== undefined && fields.description !== text(item, 'description')) changes.push({ itemId: action.id, dim: 'description', before: text(item, 'description'), after: fields.description })
  if (fields.dueDate !== undefined && fields.dueDate !== text(item, 'dueDate')) changes.push({ itemId: action.id, dim: 'dueDate', before: text(item, 'dueDate'), after: fields.dueDate })
  if (fields.flowColor !== undefined && fields.flowColor !== null) {
    const placement = driver.prepare(`SELECT horizon, nestingParentId FROM ${prefix}item_placements WHERE itemId=?`).get(action.id)
    if (text(placement, 'horizon') === 'later') throw new SyncApplyError('horizon_order')
    if (text(placement, 'nestingParentId')) throw new SyncApplyError('flow_root_parent')
  }
  if (fields.flowColor !== undefined && fields.flowColor !== (item.flowColor === null ? null : Number(item.flowColor))) {
    changes.push({ itemId: action.id, dim: 'flowColor', before: item.flowColor === null ? null : Number(item.flowColor), after: fields.flowColor })
  }
  driver.prepare(`UPDATE ${prefix}items SET title=?, description=?, dueDate=?, flowColor=?, updatedAt=?, version=version+1 WHERE id=?`)
    .run(fields.title ?? text(item, 'title'), fields.description ?? text(item, 'description'), fields.dueDate === undefined ? text(item, 'dueDate') : fields.dueDate,
      fields.flowColor === undefined ? (item.flowColor ?? null) : fields.flowColor, op.at, action.id)
  return 'applied'
}

function setStatus(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'item.status' }>, changes: CanonChange[]): 'applied' {
  const item = requireItem(driver, prefix, action.id)
  const before = { status: text(item, 'status'), completedAt: text(item, 'completedAt'), cancelledAt: text(item, 'cancelledAt') }
  const after = { status: action.status, completedAt: action.completedAt, cancelledAt: action.cancelledAt }
  if (JSON.stringify(before) === JSON.stringify(after)) return 'applied'
  changes.push({ itemId: action.id, dim: 'status', before, after })
  driver.prepare(`UPDATE ${prefix}items SET status=?, completedAt=?, cancelledAt=?, updatedAt=?, version=version+1 WHERE id=?`)
    .run(action.status, action.completedAt, action.cancelledAt, op.at, action.id)
  return 'applied'
}

function placeItem(driver: SqlDriver, prefix: string, op: SyncOp, action: { id: string; horizon: string; periodKey: { horizon: string; startDate: string } | null; sortHint: { afterId: string | null; beforeId: string | null } }, host: ApplyHost, changes: CanonChange[], reason: string): 'applied' {
  requireItem(driver, prefix, action.id)
  const placement = driver.prepare(`SELECT * FROM ${prefix}item_placements WHERE itemId=?`).get(action.id)
  if (!placement) throw new SyncApplyError('item_deleted')
  const periodId = ensurePeriod(driver, prefix, host, action.horizon, action.periodKey?.startDate ?? null)
  if (action.horizon === 'later') releaseLaterParents(driver, prefix, op, action.id, changes)
  const nestingParentId = text(placement, 'nestingParentId')
  const key = sortKey(driver, prefix, action.horizon, periodId, action.sortHint.afterId, action.sortHint.beforeId, action.id, nestingParentId)
  const before = { horizon: text(placement, 'horizon'), periodId: text(placement, 'periodId'), sortKey: num(placement, 'sortKey'), nestingParentId }
  const after = { horizon: action.horizon, periodId, sortKey: key, nestingParentId, reason }
  changes.push({ itemId: action.id, dim: 'placement', before, after })
  driver.prepare(`UPDATE ${prefix}item_placements SET horizon=?, periodId=?, sortKey=?, version=version+1, holdPeriodId=NULL WHERE itemId=?`).run(action.horizon, periodId, key, action.id)
  driver.prepare(`UPDATE ${prefix}items SET updatedAt=?, version=version+1 WHERE id=?`).run(op.at, action.id)
  return 'applied'
}

function nestItem(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'item.nest' }>, host: ApplyHost, changes: CanonChange[]): 'applied' {
  const child = requireItem(driver, prefix, action.id)
  const placement = driver.prepare(`SELECT * FROM ${prefix}item_placements WHERE itemId=?`).get(action.id)
  if (!placement) throw new SyncApplyError('item_deleted')
  const periodId = ensurePeriod(driver, prefix, host, action.horizon, action.periodKey?.startDate ?? null)
  if (action.parentId) {
    if (action.parentId === action.id) throw new SyncApplyError('outline_conflict')
    requireItem(driver, prefix, action.parentId)
    const parentPlace = driver.prepare(`SELECT horizon, periodId, nestingParentId FROM ${prefix}item_placements WHERE itemId=?`).get(action.parentId)
    if (!parentPlace || text(parentPlace, 'nestingParentId')) throw new SyncApplyError('outline_conflict')
    if ((text(parentPlace, 'horizon') === 'later') !== (action.horizon === 'later')) throw new SyncApplyError('outline_conflict')
    const ownChild = driver.prepare(`SELECT 1 FROM ${prefix}item_placements p JOIN ${prefix}items i ON i.id=p.itemId WHERE p.nestingParentId=? AND i.deletedAt IS NULL LIMIT 1`).get(action.id)
    if (ownChild) throw new SyncApplyError('outline_conflict')
    if (child.flowColor !== null && child.flowColor !== undefined) throw new SyncApplyError('flow_root_parent')
    const incoming = driver.prepare(`SELECT 1 FROM ${prefix}item_relations WHERE childId=? AND invalidatedAt IS NULL LIMIT 1`).get(action.id)
    if (incoming) throw new SyncApplyError('flow_root_parent')
  }
  const key = sortKey(driver, prefix, action.horizon, periodId, action.sortHint.afterId, action.sortHint.beforeId, action.id, action.parentId)
  const before = { horizon: text(placement, 'horizon'), periodId: text(placement, 'periodId'), sortKey: num(placement, 'sortKey'), nestingParentId: text(placement, 'nestingParentId') }
  const after = { horizon: action.horizon, periodId, sortKey: key, nestingParentId: action.parentId }
  changes.push({ itemId: action.id, dim: 'placement', before, after })
  driver.prepare(`UPDATE ${prefix}item_placements SET horizon=?, periodId=?, sortKey=?, nestingParentId=?, version=version+1, holdPeriodId=CASE WHEN ? IS NULL THEN holdPeriodId ELSE NULL END WHERE itemId=?`)
    .run(action.horizon, periodId, key, action.parentId, action.parentId, action.id)
  driver.prepare(`UPDATE ${prefix}items SET updatedAt=?, version=version+1 WHERE id=?`).run(op.at, action.id)
  return 'applied'
}

function setArchive(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'item.archive' }>, changes: CanonChange[]): 'applied' {
  const item = requireItem(driver, prefix, action.id)
  changes.push({ itemId: action.id, dim: 'archive', before: text(item, 'archivedAt'), after: action.archivedAt })
  driver.prepare(`UPDATE ${prefix}items SET archivedAt=?, updatedAt=?, version=version+1 WHERE id=?`).run(action.archivedAt, op.at, action.id)
  return 'applied'
}

function deleteItem(driver: SqlDriver, prefix: string, op: SyncOp, id: string, changes: CanonChange[]): 'applied' {
  const item = driver.prepare(`SELECT * FROM ${prefix}items WHERE id=?`).get(id)
  if (!item || text(item, 'deletedAt')) return 'applied'
  const placement = driver.prepare(`SELECT * FROM ${prefix}item_placements WHERE itemId=?`).get(id)
  if (placement && text(placement, 'nestingParentId')) {
    // A peer may delete without having observed the latest ownership. Tombstones must
    // not retain a parent pointer that can become a third level during a later rebuild.
    const before = { horizon: text(placement, 'horizon'), periodId: text(placement, 'periodId'), sortKey: num(placement, 'sortKey'), nestingParentId: text(placement, 'nestingParentId') }
    changes.push({ itemId: id, dim: 'placement', before, after: { ...before, nestingParentId: null } })
    driver.prepare(`UPDATE ${prefix}item_placements SET nestingParentId=NULL,version=version+1 WHERE itemId=?`).run(id)
  }
  const edges = driver.prepare(`SELECT id, parentId, childId FROM ${prefix}item_relations WHERE invalidatedAt IS NULL AND (parentId=? OR childId=?)`).all(id, id)
  for (const edge of edges) {
    changes.push({ itemId: String(edge.childId), dim: 'relation', before: { id: String(edge.id), parentId: String(edge.parentId), childId: String(edge.childId) }, after: null })
  }
  if (edges.length) driver.prepare(`UPDATE ${prefix}item_relations SET invalidatedAt=?, invalidatedBy=?, reason='delete' WHERE invalidatedAt IS NULL AND (parentId=? OR childId=?)`).run(op.at, op.opId, id, id)
  driver.prepare(`UPDATE ${prefix}items SET deletedAt=?, deletedBy=?, updatedAt=?, version=version+1 WHERE id=?`).run(op.at, op.opId, op.at, id)
  changes.push({ itemId: id, dim: 'delete', before: { deletedAt: null }, after: { deletedAt: op.at, deletedBy: op.opId } })
  return 'applied'
}

function discardIfEmpty(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'item.discardIfEmpty' }>, changes: CanonChange[]): 'applied' {
  const item = requireItem(driver, prefix, action.id)
  const linked = driver.prepare(`SELECT 1 FROM ${prefix}item_relations WHERE invalidatedAt IS NULL AND (parentId=? OR childId=?) LIMIT 1`).get(action.id, action.id)
  const placement = driver.prepare(`SELECT nestingParentId FROM ${prefix}item_placements WHERE itemId=?`).get(action.id)
  const child = driver.prepare(`SELECT 1 FROM ${prefix}item_placements p JOIN ${prefix}items i ON i.id=p.itemId WHERE p.nestingParentId=? AND i.deletedAt IS NULL LIMIT 1`).get(action.id)
  const guidance = driver.prepare(`SELECT value FROM ${prefix}item_guidance WHERE itemId=?`).get(action.id)
  const empty = !String(text(item, 'description') ?? '').trim() && !text(item, 'dueDate') && item.flowColor === null
    && text(item, 'status') === 'todo' && !text(item, 'archivedAt') && num(item, 'version') === action.expectVersion && !linked && !text(guidance, 'value')
    && !text(placement, 'nestingParentId') && !child
  if (!empty) throw new SyncApplyError('discard_not_empty')
  return deleteItem(driver, prefix, op, action.id, changes)
}

function restoreItem(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'item.restore' }>, changes: CanonChange[]): 'applied' {
  const item = driver.prepare(`SELECT * FROM ${prefix}items WHERE id=?`).get(action.id)
  if (!item || !text(item, 'deletedAt')) throw new SyncApplyError('restore_superseded')
  if (text(item, 'deletedBy') !== action.expectedDeleteOpId) throw new SyncApplyError('restore_superseded')
  const deletedAt = text(item, 'deletedAt')
  const deletedBy = text(item, 'deletedBy')
  const flowColor = item.flowColor
  if (flowColor !== null && flowColor !== undefined) {
    const taken = driver.prepare(`SELECT id FROM ${prefix}items WHERE flowColor=? AND deletedAt IS NULL AND id!=?`).get(flowColor, action.id)
    if (taken) {
      changes.push({ itemId: action.id, dim: 'flowColor', before: Number(flowColor), after: null })
      driver.prepare(`UPDATE ${prefix}items SET flowColor=NULL, updatedAt=?, version=version+1 WHERE id=?`).run(op.at, action.id)
    }
  }
  driver.prepare(`UPDATE ${prefix}items SET deletedAt=NULL, deletedBy=NULL, updatedAt=?, version=version+1 WHERE id=?`).run(op.at, action.id)
  changes.push({ itemId: action.id, dim: 'restore', before: { deletedAt, deletedBy }, after: { deletedAt: null } })
  const edges = driver.prepare(`SELECT id, parentId, childId FROM ${prefix}item_relations WHERE reason='delete' AND invalidatedBy=? AND (parentId=? OR childId=?)`).all(deletedBy, action.id, action.id)
  for (const edge of edges) reviveEdge(driver, prefix, action.id, edge, changes)
  return 'applied'
}

function reviveEdge(driver: SqlDriver, prefix: string, restoredId: string, edge: Row, changes: CanonChange[]): void {
  const id = String(edge.id)
  const parentId = String(edge.parentId)
  const childId = String(edge.childId)
  const otherId = parentId === restoredId ? childId : parentId
  const other = driver.prepare(`SELECT deletedAt FROM ${prefix}items WHERE id=?`).get(otherId)
  if (!other || text(other, 'deletedAt')) return
  const child = driver.prepare(`SELECT flowColor FROM ${prefix}items WHERE id=?`).get(childId)
  if (!child || child.flowColor !== null) return
  if (relationBlocked(parentId, childId, activeEdges(driver, prefix))) return
  driver.prepare(`UPDATE ${prefix}item_relations SET invalidatedAt=NULL, invalidatedBy=NULL, reason=NULL WHERE id=?`).run(id)
  changes.push({ itemId: childId, dim: 'relation', before: null, after: { id, parentId, childId } })
}

function lastPlacementSeq(driver: SqlDriver, itemId: string): number {
  const row = driver.prepare(`SELECT MAX(seq) AS seq FROM canon_changes WHERE itemId=? AND dim IN ('placement','create')`).get(itemId)
  return row?.seq === null || row?.seq === undefined ? 0 : Number(row.seq)
}

function rolloverItem(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'item.rollover' }>, host: ApplyHost, changes: CanonChange[]): 'applied' {
  const item = requireItem(driver, prefix, action.id)
  const placement = driver.prepare(`SELECT p.*, pp.startDate AS startDate, pp.horizon AS periodHorizon FROM ${prefix}item_placements p LEFT JOIN ${prefix}planning_periods pp ON pp.id=p.periodId WHERE p.itemId=?`).get(action.id)
  if (!placement) throw new SyncApplyError('rollover_stale')
  const policy = driver.prepare(`SELECT mode FROM ${prefix}rollover_policies WHERE horizon=?`).get(action.from.periodKey.horizon)
  const samePlace = text(placement, 'horizon') === action.from.periodKey.horizon && text(placement, 'startDate') === action.from.periodKey.startDate
  const seq = lastPlacementSeq(driver, action.id)
  const samePredecessor = seq === action.from.placementSeq || action.from.placementSeq === 0 && followsImportedPlacement(driver, op, seq)
  if (!samePlace || !samePredecessor || text(item, 'status') !== 'todo' || text(policy, 'mode') !== 'auto') {
    throw new SyncApplyError('rollover_stale')
  }
  return placeItem(driver, prefix, op, { id: action.id, horizon: action.to.horizon, periodKey: action.to, sortHint: { afterId: null, beforeId: null } }, host, changes, 'rollover')
}

const horizons = ['later', 'year', 'half', 'cycle', 'month', 'week', 'day']

function longerHorizon(parent: string, child: string): boolean {
  const parentIndex = horizons.indexOf(parent)
  const childIndex = horizons.indexOf(child)
  return parentIndex > 0 && childIndex > 0 && parentIndex < childIndex
}

function link(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'rel.link' }>, changes: CanonChange[]): 'applied' {
  const parent = requireItem(driver, prefix, action.parentId)
  const child = requireItem(driver, prefix, action.childId)
  const parentPlace = driver.prepare(`SELECT horizon FROM ${prefix}item_placements WHERE itemId=?`).get(action.parentId)
  const childPlace = driver.prepare(`SELECT horizon, nestingParentId FROM ${prefix}item_placements WHERE itemId=?`).get(action.childId)
  if (text(childPlace, 'nestingParentId')) throw new SyncApplyError('flow_root_parent')
  // A baseline snapshot re-links edges that moves, undo, restore and import already kept. New links still require a longer parent.
  const retained = action.retain === true || op.actions.some(other => other.t === 'calendar.setup')
  if (!parentPlace || !childPlace || (!retained && !longerHorizon(String(parentPlace.horizon), String(childPlace.horizon)))) throw new SyncApplyError('horizon_order')
  if (child.flowColor !== null) {
    if (!action.adoptParentFlow) throw new SyncApplyError('flow_root_parent')
    const color = Number(child.flowColor)
    driver.prepare(`UPDATE ${prefix}items SET flowColor=NULL, updatedAt=?, version=version+1 WHERE id=?`).run(op.at, action.childId)
    changes.push({ itemId: action.childId, dim: 'flowColor', before: color, after: null })
    const isolated = !driver.prepare(`SELECT 1 AS n FROM ${prefix}item_relations WHERE invalidatedAt IS NULL AND (parentId=? OR childId=?) LIMIT 1`).get(action.parentId, action.parentId)
    if (parent.flowColor === null && isolated) {
      driver.prepare(`UPDATE ${prefix}items SET flowColor=?, updatedAt=?, version=version+1 WHERE id=?`).run(color, op.at, action.parentId)
      changes.push({ itemId: action.parentId, dim: 'flowColor', before: null, after: color })
    }
  }
  driver.prepare(`INSERT INTO ${prefix}item_relations (id,parentId,childId,invalidatedAt,invalidatedBy,reason,createdAt) VALUES (?,?,?,NULL,NULL,NULL,?)`)
    .run(action.id, action.parentId, action.childId, op.at)
  changes.push({ itemId: action.childId, dim: 'relation', before: null, after: { id: action.id, parentId: action.parentId, childId: action.childId } })
  return 'applied'
}

function unlink(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'rel.unlink' }>, changes: CanonChange[]): 'applied' {
  const edge = driver.prepare(`SELECT * FROM ${prefix}item_relations WHERE id=?`).get(action.id)
  if (!edge) throw new SyncApplyError('parent_unavailable')
  if (text(edge, 'invalidatedAt')) {
    if (text(edge, 'invalidatedBy') === op.opId && text(edge, 'reason') === 'unlink') return 'applied'
    throw new SyncApplyError('parent_unavailable')
  }
  driver.prepare(`UPDATE ${prefix}item_relations SET invalidatedAt=?, invalidatedBy=?, reason='unlink' WHERE id=?`).run(op.at, op.opId, action.id)
  changes.push({ itemId: text(edge, 'childId'), dim: 'relation', before: { id: action.id, parentId: text(edge, 'parentId'), childId: text(edge, 'childId') }, after: null })
  return 'applied'
}

function setGuidance(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'guidance.set' }>, changes: CanonChange[]): 'applied' {
  requireItem(driver, prefix, action.itemId)
  const current = driver.prepare(`SELECT revision, value FROM ${prefix}item_guidance WHERE itemId=?`).get(action.itemId)
  const revision = current ? num(current, 'revision') : 0
  if (revision !== action.baseRevision) throw new SyncApplyError('guidance_stale')
  const value = action.value ? JSON.stringify(action.value) : null
  changes.push({ itemId: action.itemId, dim: 'guidance', before: text(current, 'value'), after: value })
  if (current) driver.prepare(`UPDATE ${prefix}item_guidance SET revision=?, value=?, updatedAt=?, operationId=? WHERE itemId=?`).run(revision + 1, value, op.at, op.opId, action.itemId)
  else driver.prepare(`INSERT INTO ${prefix}item_guidance (itemId,revision,value,updatedAt,operationId) VALUES (?,?,?,?,?)`).run(action.itemId, 1, value, op.at, op.opId)
  return 'applied'
}

function setPolicy(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'policy.set' }>, host: ApplyHost, changes: CanonChange[]): 'applied' {
  const periodId = ensurePeriod(driver, prefix, host, action.horizon, action.effectiveFromKey.startDate)
  const current = driver.prepare(`SELECT mode, effectiveFromPeriodId FROM ${prefix}rollover_policies WHERE horizon=?`).get(action.horizon)
  changes.push({ itemId: null, dim: 'policy', before: current ? { horizon: action.horizon, mode: text(current, 'mode') } : null, after: { horizon: action.horizon, mode: action.mode, effectiveFromPeriodId: periodId } })
  if (current) driver.prepare(`UPDATE ${prefix}rollover_policies SET mode=?, version=version+1, effectiveFromPeriodId=? WHERE horizon=?`).run(action.mode, periodId, action.horizon)
  else driver.prepare(`INSERT INTO ${prefix}rollover_policies (horizon,mode,version,effectiveFromPeriodId) VALUES (?,?,1,?)`).run(action.horizon, action.mode, periodId)
  void op
  return 'applied'
}

function setupCalendar(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'calendar.setup' }>, changes: CanonChange[]): 'applied' {
  const workspace = driver.prepare(`SELECT calendar FROM ${prefix}workspace WHERE id=1`).get()
  const previous = text(workspace, 'calendar')
  if (previous) {
    if (!op.importedCalendar || op.importedCalendar.id !== action.calendar.id) throw new SyncApplyError('calendar_locked')
    if (!canAdoptCalendar(driver, prefix, op)) return 'applied'
    driver.exec(`DELETE FROM ${prefix}rollover_policies; DELETE FROM ${prefix}planning_periods;`)
  }
  const calendar = JSON.stringify(action.calendar)
  driver.prepare(`UPDATE ${prefix}workspace SET calendar=?, setupConfirmedAt=? WHERE id=1`).run(calendar, action.confirmedAt ?? op.at)
  changes.push({ itemId: null, dim: 'calendar', before: previous ? JSON.parse(previous) : null, after: action.calendar })
  return 'applied'
}

function columnFor(dim: string): string | null {
  if (dim === 'title' || dim === 'description' || dim === 'dueDate' || dim === 'flowColor') return dim
  if (dim === 'archive') return 'archivedAt'
  return null
}

function laterChange(driver: SqlDriver, seq: number, itemId: string | null, dim: string): boolean {
  const row = driver.prepare(`SELECT 1 FROM canon_changes WHERE seq>? AND itemId IS ? AND dim=? LIMIT 1`).get(seq, itemId, dim)
  return !!row
}

function revert(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'revert' }>, host: ApplyHost, changes: CanonChange[]): 'applied' | 'partial' {
  const target = driver.prepare('SELECT seq, outcome FROM canon_ops WHERE opId=?').get(action.targetOpId)
  if (!target) throw new SyncApplyError('revert_superseded')
  if (text(target, 'outcome') === 'rejected') return 'applied'
  const seq = num(target, 'seq')
  // Last change first: a promoted color is released, and a new edge is gone, before the child color returns.
  const rows = driver.prepare('SELECT * FROM canon_changes WHERE seq=? ORDER BY idx DESC').all(seq)
  let skipped = 0
  for (const row of rows) {
    const dim = String(row.dim)
    const itemId = text(row, 'itemId')
    if (laterChange(driver, seq, itemId, dim)) {
      if (action.mode === 'all_or_nothing') throw new SyncApplyError('revert_superseded')
      skipped++
      continue
    }
    invertChange(driver, prefix, op, host, itemId, dim, text(row, 'before'), text(row, 'after'), changes)
  }
  return skipped && skipped < rows.length ? 'partial' : skipped && !rows.length ? 'applied' : skipped ? 'partial' : 'applied'
}

function invertChange(driver: SqlDriver, prefix: string, op: SyncOp, host: ApplyHost, itemId: string | null, dim: string, before: string | null, after: string | null, changes: CanonChange[]): void {
  const parsed = before ? JSON.parse(before) as unknown : null
  const column = columnFor(dim)
  if (column && itemId) {
    driver.prepare(`UPDATE ${prefix}items SET ${column}=?, updatedAt=?, version=version+1 WHERE id=?`).run(parsed as SqlValue, op.at, itemId)
    changes.push({ itemId, dim, before: null, after: parsed })
    return
  }
  if (dim === 'status' && itemId && parsed && typeof parsed === 'object') {
    const value = parsed as { status: string; completedAt: string | null; cancelledAt: string | null }
    driver.prepare(`UPDATE ${prefix}items SET status=?, completedAt=?, cancelledAt=?, updatedAt=?, version=version+1 WHERE id=?`).run(value.status, value.completedAt, value.cancelledAt, op.at, itemId)
  } else if (dim === 'placement' && itemId && parsed && typeof parsed === 'object') {
    const value = parsed as { horizon: string; periodId: string | null; sortKey?: number; nestingParentId?: string | null }
    const nesting = Object.prototype.hasOwnProperty.call(value, 'nestingParentId')
    if (typeof value.sortKey === 'number' && nesting) driver.prepare(`UPDATE ${prefix}item_placements SET horizon=?, periodId=?, sortKey=?, nestingParentId=?, version=version+1 WHERE itemId=?`).run(value.horizon, value.periodId, value.sortKey, value.nestingParentId ?? null, itemId)
    else if (typeof value.sortKey === 'number') driver.prepare(`UPDATE ${prefix}item_placements SET horizon=?, periodId=?, sortKey=?, version=version+1 WHERE itemId=?`).run(value.horizon, value.periodId, value.sortKey, itemId)
    else if (nesting) driver.prepare(`UPDATE ${prefix}item_placements SET horizon=?, periodId=?, nestingParentId=?, version=version+1 WHERE itemId=?`).run(value.horizon, value.periodId, value.nestingParentId ?? null, itemId)
    else driver.prepare(`UPDATE ${prefix}item_placements SET horizon=?, periodId=?, version=version+1 WHERE itemId=?`).run(value.horizon, value.periodId, itemId)
  } else if (dim === 'delete' && itemId) {
    driver.prepare(`UPDATE ${prefix}items SET deletedAt=NULL, deletedBy=NULL, updatedAt=?, version=version+1 WHERE id=?`).run(op.at, itemId)
  } else if (dim === 'restore' && itemId && parsed && typeof parsed === 'object') {
    const value = parsed as { deletedAt: string | null; deletedBy: string | null }
    driver.prepare(`UPDATE ${prefix}items SET deletedAt=?, deletedBy=?, updatedAt=?, version=version+1 WHERE id=?`).run(value.deletedAt, value.deletedBy, op.at, itemId)
  } else if (dim === 'create' && itemId) {
    const live = driver.prepare(`SELECT 1 AS n FROM ${prefix}item_relations WHERE invalidatedAt IS NULL AND (parentId=? OR childId=?) LIMIT 1`).get(itemId, itemId)
    if (live) throw new SyncApplyError('revert_superseded')
    driver.prepare(`UPDATE ${prefix}items SET deletedAt=?, deletedBy=?, updatedAt=?, version=version+1 WHERE id=?`).run(op.at, op.opId, op.at, itemId)
  } else if (dim === 'guidance' && itemId) {
    const current = driver.prepare(`SELECT revision FROM ${prefix}item_guidance WHERE itemId=?`).get(itemId)
    const value = parsed === null || typeof parsed === 'string' ? parsed : JSON.stringify(parsed)
    if (current) driver.prepare(`UPDATE ${prefix}item_guidance SET revision=?, value=?, updatedAt=?, operationId=? WHERE itemId=?`).run(num(current, 'revision') + 1, value, op.at, op.opId, itemId)
    else driver.prepare(`INSERT INTO ${prefix}item_guidance (itemId,revision,value,updatedAt,operationId) VALUES (?,?,?,?,?)`).run(itemId, 1, value, op.at, op.opId)
  } else if (dim === 'relation' && itemId) {
    const created = parsed === null
    const source = (created ? (after ? JSON.parse(after) as unknown : null) : parsed) as { id?: string } | null
    const edgeId = source && typeof source.id === 'string' ? source.id : null
    if (edgeId && created) driver.prepare(`UPDATE ${prefix}item_relations SET invalidatedAt=?, invalidatedBy=?, reason='unlink' WHERE id=? AND invalidatedAt IS NULL`).run(op.at, op.opId, edgeId)
    else if (edgeId) driver.prepare(`UPDATE ${prefix}item_relations SET invalidatedAt=NULL, invalidatedBy=NULL, reason=NULL WHERE id=?`).run(edgeId)
  } else if (dim === 'calendar') {
    driver.prepare(`UPDATE ${prefix}workspace SET calendar=? WHERE id=1`).run(before)
  }
  changes.push({ itemId, dim, before: parsed, after: null })
  void host
}

function releaseLaterParents(driver: SqlDriver, prefix: string, op: SyncOp, childId: string, changes: CanonChange[]): void {
  const edges = driver.prepare(`SELECT id, parentId, childId FROM ${prefix}item_relations WHERE childId=? AND invalidatedAt IS NULL`).all(childId)
  for (const edge of edges) {
    changes.push({ itemId: childId, dim: 'relation', before: { id: String(edge.id), parentId: String(edge.parentId), childId: String(edge.childId) }, after: null })
  }
  if (edges.length) driver.prepare(`UPDATE ${prefix}item_relations SET invalidatedAt=?, invalidatedBy=?, reason='unlink' WHERE childId=? AND invalidatedAt IS NULL`).run(op.at, op.opId, childId)
}

function activeEdges(driver: SqlDriver, prefix: string): { parentId: string; childId: string }[] {
  return driver.prepare(`SELECT parentId, childId FROM ${prefix}item_relations WHERE invalidatedAt IS NULL`).all()
    .map(edge => ({ parentId: String(edge.parentId), childId: String(edge.childId) }))
}

function relationBlocked(parentId: string, childId: string, edges: { parentId: string; childId: string }[]): boolean {
  if (parentId === childId || edges.some(edge => edge.parentId === parentId && edge.childId === childId)) return true
  const children = new Map<string, string[]>()
  for (const edge of edges) {
    const group = children.get(edge.parentId) ?? []
    group.push(edge.childId)
    children.set(edge.parentId, group)
  }
  const pending = [childId]
  const seen = new Set<string>()
  while (pending.length) {
    const id = pending.pop()!
    if (id === parentId) return true
    if (seen.has(id)) continue
    seen.add(id)
    pending.push(...(children.get(id) ?? []))
  }
  return false
}
