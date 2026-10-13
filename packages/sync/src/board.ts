/**
 * [INPUT]: base_* rows, or a captured visible board.
 * [OUTPUT]: SyncOps that replay that board. Calendar and policies are their own ops. A failed baseline rolls back and pauses sync.
 * [POS]: Upgrade path for data that predates sync. Pending ops stay ahead of the baseline and are not rewritten. Kept edges are not re-checked as new links.
 */
import { parseSyncOp, syncOpPayload, type Action, type SyncOp } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import { applySyncOp, rebuildVisibleFull, type ApplyHost, type SqlDriver } from '@goalloom/store-core'
import { SyncFailure } from './failure'

export interface BoardItem {
  id: string
  title: string
  description: string
  dueDate: string | null
  status: 'todo' | 'done' | 'cancelled'
  completedAt: string | null
  cancelledAt: string | null
  archivedAt: string | null
  deletedAt: string | null
  horizon: string
  period: { horizon: 'year' | 'half' | 'cycle' | 'month' | 'week' | 'day'; startDate: string } | null
  sortKey: number
  nestingParentId: string | null
  flowColor: number | null
}

export interface LocalBoard {
  calendar: { id: string; mode: 'rolling' | 'natural'; timezone: string; weekStart: number; cycleAnchor: string } | null
  setupConfirmedAt: string | null
  policies: { horizon: 'year' | 'half' | 'cycle' | 'month' | 'week' | 'day'; mode: 'auto' | 'manual'; startDate: string }[]
  items: BoardItem[]
  edges: { id: string; parentId: string; childId: string }[]
  guidance: { itemId: string; value: unknown }[]
}

function id(): string {
  return globalThis.crypto.randomUUID()
}

function chunk(actions: Action[], deviceId: string, at: string): SyncOp[] {
  const ops: SyncOp[] = []
  for (let index = 0; index < actions.length; index += 200) {
    const slice = actions.slice(index, index + 200)
    if (!slice.length) continue
    ops.push(parseSyncOp({ v: 1, opId: id(), deviceId, at, actions: slice }))
  }
  return ops
}

function siblingOrder(items: BoardItem[], parentId: string | null): BoardItem[] {
  return items
    .filter(item => item.nestingParentId === parentId && !item.deletedAt)
    .sort((left, right) => left.sortKey - right.sortKey || left.id.localeCompare(right.id))
}

function creates(items: BoardItem[]): Action[] {
  const roots = siblingOrder(items, null)
  const children = items.filter(item => item.nestingParentId && !item.deletedAt)
    .sort((left, right) => left.sortKey - right.sortKey || left.id.localeCompare(right.id))
  const ordered = [...roots, ...children, ...items.filter(item => item.deletedAt)]
  const actions: Action[] = []
  const seen = new Set<string>()
  for (const item of ordered) {
    if (seen.has(item.id)) continue
    seen.add(item.id)
    const parent = item.nestingParentId
    const siblings = siblingOrder(items, parent).filter(sibling => !sibling.deletedAt)
    const index = siblings.findIndex(sibling => sibling.id === item.id)
    const afterId = index > 0 ? siblings[index - 1]!.id : null
    const nested = Boolean(parent) && !item.deletedAt
    actions.push({
      t: 'item.create', id: item.id, title: item.title.trim(), description: item.description, dueDate: item.dueDate,
      horizon: (item.deletedAt ? item.horizon : nested ? item.horizon : item.horizon) as 'later',
      periodKey: item.period, sortHint: { afterId: nested || item.deletedAt ? null : afterId, beforeId: null },
      ...(nested || item.horizon === 'later' || item.flowColor === null ? {} : { flowColor: item.flowColor }),
    })
  }
  return actions
}

