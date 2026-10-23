/**
 * [INPUT]: Creation/completion SyncOps, current projection and one guarded creation undo.
 * [OUTPUT]: Causal group preflight preserving unrelated text and validating net lifecycle, graph, placement and ownership.
 * [POS]: Shared replay guard; callers delete the checked items in the same transaction.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { parseSyncOp, type Action, type SyncOp } from '@goalloom/contracts'
import { SyncApplyError, type SqlDriver } from './driver'

export function checkUndoCreate(driver: SqlDriver, prefix: string, op: SyncOp, action: Extract<Action, { t: 'item.undoCreate' }>): void {
  const fail = () => { throw new SyncApplyError('revert_superseded') }
  const read = (id: string) => {
    const row = driver.prepare('SELECT payload, outcome FROM sync_ops WHERE opId=?').get(id)
    if (!row || row.outcome === 'rejected') return fail()
    return parseSyncOp(JSON.parse(String(row.payload)))
  }
  const original = read(action.creationOperationId)
  const created = original.actions.find((candidate): candidate is Extract<Action, { t: 'item.create' }> => candidate.t === 'item.create' && candidate.id === action.id)
  if (!created) return fail()
  const completions = action.completionOperationIds.map(read)
  if (new Set(action.completionOperationIds).size !== completions.length || completions.some(completion => completion.creationOperationId !== original.opId
    || completion.actions.some(candidate => !completionAction(candidate, action.id)))) return fail()
  const item = driver.prepare(`SELECT status,archivedAt,deletedAt FROM ${prefix}items WHERE id=?`).get(action.id)
  const placement = driver.prepare(`SELECT horizon,periodId,nestingParentId FROM ${prefix}item_placements WHERE itemId=?`).get(action.id)
  const period = placement?.periodId ? driver.prepare(`SELECT horizon,startDate FROM ${prefix}planning_periods WHERE id=?`).get(placement.periodId) : null
  let horizon = created.horizon, startDate = created.periodKey?.startDate ?? null
  let parentId: string | null = null
  for (const member of [original, ...completions]) for (const change of member.actions) {
    if ((change.t === 'item.place' || change.t === 'item.nest') && change.id === action.id) { horizon = change.horizon; startDate = change.periodKey?.startDate ?? null }
    if (change.t === 'item.nest' && change.id === action.id) parentId = change.parentId
  }
  if (!item || item.deletedAt || item.archivedAt || item.status !== 'todo' || !placement || (placement.nestingParentId ?? null) !== parentId
    || placement.horizon !== horizon || (period?.startDate ?? null) !== startDate) return fail()
  if (driver.prepare(`SELECT 1 FROM ${prefix}item_placements p JOIN ${prefix}items i ON i.id=p.itemId WHERE p.nestingParentId=? AND i.deletedAt IS NULL LIMIT 1`).get(action.id)) return fail()
  const owned = new Set([original, ...completions].flatMap(member => member.actions.flatMap(candidate => candidate.t === 'rel.link' && candidate.childId === action.id ? [candidate.id] : [])))
  const removedTogether = new Set(op.actions.flatMap(candidate => candidate.t === 'item.undoCreate' && candidate.creationOperationId === original.opId ? [candidate.id] : []))
  const incident = driver.prepare(`SELECT id,parentId,childId FROM ${prefix}item_relations WHERE invalidatedAt IS NULL AND (parentId=? OR childId=?)`).all(action.id, action.id)
    .filter(edge => !(edge.parentId === action.id && removedTogether.has(String(edge.childId))))
  if (incident.length !== owned.size || incident.some(edge => !owned.has(String(edge.id)))) return fail()
}

/** A pending capture starts as one independent version-1 item on every peer. Any later write, including an edit-back, wins. */
export function checkCreationCompletion(driver: SqlDriver, prefix: string, op: SyncOp): void {
  if (!op.creationOperationId) return
  const row = driver.prepare('SELECT payload,outcome FROM sync_ops WHERE opId=?').get(op.creationOperationId)
  if (!row || row.outcome === 'rejected') throw new SyncApplyError('revert_superseded')
  const original = parseSyncOp(JSON.parse(String(row.payload)))
  const created = original.actions.filter((action): action is Extract<Action, { t: 'item.create' }> => action.t === 'item.create')
  if (created.length !== 1) throw new SyncApplyError('revert_superseded')
  const id = created[0]!.id
  if (op.actions.some(action => !completionAction(action, id))) throw new SyncApplyError('revert_superseded')
  const item = driver.prepare(`SELECT version,status,archivedAt,deletedAt FROM ${prefix}items WHERE id=?`).get(id)
  const placement = driver.prepare(`SELECT version,nestingParentId FROM ${prefix}item_placements WHERE itemId=?`).get(id)
  if (!item || Number(item.version) !== 1 || item.status !== 'todo' || item.archivedAt || item.deletedAt || !placement || Number(placement.version) !== 1 || placement.nestingParentId
    || driver.prepare(`SELECT 1 FROM ${prefix}item_relations WHERE invalidatedAt IS NULL AND (parentId=? OR childId=?) LIMIT 1`).get(id, id)) throw new SyncApplyError('revert_superseded')
}

function completionAction(action: Action, id: string): boolean {
  return action.t === 'item.place' && action.id === id || action.t === 'rel.link' && action.childId === id
    || action.t === 'item.nest' && action.id === id && action.parentId !== null
}
