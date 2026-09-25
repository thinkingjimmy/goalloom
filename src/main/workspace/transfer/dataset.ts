/**
 * [INPUT]: Normalized datasets, read-only source databases and injected time.
 * [OUTPUT]: Schema-v5 export, v1-v5 source validation, body-discarding protective checks and atomic replacement.
 * [POS]: Transfer persistence adapter; preserves source versions and never bypasses confirmation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash, randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { stat } from 'node:fs/promises'
import type { Dataset } from '../../../shared/contracts/transfer'
import { validateDataset } from '../../../domain/import-validation'
import { DomainError } from '../../../shared/contracts/commands'
import { Store } from '../../storage/store'
import { transaction, verifyDatabase } from '../../storage/database'
import { requiredTables, schemaVersion, supportedVersions, userVersion } from '../../storage/schema'
import { datasetHeader, datasetRows } from './rows'
import { serverText } from '../../../shared/i18n/server'

// Validate each source under its original schema version; only a new export uses the current version.
export function exportDataset(store: Store, now: string, version: number = schemaVersion): Dataset {
  return readDataset(store, now, version, true)
}
function readDataset(store: Store, now: string, version: number, keepDescriptions: boolean): Dataset {
  return { ...datasetHeader(store, now, version),
    // Each original body passes the same schema before it is discarded for protection-only validation.
    items: Array.from(datasetRows(store, 'items'), item => keepDescriptions ? item : { ...item, description: '' }), placements: [...datasetRows(store, 'placements')], periods: [...datasetRows(store, 'periods')],
    relations: [...datasetRows(store, 'relations')], policies: [...datasetRows(store, 'policies')], events: [...datasetRows(store, 'events')],
    operations: [...datasetRows(store, 'operations')], undoEffects: [...datasetRows(store, 'undoEffects')],
  }
}
export async function readSqliteDataset(path: string, now: string, source: 'external' | 'backup' = 'external'): Promise<Dataset> {
  return readSqlite(path, now, source, true)
}
export async function verifySqliteDataset(path: string, now: string): Promise<void> {
  await readSqlite(path, now, 'backup', false)
}
async function readSqlite(path: string, now: string, source: 'external' | 'backup', keepDescriptions: boolean): Promise<Dataset> {
  if (source === 'external' && (await stat(path)).size > 100 * 1024 * 1024) throw new DomainError('invalid', serverText().errors.fileTooLarge)
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: false })
  try {
    db.exec('PRAGMA trusted_schema=OFF; BEGIN')
    const version = userVersion(db)
    if (!supportedVersions.includes(version)) throw new DomainError('invalid', serverText().errors.unsupportedDatabase)
    const tables = db.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all()
    if (tables.some(row => row.type === 'view') || requiredTables.some(name => !tables.some(row => row.name === name && row.type === 'table'))) throw new DomainError('invalid', serverText().errors.invalidDatabase)
    verifyDatabase(db)
    const data = readDataset(new Store(db), now, version, keepDescriptions)
    return validateDataset(data, now)
  } finally { db.close() }
}
export function emptyDataset(store: Store, now: string): Dataset {
  const workspace = store.workspace()
  return { schemaVersion, historyMode: 'complete', exportedAt: now,
    workspace: { ...workspace, generation: randomUUID(), calendar: null, setupConfirmedAt: null, pausedAfterRestore: false, revision: 0, clockAnomaly: false, lastObservedAt: null, backupEnabled: true, backupRetention: 7 },
    items: [], placements: [], periods: [], policies: [], relations: [], events: [], operations: [], undoEffects: [] }
}
export function replaceDataset(store: Store, input: Dataset, mode: 'reset' | 'restore', now: string): string {
  const generation = randomUUID(), { theme, style, checkStyle } = store.workspace()
  const data = { ...input, workspace: { ...input.workspace, generation, theme, style, checkStyle, pausedAfterRestore: mode === 'restore', revision: input.workspace.revision + 1 } }
  return transaction(store.db, () => {
    // --- 唯一连接中原子替换；任何约束/校验/磁盘错误全部回滚旧库。 ---
    store.db.exec('PRAGMA defer_foreign_keys=ON; DELETE FROM undo_effects; DELETE FROM item_events; DELETE FROM operations; DELETE FROM item_relations; DELETE FROM item_placements; DELETE FROM rollover_policies; DELETE FROM planning_periods; DELETE FROM items; DELETE FROM sqlite_sequence WHERE name=\'item_events\';')
    store.saveWorkspace(data.workspace)
    for (const period of data.periods) store.ensurePeriod(period)
    const placements = new Map(data.placements.map(p => [p.itemId, p]))
    for (const item of data.items) store.insertItem({ ...item, placement: placements.get(item.id)! })
    for (const edge of data.relations) store.saveRelation(edge)
    const insertPolicy = store.prepare('INSERT INTO rollover_policies VALUES (?,?,?,?)')
    for (const policy of data.policies) insertPolicy.run(policy.horizon, policy.mode, policy.version, policy.effectiveFromPeriodId)
    for (const operation of data.operations) store.saveOperation(operation)
    const insertEvent = store.prepare('INSERT INTO item_events (seq,id,operationId,eventIndex,itemId,at,type,beforeState,afterState,fromPeriodId,toPeriodId,undoOf) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    for (const event of data.events) insertEvent.run(event.seq, event.id, event.operationId, event.eventIndex, event.itemId, event.at, event.type, event.before ? JSON.stringify(event.before) : null, JSON.stringify(event.after), event.before?.periodId ?? null, event.after.periodId, event.undoOf)
    const insertMarker = store.prepare('INSERT INTO undo_effects VALUES (?,?,?)')
    for (const marker of data.undoEffects) insertMarker.run(marker.originalId, marker.effectIndex, marker.undoId)
    if (data.historyMode === 'baseline') addBaseline(store, now)
    verifyDatabase(store.db)
    return generation
  })
}
function addBaseline(store: Store, now: string): void {
  const id = randomUUID(), generation = store.workspace().generation
  const result = { operationId: id, generation, changed: true, undoable: false, outcome: 'committed' as const, itemId: null, label: serverText().labels.importBaseline, warnings: [], restoreSource: null, originalOperationId: null }
  store.saveOperation({ id, generation, requestHash: createHash('sha256').update(id).digest('hex'), kind: 'baseline', source: 'system', at: now, effectsVersion: 1, effects: [], result })
  for (const item of store.items('1')) {
    store.event(id, now, 'baseline', null, item)
  }
}