export function actionsForBoard(board: LocalBoard, scope: 'baseline' | 'import'): Action[] {
  const live = new Set(board.items.filter(item => !item.deletedAt).map(item => item.id))
  const actions: Action[] = []
  if (scope === 'baseline' && board.calendar) {
    actions.push({ t: 'calendar.setup', calendar: board.calendar, ...(board.setupConfirmedAt ? { confirmedAt: board.setupConfirmedAt } : {}) })
  }
  if (scope === 'baseline') {
    for (const policy of board.policies) {
      actions.push({ t: 'policy.set', horizon: policy.horizon, mode: policy.mode, effectiveFromKey: { horizon: policy.horizon, startDate: policy.startDate } })
    }
  }
  actions.push(...creates(board.items))
  for (const item of board.items) {
    if (item.deletedAt || item.status === 'todo') continue
    actions.push({ t: 'item.status', id: item.id, status: item.status, completedAt: item.completedAt, cancelledAt: item.cancelledAt })
  }
  for (const item of board.items) {
    if (item.deletedAt || !item.archivedAt) continue
    actions.push({ t: 'item.archive', id: item.id, archivedAt: item.archivedAt })
  }
  for (const item of board.items) {
    if (!item.nestingParentId || item.deletedAt) continue
    const siblings = siblingOrder(board.items, item.nestingParentId)
    const index = siblings.findIndex(sibling => sibling.id === item.id)
    actions.push({
      t: 'item.nest', id: item.id, parentId: item.nestingParentId, horizon: item.horizon as 'later', periodKey: item.period,
      sortHint: { afterId: index > 0 ? siblings[index - 1]!.id : null, beforeId: null },
    })
  }
  for (const edge of board.edges) {
    const child = board.items.find(item => item.id === edge.childId)
    if (!child || child.deletedAt || child.nestingParentId || !live.has(edge.parentId)) continue
    actions.push({ t: 'rel.link', id: edge.id, parentId: edge.parentId, childId: edge.childId, retain: true })
  }
  for (const note of board.guidance) {
    if (!live.has(note.itemId) || note.value === null) continue
    actions.push({ t: 'guidance.set', itemId: note.itemId, value: note.value as never, baseRevision: 0 })
  }
  for (const item of board.items) {
    if (!item.deletedAt) continue
    actions.push({ t: 'item.delete', id: item.id })
  }
  return actions
}

export function opsForBoard(board: LocalBoard, deviceId: string, at: string, scope: 'baseline' | 'import'): SyncOp[] {
  const actions = actionsForBoard(board, scope)
  const calendar = actions.filter(action => action.t === 'calendar.setup')
  const policies = actions.filter(action => action.t === 'policy.set')
  const rest = actions.filter(action => action.t !== 'calendar.setup' && action.t !== 'policy.set')
  return [...chunk(calendar, deviceId, at), ...chunk(policies, deviceId, at), ...chunk(rest, deviceId, at)]
}

function text(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value)
}

