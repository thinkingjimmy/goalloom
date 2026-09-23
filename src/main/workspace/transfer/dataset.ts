/**
 * [INPUT]: 已校验 Dataset、固定本机连接与注入时刻。
 * [OUTPUT]: 完整 v3 导出、保留源版本的只读 SQLite 读取、单事务整库替换和新工作区代次。
 * [POS]: 恢复存储适配器；不自行确认、不跨过保护备份会话。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { stat } from 'node:fs/promises'
import { datasetSchema, type Dataset } from '../../../shared/contracts/transfer'
import { validateImport } from '../../../domain/import-validation'
import { Store } from '../../storage/store'
import { transaction, verifyDatabase } from '../../storage/database'
import { requiredTables, schemaVersion, supportedVersions, userVersion } from '../../storage/schema'

// A source file keeps its own contract version: an old SQLite copy is validated as v1/v2, never relabelled as v3.
export function exportDataset(store: Store, now: string, version: number = schemaVersion): Dataset {
  const items = store.items('1')
  return datasetSchema.parse({ schemaVersion: version, historyMode: 'complete', exportedAt: now, workspace: store.workspace(),
    items: items.map(({ placement: _placement, ...item }) => item), placements: items.map(item => item.placement),
    periods: store.periods(), relations: store.relations(false), policies: store.policies(),
    events: store.eventRows(store.db.prepare('SELECT * FROM item_events ORDER BY seq').all()),
    operations: store.db.prepare('SELECT * FROM operations ORDER BY rowid').all().map(row => ({ ...row, effects: JSON.parse(String(row.effects)), result: JSON.parse(String(row.result)) })),
    undoEffects: store.db.prepare('SELECT * FROM undo_effects').all() })
}
export async function readSqliteDataset(path: string, now: string): Promise<Dataset> {
  if ((await stat(path)).size > 100 * 1024 * 1024) throw new Error('数据库超过 100 MB 导入限制')
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: false })
  try {
    db.exec('PRAGMA trusted_schema=OFF')
    const version = userVersion(db)
    if (!supportedVersions.includes(version)) throw new Error('不支持的数据库版本')
    const tables = db.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all()
    if (tables.some(row => row.type === 'view') || requiredTables.some(name => !tables.some(row => row.name === name && row.type === 'table'))) throw new Error('数据库结构无效')
    verifyDatabase(db)
    return validateImport(exportDataset(new Store(db), now, version), now)
  } finally { db.close() }
}
export function emptyDataset(store: Store, now: string): Dataset {
  const workspace = store.workspace()
  return { schemaVersion, historyMode: 'complete', exportedAt: now,
    workspace: { ...workspace, generation: randomUUID(), calendar: null, setupConfirmedAt: null, pausedAfterRestore: false, revision: 0, clockAnomaly: false, lastObservedAt: null, backupEnabled: true, backupRetention: 7 },
    items: [], placements: [], periods: [], policies: [], relations: [], events: [], operations: [], undoEffects: [] }
}
export function replaceDataset(store: Store, input: Dataset, mode: 'reset' | 'restore', now: string): string {
  const data = structuredClone(input), generation = randomUUID(), { theme, style } = store.workspace()
  Object.assign(data.workspace, { generation, theme, style, pausedAfterRestore: mode === 'restore', revision: data.workspace.revision + 1 })
  return transaction(store.db, () => {
    // --- 唯一连接中原子替换；任何约束/校验/磁盘错误全部回滚旧库。 ---
    store.db.exec('PRAGMA defer_foreign_keys=ON; DELETE FROM undo_effects; DELETE FROM item_events; DELETE FROM operations; DELETE FROM item_relations; DELETE FROM item_placements; DELETE FROM rollover_policies; DELETE FROM planning_periods; DELETE FROM items; DELETE FROM sqlite_sequence WHERE name=\'item_events\';')
    store.saveWorkspace(data.workspace)
    for (const period of data.periods) store.ensurePeriod(period)
    const placements = new Map(data.placements.map(p => [p.itemId, p]))
    for (const item of data.items) store.insertItem({ ...item, placement: placements.get(item.id)! })
    for (const edge of data.relations) store.saveRelation(edge)
    for (const policy of data.policies) store.db.prepare('INSERT INTO rollover_policies VALUES (?,?,?,?)').run(policy.horizon, policy.mode, policy.version, policy.effectiveFromPeriodId)
    for (const operation of data.operations) store.saveOperation(operation)
    for (const event of data.events) store.db.prepare('INSERT INTO item_events (seq,id,operationId,eventIndex,itemId,at,type,beforeState,afterState,fromPeriodId,toPeriodId,undoOf) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(event.seq, event.id, event.operationId, event.eventIndex, event.itemId, event.at, event.type, event.before ? JSON.stringify(event.before) : null, JSON.stringify(event.after), event.before?.periodId ?? null, event.after.periodId, event.undoOf)
    for (const marker of data.undoEffects) store.db.prepare('INSERT INTO undo_effects VALUES (?,?,?)').run(marker.originalId, marker.effectIndex, marker.undoId)
    if (data.historyMode === 'baseline') addBaseline(store, now)
    verifyDatabase(store.db)
    return generation
  })
}
function addBaseline(store: Store, now: string): void {
  const id = randomUUID(), generation = store.workspace().generation
  const result = { operationId: id, generation, changed: true, undoable: false, outcome: 'committed' as const, itemId: null, label: '导入历史起点', warnings: [], restoreSource: null, originalOperationId: null }
  store.saveOperation({ id, generation, requestHash: createHash('sha256').update(id).digest('hex'), kind: 'baseline', source: 'system', at: now, effectsVersion: 1, effects: [], result })
  for (const item of store.items('1')) {
    store.event(id, now, 'baseline', null, item)
  }
}
