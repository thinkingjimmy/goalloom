/**
 * [INPUT]: Controlled SQLite connection, validated DTOs and authoritative current versions.
 * [OUTPUT]: Bounded prepared statements, summary/detail reads, indexed neighbors and versioned writes/events/receipts.
 * [POS]: Persistence adapter; Repository owns transactions and business policy.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { DatabaseSync, SQLInputValue, StatementSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { DomainError } from '../../shared/contracts/commands'
import { workspaceSchema, type Item, type ItemSummary, type ItemRecord, type Placement, type PlanningPeriod, type Policy, type Relation, type Workspace } from '../../shared/contracts/entities'
import { businessState, type ItemEvent, type Operation, type PositionEffect } from '../../shared/contracts/effects'
import { serverText } from '../../shared/i18n/server'

export class Store {
  private statements = new Map<string, StatementSync>()
  constructor(readonly db: DatabaseSync) {}
  prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql)
    if (!statement) {
      if (this.statements.size >= 128) this.statements.delete(this.statements.keys().next().value!)
      statement = this.db.prepare(sql); this.statements.set(sql, statement)
    }
    return statement
  }
  workspace(): Workspace {
    const row = this.prepare('SELECT * FROM workspace WHERE id=1').get()!
    return workspaceSchema.parse({ generation: row.generation, calendar: row.calendar ? JSON.parse(String(row.calendar)) : null,
      setupConfirmedAt: row.setupConfirmedAt, pausedAfterRestore: Boolean(row.pausedAfterRestore), revision: row.revision,
      lastObservedAt: row.lastObservedAt, clockAnomaly: Boolean(row.clockAnomaly), theme: row.theme, style: row.style, checkStyle: row.checkStyle,
      backupEnabled: Boolean(row.backupEnabled), backupRetention: row.backupRetention })
  }
  saveWorkspace(workspace: Workspace): void {
    this.prepare('UPDATE workspace SET generation=?,calendar=?,setupConfirmedAt=?,pausedAfterRestore=?,revision=?,lastObservedAt=?,clockAnomaly=?,theme=?,style=?,checkStyle=?,backupEnabled=?,backupRetention=? WHERE id=1')
      .run(workspace.generation, workspace.calendar ? JSON.stringify(workspace.calendar) : null, workspace.setupConfirmedAt, Number(workspace.pausedAfterRestore), workspace.revision, workspace.lastObservedAt, Number(workspace.clockAnomaly), workspace.theme, workspace.style, workspace.checkStyle, Number(workspace.backupEnabled), workspace.backupRetention)
  }
  item(id: string, expectedVersion?: number): Item {
    const row = this.prepare('SELECT * FROM items WHERE id=?').get(id) as unknown as ItemRecord | undefined
    if (!row) throw new DomainError('invalid', serverText().errors.itemMissing)
    if (expectedVersion !== undefined && row.version !== expectedVersion) throw new DomainError('stale', serverText().errors.itemChanged)
    const placement = this.prepare('SELECT * FROM item_placements WHERE itemId=?').get(id) as unknown as Placement
    return { ...row, placement }
  }
  items(where: string, parameters: SQLInputValue[] = [], suffix = 'ORDER BY p.sortKey,i.id'): Item[] {
    const rows = this.prepare(`SELECT i.*,p.horizon,p.periodId,p.sortKey,p.version AS placementVersion,p.holdPeriodId FROM items i JOIN item_placements p ON p.itemId=i.id WHERE ${where} ${suffix}`).all(...parameters)
    return rows.map(row => {
      const { horizon, periodId, sortKey, placementVersion, holdPeriodId, ...item } = row
      return { ...item, placement: { itemId: item.id, horizon, periodId, sortKey, version: placementVersion, holdPeriodId } } as Item
    })
  }
  summaries(where: string, parameters: SQLInputValue[] = [], suffix = 'ORDER BY p.sortKey,i.id'): ItemSummary[] {
    // Match JavaScript trim without transferring the description or retaining a second body in the worker.
    const whitespace = 'char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)'
    const rows = this.prepare(`SELECT i.id,i.title,i.dueDate,i.status,i.completedAt,i.cancelledAt,i.archivedAt,i.deletedAt,i.deletedBy,i.createdAt,i.updatedAt,i.version,i.flowColor,
      length(trim(i.description,${whitespace}))>0 AS hasDescription,p.horizon,p.periodId,p.sortKey,p.version AS placementVersion,p.holdPeriodId
      FROM items i JOIN item_placements p ON p.itemId=i.id WHERE ${where} ${suffix}`).all(...parameters)
    return rows.map(row => {
      const { horizon, periodId, sortKey, placementVersion, holdPeriodId, hasDescription, ...item } = row
      return { ...item, hasDescription: Boolean(hasDescription), placement: { itemId: item.id, horizon, periodId, sortKey, version: placementVersion, holdPeriodId } } as ItemSummary
    })
  }
  insertItem(item: Item): void {
    this.prepare('INSERT INTO items (id,title,description,dueDate,status,completedAt,cancelledAt,archivedAt,deletedAt,deletedBy,createdAt,updatedAt,version,flowColor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(item.id, item.title, item.description, item.dueDate, item.status, item.completedAt, item.cancelledAt, item.archivedAt, item.deletedAt, item.deletedBy, item.createdAt, item.updatedAt, item.version, item.flowColor ?? null)
    const p = item.placement
    this.prepare('INSERT INTO item_placements VALUES (?,?,?,?,?,?)').run(p.itemId, p.horizon, p.periodId, p.sortKey, p.version, p.holdPeriodId)
  }
  saveItem(item: Item, previousVersion: number): void {
    const result = this.prepare('UPDATE items SET title=?,description=?,dueDate=?,status=?,completedAt=?,cancelledAt=?,archivedAt=?,deletedAt=?,deletedBy=?,updatedAt=?,version=?,flowColor=? WHERE id=? AND version=?')
      .run(item.title, item.description, item.dueDate, item.status, item.completedAt, item.cancelledAt, item.archivedAt, item.deletedAt, item.deletedBy, item.updatedAt, item.version, item.flowColor ?? null, item.id, previousVersion)
    if (result.changes !== 1) throw new DomainError('stale', serverText().errors.writeRace)
  }
  savePlacement(placement: Placement, previousVersion: number): void {
    const result = this.prepare('UPDATE item_placements SET horizon=?,periodId=?,sortKey=?,version=?,holdPeriodId=? WHERE itemId=? AND version=?')
      .run(placement.horizon, placement.periodId, placement.sortKey, placement.version, placement.holdPeriodId, placement.itemId, previousVersion)
    if (result.changes !== 1) throw new DomainError('stale', serverText().errors.placementChanged)
  }
  periods(): PlanningPeriod[] { return this.prepare('SELECT * FROM planning_periods ORDER BY startAt,id').all() as unknown as PlanningPeriod[] }
  period(id: string): PlanningPeriod {
    const row = this.prepare('SELECT * FROM planning_periods WHERE id=?').get(id) as unknown as PlanningPeriod | undefined
    if (!row) throw new DomainError('invalid', serverText().errors.periodMissing)
    return row
  }
  ensurePeriod(period: PlanningPeriod): void { this.prepare('INSERT OR IGNORE INTO planning_periods VALUES (?,?,?,?,?,?)').run(period.id, period.horizon, period.startDate, period.endDate, period.startAt, period.endAt) }
  policies(): Policy[] { return this.prepare('SELECT * FROM rollover_policies').all() as unknown as Policy[] }
  relations(activeOnly = true): Relation[] { return this.prepare(`SELECT * FROM item_relations ${activeOnly ? 'WHERE invalidatedAt IS NULL' : ''}`).all() as unknown as Relation[] }
  saveRelation(relation: Relation): void {
    this.prepare('INSERT INTO item_relations VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET invalidatedAt=excluded.invalidatedAt,invalidatedBy=excluded.invalidatedBy,reason=excluded.reason')
      .run(relation.id, relation.parentId, relation.childId, relation.invalidatedAt, relation.invalidatedBy, relation.reason, relation.createdAt)
  }
  order(horizon: Placement['horizon'], periodId: string | null): { id: string; placement: Placement }[] {
    const rows = this.prepare('SELECT p.* FROM item_placements p JOIN items i ON i.id=p.itemId WHERE i.deletedAt IS NULL AND p.horizon=? AND p.periodId IS ? ORDER BY p.sortKey,p.itemId').all(horizon, periodId) as unknown as Placement[]
    return rows.map(placement => ({ id: placement.itemId, placement }))
  }
  neighbor(placement: Placement, direction: 'before' | 'after', excludedId: string | null = null): Placement | null {
    const comparison = direction === 'before' ? '<' : '>', order = direction === 'before' ? 'DESC' : 'ASC'
    return this.prepare(`SELECT p.* FROM item_placements p JOIN items i ON i.id=p.itemId WHERE i.deletedAt IS NULL AND p.horizon=? AND p.periodId IS ?
      AND (p.sortKey,p.itemId) ${comparison} (?,?) AND p.itemId IS NOT ? ORDER BY p.sortKey ${order},p.itemId ${order} LIMIT 1`)
      .get(placement.horizon, placement.periodId, placement.sortKey, placement.itemId, excludedId) as unknown as Placement ?? null
  }
  insertion(horizon: Placement['horizon'], periodId: string | null, beforeId: string | null, excludedId: string | null): { previous: Placement | null; next: Placement | null } {
    if (beforeId === null) {
      const previous = this.prepare('SELECT p.* FROM item_placements p JOIN items i ON i.id=p.itemId WHERE i.deletedAt IS NULL AND p.horizon=? AND p.periodId IS ? AND p.itemId IS NOT ? ORDER BY p.sortKey DESC,p.itemId DESC LIMIT 1').get(horizon, periodId, excludedId) as unknown as Placement ?? null
      return { previous, next: null }
    }
    const next = this.prepare('SELECT p.* FROM item_placements p JOIN items i ON i.id=p.itemId WHERE p.itemId=? AND i.deletedAt IS NULL AND p.horizon=? AND p.periodId IS ? AND p.itemId IS NOT ?').get(beforeId, horizon, periodId, excludedId) as unknown as Placement | undefined
    if (!next) throw new DomainError('conflict', serverText().errors.sortTargetGone)
    return { previous: this.neighbor(next, 'before', excludedId), next }
  }
  position(item: Item): PositionEffect {
    return { horizon: item.placement.horizon, periodId: item.placement.periodId, previousId: this.neighbor(item.placement, 'before')?.itemId ?? null, nextId: this.neighbor(item.placement, 'after')?.itemId ?? null }
  }
  operation(id: string): Operation | null {
    const row = this.prepare('SELECT * FROM operations WHERE id=?').get(id)
    return row ? { ...row, effects: JSON.parse(String(row.effects)), result: JSON.parse(String(row.result)) } as unknown as Operation : null
  }
  saveOperation(operation: Operation): void {
    this.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?,?,?,?)').run(operation.id, operation.generation, operation.requestHash, operation.kind, operation.source, operation.at, operation.effectsVersion, JSON.stringify(operation.effects), JSON.stringify(operation.result))
  }
  event(operationId: string, at: string, type: string, before: Item | null, after: Item, undoOf: string | null = null): void {
    const index = Number(this.prepare('SELECT count(*) AS n FROM item_events WHERE operationId=?').get(operationId)!.n)
    this.prepare('INSERT INTO item_events (id,operationId,eventIndex,itemId,at,type,beforeState,afterState,fromPeriodId,toPeriodId,undoOf) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), operationId, index, after.id, at, type, before ? JSON.stringify(businessState(before)) : null, JSON.stringify(businessState(after)), before?.placement.periodId ?? null, after.placement.periodId, undoOf)
  }
  events(itemId: string): ItemEvent[] {
    return this.eventRows(this.prepare('SELECT * FROM item_events WHERE itemId=? ORDER BY seq').all(itemId))
  }
  eventRows(rows: Record<string, unknown>[]): ItemEvent[] {
    return rows.map(row => ({ seq: Number(row.seq), id: String(row.id), operationId: String(row.operationId), eventIndex: Number(row.eventIndex), itemId: String(row.itemId), at: String(row.at), type: String(row.type), before: row.beforeState ? JSON.parse(String(row.beforeState)) : null, after: JSON.parse(String(row.afterState)), undoOf: row.undoOf as string | null }))
  }
}
