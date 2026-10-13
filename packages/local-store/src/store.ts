/**
 * [INPUT]: A schema v10 driver, injected ids and an explicit clock.
 * [OUTPUT]: Board snapshot and local commands. Restore returns a token that puts the same deletion back. base_* stays equal to the live rows while sync is off.
 * [POS]: Offline workspace. Graph rules are rechecked by the schema triggers inside the write transaction.
 */
import { mayLink } from './board'
import { noteSignal } from './notes'
import { currentPeriod, validateCalendar, workspaceDate } from './periods'
import type { ActivityRow, CalendarConfig, GroupUndo, Horizon, ItemRow, NestSnap, Period, PeriodHorizon, PolicyMode, RelationRow, SqlDriver, SqlValue, Status, UndoToken } from './types'
import { periodHorizons } from './types'

export class StoreError extends Error {
  constructor(readonly code: string) { super(code); this.name = 'StoreError' }
}

export interface Snapshot {
  now: string
  today: string
  generation: string
  calendar: CalendarConfig | null
  setupConfirmedAt: string | null
  theme: 'system' | 'light' | 'dark'
  style: 'paper' | 'minimal'
  checkStyle: 'outline' | 'paper' | 'tint'
  backupEnabled: boolean
  backupRetention: number
  periods: Partial<Record<PeriodHorizon, Period>>
  policies: Partial<Record<PeriodHorizon, PolicyMode>>
  items: ItemRow[]
  relations: RelationRow[]
  backlog: ItemRow[]
  trash: ItemRow[]
}

export interface CreateInput {
  title: string
  description?: string
  dueDate?: string | null
  horizon: Horizon
  periodId?: string | null
  flowColor?: number | null
  parentId?: string | null
  nestingParentId?: string | null
}

const itemSql = `SELECT i.id AS id, i.title AS title, i.description AS description, i.dueDate AS dueDate, i.status AS status,
  i.completedAt AS completedAt, i.archivedAt AS archivedAt, i.deletedAt AS deletedAt, i.createdAt AS createdAt, i.updatedAt AS updatedAt,
  i.version AS version, i.flowColor AS flowColor, p.horizon AS horizon, p.periodId AS periodId, p.sortKey AS sortKey,
  p.version AS placementVersion, p.nestingParentId AS nestingParentId, p.holdPeriodId AS holdPeriodId
  FROM items i JOIN item_placements p ON p.itemId=i.id`

export class LocalWorkspace {
  constructor(private readonly db: SqlDriver, private readonly ids: () => string) {}

  load(now: string): Snapshot {
    return this.tx(() => {
      this.reconcile(now)
      const snap = this.snapshot(now)
      this.mirror()
      return snap
    })
  }

  savePeriod(period: Period): void {
    this.tx(() => { this.ensurePeriod(period); this.mirror() })
  }

  confirm(now: string, input: { mode: 'rolling' | 'natural'; timezone: string; weekStart: number; anchor?: string }): CalendarConfig {
    return this.tx(() => {
      const workspace = this.workspace()
      if (workspace.setupConfirmedAt) throw new StoreError('calendar-locked')
      const today = workspaceDate(input.timezone, now)
      const cycleAnchor = input.mode === 'natural' ? `${today.slice(0, 4)}-01-01` : (input.anchor ?? today)
      const calendar: CalendarConfig = { id: this.ids(), mode: input.mode, timezone: input.timezone, weekStart: input.weekStart, cycleAnchor }
      validateCalendar(calendar)
      if (calendar.cycleAnchor > today) throw new StoreError('anchor')
      this.db.prepare('UPDATE workspace SET calendar=?, setupConfirmedAt=? WHERE id=1').run(JSON.stringify(calendar), now)
      for (const horizon of periodHorizons) {
        const period = currentPeriod(calendar, horizon, now)
        this.ensurePeriod(period)
        this.db.prepare('INSERT INTO rollover_policies (horizon, mode, version, effectiveFromPeriodId) VALUES (?,?,1,?)').run(horizon, horizon === 'day' ? 'auto' : 'manual', period.id)
      }
      this.mirror()
      return calendar
    })
  }

