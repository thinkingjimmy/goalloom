/**
 * [INPUT]: 严格命令、有限查询、注入时钟、SQLite Store。
 * [OUTPUT]: 权威事务中复核的写入/历史/幂等回执（计划含有序 itemIds）及只读投影。
 * [POS]: workspace 业务命令唯一事务入口；worker 串行调用，renderer 不直连数据库。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { compareInstants, currentPeriod, workspaceDate, type Clock } from '../../domain/calendar'
import { commandSchema, DomainError, type Command, type CommandResult } from '../../shared/contracts/commands'
import type { ItemDetail, ItemPage, Query, Snapshot } from '../../shared/contracts/queries'
import type { Context } from './context'
import { confirmSetup, createItem, editItem, linkItems, moveItem, setFlowColor } from './commands/items'
import { transaction } from '../storage/database'
import { Store } from '../storage/store'
import { deleteItem, restoreItem, setArchive, setStatus, unlinkItems } from './commands/lifecycle'
import { undoOperation } from './commands/undo'
import { arrangeBacklog } from './commands/backlog'
import { createPlan } from './commands/plan'
import { setPolicy, confirmClock, setBackupPreferences, confirmRollover, undoBatch } from './commands/settings'
import { serverText } from '../../shared/i18n/server'

export class Repository {
  readonly store: Store
  maintenance = false
  constructor(readonly db: DatabaseSync, readonly clock: Clock) { this.store = new Store(db) }
  execute(input: unknown): CommandResult {
    const command = commandSchema.parse(input)
    if (this.maintenance) throw new DomainError('maintenance', serverText().errors.maintenance)
    return transaction(this.db, () => this.apply(command))
  }
  private apply(command: Command): CommandResult {
    const workspace = this.store.workspace()
    if (workspace.generation !== command.generation) throw new DomainError('generation', serverText().errors.workspaceReplaced)
    const hash = createHash('sha256').update(JSON.stringify(command)).digest('hex')
    const receipt = this.store.operation(command.operationId)
    if (receipt) {
      if (receipt.requestHash !== hash) throw new DomainError('conflict', serverText().errors.operationIdReused)
      return receipt.result
    }
    if (!workspace.setupConfirmedAt && !['confirmSetup', 'preferences'].includes(command.type)) throw new DomainError('setup', serverText().errors.setupRequired)
    const now = this.clock.now()
    const context: Context = { store: this.store, workspace, command, now, effects: [], warnings: [], itemId: null, label: '' }
    const changed = command.type === 'undo' ? this.undo(context, command) : this.dispatch(context, command)
    if (changed) workspace.revision++
    if (workspace.lastObservedAt && compareInstants(now, workspace.lastObservedAt) < 0) workspace.clockAnomaly = true
    else workspace.lastObservedAt = now
    this.store.saveWorkspace(workspace)
    const result: CommandResult = { operationId: command.operationId, generation: command.generation, changed, undoable: context.effects.length > 0,
      outcome: context.outcome ?? 'committed', itemId: context.itemId, label: context.label, warnings: context.warnings, restoreSource: context.restoreSource ?? null, originalOperationId: command.type === 'undo' || command.type === 'undoBatch' ? command.originalOperationId : null,
      ...(context.itemIds ? { itemIds: context.itemIds } : {}) }
    this.store.saveOperation({ id: command.operationId, generation: command.generation, requestHash: hash, kind: command.type, source: 'user', at: now, effectsVersion: 1, effects: context.effects, result })
    for (const effect of context.undone ?? []) this.db.prepare('INSERT INTO undo_effects VALUES (?,?,?)').run(effect.originalId, effect.index, command.operationId)
    return result
  }
  private undo(context: Context, command: Extract<Command, { type: 'undo' }>): boolean {
    this.db.exec('SAVEPOINT undo_step')
    try {
      const changed = undoOperation(context, command)
      this.db.exec('RELEASE undo_step')
      return changed
    } catch (error) {
      this.db.exec('ROLLBACK TO undo_step; RELEASE undo_step')
      if (!(error instanceof DomainError) || !['conflict', 'invalid', 'stale'].includes(error.code)) throw error
      context.outcome = 'conflict_skipped'
      context.warnings = [error.message]
      // A failed plan undo exposes no partial IDs, so no restore entry can survive it.
      if (this.store.operation(command.originalOperationId)?.kind === 'createPlan') { context.itemIds = []; context.itemId = null }
      delete context.restoreSource
      delete context.undone
      return false
    }
  }
  private dispatch(context: Context, command: Command): boolean {
    switch (command.type) {
      case 'confirmSetup': return confirmSetup(context, command)
      case 'create': return createItem(context, command)
      case 'createPlan': return createPlan(context, command)
      case 'edit': return editItem(context, command)
      case 'flowColor': return setFlowColor(context, command)
      case 'move': return moveItem(context, command)
      case 'link': return linkItems(context, command)
      case 'status': return setStatus(context, command)
      case 'archive': return setArchive(context, command)
      case 'delete': return deleteItem(context, command)
      case 'restoreItem': return restoreItem(context, command)
      case 'unlink': return unlinkItems(context, command)
      case 'arrangeBacklog': return arrangeBacklog(context, command)
      case 'policy': return setPolicy(context, command)
      case 'confirmClock': return confirmClock(context)
      case 'confirmRollover': return confirmRollover(context)
      case 'backupPreferences': return setBackupPreferences(context, command)
      case 'undoBatch': return undoBatch(context, command)
      case 'preferences': {
        const theme = command.theme ?? context.workspace.theme, style = command.style ?? context.workspace.style, checkStyle = command.checkStyle ?? context.workspace.checkStyle
        if (context.workspace.theme === theme && context.workspace.style === style && context.workspace.checkStyle === checkStyle) return false
        context.label = context.workspace.style !== style ? serverText().labels.style : context.workspace.checkStyle !== checkStyle ? serverText().labels.checkStyle : serverText().labels.theme
        Object.assign(context.workspace, { theme, style, checkStyle })
        return true
      }
      default: throw new DomainError('invalid', serverText().errors.notAvailable)
    }
  }
  snapshot(): Snapshot {
    const workspace = this.store.workspace()
    const observedAt = this.clock.now()
    const periods = workspace.calendar ? (['cycle', 'month', 'week', 'day'] as const).map(horizon => {
      const beforeAnchor = workspaceDate(workspace.calendar!.timezone, observedAt) < workspace.calendar!.cycleAnchor
      const cycleObservation = beforeAnchor ? workspace.lastObservedAt ?? workspace.setupConfirmedAt! : observedAt
      return currentPeriod(workspace.calendar!, horizon, horizon === 'cycle' ? cycleObservation : observedAt)
    }) : []
    const ids = periods.map(period => period.id)
    const items = this.store.items(`i.deletedAt IS NULL AND i.archivedAt IS NULL AND i.status!='cancelled' AND (p.horizon='later' OR p.periodId IN (${ids.map(() => '?').join(',') || 'NULL'}))`, ids)
    const backlog: Record<string, number> = {}
    for (const row of this.db.prepare("SELECT p.horizon, count(*) AS n FROM items i JOIN item_placements p ON p.itemId=i.id JOIN planning_periods pp ON pp.id=p.periodId WHERE i.status='todo' AND i.deletedAt IS NULL AND i.archivedAt IS NULL AND julianday(pp.endAt)<=julianday(?) GROUP BY p.horizon").all(observedAt)) backlog[String(row.horizon)] = Number(row.n)
    const source = this.db.prepare("SELECT pp.startDate FROM item_events e JOIN planning_periods pp ON pp.id=e.fromPeriodId WHERE e.seq=(SELECT seq FROM item_events WHERE itemId=? AND fromPeriodId IS NOT toPeriodId ORDER BY seq DESC LIMIT 1) AND e.type='rolled_over'")
    const rolloverSources = Object.fromEntries(items.flatMap(item => {
      const row = source.get(item.id)
      return row ? [[item.id, String(row.startDate)]] : []
    }))
    const flows = this.db.prepare('SELECT id,title,flowColor,archivedAt FROM items WHERE flowColor IS NOT NULL AND deletedAt IS NULL ORDER BY flowColor').all()
      .map(row => ({ id: String(row.id), title: String(row.title), flowColor: Number(row.flowColor), archived: row.archivedAt !== null }))
    return { workspace, periods, items, relations: this.relationViews(), policies: this.store.policies(), backlog, observedAt, maintenance: this.maintenance, backupError: null, rolloverSources, flows }
  }
  relationViews(): Snapshot['relations'] {
    return this.db.prepare('SELECT r.*,p.title AS parentTitle,c.title AS childTitle,p.archivedAt AS parentArchived,c.archivedAt AS childArchived FROM item_relations r JOIN items p ON p.id=r.parentId JOIN items c ON c.id=r.childId WHERE r.invalidatedAt IS NULL ORDER BY r.createdAt,r.id').all()
      .map(row => ({ ...row, parentArchived: row.parentArchived !== null, childArchived: row.childArchived !== null })) as unknown as Snapshot['relations']
  }
  detail(itemId: string): ItemDetail { return { item: this.store.item(itemId), relations: this.relationViews().filter(edge => edge.parentId === itemId || edge.childId === itemId) } }
  list(query: Extract<Query, { type: 'list' }>): ItemPage {
    const conditions = [query.view === 'trash' ? 'i.deletedAt IS NOT NULL' : 'i.deletedAt IS NULL']
    const parameters: (string | number)[] = []
    if (query.view === 'search' && !query.query.trim()) return { items: [], total: 0 }
    if (query.view === 'done' || query.view === 'cancelled') { conditions.push('i.status=?'); parameters.push(query.view) }
    if (query.view === 'archived') conditions.push('i.archivedAt IS NOT NULL')
    if (query.view === 'backlog') {
      conditions.push("i.status='todo' AND i.archivedAt IS NULL AND p.periodId IN (SELECT id FROM planning_periods WHERE julianday(endAt)<=julianday(?))")
      parameters.push(this.clock.now())
      if (query.horizon) { conditions.push('p.horizon=?'); parameters.push(query.horizon) }
    }
    if (query.query.trim()) {
      conditions.push("(i.title LIKE ? ESCAPE '\\' OR i.description LIKE ? ESCAPE '\\')")
      const pattern = `%${query.query.trim().replace(/[\\%_]/g, '\\$&')}%`
      parameters.push(pattern, pattern)
    }
    const where = conditions.join(' AND ')
    const total = Number(this.db.prepare(`SELECT count(*) AS n FROM items i JOIN item_placements p ON p.itemId=i.id WHERE ${where}`).get(...parameters)!.n)
    const sort = { done: 'i.completedAt DESC,i.id', cancelled: 'i.cancelledAt DESC,i.id', archived: 'i.archivedAt DESC,i.id', trash: 'i.deletedAt DESC,i.id', search: 'i.updatedAt DESC,i.id', backlog: 'p.periodId DESC,p.sortKey,i.id' }[query.view]
    return { items: this.store.items(where, [...parameters, query.limit, query.offset], `ORDER BY ${sort} LIMIT ? OFFSET ?`), total }
  }
}