function readBoard(driver: SqlDriver, prefix: '' | 'base_'): LocalBoard {
  const workspace = driver.prepare(`SELECT calendar, setupConfirmedAt FROM ${prefix}workspace WHERE id=1`).get()
  const calendarRaw = workspace?.calendar
  let calendar: LocalBoard['calendar'] = null
  if (calendarRaw) {
    const parsed = JSON.parse(String(calendarRaw)) as LocalBoard['calendar']
    calendar = parsed
  }
  const setupConfirmedAt = workspace?.setupConfirmedAt ? String(workspace.setupConfirmedAt) : null
  const policies = driver.prepare(`SELECT r.horizon AS horizon, r.mode AS mode, p.startDate AS startDate, p.horizon AS periodHorizon
    FROM ${prefix}rollover_policies r JOIN ${prefix}planning_periods p ON p.id=r.effectiveFromPeriodId`).all().map(row => ({
    horizon: String(row.horizon) as LocalBoard['policies'][number]['horizon'],
    mode: String(row.mode) as 'auto' | 'manual',
    startDate: String(row.startDate),
  }))
  const items = driver.prepare(`SELECT i.id AS id, i.title AS title, i.description AS description, i.dueDate AS dueDate, i.status AS status,
    i.completedAt AS completedAt, i.cancelledAt AS cancelledAt, i.archivedAt AS archivedAt, i.deletedAt AS deletedAt, i.flowColor AS flowColor,
    p.horizon AS horizon, p.sortKey AS sortKey, p.nestingParentId AS nestingParentId, pp.horizon AS periodHorizon, pp.startDate AS startDate
    FROM ${prefix}items i JOIN ${prefix}item_placements p ON p.itemId=i.id
    LEFT JOIN ${prefix}planning_periods pp ON pp.id=p.periodId`).all().map(row => ({
    id: String(row.id), title: String(row.title), description: String(row.description ?? ''),
    dueDate: text(row.dueDate), status: String(row.status) as BoardItem['status'],
    completedAt: text(row.completedAt), cancelledAt: text(row.cancelledAt), archivedAt: text(row.archivedAt), deletedAt: text(row.deletedAt),
    horizon: String(row.horizon), sortKey: Number(row.sortKey), nestingParentId: text(row.nestingParentId),
    flowColor: row.flowColor === null || row.flowColor === undefined ? null : Number(row.flowColor),
    period: row.periodHorizon && row.startDate ? { horizon: String(row.periodHorizon) as NonNullable<BoardItem['period']>['horizon'], startDate: String(row.startDate) } : null,
  }))
  const edges = driver.prepare(`SELECT id, parentId, childId FROM ${prefix}item_relations WHERE invalidatedAt IS NULL`).all().map(row => ({
    id: String(row.id), parentId: String(row.parentId), childId: String(row.childId),
  }))
  const guidance = driver.prepare(`SELECT itemId, value FROM ${prefix}item_guidance WHERE value IS NOT NULL`).all().flatMap(row => {
    try { return [{ itemId: String(row.itemId), value: JSON.parse(String(row.value)) }] }
    catch { return [] }
  })
  return { calendar, setupConfirmedAt, policies, items, edges, guidance }
}

export function captureVisibleBoard(driver: SqlDriver): LocalBoard {
  return readBoard(driver, '')
}

export function localLiveCount(driver: SqlDriver): number {
  return Number(driver.prepare('SELECT count(*) AS n FROM items WHERE deletedAt IS NULL').get()?.n ?? 0)
}

