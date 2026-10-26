/**
 * [INPUT]: Validated seed actions and additive seed-state rows.
 * [OUTPUT]: Shared exact-state types, fatal integrity errors and persisted replay state.
 * [POS]: Initialization support used by the single applier and binding handoff.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { canonicalJson, type Action } from '@goalloom/contracts'
import { SyncApplyError, type SqlDriver } from './driver'

export type SeedRecord = Extract<Action, { t: 'seed.rows' }>['records'][number]
export type SeedManifest = Extract<Action, { t: 'seed.begin' }>['manifest']
export type SeedCounts = Omit<SeedManifest['counts'], 'workspace'> & { workspace: number }
export type SeedScope = 'base' | 'visible'
export const seedByteLimit = 104_857_600
export const seedPlaintextLimit = 1_048_536
export const seedRecordLimit = 200
export const seedHorizons = ['year', 'half', 'cycle', 'month', 'week', 'day'] as const
export const emptySeedCounts = (): SeedCounts => ({ workspace: 0, periods: 0, policies: 0, items: 0, guidance: 0, relations: 0 })
export interface ExactSeedSource { records: SeedRecord[]; counts: SeedCounts; rowBytes: number; digest: string }
export interface SeedState {
  seedId: string; manifest: SeedManifest; creatorDeviceId: string; beginOpId: string
  phase: 'loading' | 'complete'; nextChunk: number; lastKey: string | null; counts: SeedCounts; rowBytes: number
  finalOpId: string | null; finalPayloadHash: string | null
}
export interface SeedBoundary {
  requestId: string; creatorDeviceId: string; finalOpId: string; finalPayloadHash: string; finalSeq: number
}
export class SeedIntegrityError extends SyncApplyError {
  constructor(message: string) { super('seed_integrity', message); this.name = 'SeedIntegrityError' }
}
export function seedAssert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SeedIntegrityError(message)
}
export function seedTablesReady(driver: SqlDriver): boolean {
  return Boolean(driver.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_seed_state'").get())
}
export function readSeedState(driver: SqlDriver, scope: SeedScope): SeedState | null {
  if (!seedTablesReady(driver)) return null
  const row = driver.prepare('SELECT * FROM sync_seed_state WHERE scope=?').get(scope)
  if (!row) return null
  return {
    seedId: String(row.seedId), manifest: JSON.parse(String(row.manifest)) as SeedManifest,
    creatorDeviceId: String(row.creatorDeviceId), beginOpId: String(row.beginOpId), phase: String(row.phase) as SeedState['phase'],
    nextChunk: Number(row.nextChunk), lastKey: row.lastKey === null ? null : String(row.lastKey),
    counts: JSON.parse(String(row.counts)) as SeedCounts, rowBytes: Number(row.rowBytes),
    finalOpId: row.finalOpId === null ? null : String(row.finalOpId), finalPayloadHash: row.finalPayloadHash === null ? null : String(row.finalPayloadHash),
  }
}
export function writeSeedState(driver: SqlDriver, scope: SeedScope, state: SeedState): void {
  driver.prepare(`INSERT INTO sync_seed_state(scope,seedId,manifest,creatorDeviceId,beginOpId,phase,nextChunk,lastKey,counts,rowBytes,finalOpId,finalPayloadHash)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(scope) DO UPDATE SET seedId=excluded.seedId,manifest=excluded.manifest,
    creatorDeviceId=excluded.creatorDeviceId,beginOpId=excluded.beginOpId,phase=excluded.phase,nextChunk=excluded.nextChunk,
    lastKey=excluded.lastKey,counts=excluded.counts,rowBytes=excluded.rowBytes,finalOpId=excluded.finalOpId,finalPayloadHash=excluded.finalPayloadHash`)
    .run(scope, state.seedId, canonicalJson(state.manifest), state.creatorDeviceId, state.beginOpId, state.phase, state.nextChunk,
      state.lastKey, canonicalJson(state.counts), state.rowBytes, state.finalOpId, state.finalPayloadHash)
}
export function resetSeedState(driver: SqlDriver): void {
  if (seedTablesReady(driver)) driver.exec('DELETE FROM sync_seed_state')
}
export function copySeedStateToVisible(driver: SqlDriver): void {
  if (!seedTablesReady(driver)) return
  driver.prepare("DELETE FROM sync_seed_state WHERE scope='visible'").run()
  const base = readSeedState(driver, 'base')
  if (base) writeSeedState(driver, 'visible', base)
}
export function seedRecordKey(record: SeedRecord): string {
  switch (record.kind) {
    case 'workspace': return '0:workspace'
    case 'period': return `1:${record.row.id}`
    case 'policy': return `2:${seedHorizons.indexOf(record.row.horizon)}`
    case 'item': return `3:${record.placement.nestingParentId === null ? 0 : 1}:${record.row.id}`
    case 'relation': return `4:${record.row.id}`
  }
}
export function countSeedRecord(counts: SeedCounts, record: SeedRecord): void {
  if (record.kind === 'workspace') counts.workspace++
  else if (record.kind === 'period') counts.periods++
  else if (record.kind === 'policy') counts.policies++
  else if (record.kind === 'relation') counts.relations++
  else { counts.items++; if (record.guidance) counts.guidance++ }
}
