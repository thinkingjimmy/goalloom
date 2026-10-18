/**
 * [INPUT]: A committed command, its effects, and item rows captured before dispatch.
 * [OUTPUT]: Transaction-owned SyncOps with the observed basisSeq, atomic nested creation, causal completion and guarded grouped creation undo. Clock confirmation/rollover resume write nothing.
 * [POS]: Desktop adapter from command effects to SyncOp. applySyncOp is the other direction.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { DatabaseSync } from 'node:sqlite'
import { syncOpPayload, type Action, type SyncOp } from '@goalloom/contracts'
import { enqueueSettings } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { sha256Hex, uuidv5 } from '@goalloom/crypto'
import type { Command } from '../../../shared/contracts/commands'
import type { Effect, PositionEffect } from '../../../shared/contracts/effects'

interface BeforeItem { title: string; description: string; dueDate: string | null; deletedBy: string | null; version: number }

export function captureSyncBefore(db: DatabaseSync, command: Command): Map<string, BeforeItem> {
  const ids = 'itemId' in command ? [command.itemId] : command.type === 'link' ? [command.parentId, command.childId] : []
  const rows = new Map<string, BeforeItem>()
  for (const id of ids) {
    const row = db.prepare('SELECT title, description, dueDate, deletedBy, version FROM items WHERE id=?').get(id)
    if (row) rows.set(id, { title: String(row.title), description: String(row.description), dueDate: row.dueDate === null ? null : String(row.dueDate), deletedBy: row.deletedBy === null ? null : String(row.deletedBy), version: Number(row.version) })
  }
  return rows
}

export function emitSyncOp(db: DatabaseSync, input: { command: Command; effects: Effect[]; before: Map<string, BeforeItem>; at: string; changed: boolean }): void {
  if (!input.changed || !db.prepare("SELECT 1 FROM sqlite_master WHERE name='sync_ops'").get()) return
  if (input.command.type === 'preferences' || input.command.type === 'backupPreferences') {
    emitPreferences(db, input.command, input.at)
    return
  }
  if (input.command.type === 'confirmClock' || input.command.type === 'confirmRollover') return
  if (input.command.type === 'undo' || input.command.type === 'undoBatch') {
    emitUndo(db, input.command.originalOperationId, input.command.operationId, input.at)
    return
  }
  const actions = actionsFor(db, input)
  if (!actions.length) return
  insertOp(db, { v: 1, opId: input.command.operationId, deviceId: deviceId(db), at: input.at, actions,
    ...(input.command.type === 'completeCreation' ? { creationOperationId: input.command.creationOperationId } : {}) })
}

export function emitRolloverOp(db: DatabaseSync, input: { itemId: string; fromPeriodId: string; toPeriodId: string; placementSeq: number; at: string }): void {
  const from = db.prepare('SELECT horizon, startDate FROM planning_periods WHERE id=?').get(input.fromPeriodId)
  const to = db.prepare('SELECT horizon, startDate, startAt FROM planning_periods WHERE id=?').get(input.toPeriodId)
  const base = db.prepare('SELECT periodId FROM base_item_placements WHERE itemId=?').get(input.itemId)
  if (!from || !to || !base || String(base.periodId) !== input.fromPeriodId) return
  const workspace = db.prepare('SELECT workspaceId FROM sync_state WHERE id=1').get()
  const generation = String(db.prepare('SELECT generation FROM workspace WHERE id=1').get()!.generation)
  const namespace = workspace?.workspaceId ? String(workspace.workspaceId) : generation
  const fromKey = { horizon: String(from.horizon) as 'week', startDate: String(from.startDate) }
  const toKey = { horizon: String(to.horizon) as 'week', startDate: String(to.startDate) }
  const opId = uuidv5(`rollover:${input.itemId}:${fromKey.horizon}:${fromKey.startDate}@${input.placementSeq}:${toKey.horizon}:${toKey.startDate}`, namespace)
  if (db.prepare('SELECT 1 FROM sync_ops WHERE opId=?').get(opId)) return
  insertOp(db, {
    v: 1, opId, deviceId: 'system', at: String(to.startAt),
    actions: [{ t: 'item.rollover', id: input.itemId, from: { periodKey: fromKey, placementSeq: input.placementSeq }, to: toKey, position: 'append' }],
  })
}

function emitUndo(db: DatabaseSync, originalId: string, undoId: string, at: string): void {
  const original = db.prepare('SELECT kind,result,effects FROM operations WHERE id=?').get(originalId)
  const completions = db.prepare("SELECT id FROM operations WHERE kind='completeCreation' AND json_extract(result,'$.creationOperationId')=? AND json_extract(result,'$.changed')=1 ORDER BY rowid").all(originalId)
  if (original && ['create', 'createPlan'].includes(String(original.kind)) && (JSON.parse(String(original.result)).capture || completions.length)) {
    const effects = JSON.parse(String(original.effects)) as Effect[]
    const ids = completions.map(row => String(row.id))
    insertOp(db, { v: 1, opId: undoId, deviceId: deviceId(db), at, actions: [...effects].reverse().flatMap(effect => effect.kind === 'create'
      ? [{ t: 'item.undoCreate' as const, id: effect.itemId, creationOperationId: originalId, completionOperationIds: ids }] : []) })
    return
  }
  const row = db.prepare('SELECT state FROM sync_ops WHERE opId=?').get(originalId)
  if (!row) {
    emitRolloverUndo(db, originalId, undoId, at)
    return
  }
  if (String(row.state) === 'never_sent') {
    db.prepare(`UPDATE sync_ops SET state='reverted_local', updatedAt=? WHERE opId=? AND state='never_sent'`).run(at, originalId)
    return
  }
  insertOp(db, { v: 1, opId: undoId, deviceId: deviceId(db), at, actions: [{ t: 'revert', targetOpId: originalId, mode: 'all_or_nothing' }] })
}

/** A system rollover receipt is not itself a SyncOp. Revert only the item.rollover rows whose effects this undo actually applied. */
function emitRolloverUndo(db: DatabaseSync, originalId: string, undoId: string, at: string): void {
  const original = db.prepare('SELECT kind, source, effects FROM operations WHERE id=?').get(originalId)
  if (!original || String(original.source) !== 'system' || String(original.kind) !== 'rollover') return
  const effects = JSON.parse(String(original.effects)) as Effect[]
  const undone = db.prepare('SELECT effectIndex FROM undo_effects WHERE originalId=? AND undoId=?').all(originalId, undoId)
  for (const marker of undone) {
    const effect = effects[Number(marker.effectIndex)]
    if (!effect || (effect.kind !== 'position' && effect.kind !== 'groupPlacement') || effect.before.periodId === effect.after.periodId) continue
    const from = periodKey(db, effect.before.periodId)
    const to = periodKey(db, effect.after.periodId)
    if (!from || !to) continue
    const candidates = db.prepare(`SELECT opId, state, payload FROM sync_ops WHERE deviceId='system' AND json_extract(payload,'$.actions[0].t')='item.rollover' AND json_extract(payload,'$.actions[0].id')=?`).all(effect.itemId)
    for (const candidate of candidates) {
      const action = JSON.parse(String(candidate.payload)).actions?.[0]
      if (!action || action.t !== 'item.rollover') continue
      if (action.from?.periodKey?.horizon !== from.horizon || action.from?.periodKey?.startDate !== from.startDate) continue
      if (action.to?.horizon !== to.horizon || action.to?.startDate !== to.startDate) continue
      const opId = String(candidate.opId)
      const state = String(candidate.state)
      if (state === 'never_sent') {
        db.prepare(`UPDATE sync_ops SET state='reverted_local', updatedAt=? WHERE opId=? AND state='never_sent'`).run(at, opId)
      } else if (state === 'send_unknown' || state === 'accepted' || state === 'applied') {
        const revertId = uuidv5(`revert:${opId}`, undoId)
        if (!db.prepare('SELECT 1 FROM sync_ops WHERE opId=?').get(revertId)) {
          insertOp(db, { v: 1, opId: revertId, deviceId: deviceId(db), at, actions: [{ t: 'revert', targetOpId: opId, mode: 'all_or_nothing' }] })
        }
      }
    }
  }
}

