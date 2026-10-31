/**
 * [INPUT]: One validated seed action, persisted initialization state and exact projection rows.
 * [OUTPUT]: Deterministic begin/rows/final application, fatal integrity guards and verified fixed-boundary proof.
 * [POS]: Initialization branch of the existing shared applier; no transport or second replay engine.
 */
import { canonicalJson, syncOpPayload, type SyncOp } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import type { ApplyHost, SqlDriver } from './driver'
import { captureSeedRecords, insertSeedRecord, seedRecordBytes } from './seed-records'
import { countSeedRecord, emptySeedCounts, readSeedState, seedAssert, seedRecordKey, SeedIntegrityError, seedTablesReady, writeSeedState, type SeedBoundary, type SeedScope } from './seed-types'

export function hasSeedAction(input: unknown): boolean {
  if (!input || typeof input !== 'object' || !('actions' in input) || !Array.isArray(input.actions)) return false
  return input.actions.some(action => action && typeof action === 'object' && typeof action.t === 'string' && action.t.startsWith('seed.'))
}

export function applySeedOperation(driver: SqlDriver, op: SyncOp, scope: SeedScope, host: ApplyHost): boolean {
  const action = op.actions[0]
  const state = readSeedState(driver, scope)
  if (!hasSeedAction(op)) { seedAssert(state?.phase !== 'loading', 'ordinary operation inside seed'); return false }
  try {
    seedAssert(seedTablesReady(driver), 'seed schema unavailable')
    seedAssert(op.actions.length === 1 && action, 'mixed seed operation')
    if (action.t === 'seed.begin') {
      seedAssert(!state, 'seed already initialized')
      const prefix = scope === 'base' ? 'base_' : ''
      for (const table of ['items', 'item_placements', 'planning_periods', 'rollover_policies', 'item_relations', 'item_guidance']) {
        seedAssert(!driver.prepare(`SELECT 1 FROM ${prefix}${table} LIMIT 1`).get(), 'seed requires empty projection')
      }
      seedAssert(driver.prepare(`SELECT calendar FROM ${prefix}workspace WHERE id=1`).get()?.calendar === null, 'seed requires empty calendar')
      if (scope === 'base') {
        seedAssert(Number(driver.prepare('SELECT lastAppliedSeq AS seq FROM sync_state WHERE id=1').get()?.seq ?? 0) === 0
          && !driver.prepare('SELECT 1 FROM canon_ops LIMIT 1').get(), 'seed must start at sequence one')
      }
      writeSeedState(driver, scope, {
        seedId: action.manifest.seedId, manifest: action.manifest, creatorDeviceId: op.deviceId, beginOpId: op.opId,
        phase: 'loading', nextChunk: 0, lastKey: null, counts: emptySeedCounts(), rowBytes: 0, finalOpId: null, finalPayloadHash: null,
      })
      return true
    }
    seedAssert(state?.phase === 'loading' && 'seedId' in action && action.seedId === state.seedId && op.deviceId === state.creatorDeviceId, 'seed identity or phase')
    if (action.t === 'seed.rows') {
      seedAssert(action.index === state.nextChunk && state.nextChunk < state.manifest.chunks, 'seed chunk order')
      for (const record of action.records) {
        const key = seedRecordKey(record)
        seedAssert(state.lastKey === null || key > state.lastKey, 'seed record order')
        countSeedRecord(state.counts, record)
        state.rowBytes += seedRecordBytes(record).length
        for (const key of Object.keys(state.counts) as (keyof typeof state.counts)[]) seedAssert(state.counts[key] <= state.manifest.counts[key], 'seed count exceeds manifest')
        seedAssert(state.rowBytes <= state.manifest.rowBytes, 'seed bytes exceed manifest')
        insertSeedRecord(driver, scope, record)
        state.lastKey = key
      }
      state.nextChunk++
      writeSeedState(driver, scope, state)
      return true
    }
    seedAssert(action.t === 'seed.final' && action.chunks === state.manifest.chunks && action.digest === state.manifest.digest
      && state.nextChunk === action.chunks && state.rowBytes === state.manifest.rowBytes
      && canonicalJson(state.counts) === canonicalJson(state.manifest.counts), 'seed incomplete final')
    const source = captureSeedRecords(driver, host, scope)
    seedAssert(source.digest === state.manifest.digest && source.rowBytes === state.manifest.rowBytes
      && canonicalJson(source.counts) === canonicalJson(state.manifest.counts), 'seed final integrity')
    if (scope === 'base') seedAssert(Number(driver.prepare('SELECT lastAppliedSeq AS seq FROM sync_state WHERE id=1').get()?.seq ?? 0) + 1 === action.chunks + 2, 'seed final sequence')
    state.phase = 'complete'; state.finalOpId = op.opId; state.finalPayloadHash = sha256Hex(syncOpPayload(op))
    writeSeedState(driver, scope, state)
    return true
  } catch (error) {
    if (error instanceof SeedIntegrityError) throw error
    throw new SeedIntegrityError(error instanceof Error ? error.message : 'seed application failed')
  }
}

/** The frozen manifest binds its independent requestId to the original final tuple; plaintext seedId is a separate identity. */
export function assertSeedBoundary(driver: SqlDriver, expected: SeedBoundary | null): void {
  const state = readSeedState(driver, 'base')
  if (expected === null) { seedAssert(!state, 'seeded history requires initialization proof'); return }
  seedAssert(state?.phase === 'complete' && state.creatorDeviceId === expected.creatorDeviceId
    && state.finalOpId === expected.finalOpId && state.finalPayloadHash === expected.finalPayloadHash
    && expected.finalSeq === state.manifest.chunks + 2, 'seed frozen identity mismatch')
  const first = driver.prepare('SELECT opId,deviceId,kind,outcome FROM canon_ops WHERE seq=1').get()
  const final = driver.prepare('SELECT opId,deviceId,kind,outcome FROM canon_ops WHERE seq=?').get(expected.finalSeq)
  const receipt = driver.prepare('SELECT payloadHash,seq,outcome FROM sync_ops WHERE opId=?').get(expected.finalOpId)
  seedAssert(first?.opId === state.beginOpId && first.deviceId === expected.creatorDeviceId && first.kind === 'seed.begin' && first.outcome === 'applied'
    && final?.opId === expected.finalOpId && final.deviceId === expected.creatorDeviceId && final.kind === 'seed.final' && final.outcome === 'applied'
    && receipt?.payloadHash === expected.finalPayloadHash && receipt.seq === expected.finalSeq && receipt.outcome === 'applied'
    && !driver.prepare("SELECT 1 FROM canon_ops WHERE seq<=? AND (deviceId<>? OR outcome<>'applied' OR kind NOT IN ('seed.begin','seed.rows','seed.final')) LIMIT 1").get(expected.finalSeq, expected.creatorDeviceId)
    && Number(driver.prepare('SELECT count(*) AS n FROM canon_ops WHERE seq<=?').get(expected.finalSeq)?.n) === expected.finalSeq, 'seed canonical boundary mismatch')
}
