/**
 * [INPUT]: 受控 SQLite 连接、已校验 DTO 与权威事务中的当前版本。
 * [OUTPUT]: 参数化读写、位置顺序、事件/回执；不拥有事务和业务策略。
 * [POS]: repository 的持久化适配器，所有业务写入由 repository 统一包裹。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { DomainError } from '../../shared/contracts/commands'
import { workspaceSchema, type Item, type ItemRecord, type Placement, type PlanningPeriod, type Policy, type Relation, type Workspace } from '../../shared/contracts/entities'
import { businessState, type ItemEvent, type Operation, type PositionEffect } from '../../shared/contracts/effects'
import { serverText } from '../../shared/i18n/server'

export class Store {
  constructor(readonly db: DatabaseSync) {}
  workspace(): Workspace {
    const row = this.db.prepare('SELECT * FROM workspace WHERE id=1').get()!
    return workspaceSchema.parse({ generation: row.generation, calendar: row.calendar ? JSON.parse(String(row.calendar)) : null,
      setupConfirmedAt: row.setupConfirmedAt, pausedAfterRestore: Boolean(row.pausedAfterRestore), revision: row.revision,
      lastObservedAt: row.lastObservedAt, clockAnomaly: Boolean(row.clockAnomaly), theme: row.theme, style: row.style, checkStyle: row.checkStyle,
      backupEnabled: Boolean(row.backupEnabled), backupRetention: row.backupRetention })
  }
  saveWorkspace(workspace: Workspace): void {
    this.db.prepare('UPDATE workspace SET generation=?,calendar=?,setupConfirmedAt=?,pausedAfterRestore=?,revision=?,lastObservedAt=?,clockAnomaly=?,theme=?,style=?,checkStyle=?,backupEnabled=?,backupRetention=? WHERE id=1')
      .run(workspace.generation, workspace.calendar ? JSON.stringify(workspace.calendar) : null, workspace.setupConfirmedAt, Number(workspace.pausedAfterRestore), workspace.revision, workspace.lastObservedAt, Number(workspace.clockAnomaly), workspace.theme, workspace.style, workspace.checkStyle, Number(workspace.backupEnabled), workspace.backupRetention)
  }
  item(id: string, expectedVersion?: number): Item {
    const row = this.db.prepare('SELECT * FROM items WHERE id=?').get(id) as unknown as ItemRecord | undefined
    if (!row) throw new DomainError('invalid', serverText().errors.itemMissing)
    if (expectedVersion !== undefined && row.version !== expectedVersion) throw new DomainError('stale', serverText().errors.itemChanged)
    const placement = this.db.prepare('SELECT * FROM item_placements WHERE itemId=?').get(id) as unknown as Placement
    return { ...row, placement }
  }
  items(where: string, parameters: SQLInputValue[] = [], suffix = 'ORDER BY p.sortKey,i.id'): Item[] {
    const rows = this.db.prepare(`SELECT i.*,p.horizon,p.periodId,p.sortKey,p.version AS placementVersion,p.holdPeriodId FROM items i JOIN item_placements p ON p.itemId=i.id WHERE ${where} ${suffix}`).all(...parameters)
    return rows.map(row => {
      const { horizon, periodId, sortKey, placementVersion, holdPeriodId, ...item } = row
      return { ...item, placement: { itemId: item.id, horizon, periodId, sortKey, version: placementVersion, holdPeriodId } } as Item
    })
  }
  insertItem(item: Item): void {
    this.db.prepare('INSERT INTO items (id,title,description,dueDate,status,completedAt,cancelledAt,archivedAt,deletedAt,deletedBy,createdAt,updatedAt,version,flowColor) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(item.id, item.title, item.description, item.dueDate, item.status, item.completedAt, item.cancelledAt, item.archivedAt, item.deletedAt, item.deletedBy, item.createdAt, item.updatedAt, item.version, item.flowColor ?? null)
    const p = item.placement
    this.db.prepare('INSERT INTO item_placements VALUES (?,?,?,?,?,?)').run(p.itemId, p.horizon, p.periodId, p.sortKey, p.version, p.holdPeriodId)
  }
  saveItem(item: Item, previousVersion: number): void {
    const result = this.db.prepare('UPDATE items SET title=?,description=?,dueDate=?,status=?,completedAt=?,cancelledAt=?,archivedAt=?,deletedAt=?,deletedBy=?,updatedAt=?,version=?,flowColor=? WHERE id=? AND version=?')
      .run(item.title, item.description, item.dueDate, item.status, item.completedAt, item.cancelledAt, item.archivedAt, item.deletedAt, item.deletedBy, item.updatedAt, item.version, item.flowColor ?? null, item.id, previousVersion)
    if (result.changes !== 1) throw new DomainError('stale', serverText().errors.writeRace)
  }
  savePlacement(placement: Placement, previousVersion: number): void {
    const result = this.db.prepare('UPDATE item_placements SET horizon=?,periodId=?,sortKey=?,version=?,holdPeriodId=? WHERE itemId=? AND version=?')
      .run(placement.horizon, placement.periodId, placement.sortKey, placement.version, placement.holdPeriodId, placement.itemId, previousVersion)
    if (result.changes !== 1) throw new DomainError('stale', serverText().errors.placementChanged)
  }
  periods(): PlanningPeriod[] { return this.db.prepare('SELECT * FROM planning_periods ORDER BY startAt,id').all() as unknown as PlanningPeriod[] }
  period(id: string): PlanningPeriod {
    const row = this.db.prepare('SELECT * FROM planning_periods WHERE id=?').get(id) as unknown as PlanningPeriod | undefined
    if (!row) throw new DomainError('invalid', serverText().errors.periodMissing)
    return row
  }
  ensurePeriod(period: PlanningPeriod): void { this.db.prepare('INSERT OR IGNORE INTO planning_periods VALUES (?,?,?,?,?,?)').run(period.id, period.horizon, period.startDate, period.endDate, period.startAt, period.endAt) }
  policies(): Policy[] { return this.db.prepare('SELECT * FROM rollover_policies').all() as unknown as Policy[] }
  relations(activeOnly = true): Relation[] { return this.db.prepare(`SELECT * FROM item_relations ${activeOnly ? 'WHERE invalidatedAt IS NULL' : ''}`).all() as unknown as Relation[] }
  saveRelation(relation: Relation): void {
    this.db.prepare('INSERT INTO item_relations VALUES (?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET invalidatedAt=excluded.invalidatedAt,invalidatedBy=excluded.invalidatedBy,reason=excluded.reason')
      .run(relation.id, relation.parentId, relation.childId, relation.invalidatedAt, relation.invalidatedBy, relation.reason, relation.createdAt)
  }
  order(horizon: Placement['horizon'], periodId: string | null): Item[] {
    return this.items('i.deletedAt IS NULL AND p.horizon=? AND p.periodId IS ?', [horizon, periodId])
  }
  position(item: Item): PositionEffect {
    const order = this.order(item.placement.horizon, item.placement.periodId)
    const index = order.findIndex(row => row.id === item.id)
    return { horizon: item.placement.horizon, periodId: item.placement.periodId, previousId: order[index - 1]?.id ?? null, nextId: order[index + 1]?.id ?? null }
  }
  operation(id: string): Operation | null {
    const row = this.db.prepare('SELECT * FROM operations WHERE id=?').get(id)
    return row ? { ...row, effects: JSON.parse(String(row.effects)), result: JSON.parse(String(row.result)) } as unknown as Operation : null
  }
  saveOperation(operation: Operation): void {
    this.db.prepare('INSERT INTO operations VALUES (?,?,?,?,?,?,?,?,?)').run(operation.id, operation.generation, operation.requestHash, operation.kind, operation.source, operation.at, operation.effectsVersion, JSON.stringify(operation.effects), JSON.stringify(operation.result))
  }
  event(operationId: string, at: string, type: string, before: Item | null, after: Item, undoOf: string | null = null): void {
    const index = Number(this.db.prepare('SELECT count(*) AS n FROM item_events WHERE operationId=?').get(operationId)!.n)
    this.db.prepare('INSERT INTO item_events (id,operationId,eventIndex,itemId,at,type,beforeState,afterState,fromPeriodId,toPeriodId,undoOf) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
      .run(randomUUID(), operationId, index, after.id, at, type, before ? JSON.stringify(businessState(before)) : null, JSON.stringify(businessState(after)), before?.placement.periodId ?? null, after.placement.periodId, undoOf)
  }
  events(itemId: string): ItemEvent[] {
    return this.eventRows(this.db.prepare('SELECT * FROM item_events WHERE itemId=? ORDER BY seq').all(itemId))
  }
  eventRows(rows: Record<string, unknown>[]): ItemEvent[] {
    return rows.map(row => ({ seq: Number(row.seq), id: String(row.id), operationId: String(row.operationId), eventIndex: Number(row.eventIndex), itemId: String(row.itemId), at: String(row.at), type: String(row.type), before: row.beforeState ? JSON.parse(String(row.beforeState)) : null, after: JSON.parse(String(row.afterState)), undoOf: row.undoOf as string | null }))
  }
}