function periodKey(db: DatabaseSync, periodId: string | null): { horizon: string; startDate: string } | null {
  if (!periodId) return null
  const row = db.prepare('SELECT horizon, startDate FROM planning_periods WHERE id=?').get(periodId)
  return row ? { horizon: String(row.horizon), startDate: String(row.startDate) } : null
}

function actionsFor(db: DatabaseSync, input: { command: Command; effects: Effect[]; before: Map<string, BeforeItem> }): Action[] {
  const actions: Action[] = []
  if (input.command.type === 'edit') {
    const before = input.before.get(input.command.itemId)
    const after = db.prepare('SELECT title, description, dueDate FROM items WHERE id=?').get(input.command.itemId)
    if (!before || !after) return []
    const fields: { title?: string; description?: string; dueDate?: string | null } = {}
    if (String(after.title) !== before.title) fields.title = String(after.title)
    if (String(after.description) !== before.description) fields.description = String(after.description)
    if ((after.dueDate === null ? null : String(after.dueDate)) !== before.dueDate) fields.dueDate = after.dueDate === null ? null : String(after.dueDate)
    if (Object.keys(fields).length) actions.push({ t: 'item.set', id: input.command.itemId, fields })
    return actions
  }
  if (input.command.type === 'confirmSetup') {
    const calendar = db.prepare('SELECT calendar FROM workspace WHERE id=1').get()
    if (calendar?.calendar) actions.push({ t: 'calendar.setup', calendar: JSON.parse(String(calendar.calendar)) })
    return actions
  }
  if (input.command.type === 'policy') {
    const period = db.prepare('SELECT p.horizon, p.startDate FROM rollover_policies r JOIN planning_periods p ON p.id=r.effectiveFromPeriodId WHERE r.horizon=?').get(input.command.horizon)
    if (period) actions.push({ t: 'policy.set', horizon: input.command.horizon, mode: input.command.mode, effectiveFromKey: { horizon: String(period.horizon) as 'day', startDate: String(period.startDate) } })
    return actions
  }
  for (const effect of input.effects) {
    if (effect.kind === 'create') {
      const nesting = input.effects.find(candidate => candidate.kind === 'nesting' && candidate.itemId === effect.itemId)
      actions.push(...createActions(db, effect.itemId, effect.initialRelations, nesting?.kind === 'nesting' ? nesting.before : undefined))
    }
    if (effect.kind === 'description') actions.push({ t: 'item.set', id: effect.itemId, fields: { description: effect.after } })
    if (effect.kind === 'status') actions.push({ t: 'item.status', id: effect.itemId, status: effect.after.status, completedAt: effect.after.completedAt, cancelledAt: effect.after.cancelledAt })
    if (effect.kind === 'position') actions.push(placeAction(db, effect.itemId, effect.after.horizon, effect.after.periodId, effect.after.previousId, effect.after.nextId, input.command.type === 'arrangeBacklog' || input.command.type === 'materializeParentOrder' ? 'arrange' : 'move'))
    if (effect.kind === 'groupPlacement') actions.push(placeAction(db, effect.itemId, effect.after.horizon, effect.after.periodId, null, null, input.command.type === 'arrangeBacklog' || input.command.type === 'materializeParentOrder' ? 'arrange' : 'move'))
    if (effect.kind === 'nesting') actions.push(...nestingActions(db, effect))
    if (effect.kind === 'archive') actions.push({ t: 'item.archive', id: effect.itemId, archivedAt: effect.after })
    if (effect.kind === 'visibility' && effect.after.deletedAt) {
      const before = input.before.get(effect.itemId)
      actions.push(input.command.type === 'discardEmpty'
        ? { t: 'item.discardIfEmpty', id: effect.itemId, expectVersion: before?.version ?? 1 }
        : { t: 'item.delete', id: effect.itemId })
    }
    if (effect.kind === 'visibility' && !effect.after.deletedAt) {
      const before = input.before.get(effect.itemId)
      if (before?.deletedBy) actions.push({ t: 'item.restore', id: effect.itemId, expectedDeleteOpId: before.deletedBy })
    }
    if (effect.kind === 'relations') {
      for (const edge of effect.edges) {
        if (edge.after.invalidatedAt) actions.push({ t: 'rel.unlink', id: edge.after.id })
        else if (!edge.before) actions.push({ t: 'rel.link', id: edge.after.id, parentId: edge.after.parentId, childId: edge.after.childId, ...(effect.flowColor ? { adoptParentFlow: true } : {}) })
      }
    }
    if (effect.kind === 'guidance' && input.command.type === 'applyAssistance') {
      actions.push({ t: 'guidance.set', itemId: effect.itemId, value: effect.after.value, baseRevision: input.command.expectedGuidanceRevision })
    }
    if (effect.kind === 'relations' && effect.flowColor && input.command.type === 'flowColor') {
      actions.push({ t: 'item.set', id: effect.itemId, fields: { flowColor: null } })
    }
  }
  if (input.command.type === 'flowColor' && !actions.some(action => action.t === 'item.set')) {
    actions.push({ t: 'item.set', id: input.command.itemId, fields: { flowColor: input.command.flowColor } })
  }
  return actions
}

