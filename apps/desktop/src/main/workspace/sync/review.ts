/**
 * [INPUT]: Local conflict groups, current projection, preview token and injected transaction time.
 * [OUTPUT]: Read-only task comparisons or one atomic, receipt-owned resolution of lost actions.
 * [POS]: Storage-side sync review; simulation rolls back, writes reuse the production applier.
 */
import { createHash } from 'node:crypto'
import type { Action, SyncOp } from '@goalloom/contracts'
import { syncOpPayload } from '@goalloom/contracts'
import { acknowledgeConflict, applySyncOp, businessCode, pendingConflicts, type PendingConflict } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import type { DatabaseSync } from 'node:sqlite'
import { DomainError, type CommandOf } from '../../../shared/contracts/commands'
import type { SyncReview, SyncReviewPage, SyncReviewSnapshot } from '../../../shared/contracts/sync-review'
import { serverText } from '../../../shared/i18n/server'
import { flowIndex } from '../../../domain/flows'
import { Store } from '../../storage/store'
import { syncHost } from '../../sync/host'
import type { Context } from '../context'

function snapshot(store: Store, id: string, actions: Action[] = []): SyncReviewSnapshot {
  if (!store.db.prepare('SELECT 1 FROM items WHERE id=?').get(id)) {
    const creation = actions.find((action): action is Extract<Action, { t: 'item.create' }> => action.t === 'item.create' && action.id === id)
    if (!creation) throw new DomainError('read', serverText().errors.itemChanged)
    const period = creation.periodKey ? syncHost(store.db).materializePeriod(creation.horizon, creation.periodKey.startDate) : null
    return { id, title: creation.title, description: creation.description, dueDate: creation.dueDate, status: 'todo', deleted: false, missing: true,
      archived: false, flowColors: [], horizon: creation.horizon, periodStart: period?.startDate ?? null, periodEnd: period?.endDate ?? null, parents: [] }
  }
  const item = store.item(id), period = item.placement.periodId ? store.period(item.placement.periodId) : null
  const relations = [...store.relations(), ...store.nestingLinks()]
  const roots = store.db.prepare('SELECT id,flowColor FROM items WHERE deletedAt IS NULL AND flowColor IS NOT NULL').all()
  const colors = new Map(roots.map(row => [String(row.id), Number(row.flowColor)]))
  const ids = flowIndex(relations, colors.keys())(id)
  return {
    id, title: item.title, description: item.description, dueDate: item.dueDate, status: item.status,
    deleted: !!item.deletedAt, missing: false, archived: !!item.archivedAt, horizon: item.placement.horizon,
    periodStart: period?.startDate ?? null, periodEnd: period?.endDate ?? null,
    flowColors: item.placement.horizon === 'later' ? [] : [...new Set(ids.map(id => colors.get(id)!))],
    parents: relations.filter(edge => edge.childId === id).map(edge => store.item(edge.parentId).title),
  }
}

function actionsFor(store: Store, group: PendingConflict): Action[] {
  let actions = group.records.flatMap(record => record.actions)
  if (!store.db.prepare('SELECT 1 FROM items WHERE id=?').get(group.itemId)) {
    const live = (id: string) => !!store.db.prepare('SELECT 1 FROM items WHERE id=? AND deletedAt IS NULL').get(id)
    actions = actions.flatMap(action => {
      if (action.t === 'rel.link' && (!live(action.parentId) || action.childId !== group.itemId)) return []
      if (action.t === 'item.create' && action.parentId && !live(action.parentId)) { const { parentId: _parentId, ...independent } = action; return [independent] }
      return [action]
    })
    return actions
  }
  const item = store.item(group.itemId)
  return item.deletedAt && item.deletedBy ? [{ t: 'item.restore', id: item.id, expectedDeleteOpId: item.deletedBy }, ...actions] : actions
}

function guardedValues(store: Store, actions: Action[], itemId: string): unknown[] {
  if (!store.db.prepare('SELECT 1 FROM items WHERE id=?').get(itemId)) return [{ id: itemId, missing: true }]
  const item = store.item(itemId)
  const values: unknown[] = [{ id: item.id, deletedAt: item.deletedAt, deletedBy: item.deletedBy }]
  for (const action of actions) {
    if (action.t === 'item.set') values.push(Object.fromEntries(Object.keys(action.fields).sort().map(key => [key, item[key as keyof typeof item]])))
    else if (action.t === 'item.status') values.push({ status: item.status, completedAt: item.completedAt, cancelledAt: item.cancelledAt })
    else if (action.t === 'item.archive') values.push(item.archivedAt)
    else if (action.t === 'item.place' || action.t === 'item.nest') values.push({ horizon: item.placement.horizon, periodId: item.placement.periodId, nestingParentId: item.placement.nestingParentId ?? null })
    if (action.t === 'rel.link' || action.t === 'item.nest' && action.parentId) {
      const parentId = action.parentId!
      const parent = store.db.prepare('SELECT i.id,i.deletedAt,i.flowColor,p.horizon,p.nestingParentId FROM items i JOIN item_placements p ON p.itemId=i.id WHERE i.id=?').get(parentId)
      values.push(parent ?? null)
    }
    if (action.t === 'rel.unlink') values.push(store.db.prepare('SELECT id,parentId,childId,invalidatedAt FROM item_relations WHERE id=?').get(action.id) ?? null)
  }
  return values
}