  create(now: string, input: CreateInput): { id: string; undo: UndoToken } {
    return this.tx(() => {
      this.requireSetup()
      const title = input.title.trim()
      if (!title || title.length > 500) throw new StoreError('title')
      if (input.parentId && input.nestingParentId) throw new StoreError('nesting')
      if (input.flowColor != null && (input.horizon === 'later' || input.parentId || input.nestingParentId)) throw new StoreError('flow')
      const period = this.periodFor(now, input.horizon, input.periodId ?? null)
      const id = this.ids()
      const sortKey = this.nextSort(input.horizon, period?.id ?? null, input.nestingParentId ?? null)
      this.db.prepare(`INSERT INTO items (id,title,description,dueDate,status,completedAt,cancelledAt,archivedAt,deletedAt,deletedBy,createdAt,updatedAt,version,flowColor)
        VALUES (?,?,?,?,'todo',NULL,NULL,NULL,NULL,NULL,?,?,1,?)`).run(id, title, input.description ?? '', input.dueDate ?? null, now, now, input.flowColor ?? null)
      this.db.prepare('INSERT INTO item_placements (itemId,horizon,periodId,sortKey,version,holdPeriodId,nestingParentId) VALUES (?,?,?,?,1,NULL,?)')
        .run(id, input.horizon, period?.id ?? null, sortKey, input.nestingParentId ?? null)
      if (input.parentId) this.insertRelation(input.parentId, id, now)
      this.event(now, id, 'created', null, { title, horizon: input.horizon })
      this.mirror()
      return { id, undo: { kind: 'create', id } }
    })
  }

  setStatus(now: string, id: string, status: 'todo' | 'done'): UndoToken {
    return this.tx(() => {
      const item = this.item(id)
      if (!item || item.deletedAt) throw new StoreError('missing')
      const previous: UndoToken = { kind: 'status', id, status: item.status === 'cancelled' ? 'todo' : item.status, completedAt: item.completedAt }
      const completedAt = status === 'done' ? now : null
      const changed = this.db.prepare('UPDATE items SET status=?, completedAt=?, cancelledAt=NULL, updatedAt=?, version=version+1 WHERE id=? AND version=? AND deletedAt IS NULL')
        .run(status, completedAt, now, id, item.version)
      if (changed.changes !== 1) throw new StoreError('conflict')
      this.event(now, id, 'status_changed', { status: item.status }, { status })
      this.mirror()
      return previous
    })
  }

  move(now: string, id: string, horizon: Horizon, periodId: string | null): UndoToken {
    return this.tx(() => {
      const undo = this.place(now, id, horizon, periodId)
      this.mirror()
      return undo
    })
  }

  nest(now: string, id: string, parentId: string): UndoToken {
    return this.tx(() => {
      const item = this.item(id), parent = this.item(parentId)
      if (!item || !parent || item.deletedAt || parent.deletedAt) throw new StoreError('missing')
      const undo: UndoToken = {
        kind: 'placement', id, horizon: item.horizon, periodId: item.periodId, sortKey: item.sortKey,
        nestingParentId: item.nestingParentId, nestingAfter: parentId, relationIds: [], createdRelationIds: [],
      }
      const sortKey = this.nextSort(parent.horizon, parent.periodId, parentId)
      const changed = this.db.prepare('UPDATE item_placements SET horizon=?, periodId=?, sortKey=?, nestingParentId=?, holdPeriodId=NULL, version=version+1 WHERE itemId=? AND version=?')
        .run(parent.horizon, parent.periodId, sortKey, parentId, id, item.placementVersion)
      if (changed.changes !== 1) throw new StoreError('conflict')
      this.touch(id, item.version, now)
      this.event(now, id, 'nesting_changed', { nestingParentId: item.nestingParentId }, { nestingParentId: parentId })
      this.mirror()
      return undo
    })
  }

  reorder(now: string, id: string, beforeId: string | null, afterId: string | null): UndoToken {
    return this.tx(() => {
      const item = this.item(id)
      if (!item || item.deletedAt) throw new StoreError('missing')
      const before = beforeId ? this.item(beforeId) : null
      const after = afterId ? this.item(afterId) : null
      const nestingParentId = before?.nestingParentId ?? after?.nestingParentId ?? null
      const leaving = Boolean(item.nestingParentId && item.nestingParentId !== nestingParentId && nestingParentId === null)
      const createdRelationIds = leaving ? this.releaseNesting(item, now) : []
      const current = leaving ? this.item(id) : item
      if (!current) throw new StoreError('missing')
      const sortKey = keyBetween(before?.sortKey ?? null, after?.sortKey ?? null, item.sortKey)
      const undo: UndoToken = {
        kind: 'placement', id, horizon: item.horizon, periodId: item.periodId, sortKey: item.sortKey,
        nestingParentId: item.nestingParentId, nestingAfter: nestingParentId, relationIds: [], createdRelationIds,
      }
      const changed = this.db.prepare('UPDATE item_placements SET sortKey=?, nestingParentId=?, version=version+1 WHERE itemId=? AND version=?')
        .run(sortKey, nestingParentId, id, current.placementVersion)
      if (changed.changes !== 1) throw new StoreError('conflict')
      this.touch(id, current.version, now)
      this.mirror()
      return undo
    })
  }