function createActions(db: DatabaseSync, itemId: string, relations: string[], initialPosition?: PositionEffect): Action[] {
  const item = db.prepare('SELECT * FROM items WHERE id=?').get(itemId)
  const placement = db.prepare('SELECT * FROM item_placements WHERE itemId=?').get(itemId)
  if (!item || !placement) return []
  const periodId = placement.periodId ?? null
  const period = periodId ? db.prepare('SELECT horizon, startDate FROM planning_periods WHERE id=?').get(periodId) : undefined
  const previous = db.prepare('SELECT itemId FROM item_placements WHERE horizon=? AND periodId IS ? AND itemId!=? ORDER BY sortKey DESC, itemId DESC LIMIT 1').get(placement.horizon ?? null, periodId, itemId)
  const parent = relations[0] ? db.prepare('SELECT parentId FROM item_relations WHERE id=?').get(relations[0]) : undefined
  const action: Action = {
    t: 'item.create', id: itemId, title: String(item.title), description: String(item.description), dueDate: item.dueDate === null ? null : String(item.dueDate),
    horizon: String(placement.horizon) as 'later', periodKey: period ? { horizon: String(period.horizon) as 'week', startDate: String(period.startDate) } : null,
    sortHint: initialPosition ? { afterId: initialPosition.previousId, beforeId: initialPosition.nextId } : { afterId: previous ? String(previous.itemId) : null, beforeId: null },
    ...(item.flowColor === null ? {} : { flowColor: Number(item.flowColor) }),
    ...(parent ? { parentId: String(parent.parentId) } : {}),
  }
  const link = parent ? relations.map(id => {
    const edge = db.prepare('SELECT id, parentId, childId FROM item_relations WHERE id=?').get(id)
    return edge ? { t: 'rel.link' as const, id: String(edge.id), parentId: String(edge.parentId), childId: String(edge.childId) } : null
  }).filter(value => value !== null) : []
  return [action, ...link]
}