function fallback(store: Store, current: SyncReviewSnapshot, actions: Action[]): SyncReviewSnapshot {
  const local = structuredClone(current)
  for (const action of actions) {
    if (action.t === 'item.create') local.missing = false
    if (action.t === 'item.restore') local.deleted = false
    if (action.t === 'item.set') {
      if (action.fields.title !== undefined) local.title = action.fields.title
      if (action.fields.description !== undefined) local.description = action.fields.description
      if (action.fields.dueDate !== undefined) local.dueDate = action.fields.dueDate
      if (action.fields.flowColor !== undefined) local.flowColors = action.fields.flowColor === null ? [] : [action.fields.flowColor]
    }
    if (action.t === 'item.status') local.status = action.status
    if (action.t === 'item.archive') local.archived = !!action.archivedAt
    if (action.t === 'item.place' || action.t === 'item.nest') {
      local.horizon = action.horizon
      local.periodStart = action.periodKey?.startDate ?? null
      local.periodEnd = null
    }
    if (action.t === 'rel.link' || action.t === 'item.nest' && action.parentId) {
      const title = store.db.prepare('SELECT title FROM items WHERE id=?').get(action.parentId!)?.title
      local.parents = title ? [String(title)] : []
    }
  }
  return local
}

function prepare(db: DatabaseSync, group: PendingConflict, at: string): { review: SyncReview; actions: Action[] } {
  const store = new Store(db), actions = actionsFor(store, group), current = snapshot(store, group.itemId, actions)
  const generation = store.workspace().generation
  const token = createHash('sha256').update(JSON.stringify({ generation, records: group.records, actions, values: guardedValues(store, actions, group.itemId) })).digest('hex')
  let local = fallback(store, current, actions), canUseLocal = false
  if (actions.length <= 500) {
    db.exec('SAVEPOINT sync_review_preview')
    try {
      applySyncOp(nodeSqlDriver(db), { v: 1, opId: '00000000-0000-4000-8000-000000000001', deviceId: 'preview', at, actions }, 'visible', syncHost(db))
      local = snapshot(store, group.itemId); canUseLocal = true
    } catch (error) { if (!businessCode(error)) throw error }
    finally { db.exec('ROLLBACK TO sync_review_preview; RELEASE sync_review_preview') }
  }
  const reason: SyncReview['reason'] = current.missing ? 'missing' : current.deleted ? 'deleted' : actions.some(action => action.t.startsWith('rel.') || action.t === 'item.nest') ? 'relation'
    : actions.some(action => action.t === 'item.place') ? 'placement' : 'changed'
  return { review: { itemId: group.itemId, token, local, current, canUseLocal, reason }, actions }
}

export function readSyncReviews(db: DatabaseSync, generation: string, at: string): SyncReviewPage {
  if (new Store(db).workspace().generation !== generation) throw new DomainError('generation', serverText().errors.workspaceReplaced)
  const groups = pendingConflicts(nodeSqlDriver(db))
  return { generation, remaining: groups.length, review: groups[0] ? prepare(db, groups[0], at).review : null }
}

export function resolveSyncReview(context: Context, command: CommandOf<'resolveSyncReview'>): boolean {
  const db = context.store.db, driver = nodeSqlDriver(db)
  const group = pendingConflicts(driver).find(group => group.itemId === command.itemId)
  if (!group) throw new DomainError('stale', serverText().errors.itemChanged)
  const prepared = prepare(db, group, context.now)
  if (prepared.review.token !== command.token || command.choice === 'local' && !prepared.review.canUseLocal) throw new DomainError('stale', serverText().errors.itemChanged)
  let changed = false
  if (command.choice === 'local') {
    const before = prepared.review.current.missing ? null : context.store.item(command.itemId)
    const deviceId = String(db.prepare('SELECT deviceId FROM sync_state WHERE id=1').get()?.deviceId ?? 'local')
    const op: SyncOp = { v: 1, opId: command.operationId, deviceId, at: context.now,
      basisSeq: Number(db.prepare('SELECT lastAppliedSeq FROM sync_state WHERE id=1').get()?.lastAppliedSeq ?? 0), actions: prepared.actions }
    const result = applySyncOp(driver, op, 'visible', syncHost(db))
    changed = result.changes.length > 0
    if (changed) {
      const payload = syncOpPayload(op), payloadHash = createHash('sha256').update(payload).digest('hex')
      const order = Number(db.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()!.n) + 1
      db.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
        VALUES (?,?,'local',1,?,?,?,?,'never_sent',?,?)`).run(op.opId, order, payload, payloadHash, op.deviceId, op.at, op.at, op.at)
      context.store.event(command.operationId, context.now, !before ? 'created' : before.deletedAt ? 'item_restored' : 'sync_resolved', before, context.store.item(command.itemId))
    }
  }
  acknowledgeConflict(driver, group, context.now)
  context.itemId = command.itemId; context.label = serverText().labels.save
  return changed
}
