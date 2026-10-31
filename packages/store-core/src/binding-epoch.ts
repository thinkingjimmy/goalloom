/**
 * [INPUT]: Complete expected identity and main-authenticated higher epoch with frozen protected-context/roster digests.
 * [OUTPUT]: Atomic identity/runtime epoch CAS, immutable recovery receipts and exact initialization identity lineage.
 * [POS]: Local binding maintenance beside retired.ts; no key material, transport, retirement or initialization writer.
 */
import { canonicalJson } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import type { SqlDriver, SqlValue } from './driver'
import { assertActiveBinding, validateBinding, type BindingIdentity } from './retired'
import { seedAssert } from './seed-types'

export interface BindingEpochProof {
  requestId: string; rosterHash: string; contextDigest: string; at: string
}
export interface BindingEpochReceipt {
  version: 1; requestId: string; previousBinding: BindingIdentity; binding: BindingIdentity
  rosterHash: string; contextDigest: string; committedAt: string
}

function validateProof(proof: BindingEpochProof): void {
  seedAssert(proof && Object.keys(proof).length === 4 && ['requestId', 'rosterHash', 'contextDigest', 'at'].every(key => Object.hasOwn(proof, key)), 'binding epoch proof fields')
  seedAssert(typeof proof.requestId === 'string' && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(proof.requestId), 'binding epoch request')
  seedAssert([proof.rosterHash, proof.contextDigest].every(value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)), 'binding epoch digest')
  seedAssert(typeof proof.at === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(proof.at) && Number.isFinite(Date.parse(proof.at)), 'binding epoch time')
}
function validateAdvance(previous: BindingIdentity, binding: BindingIdentity): void {
  validateBinding(previous); validateBinding(binding)
  seedAssert(binding.keyEpoch > previous.keyEpoch && canonicalJson({ ...binding, keyEpoch: previous.keyEpoch }) === canonicalJson(previous), 'binding epoch identity or order')
}
function requestHash(previous: BindingIdentity, binding: BindingIdentity, proof: BindingEpochProof): string {
  return sha256Hex(canonicalJson({ purpose: 'binding-epoch/v1', expectedBinding: previous, nextEpoch: binding.keyEpoch, proof }))
}
function decodeReceipt(row: Record<string, SqlValue>): BindingEpochReceipt {
  const receipt = JSON.parse(String(row.receipt)) as BindingEpochReceipt
  seedAssert(receipt && Object.keys(receipt).length === 7 && receipt.version === 1, 'binding epoch receipt fields')
  validateAdvance(receipt.previousBinding, receipt.binding)
  const proof = { requestId: receipt.requestId, rosterHash: receipt.rosterHash, contextDigest: receipt.contextDigest, at: receipt.committedAt }
  validateProof(proof)
  seedAssert(row.requestId === receipt.requestId && row.bindingToken === receipt.binding.bindingToken
    && row.fromEpoch === receipt.previousBinding.keyEpoch && row.toEpoch === receipt.binding.keyEpoch && row.committedAt === receipt.committedAt
    && row.requestHash === requestHash(receipt.previousBinding, receipt.binding, proof), 'binding epoch receipt integrity')
  return receipt
}

export function readBindingEpochReceipt(driver: SqlDriver, requestId: string): BindingEpochReceipt | null {
  const row = driver.prepare('SELECT * FROM sync_binding_epoch_receipts WHERE requestId=?').get(requestId)
  return row ? decodeReceipt(row) : null
}

/** Main verifies the signed roster/envelope before preparing the context bound by these digests. */
export function advanceActiveBindingEpoch(driver: SqlDriver, expectedBinding: BindingIdentity, nextEpoch: number, proof: BindingEpochProof): BindingEpochReceipt {
  validateProof(proof)
  const binding = { ...expectedBinding, keyEpoch: nextEpoch }
  validateAdvance(expectedBinding, binding)
  const hash = requestHash(expectedBinding, binding, proof)
  return driver.transaction(() => {
    const prior = driver.prepare('SELECT * FROM sync_binding_epoch_receipts WHERE requestId=?').get(proof.requestId)
    if (prior) {
      const receipt = decodeReceipt(prior)
      seedAssert(prior.requestHash === hash, 'binding epoch request changed')
      assertActiveBinding(driver, receipt.binding)
      return receipt
    }
    assertActiveBinding(driver, expectedBinding)
    const changed = driver.prepare('UPDATE sync_active_binding SET identity=? WHERE id=1 AND identity=?')
      .run(canonicalJson(binding), canonicalJson(expectedBinding))
    seedAssert(changed.changes === 1, 'binding epoch identity CAS')
    const runtime = driver.prepare(`UPDATE sync_state SET keyEpoch=? WHERE id=1 AND workspaceId=? AND deviceId=? AND keyEpoch=?
      AND EXISTS(SELECT 1 FROM workspace WHERE id=1 AND generation=?)`)
      .run(nextEpoch, expectedBinding.workspaceId, expectedBinding.deviceId, expectedBinding.keyEpoch, expectedBinding.localGeneration)
    seedAssert(runtime.changes === 1, 'binding epoch runtime CAS')
    const receipt: BindingEpochReceipt = { version: 1, requestId: proof.requestId, previousBinding: expectedBinding, binding,
      rosterHash: proof.rosterHash, contextDigest: proof.contextDigest, committedAt: proof.at }
    driver.prepare(`INSERT INTO sync_binding_epoch_receipts(requestId,requestHash,bindingToken,fromEpoch,toEpoch,receipt,committedAt)
      VALUES (?,?,?,?,?,?,?)`).run(proof.requestId, hash, binding.bindingToken, expectedBinding.keyEpoch, nextEpoch, canonicalJson(receipt), proof.at)
    assertActiveBinding(driver, binding)
    return receipt
  })
}

/** Match every original identity field and prove each epoch step; comparing identities with epoch omitted is insufficient. */
export function assertBindingEpochLineage(driver: SqlDriver, originalBinding: BindingIdentity, currentBinding: BindingIdentity): void {
  validateBinding(originalBinding)
  assertActiveBinding(driver, currentBinding)
  seedAssert(originalBinding.keyEpoch <= currentBinding.keyEpoch
    && canonicalJson({ ...currentBinding, keyEpoch: originalBinding.keyEpoch }) === canonicalJson(originalBinding), 'binding epoch lineage identity')
  let cursor = currentBinding
  while (cursor.keyEpoch > originalBinding.keyEpoch) {
    const row = driver.prepare('SELECT * FROM sync_binding_epoch_receipts WHERE bindingToken=? AND toEpoch=?').get(cursor.bindingToken, cursor.keyEpoch)
    seedAssert(row, 'binding epoch lineage missing')
    const receipt = decodeReceipt(row)
    seedAssert(canonicalJson(receipt.binding) === canonicalJson(cursor), 'binding epoch lineage crossed')
    cursor = receipt.previousBinding
  }
  seedAssert(canonicalJson(cursor) === canonicalJson(originalBinding), 'binding epoch lineage origin')
}