function insertOp(driver: SqlDriver, op: SyncOp, at: string, order: number): void {
  const payload = syncOpPayload(op)
  driver.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
    VALUES (?,?,'local',1,?,?,?,?, 'never_sent', ?, ?)`).run(op.opId, order, payload, sha256Hex(payload), op.deviceId, op.at, at, at)
}

function clearBase(driver: SqlDriver): void {
  driver.exec(`DELETE FROM base_item_guidance; DELETE FROM base_item_relations; DELETE FROM base_item_placements; DELETE FROM base_rollover_policies;
    DELETE FROM base_items; DELETE FROM base_planning_periods;`)
  driver.prepare('UPDATE base_workspace SET calendar=NULL, setupConfirmedAt=NULL WHERE id=1').run()
}

/** Replaces the op log with the visible board. Used when cloud ciphertext is abandoned and this computer uploads again. */
export function queueVisibleBaseline(driver: SqlDriver, host: ApplyHost, deviceId: string, at: string): number {
  return baselineTransaction(driver, at, () => {
    const board = captureVisibleBoard(driver)
    driver.exec('DELETE FROM sync_conflicts; DELETE FROM canon_changes; DELETE FROM canon_ops; DELETE FROM sync_ops;')
    const ops = board.calendar || board.items.length || board.policies.length ? opsForBoard(board, deviceId, at, 'baseline') : []
    ops.forEach((op, index) => insertOp(driver, op, at, index + 1))
    clearBase(driver)
    rebuildVisibleFull(driver, host, { strictOpIds: new Set(ops.map(op => op.opId)) })
    assertBaselineKept(board, driver)
    driver.prepare('UPDATE sync_state SET lastAppliedSeq=0, lastUploadedSeq=0, paused=NULL, updatedAt=? WHERE id=1').run(at)
    return ops.length
  })
}

/** Turns a pre-sync base projection into never_sent ops and replays them onto an empty base. Pending ops keep their relative order. */
export function queueBaseline(driver: SqlDriver, host: ApplyHost, deviceId: string, at: string): number {
  return baselineTransaction(driver, at, () => {
    const board = readBoard(driver, 'base_')
    const meaningful = board.calendar || board.items.length || board.policies.length
    if (!meaningful) return 0
    const ops = opsForBoard(board, deviceId, at, 'baseline')
    if (!ops.length) return 0
    driver.prepare('UPDATE sync_ops SET localOrder = -localOrder WHERE localOrder IS NOT NULL').run()
    driver.prepare('UPDATE sync_ops SET localOrder = -localOrder + ? WHERE localOrder IS NOT NULL').run(ops.length)
    ops.forEach((op, index) => insertOp(driver, op, at, index + 1))
    clearBase(driver)
    rebuildVisibleFull(driver, host, { strictOpIds: new Set(ops.map(op => op.opId)) })
    assertBaselineKept(board, driver)
    return ops.length
  })
}

function baselineTransaction<T>(driver: SqlDriver, at: string, work: () => T): T {
  try { return driver.transaction(work) }
  catch (error) {
    driver.prepare('UPDATE sync_state SET paused=?, updatedAt=? WHERE id=1').run('baseline', at)
    throw error
  }
}

function assertBaselineKept(before: LocalBoard, driver: SqlDriver): void {
  const after = readBoard(driver, '')
  if (before.calendar && (!after.calendar || after.calendar.id !== before.calendar.id || !after.setupConfirmedAt)) {
    throw new SyncFailure('storage', 'baseline calendar')
  }
  if (before.items.some(item => !item.deletedAt) && localLiveCount(driver) === 0) throw new SyncFailure('storage', 'baseline items')
}

/** Restores a board whose baseline calendar op was rejected and left setup unconfirmed. Payloads stay the source; onboarding is not required. */
export function repairRejectedBaseline(driver: SqlDriver, host: ApplyHost): boolean {
  if (driver.prepare('SELECT setupConfirmedAt FROM workspace WHERE id=1').get()?.setupConfirmedAt) return false
  const rows = driver.prepare(`SELECT localOrder, payload, at, deviceId, outcome FROM sync_ops WHERE origin='local' ORDER BY localOrder`).all()
  const head = rows.find(row => String(row.outcome ?? '') === 'rejected' && firstAction(row.payload) === 'calendar.setup')
  if (!head) return false
  const batch = rows.filter(row => String(row.at) === String(head.at) && String(row.deviceId) === String(head.deviceId))
  return driver.transaction(() => {
    for (const row of batch) applySyncOp(driver, JSON.parse(String(row.payload)), 'base', host)
    rebuildVisibleFull(driver, host)
    const restored = readBoard(driver, '')
    if (!restored.calendar || !restored.setupConfirmedAt) throw new SyncFailure('storage', 'baseline repair')
    return true
  })
}

function firstAction(payload: unknown): string | null {
  try {
    const action = JSON.parse(String(payload))?.actions?.[0]
    return action && typeof action.t === 'string' ? action.t : null
  } catch { return null }
}

function placedBoard(host: ApplyHost, board: LocalBoard, at: string): LocalBoard {
  if (!board.calendar || !host.alignImportedPeriod) return board
  const local = JSON.stringify(board.calendar)
  return {
    ...board,
    items: board.items.map(item => {
      if (!item.period) return item
      const startDate = host.alignImportedPeriod!(local, item.period.horizon, item.period.startDate, at)
      return startDate === item.period.startDate ? item : { ...item, period: { horizon: item.period.horizon, startDate } }
    }),
  }
}

/** Writes the captured board as new local ops. Caller owns the transaction. */
export function applyImportedBoard(driver: SqlDriver, host: ApplyHost, board: LocalBoard, deviceId: string, at: string): number {
  const source = placedBoard(host, board, at)
  const imported: LocalBoard = { calendar: null, setupConfirmedAt: null, policies: [], guidance: source.guidance, edges: [], items: [] }
  const map = new Map<string, string>()
  for (const item of source.items.filter(item => !item.deletedAt)) map.set(item.id, id())
  imported.items = source.items.filter(item => !item.deletedAt).map(item => ({
    ...item,
    id: map.get(item.id)!,
    nestingParentId: item.nestingParentId && map.has(item.nestingParentId) ? map.get(item.nestingParentId)! : null,
    flowColor: item.flowColor !== null && driver.prepare('SELECT 1 FROM items WHERE flowColor=? AND deletedAt IS NULL').get(item.flowColor) ? null : item.flowColor,
  }))
  imported.edges = source.edges.flatMap(edge => {
    const parentId = map.get(edge.parentId)
    const childId = map.get(edge.childId)
    return parentId && childId ? [{ id: id(), parentId, childId }] : []
  })
  imported.guidance = source.guidance.flatMap(note => map.has(note.itemId) ? [{ itemId: map.get(note.itemId)!, value: note.value }] : [])
  const ops = opsForBoard(imported, deviceId, at, 'import')
  if (!ops.length) return 0
  let order = Number(driver.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()?.n ?? 0)
  for (const op of ops) {
    applySyncOp(driver, op, 'visible', host)
    order += 1
    insertOp(driver, op, at, order)
  }
  return imported.items.length
}

export function stageImportedBoard(driver: SqlDriver, host: ApplyHost, board: LocalBoard, deviceId: string, at: string): number {
  return driver.transaction(() => applyImportedBoard(driver, host, board, deviceId, at))
}

export function clearProjection(driver: SqlDriver, binding: { workspaceId: string; deviceId: string; keyEpoch: number }, at: string): void {
  driver.exec(`DELETE FROM item_guidance; DELETE FROM item_relations; DELETE FROM item_placements; DELETE FROM rollover_policies; DELETE FROM items; DELETE FROM planning_periods;
    DELETE FROM base_item_guidance; DELETE FROM base_item_relations; DELETE FROM base_item_placements; DELETE FROM base_rollover_policies; DELETE FROM base_items; DELETE FROM base_planning_periods;
    DELETE FROM sync_conflicts; DELETE FROM canon_changes; DELETE FROM canon_ops; DELETE FROM sync_ops;`)
  driver.prepare('UPDATE workspace SET calendar=NULL, setupConfirmedAt=NULL WHERE id=1').run()
  driver.prepare('UPDATE base_workspace SET calendar=NULL, setupConfirmedAt=NULL WHERE id=1').run()
  driver.prepare('UPDATE sync_state SET workspaceId=?, deviceId=?, keyEpoch=?, lastAppliedSeq=0, lastUploadedSeq=0, paused=NULL, updatedAt=? WHERE id=1')
    .run(binding.workspaceId, binding.deviceId, binding.keyEpoch, at)
}

export function bindWorkspace(driver: SqlDriver, binding: { workspaceId: string; deviceId: string; keyEpoch: number }, at: string): void {
  driver.prepare('UPDATE sync_state SET workspaceId=?, deviceId=?, keyEpoch=?, paused=NULL, updatedAt=? WHERE id=1')
    .run(binding.workspaceId, binding.deviceId, binding.keyEpoch, at)
}

export function syncCursor(driver: SqlDriver): number {
  return Number(driver.prepare('SELECT lastAppliedSeq AS seq FROM sync_state WHERE id=1').get()?.seq ?? 0)
}

export function conflictCount(driver: SqlDriver): number {
  return Number(driver.prepare('SELECT count(*) AS n FROM sync_conflicts').get()?.n ?? 0)
}

/** Used when a baseline op cannot be parsed. Callers surface it as a storage pause. */
export function assertBoard(board: LocalBoard): void {
  if (board.items.some(item => !item.title.trim())) throw new SyncFailure('storage', 'empty title')
}
