/**
 * [INPUT]: A read-only Store view and the source schema version.
 * [OUTPUT]: Individually normalized, bounded dataset rows including six policies, shared by export and SQLite restore.
 * [POS]: Transfer serialization boundary; avoids a second full schema clone of an owned dataset.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { datasetSchema, operationSchema, undoMarkerSchema, type Dataset } from '../../../shared/contracts/transfer'
import { itemRecordSchema, periodSchema, placementSchema, policySchema, relationSchema } from '../../../shared/contracts/entities'
import { guidanceRecordSchema } from '../../../shared/contracts/assistance'
import { eventSchema } from '../../../shared/contracts/history'
import { DomainError } from '../../../shared/contracts/commands'
import { serverText } from '../../../shared/i18n/server'
import { policyHorizons } from '../../../shared/contracts/values'
import type { Store } from '../../storage/store'

export function datasetHeader(store: Store, now: string, version: number) {
  return datasetSchema.pick({ schemaVersion: true, historyMode: true, exportedAt: true, workspace: true }).parse({ schemaVersion: version, historyMode: 'complete', exportedAt: now, workspace: store.workspace() })
}
const tables = {
  guidance: { sql: 'SELECT * FROM item_guidance ORDER BY itemId', schema: guidanceRecordSchema, max: 100_000 },
  items: { sql: 'SELECT * FROM items ORDER BY id', schema: itemRecordSchema, max: 100_000 },
  placements: { sql: 'SELECT * FROM item_placements ORDER BY itemId', schema: placementSchema, max: 100_000 },
  periods: { sql: 'SELECT * FROM planning_periods ORDER BY startAt,id', schema: periodSchema, max: 100_000 },
  relations: { sql: 'SELECT * FROM item_relations ORDER BY id', schema: relationSchema, max: 500_000 },
  policies: { sql: 'SELECT * FROM rollover_policies ORDER BY horizon', schema: policySchema, max: policyHorizons.length },
  events: { sql: 'SELECT * FROM item_events ORDER BY seq', schema: eventSchema, max: 1_000_000 },
  operations: { sql: 'SELECT * FROM operations ORDER BY rowid', schema: operationSchema, max: 500_000 },
  undoEffects: { sql: 'SELECT * FROM undo_effects ORDER BY originalId,effectIndex', schema: undoMarkerSchema, max: 500_000 },
} as const
export type DatasetTable = keyof typeof tables
export const datasetTables = Object.keys(tables) as DatasetTable[]

export function* datasetRows<K extends DatasetTable>(store: Store, table: K): Generator<Dataset[K][number]> {
  if (table === 'guidance' && !store.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='item_guidance'").get()) return
  const descriptor = tables[table]
  let count = 0
  for (const row of store.prepare(descriptor.sql).iterate()) {
    if (++count > descriptor.max) throw new DomainError('invalid', serverText().errors.fileCheckFailed)
    const value = table === 'events' ? store.eventRows([row])[0]
      : table === 'operations' ? { ...row, effects: JSON.parse(String(row.effects)), result: JSON.parse(String(row.result)) }
      : table === 'guidance' ? { ...row, value: row.value ? JSON.parse(String(row.value)) : null } : row
    yield descriptor.schema.parse(value) as Dataset[K][number]
  }
}
