/**
 * [INPUT]: Verified binding identities, exact source rows and a protected-context retention reference from main.
 * [OUTPUT]: Byte-sized seed operations, atomic retired-binding handoff receipts and original-final verification through committed epoch lineage.
 * [POS]: Local initialization orchestration over the existing shared applier. Network/vault completion stays in the host.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { canonicalJson, parseSyncOp, syncOpPayload, type SyncOp } from '@goalloom/contracts'
import { sha256Hex, utf8 } from '@goalloom/crypto'
import {
  assertActiveBinding, assertUnboundBinding, assertForeignKeys, assertSeedBoundary, assertBindingEpochLineage, captureSeedRecords, describeSeedRecords, previewRetiredEvidence,
  readSeedState, rebuildVisibleFull, resetSeedState, retainBindingRows, seedAssert, seedPlaintextLimit, seedRecordLimit,
  switchActiveBinding, type ApplyHost, type BindingIdentity, type ExactSeedSource, type RetiredEvidence, type SeedBoundary,
  type SeedManifest, type SeedRecord, type SqlDriver,
} from '@goalloom/store-core'
import { clearBase } from './board'

export interface EncodedSeed { manifest: SeedManifest; ops: SyncOp[]; final: { opId: string; payloadHash: string; seq: number } }
export interface BindingTransitionPreview { sourceDigest: string; counts: ExactSeedSource['counts']; rowBytes: number; localGeneration: string; revision: number; retired: RetiredEvidence }
export interface BindingTransitionInput {
  requestId: string; initializationRequestId: string; expectedBinding: BindingIdentity | null; newBinding: BindingIdentity
  expectedLocalGeneration: string; expectedRevision: number; expectedSourceDigest: string
  seedId: string; finalOpId: string; protectedContextRef: string | null; newProtectedContextRef: string; at: string
}
export interface BindingTransitionReceipt {
  requestId: string; initializationRequestId: string; oldBinding: BindingIdentity | null; newBinding: BindingIdentity; sourceDigest: string; sourceCounts: ExactSeedSource['counts']
  manifest: SeedManifest; beginOpId: string; finalOpId: string; finalPayloadHash: string; finalSeq: number
  protectedContextRef: string | null; newProtectedContextRef: string; retired: RetiredEvidence; committedAt: string
}
export interface SeedHandoff extends SeedBoundary { transitionRequestId: string; seedId: string; target: { workspaceId: string; generation: string }; canonicalVerified: boolean }

export function captureExactSeed(driver: SqlDriver, host: ApplyHost): ExactSeedSource { return captureSeedRecords(driver, host, 'visible') }

export function encodeExactSeed(source: ExactSeedSource, input: { seedId: string; finalOpId: string; deviceId: string; at: string }): EncodedSeed {
  const measured = describeSeedRecords(source.records)
  seedAssert(measured.digest === source.digest && measured.rowBytes === source.rowBytes && canonicalJson(measured.counts) === canonicalJson(source.counts), 'seed source descriptor changed')
  const envelope = (opId: string, action: unknown): SyncOp => parseSyncOp({ v: 1, opId, deviceId: input.deviceId, at: input.at, actions: [action] })
  const groups: SeedRecord[][] = []
  let current: SeedRecord[] = [], currentBytes = 0
  const dummyId = '00000000-0000-4000-8000-000000000001'
  const overhead = () => utf8(canonicalJson({ v: 1, opId: dummyId, deviceId: input.deviceId, at: input.at,
    actions: [{ t: 'seed.rows', seedId: input.seedId, index: groups.length, records: [] }] })).length
  for (const record of source.records) {
    const bytes = utf8(canonicalJson(record)).length
    if (current.length && (current.length === seedRecordLimit || overhead() + currentBytes + bytes + current.length > seedPlaintextLimit)) {
      groups.push(current); current = []; currentBytes = 0
    }
    seedAssert(overhead() + bytes <= seedPlaintextLimit, 'seed record exceeds operation budget')
    current.push(record); currentBytes += bytes
  }
  if (current.length) groups.push(current)
  const manifest: SeedManifest = { version: 1, seedId: input.seedId, counts: { ...source.counts, workspace: 1 }, rowBytes: source.rowBytes, chunks: groups.length, digest: source.digest }
  const begin = envelope(globalThis.crypto.randomUUID(), { t: 'seed.begin', manifest })
  const ops = [begin, ...groups.map((records, index) => envelope(globalThis.crypto.randomUUID(), { t: 'seed.rows', seedId: input.seedId, index, records }))]
  const final = envelope(input.finalOpId, { t: 'seed.final', seedId: input.seedId, chunks: manifest.chunks, digest: manifest.digest })
  seedAssert(!ops.some(op => op.opId === final.opId), 'seed operation identities collide')
  ops.push(final)
  return { manifest, ops, final: { opId: final.opId, payloadHash: sha256Hex(syncOpPayload(final)), seq: ops.length } }
}

export function previewBindingTransition(driver: SqlDriver, host: ApplyHost, input: { expectedBinding: BindingIdentity | null; expectedLocalGeneration: string }): BindingTransitionPreview {
  if (input.expectedBinding) assertActiveBinding(driver, input.expectedBinding)
  else assertUnboundBinding(driver, input.expectedLocalGeneration)
  seedAssert(driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation === input.expectedLocalGeneration, 'transition local generation')
  const source = captureExactSeed(driver, host)
  const workspace = driver.prepare('SELECT generation,revision FROM workspace WHERE id=1').get()!
  return { sourceDigest: source.digest, counts: source.counts, rowBytes: source.rowBytes, localGeneration: String(workspace.generation),
    revision: Number(workspace.revision), retired: previewRetiredEvidence(driver, input.expectedLocalGeneration) }
}
export function readBindingTransition(driver: SqlDriver, requestId: string): BindingTransitionReceipt | null {
  const row = driver.prepare('SELECT receipt FROM sync_binding_transitions WHERE requestId=?').get(requestId)
  return row ? JSON.parse(String(row.receipt)) as BindingTransitionReceipt : null
}
export function commitBindingTransition(driver: SqlDriver, host: ApplyHost, input: BindingTransitionInput): BindingTransitionReceipt {
  const requestHash = sha256Hex(canonicalJson(input))
  return driver.transaction(() => {
    const prior = driver.prepare('SELECT requestHash,receipt FROM sync_binding_transitions WHERE requestId=?').get(input.requestId)
    if (prior) {
      seedAssert(prior.requestHash === requestHash, 'transition request identity changed')
      assertActiveBinding(driver, input.newBinding)
      return JSON.parse(String(prior.receipt)) as BindingTransitionReceipt
    }
    if (input.expectedBinding) assertActiveBinding(driver, input.expectedBinding)
    else assertUnboundBinding(driver, input.expectedLocalGeneration)
    const reference = (value: string | null) => typeof value === 'string' && value.length > 0 && value.length <= 180 && /^[a-zA-Z0-9:_-]+$/.test(value)
    seedAssert(reference(input.newProtectedContextRef) && (input.expectedBinding ? reference(input.protectedContextRef) : input.protectedContextRef === null), 'transition protected context')
    seedAssert(driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation === input.expectedLocalGeneration
      && input.newBinding.localGeneration === input.expectedLocalGeneration, 'transition local generation')
    seedAssert(/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(input.initializationRequestId)
      && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(input.requestId), 'transition initialization request')
    seedAssert(Number(driver.prepare('SELECT revision FROM workspace WHERE id=1').get()?.revision) === input.expectedRevision, 'transition source changed')
    const source = captureExactSeed(driver, host)
    seedAssert(source.digest === input.expectedSourceDigest, 'transition source digest changed')
    const encoded = encodeExactSeed(source, { seedId: input.seedId, finalOpId: input.finalOpId, deviceId: input.newBinding.deviceId, at: input.at })
    const retired = retainBindingRows(driver, input.requestId, input.expectedLocalGeneration)
    const receipt: BindingTransitionReceipt = {
      requestId: input.requestId, initializationRequestId: input.initializationRequestId, oldBinding: input.expectedBinding, newBinding: input.newBinding, sourceDigest: source.digest, sourceCounts: source.counts,
      manifest: encoded.manifest, beginOpId: encoded.ops[0]!.opId, finalOpId: encoded.final.opId, finalPayloadHash: encoded.final.payloadHash,
      finalSeq: encoded.final.seq, protectedContextRef: input.protectedContextRef, newProtectedContextRef: input.newProtectedContextRef, retired, committedAt: input.at,
    }
    driver.prepare('INSERT INTO sync_binding_transitions(requestId,requestHash,receipt,committedAt) VALUES (?,?,?,?)')
      .run(input.requestId, requestHash, canonicalJson(receipt), input.at)
    driver.exec('DELETE FROM sync_conflicts; DELETE FROM canon_changes; DELETE FROM canon_ops; DELETE FROM sync_ops;')
    switchActiveBinding(driver, input.expectedBinding, input.newBinding, input.at, input.requestId)
    clearBase(driver); resetSeedState(driver)
    const insert = driver.prepare(`INSERT INTO sync_ops(opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
      VALUES (?,?,'local',1,?,?,?,?,'never_sent',?,?)`)
    encoded.ops.forEach((op, index) => {
      const payload = syncOpPayload(op)
      insert.run(op.opId, index + 1, payload, sha256Hex(payload), op.deviceId, op.at, input.at, input.at)
    })
    rebuildVisibleFull(driver, host, { strictOpIds: new Set(encoded.ops.map(op => op.opId)) })
    const after = captureExactSeed(driver, host)
    seedAssert(after.digest === source.digest && after.rowBytes === source.rowBytes && canonicalJson(after.counts) === canonicalJson(source.counts), 'transition changed current state')
    assertForeignKeys(driver)
    return receipt
  })
}

/** Only a local transition owns a handoff. A completed joined seed has no local initialization to finish. */
export function readSeedHandoff(driver: SqlDriver, expectedBinding: BindingIdentity): SeedHandoff | null {
  assertActiveBinding(driver, expectedBinding)
  const state = readSeedState(driver, 'visible')
  if (!state) return null
  const active = driver.prepare('SELECT transitionRequestId FROM sync_active_binding WHERE id=1').get()
  if (!active?.transitionRequestId) {
    seedAssert(state.phase === 'complete', 'seed transition binding mismatch')
    return null
  }
  const receipt = readBindingTransition(driver, String(active.transitionRequestId))
  seedAssert(receipt && receipt.manifest.seedId === state.seedId, 'seed transition binding mismatch')
  assertBindingEpochLineage(driver, receipt.newBinding, expectedBinding)
  const boundary: SeedBoundary = { requestId: receipt.initializationRequestId, creatorDeviceId: expectedBinding.deviceId,
    finalOpId: receipt.finalOpId, finalPayloadHash: receipt.finalPayloadHash, finalSeq: receipt.finalSeq }
  let canonicalVerified = false
  if (readSeedState(driver, 'base')?.phase === 'complete') { assertSeedBoundary(driver, boundary); canonicalVerified = true }
  return { ...boundary, transitionRequestId: receipt.requestId, seedId: receipt.manifest.seedId, target: { workspaceId: expectedBinding.workspaceId, generation: expectedBinding.generation }, canonicalVerified }
}
export { retiredBindingSummary } from '@goalloom/store-core'
export type { BindingIdentity, ExactSeedSource, RetiredBindingSummary } from '@goalloom/store-core'