  edit(now: string, id: string, fields: { title?: string; description?: string; dueDate?: string | null }): void {
    this.tx(() => {
      const item = this.item(id)
      if (!item || item.deletedAt) throw new StoreError('missing')
      const title = (fields.title ?? item.title).trim()
      if (!title || title.length > 500) throw new StoreError('title')
      const description = fields.description ?? item.description
      const dueDate = fields.dueDate === undefined ? item.dueDate : fields.dueDate
      const changed = this.db.prepare('UPDATE items SET title=?, description=?, dueDate=?, updatedAt=?, version=version+1 WHERE id=? AND version=?')
        .run(title, description, dueDate, now, id, item.version)
      if (changed.changes !== 1) throw new StoreError('conflict')
      this.event(now, id, 'edited', { title: item.title }, { title })
      this.mirror()
    })
  }

  setFlow(now: string, id: string, flowColor: number | null): void {
    this.tx(() => {
      const item = this.item(id)
      if (!item || item.deletedAt) throw new StoreError('missing')
      const changed = this.db.prepare('UPDATE items SET flowColor=?, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(flowColor, now, id, item.version)
      if (changed.changes !== 1) throw new StoreError('conflict')
      this.event(now, id, 'edited', { flowColor: item.flowColor }, { flowColor })
      this.mirror()
    })
  }

  link(now: string, parentId: string, childId: string): void {
    this.tx(() => {
      this.insertRelation(parentId, childId, now)
      this.event(now, childId, 'moved', null, { parentId })
      this.mirror()
    })
  }

  unlink(now: string, parentId: string, childId: string): void {
    this.tx(() => {
      this.db.prepare(`UPDATE item_relations SET invalidatedAt=?, invalidatedBy=?, reason='unlink' WHERE parentId=? AND childId=? AND invalidatedAt IS NULL`)
        .run(now, this.generation(), parentId, childId)
      this.mirror()
    })
  }

  trash(now: string, id: string): UndoToken {
    return this.tx(() => {
      const item = this.item(id)
      if (!item || item.deletedAt) throw new StoreError('missing')
      const children = this.childrenOf(id)
      const nestChildren: NestSnap[] = []
      const createdRelationIds: string[] = []
      for (const child of children) {
        if (!child.nestingParentId) continue
        nestChildren.push({ id: child.id, horizon: child.horizon, periodId: child.periodId, sortKey: child.sortKey, nestingParentId: child.nestingParentId })
        createdRelationIds.push(...this.releaseNesting(child, now))
        this.touch(child.id, child.version, now)
      }
      const priorNest: NestSnap | null = item.nestingParentId
        ? { id: item.id, horizon: item.horizon, periodId: item.periodId, sortKey: item.sortKey, nestingParentId: item.nestingParentId }
        : null
      if (priorNest) {
        const fresh = this.item(id)
        if (!fresh) throw new StoreError('missing')
        createdRelationIds.push(...this.releaseNesting(fresh, now))
      }
      const current = this.item(id)
      if (!current) throw new StoreError('missing')
      const relationIds = this.touchingRelationIds(id)
      this.invalidateIds(relationIds, now, 'delete')
      const changed = this.db.prepare('UPDATE items SET deletedAt=?, deletedBy=?, updatedAt=?, version=version+1 WHERE id=? AND version=? AND deletedAt IS NULL')
        .run(now, this.generation(), now, id, current.version)
      if (changed.changes !== 1) throw new StoreError('conflict')
      this.event(now, id, 'deleted', { title: item.title }, { deleted: true })
      this.mirror()
      return {
        kind: 'trash', id, relationIds, createdRelationIds, nestChildren,
        ...(priorNest ? { priorNest } : {}),
      }
    })
  }

  restore(now: string, id: string): UndoToken {
    return this.tx(() => {
      const item = this.item(id)
      if (!item?.deletedAt) throw new StoreError('missing')
      const raw = this.db.prepare('SELECT deletedBy FROM items WHERE id=?').get(id)?.deletedBy
      const undo: UndoToken = { kind: 'restore', id, deletedAt: item.deletedAt, deletedBy: typeof raw === 'string' ? raw : null }
      this.db.prepare('UPDATE items SET deletedAt=NULL, deletedBy=NULL, updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, id, item.version)
      this.event(now, id, 'item_restored', null, { title: item.title })
      this.mirror()
      return undo
    })
  }

  undo(now: string, token: UndoToken): void {
    this.tx(() => {
      if (token.kind === 'create') {
        const item = this.item(token.id)
        if (!item) throw new StoreError('missing')
        this.db.prepare('UPDATE items SET deletedAt=?, deletedBy=?, updatedAt=?, version=version+1 WHERE id=? AND deletedAt IS NULL').run(now, this.generation(), now, token.id)
      } else if (token.kind === 'trash') {
        const item = this.item(token.id)
        if (!item?.deletedAt) throw new StoreError('missing')
        this.db.prepare('UPDATE items SET deletedAt=NULL, deletedBy=NULL, updatedAt=?, version=version+1 WHERE id=?').run(now, token.id)
        const copies = new Set(token.createdRelationIds ?? [])
        for (const relationId of token.relationIds ?? []) if (!copies.has(relationId)) this.reactivateRelation(relationId)
        for (const child of token.nestChildren ?? []) this.restoreNest(now, child, copies)
        if (token.priorNest) this.restoreNest(now, token.priorNest, copies)
        this.applyUndoHold(now, token.id)
      } else if (token.kind === 'status') {
        this.db.prepare('UPDATE items SET status=?, completedAt=?, updatedAt=?, version=version+1 WHERE id=?').run(token.status ?? 'todo', token.completedAt ?? null, now, token.id)
        this.applyUndoHold(now, token.id)
      } else if (token.kind === 'restore') {
        const item = this.item(token.id)
        if (!item || item.deletedAt || !token.deletedAt) throw new StoreError('missing')
        this.db.prepare('UPDATE items SET deletedAt=?, deletedBy=?, updatedAt=?, version=version+1 WHERE id=? AND deletedAt IS NULL')
          .run(token.deletedAt, token.deletedBy ?? null, now, token.id)
      } else {
        const item = this.item(token.id)
        if (!item || item.deletedAt) throw new StoreError('missing')
        if ((item.nestingParentId ?? null) !== (token.nestingAfter ?? null)) throw new StoreError('conflict')
        for (const child of token.group ?? []) {
          const row = this.item(child.id)
          if (!row || row.deletedAt) throw new StoreError('missing')
          if ((row.nestingParentId ?? null) !== child.nestingAfter || row.horizon !== child.horizonAfter || (row.periodId ?? null) !== child.periodAfter) throw new StoreError('conflict')
        }
        this.invalidateIds(token.createdRelationIds ?? [], now, 'unlink')
        this.db.prepare('UPDATE item_placements SET horizon=?, periodId=?, sortKey=?, nestingParentId=?, version=version+1 WHERE itemId=?')
          .run(token.horizon ?? 'later', token.periodId ?? null, token.sortKey ?? 0, token.nestingParentId ?? null, token.id)
        for (const child of token.group ?? []) {
          this.db.prepare('UPDATE item_placements SET horizon=?, periodId=?, sortKey=?, nestingParentId=?, version=version+1 WHERE itemId=?')
            .run(child.horizon, child.periodId, child.sortKey, child.nestingParentId, child.id)
        }
        for (const relationId of token.relationIds ?? []) this.reactivateRelation(relationId)
        this.applyUndoHold(now, token.id)
        for (const child of token.group ?? []) this.applyUndoHold(now, child.id)
      }
      this.event(now, token.id, 'undo', null, { kind: token.kind })
      this.mirror()
    })
  }

  setPolicy(horizon: PeriodHorizon, mode: PolicyMode): void {
    this.tx(() => {
      const changed = this.db.prepare('UPDATE rollover_policies SET mode=?, version=version+1 WHERE horizon=?').run(mode, horizon)
      if (changed.changes !== 1) throw new StoreError('missing')
      this.mirror()
    })
  }

  setAppearance(fields: { theme?: Snapshot['theme']; style?: Snapshot['style']; checkStyle?: Snapshot['checkStyle'] }): void {
    this.tx(() => {
      const current = this.workspace()
      this.db.prepare('UPDATE workspace SET theme=?, style=?, checkStyle=? WHERE id=1')
        .run(fields.theme ?? current.theme, fields.style ?? current.style, fields.checkStyle ?? current.checkStyle)
      this.mirror()
    })
  }

  setBackup(enabled: boolean, retention: number): void {
    this.tx(() => {
      this.db.prepare('UPDATE workspace SET backupEnabled=?, backupRetention=? WHERE id=1').run(enabled ? 1 : 0, retention)
      this.mirror()
    })
  }

  activity(id: string): ActivityRow[] {
    return this.db.prepare('SELECT type, at, fromPeriodId, toPeriodId FROM item_events WHERE itemId=? ORDER BY seq DESC LIMIT 30').all(id).map(row => ({
      type: String(row.type), at: String(row.at), fromPeriodId: row.fromPeriodId === null ? null : String(row.fromPeriodId), toPeriodId: row.toPeriodId === null ? null : String(row.toPeriodId),
    }))
  }

  private reconcile(now: string): void {
    const calendar = this.calendar()
    if (!calendar) return
    const policies = this.policyMap()
    const rows = this.db.prepare(`SELECT i.id AS id, p.horizon AS horizon, p.periodId AS periodId, p.nestingParentId AS nestingParentId, per.endAt AS endAt
      FROM items i JOIN item_placements p ON p.itemId=i.id JOIN planning_periods per ON per.id=p.periodId
      WHERE i.deletedAt IS NULL AND i.archivedAt IS NULL AND i.status='todo'`).all()
    const processed = new Set<string>()
    const observed = Date.parse(now)
    for (const row of rows) {
      const horizon = String(row.horizon) as PeriodHorizon
      if (policies.get(horizon) !== 'auto' || Date.parse(String(row.endAt)) > observed) continue
      const period = currentPeriod(calendar, horizon, now)
      if (period.id === row.periodId) continue
      this.ensurePeriod(period)
      const rootId = row.nestingParentId == null ? String(row.id) : String(row.nestingParentId)
      if (processed.has(rootId)) continue
      processed.add(rootId)
      const root = this.item(rootId)
      if (!root || root.deletedAt) continue
      const members = [root, ...this.childrenOf(rootId)]
      if (members.some(member => member.status === 'todo' && member.holdPeriodId === period.id)) continue
      this.place(now, rootId, horizon, period.id, 'rolled_over')
    }
  }

  private snapshot(now: string): Snapshot {
    const workspace = this.workspace()
    const calendar = workspace.calendar
    const today = calendar ? workspaceDate(calendar.timezone, now) : now.slice(0, 10)
    const periods: Snapshot['periods'] = {}
    if (calendar) for (const horizon of periodHorizons) {
      const period = currentPeriod(calendar, horizon, now)
      this.ensurePeriod(period)
      periods[horizon] = period
    }
    const items = this.db.prepare(itemSql).all().map(mapItem)
    const relations = this.db.prepare(`SELECT id, parentId, childId FROM item_relations WHERE invalidatedAt IS NULL`).all().map(row => ({
      id: String(row.id), parentId: String(row.parentId), childId: String(row.childId),
    }))
    const policies: Snapshot['policies'] = {}
    for (const [horizon, mode] of this.policyMap()) policies[horizon] = mode
    const past = new Set(this.db.prepare(`SELECT id FROM planning_periods WHERE endAt<=?`).all(now).map(row => String(row.id)))
    const active = items.filter(item => !item.deletedAt && !item.archivedAt)
    const backlog = active.filter(item => item.status === 'todo' && item.periodId && past.has(item.periodId) && policies[item.horizon as PeriodHorizon] === 'manual')
    return {
      now, today, generation: workspace.generation, calendar, setupConfirmedAt: workspace.setupConfirmedAt,
      theme: workspace.theme, style: workspace.style, checkStyle: workspace.checkStyle,
      backupEnabled: workspace.backupEnabled, backupRetention: workspace.backupRetention,
      periods, policies, items: active, relations, backlog, trash: items.filter(item => item.deletedAt),
    }
  }

  private periodFor(now: string, horizon: Horizon, periodId: string | null): Period | null {
    if (horizon === 'later') return null
    const calendar = this.calendar()
    if (!calendar) throw new StoreError('setup')
    if (periodId) {
      const row = this.db.prepare('SELECT id, horizon, startDate, endDate, startAt, endAt FROM planning_periods WHERE id=?').get(periodId)
      if (!row || row.horizon !== horizon) throw new StoreError('period')
      return mapPeriod(row)
    }
    const period = currentPeriod(calendar, horizon, now)
    this.ensurePeriod(period)
    return period
  }

  private ensurePeriod(period: Period): void {
    this.db.prepare('INSERT INTO planning_periods (id,horizon,startDate,endDate,startAt,endAt) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING')
      .run(period.id, period.horizon, period.startDate, period.endDate, period.startAt, period.endAt)
  }

  private insertRelation(parentId: string, childId: string, now: string): string {
    if (parentId === childId) throw new StoreError('self')
    const parent = this.item(parentId), child = this.item(childId)
    if (!parent || !child || parent.deletedAt || child.deletedAt) throw new StoreError('missing')
    if (!mayLink(parent.horizon, child.horizon)) throw new StoreError('horizon')
    const id = this.ids()
    this.db.prepare(`INSERT INTO item_relations (id,parentId,childId,invalidatedAt,invalidatedBy,reason,createdAt) VALUES (?,?,?,NULL,NULL,NULL,?)`)
      .run(id, parentId, childId, now)
    return id
  }

  private activeParentIds(id: string): string[] {
    return this.db.prepare('SELECT id FROM item_relations WHERE childId=? AND invalidatedAt IS NULL').all(id).map(row => String(row.id))
  }

  private unlinkParents(id: string, now: string): void {
    this.db.prepare(`UPDATE item_relations SET invalidatedAt=?, invalidatedBy=?, reason='unlink' WHERE childId=? AND invalidatedAt IS NULL`).run(now, this.generation(), id)
  }

  private place(now: string, id: string, horizon: Horizon, periodId: string | null, event: 'moved' | 'rolled_over' = 'moved'): UndoToken {
    const item = this.item(id)
    if (!item || item.deletedAt) throw new StoreError('missing')
    const period = this.periodFor(now, horizon, periodId)
    const destination = period?.id ?? null
    const sameContainer = item.nestingParentId !== null && item.horizon === horizon && item.periodId === destination
    const relationIds = horizon === 'later' ? this.activeParentIds(id) : []
    const released = Boolean(item.nestingParentId && !sameContainer)
    const createdRelationIds = released ? this.releaseNesting(item, now) : []
    const current = released ? this.item(id) : item
    if (!current) throw new StoreError('missing')
    const nestingAfter = sameContainer ? item.nestingParentId : null
    const group: GroupUndo[] = []
    if (!current.nestingParentId) {
      for (const child of this.childrenOf(id)) {
        if (child.horizon === horizon && child.periodId === destination) continue
        group.push({
          id: child.id, horizon: child.horizon, periodId: child.periodId, sortKey: child.sortKey,
          nestingParentId: child.nestingParentId, nestingAfter: child.nestingParentId, horizonAfter: horizon, periodAfter: destination,
        })
        const moved = this.db.prepare('UPDATE item_placements SET horizon=?, periodId=?, holdPeriodId=NULL, version=version+1 WHERE itemId=? AND version=?')
          .run(horizon, destination, child.id, child.placementVersion)
        if (moved.changes !== 1) throw new StoreError('conflict')
        this.touch(child.id, child.version, now)
        this.event(now, child.id, event, { horizon: child.horizon, periodId: child.periodId }, { horizon, periodId: destination }, child.periodId, destination)
      }
    }
    const sortKey = this.nextSort(horizon, destination, nestingAfter)
    const changed = this.db.prepare('UPDATE item_placements SET horizon=?, periodId=?, sortKey=?, nestingParentId=?, holdPeriodId=NULL, version=version+1 WHERE itemId=? AND version=?')
      .run(horizon, destination, sortKey, nestingAfter, id, current.placementVersion)
    if (changed.changes !== 1) throw new StoreError('conflict')
    if (horizon === 'later') this.unlinkParents(id, now)
    this.touch(id, current.version, now)
    this.event(now, id, event, { horizon: item.horizon, periodId: item.periodId }, { horizon, periodId: destination }, item.periodId, destination)
    return {
      kind: 'placement', id, horizon: item.horizon, periodId: item.periodId, sortKey: item.sortKey,
      nestingParentId: item.nestingParentId, nestingAfter, relationIds, createdRelationIds,
      ...(group.length ? { group } : {}),
    }
  }

  /** Leaves a container and copies that container's active goal parents onto the item. */
  private releaseNesting(item: ItemRow, now: string): string[] {
    if (!item.nestingParentId) return []
    const sources = this.db.prepare('SELECT parentId FROM item_relations WHERE childId=? AND invalidatedAt IS NULL').all(item.nestingParentId).map(row => String(row.parentId))
    const sortKey = this.nextSort(item.horizon, item.periodId, null)
    const changed = this.db.prepare('UPDATE item_placements SET nestingParentId=NULL, sortKey=?, version=version+1 WHERE itemId=? AND version=?')
      .run(sortKey, item.id, item.placementVersion)
    if (changed.changes !== 1) throw new StoreError('conflict')
    return sources.map(parentId => this.insertRelation(parentId, item.id, now))
  }

  private childrenOf(id: string): ItemRow[] {
    return this.db.prepare(`${itemSql} WHERE p.nestingParentId=? AND i.deletedAt IS NULL`).all(id).map(mapItem)
  }

  private touchingRelationIds(id: string): string[] {
    return this.db.prepare('SELECT id FROM item_relations WHERE invalidatedAt IS NULL AND (parentId=? OR childId=?)').all(id, id).map(row => String(row.id))
  }

  private invalidateIds(ids: readonly string[], now: string, reason: string): void {
    for (const id of ids) {
      this.db.prepare('UPDATE item_relations SET invalidatedAt=?, invalidatedBy=?, reason=? WHERE id=? AND invalidatedAt IS NULL').run(now, this.generation(), reason, id)
    }
  }

  private reactivateRelation(id: string): void {
    const edge = this.db.prepare('SELECT parentId, childId FROM item_relations WHERE id=?').get(id)
    if (!edge) return
    const parent = this.item(String(edge.parentId))
    const child = this.item(String(edge.childId))
    if (!parent || !child || parent.deletedAt || child.deletedAt || child.nestingParentId || child.flowColor !== null) return
    this.db.prepare('UPDATE item_relations SET invalidatedAt=NULL, invalidatedBy=NULL, reason=NULL WHERE id=?').run(id)
  }

  private restoreNest(now: string, child: NestSnap, copies: ReadonlySet<string>): void {
    const row = this.item(child.id)
    const parent = this.item(child.nestingParentId)
    if (!row || row.deletedAt || row.nestingParentId || row.flowColor !== null || row.horizon !== child.horizon || row.periodId !== child.periodId) return
    if (!parent || parent.deletedAt || parent.nestingParentId || parent.horizon !== child.horizon || parent.periodId !== child.periodId) return
    const incoming = this.activeParentIds(child.id)
    if (incoming.some(id => !copies.has(id))) return
    this.invalidateIds(incoming, now, 'unlink')
    this.db.prepare('UPDATE item_placements SET horizon=?, periodId=?, sortKey=?, nestingParentId=?, version=version+1 WHERE itemId=?')
      .run(child.horizon, child.periodId, child.sortKey, child.nestingParentId, child.id)
  }

  private applyUndoHold(now: string, id: string): void {
    const item = this.item(id)
    if (!item || item.deletedAt) return
    const calendar = this.calendar()
    let hold: string | null = null
    if (item.status === 'todo' && item.periodId && calendar && item.horizon !== 'later') {
      const period = this.db.prepare('SELECT id, horizon, startDate, endDate, startAt, endAt FROM planning_periods WHERE id=?').get(item.periodId)
      const mapped = period ? mapPeriod(period) : null
      if (mapped && Date.parse(mapped.endAt) <= Date.parse(now)) {
        const current = currentPeriod(calendar, mapped.horizon, now)
        if (mapped.horizon === current.horizon) {
          this.ensurePeriod(current)
          hold = current.id
        }
      }
    }
    if (hold === item.holdPeriodId) return
    this.db.prepare('UPDATE item_placements SET holdPeriodId=?, version=version+1 WHERE itemId=?').run(hold, id)
  }

  private nextSort(horizon: Horizon, periodId: string | null, nestingParentId: string | null): number {
    const row = this.db.prepare(`SELECT MAX(sortKey) AS n FROM item_placements WHERE horizon=? AND periodId IS ? AND nestingParentId IS ?`).get(horizon, periodId, nestingParentId)
    return row?.n === null || row?.n === undefined ? 0 : Number(row.n) + 1
  }

  private item(id: string): ItemRow | null {
    const row = this.db.prepare(`${itemSql} WHERE i.id=?`).get(id)
    return row ? mapItem(row) : null
  }

  private touch(id: string, version: number, now: string): void {
    const changed = this.db.prepare('UPDATE items SET updatedAt=?, version=version+1 WHERE id=? AND version=?').run(now, id, version)
    if (changed.changes !== 1) throw new StoreError('conflict')
  }

  private event(now: string, itemId: string, type: string, before: unknown, after: unknown, fromPeriodId: SqlValue = null, toPeriodId: SqlValue = null): void {
    const operationId = this.ids()
    this.db.prepare(`INSERT INTO operations (id,generation,requestHash,kind,source,at,effectsVersion,effects,result) VALUES (?,?,?,?, 'user', ?,3,'[]','{}')`)
      .run(operationId, this.generation(), operationId, type, now)
    this.db.prepare(`INSERT INTO item_events (id,operationId,eventIndex,itemId,at,type,beforeState,afterState,fromPeriodId,toPeriodId) VALUES (?,?,0,?,?,?,?,?,?,?)`)
      .run(this.ids(), operationId, itemId, now, type, before === null ? null : JSON.stringify(before), JSON.stringify(after), fromPeriodId, toPeriodId)
  }

  private requireSetup(): void {
    if (!this.workspace().setupConfirmedAt) throw new StoreError('setup')
  }

  private calendar(): CalendarConfig | null {
    return this.workspace().calendar
  }

  private generation(): string {
    return this.workspace().generation
  }

  private workspace(): Snapshot extends never ? never : {
    generation: string; calendar: CalendarConfig | null; setupConfirmedAt: string | null
    theme: Snapshot['theme']; style: Snapshot['style']; checkStyle: Snapshot['checkStyle']
    backupEnabled: boolean; backupRetention: number
  } {
    const row = this.db.prepare('SELECT generation, calendar, setupConfirmedAt, theme, style, checkStyle, backupEnabled, backupRetention FROM workspace WHERE id=1').get()
    if (!row) throw new StoreError('workspace')
    return {
      generation: String(row.generation),
      calendar: row.calendar ? JSON.parse(String(row.calendar)) as CalendarConfig : null,
      setupConfirmedAt: row.setupConfirmedAt === null ? null : String(row.setupConfirmedAt),
      theme: String(row.theme) as Snapshot['theme'],
      style: String(row.style) as Snapshot['style'],
      checkStyle: String(row.checkStyle) as Snapshot['checkStyle'],
      backupEnabled: Number(row.backupEnabled) === 1,
      backupRetention: Number(row.backupRetention),
    }
  }

  private policyMap(): Map<PeriodHorizon, PolicyMode> {
    const map = new Map<PeriodHorizon, PolicyMode>()
    for (const row of this.db.prepare('SELECT horizon, mode FROM rollover_policies').all()) map.set(String(row.horizon) as PeriodHorizon, String(row.mode) as PolicyMode)
    return map
  }

  private mirror(): void {
    this.db.exec('DELETE FROM base_item_relations')
    this.db.exec('DELETE FROM base_item_placements')
    this.db.exec('DELETE FROM base_item_guidance')
    this.db.exec('DELETE FROM base_rollover_policies')
    this.db.exec('DELETE FROM base_items')
    this.db.exec('DELETE FROM base_planning_periods')
    this.db.exec('DELETE FROM base_workspace')
    this.db.exec('INSERT INTO base_workspace SELECT * FROM workspace')
    this.db.exec('INSERT INTO base_planning_periods SELECT * FROM planning_periods')
    this.db.exec('INSERT INTO base_items SELECT * FROM items')
    this.db.exec('INSERT INTO base_item_placements SELECT * FROM item_placements')
    this.db.exec('INSERT INTO base_item_relations SELECT * FROM item_relations')
    this.db.exec('INSERT INTO base_rollover_policies SELECT * FROM rollover_policies')
    this.db.exec('INSERT INTO base_item_guidance SELECT * FROM item_guidance')
  }

  private tx<T>(fn: () => T): T {
    try { return this.db.transaction(fn) } catch (error) {
      if (error instanceof StoreError) throw error
      const message = error instanceof Error ? error.message : String(error)
      throw new StoreError(message)
    }
  }
}

function mapItem(row: Record<string, SqlValue>): ItemRow {
  const description = String(row.description ?? '')
  return {
    id: String(row.id), title: String(row.title), description,
    dueDate: row.dueDate === null || row.dueDate === undefined ? null : String(row.dueDate),
    status: String(row.status) as Status,
    completedAt: row.completedAt === null || row.completedAt === undefined ? null : String(row.completedAt),
    archivedAt: row.archivedAt === null || row.archivedAt === undefined ? null : String(row.archivedAt),
    deletedAt: row.deletedAt === null || row.deletedAt === undefined ? null : String(row.deletedAt),
    createdAt: String(row.createdAt), updatedAt: String(row.updatedAt), version: Number(row.version),
    flowColor: row.flowColor === null || row.flowColor === undefined ? null : Number(row.flowColor),
    horizon: String(row.horizon) as Horizon,
    periodId: row.periodId === null || row.periodId === undefined ? null : String(row.periodId),
    sortKey: Number(row.sortKey), placementVersion: Number(row.placementVersion),
    nestingParentId: row.nestingParentId === null || row.nestingParentId === undefined ? null : String(row.nestingParentId),
    holdPeriodId: row.holdPeriodId === null || row.holdPeriodId === undefined ? null : String(row.holdPeriodId),
    note: noteSignal(description),
  }
}

function mapPeriod(row: Record<string, SqlValue>): Period {
  return { id: String(row.id), horizon: String(row.horizon) as PeriodHorizon, startDate: String(row.startDate), endDate: String(row.endDate), startAt: String(row.startAt), endAt: String(row.endAt) }
}

function keyBetween(before: number | null, after: number | null, current: number): number {
  if (before === null && after === null) return current
  if (before === null) return (after ?? 0) - 1
  if (after === null) return before + 1
  if (before === after) return before + 0.5
  return (before + after) / 2
}