function nestingActions(db: DatabaseSync, effect: Extract<Effect, { kind: 'nesting' }>): Action[] {
  const unlinks = effect.edges.flatMap(edge => edge.after.invalidatedAt ? [{ t: 'rel.unlink' as const, id: edge.after.id }] : [])
  const links = effect.edges.flatMap(edge => !edge.before && !edge.after.invalidatedAt
    ? [{ t: 'rel.link' as const, id: edge.after.id, parentId: edge.after.parentId, childId: edge.after.childId }] : [])
  const color = effect.flowColor ? [{ t: 'item.set' as const, id: effect.itemId, fields: { flowColor: null as null } }] : []
  const period = effect.after.periodId ? db.prepare('SELECT horizon, startDate FROM planning_periods WHERE id=?').get(effect.after.periodId) : undefined
  const nest: Action = {
    t: 'item.nest', id: effect.itemId, parentId: effect.after.nestingParentId, horizon: effect.after.horizon as 'later',
    periodKey: period ? { horizon: String(period.horizon) as 'week', startDate: String(period.startDate) } : null,
    sortHint: { afterId: effect.after.previousId, beforeId: effect.after.nextId },
  }
  // Clear incoming goal edges and color before the child becomes nested. Materialized edges are written after it is independent again.
  return effect.after.nestingParentId ? [...unlinks, ...color, nest] : [...unlinks, ...color, nest, ...links]
}

function placeAction(db: DatabaseSync, itemId: string, horizon: string, periodId: string | null, previousId: string | null, nextId: string | null, reason: 'move' | 'arrange' | 'rollover'): Action {
  const period = periodId ? db.prepare('SELECT horizon, startDate FROM planning_periods WHERE id=?').get(periodId) : undefined
  return {
    t: 'item.place', id: itemId, horizon: horizon as 'later', periodKey: period ? { horizon: String(period.horizon) as 'week', startDate: String(period.startDate) } : null,
    sortHint: { afterId: previousId, beforeId: nextId }, reason,
  }
}

function emitPreferences(db: DatabaseSync, command: Extract<Command, { type: 'preferences' | 'backupPreferences' }>, at: string): void {
  const entries = command.type === 'preferences'
    ? [
      ...(command.theme ? [{ key: 'theme', value: command.theme }] : []),
      ...(command.style ? [{ key: 'style', value: command.style }] : []),
      ...(command.checkStyle ? [{ key: 'checkStyle', value: command.checkStyle }] : []),
    ]
    : [{ key: 'backup.enabled', value: command.enabled }, { key: 'backup.retention', value: command.retention }]
  enqueueSettings(nodeSqlDriver(db), { opId: command.operationId, deviceId: deviceId(db), at, entries })
}

function deviceId(db: DatabaseSync): string {
  const row = db.prepare('SELECT deviceId FROM sync_state WHERE id=1').get()
  return row?.deviceId ? String(row.deviceId) : 'local'
}

function insertOp(db: DatabaseSync, op: SyncOp): void {
  const payload = syncOpPayload({ ...op, basisSeq: Number(db.prepare('SELECT lastAppliedSeq FROM sync_state WHERE id=1').get()?.lastAppliedSeq ?? 0) })
  const order = Number(db.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()!.n) + 1
  db.prepare(`INSERT INTO sync_ops (opId, localOrder, origin, formatVersion, payload, payloadHash, deviceId, at, state, createdAt, updatedAt)
    VALUES (?, ?, 'local', 1, ?, ?, ?, ?, 'never_sent', ?, ?)`).run(op.opId, order, payload, sha256Hex(payload), op.deviceId, op.at, op.at, op.at)
}
