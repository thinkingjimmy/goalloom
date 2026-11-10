/**
 * [INPUT]: Normalized datasets, read-only v16 or pre-focus v15 source databases and injected time.
 * [OUTPUT]: Strict v16 exports, focus-free v15 restores, explicit current-data recovery for verified application backups, and atomic replacement.
 * [POS]: Transfer persistence adapter; preserves source versions and never bypasses confirmation.
 */
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { stat } from 'node:fs/promises'
import type { Dataset } from '../../../shared/contracts/transfer'
import { validateDataset } from '../../../domain/import-validation'
import { cloudCatalog } from '../../../shared/i18n/cloud'
import { serverLocale } from '../../../shared/i18n/server'
import { DomainError } from '../../../shared/contracts/commands'
import { addBaseline } from '../baseline'
import { Store } from '../../storage/store'
import { transaction, verifyDatabase } from '../../storage/database'
import { schemaVersion, tablesFor, upgradableVersion, userVersion } from '../../storage/schema'
import { datasetHeader, datasetRows } from './rows'
import { serverText } from '../../../shared/i18n/server'
import { copyProjectionToBase } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'

// Exports are always v16; restore also accepts the pre-focus v15 format.
export function exportDataset(store: Store, now: string): Dataset {
  return readDataset(store, now, true)
}
// A v15 source has no focus table; it restores as a focus-free v15 dataset.
function readDataset(store: Store, now: string, keepDescriptions: boolean, baseline = false, version: 15 | 16 = 16): Dataset {
  return { ...datasetHeader(store, now), schemaVersion: version, ...(baseline ? { historyMode: 'baseline' as const } : {}),
    // Each original body passes the same schema before it is discarded for protection-only validation.
    items: Array.from(datasetRows(store, 'items'), item => keepDescriptions ? item : { ...item, description: '' }), placements: [...datasetRows(store, 'placements')], periods: [...datasetRows(store, 'periods')],
    relations: [...datasetRows(store, 'relations')], policies: [...datasetRows(store, 'policies')], events: baseline ? [] : [...datasetRows(store, 'events')],
    operations: baseline ? [] : [...datasetRows(store, 'operations')], undoEffects: baseline ? [] : [...datasetRows(store, 'undoEffects')],
    focus: version === 16 ? [...datasetRows(store, 'focus')] : [],
  }
}
export async function readSqliteDataset(path: string, now: string, source: 'external' | 'backup' = 'external'): Promise<Dataset> {
  return readSqlite(path, now, source, true)
}
export async function verifySqliteDataset(path: string, now: string): Promise<void> {
  await readSqlite(path, now, 'backup', false)
}
/** Caller must verify the application's backup receipt/hash before this recovery boundary. */
export async function readRetrievedDataset(path: string, now: string): Promise<Dataset> {
  const data = await readSqlite(path, now, 'backup', true)
  if (data.historyMode !== 'baseline') throw new DomainError('invalid', 'retrieved_copy_not_baseline')
  return data
}
export async function readBackupDataset(path: string, now: string, keepDescriptions = true): Promise<{ data: Dataset; historyRecovered: boolean }> {
  try { return { data: await readSqlite(path, now, 'backup', keepDescriptions), historyRecovered: false } }
  catch {
    return { data: await readSqlite(path, now, 'backup', keepDescriptions, true), historyRecovered: true }
  }
}
async function readSqlite(path: string, now: string, source: 'external' | 'backup', keepDescriptions: boolean, baseline = false): Promise<Dataset> {
  if (source === 'external' && (await stat(path)).size > 100 * 1024 * 1024) throw new DomainError('invalid', serverText().errors.fileTooLarge)
  const db = new DatabaseSync(path, { readOnly: true, allowExtension: false })
  try {
    db.exec('PRAGMA trusted_schema=OFF; BEGIN')
    const version = userVersion(db)
    if (version !== schemaVersion && version !== upgradableVersion) throw new DomainError('invalid', serverText().errors.unsupportedDatabase)
    const tables = db.prepare("SELECT name,type FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all()
    const names = tables.map(row => String(row.name))
    if (tables.some(row => row.type === 'view') || tablesFor(version).some(name => !names.includes(name))) throw new DomainError('invalid', serverText().errors.invalidDatabase)
    verifyDatabase(db)
    const retrieved = names.includes('retrieval_copy') && db.prepare("SELECT 1 FROM retrieval_copy WHERE id=1 AND historyMode='baseline'").get()
    const data = readDataset(new Store(db), now, keepDescriptions, baseline || Boolean(retrieved), version === upgradableVersion ? 15 : 16)
    return validateDataset(data, now)
  } finally { db.close() }
}
export function emptyDataset(store: Store, now: string): Dataset {
  const workspace = store.workspace()
  return { schemaVersion, historyMode: 'complete', exportedAt: now,
    workspace: { ...workspace, generation: randomUUID(), calendar: null, setupConfirmedAt: null, pausedAfterRestore: false, revision: 0, clockAnomaly: false, lastObservedAt: null, backupEnabled: true, backupRetention: 7 },
    items: [], placements: [], periods: [], policies: [], relations: [], events: [], operations: [], undoEffects: [], focus: [] }
}
export function replaceDataset(store: Store, input: Dataset, mode: 'reset' | 'restore', now: string, retrievedCopy = false): string {
  const generation = randomUUID(), { theme, style, checkStyle } = store.workspace()
  const data = { ...input, workspace: { ...input.workspace, generation, theme, style, checkStyle, pausedAfterRestore: mode !== 'reset', revision: input.workspace.revision + 1 } }
  return transaction(store.db, () => {
    if (retrievedCopy && store.db.prepare("SELECT 1 FROM sync_ops WHERE origin='local' AND state IN ('never_sent','send_unknown','accepted') LIMIT 1").get()) throw new DomainError('conflict', cloudCatalog[serverLocale()].pendingWrites)
    // --- 唯一连接中原子替换；任何约束/校验/磁盘错误全部回滚旧库。 ---
    store.db.exec('PRAGMA defer_foreign_keys=ON; DELETE FROM period_focus; DELETE FROM undo_effects; DELETE FROM item_events; DELETE FROM operations; DELETE FROM item_relations; DELETE FROM item_placements; DELETE FROM rollover_policies; DELETE FROM planning_periods; DELETE FROM items; DELETE FROM sqlite_sequence WHERE name=\'item_events\';')
    store.saveWorkspace(data.workspace)
    for (const period of data.periods) store.ensurePeriod(period)
    const placements = new Map(data.placements.map(p => [p.itemId, p]))
    for (const item of data.items) store.insertItem({ ...item, placement: placements.get(item.id)! })
    for (const edge of data.relations) store.saveRelation(edge)
    for (const focus of data.focus) store.saveFocus(focus.periodId, focus.itemId)
    const insertPolicy = store.prepare('INSERT INTO rollover_policies VALUES (?,?,?,?)')
    for (const policy of data.policies) insertPolicy.run(policy.horizon, policy.mode, policy.version, policy.effectiveFromPeriodId)
    for (const operation of data.operations) store.saveOperation(operation)
    const insertEvent = store.prepare('INSERT INTO item_events (seq,id,operationId,eventIndex,itemId,at,type,beforeState,afterState,fromPeriodId,toPeriodId,undoOf) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    for (const event of data.events) insertEvent.run(event.seq, event.id, event.operationId, event.eventIndex, event.itemId, event.at, event.type, event.before ? JSON.stringify(event.before) : null, JSON.stringify(event.after), event.before?.periodId ?? null, event.after.periodId, event.undoOf)
    const insertMarker = store.prepare('INSERT INTO undo_effects VALUES (?,?,?)')
    for (const marker of data.undoEffects) insertMarker.run(marker.originalId, marker.effectIndex, marker.undoId)
    if (data.historyMode === 'baseline') addBaseline(store, now)
    const driver = nodeSqlDriver(store.db)
    driver.exec('DELETE FROM sync_conflicts; DELETE FROM canon_changes; DELETE FROM canon_ops; DELETE FROM sync_ops; DELETE FROM sync_settings')
    driver.prepare(`UPDATE sync_state SET lastAppliedSeq=0, lastUploadedSeq=0, paused='generation', workspaceId=NULL, keyEpoch=NULL, updatedAt=? WHERE id=1`).run(now)
    driver.exec('DELETE FROM sync_initialization_ack; DELETE FROM sync_seed_state; DELETE FROM sync_active_binding')
    copyProjectionToBase(driver)
    verifyDatabase(store.db)
    return generation
  })
}
