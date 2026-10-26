// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Shared retained-copy DTOs/scalars from packages/contracts, canonical JSON and crypto records.
 * [OUTPUT]: Strict request/response schemas, finite failures and the exact proof digest.
 * [POS]: Retrieval protocol boundary; no identity, database or password access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { sha256 as digest } from '@noble/hashes/sha2.js'
import { hex, utf8 } from '../../../packages/crypto/src/bytes.ts'
import { canonicalJson } from '../../../packages/contracts/src/canonical.ts'
import { cloudUuid as uuid, cloudHex as hexBytes, cloudInteger as integer,
  cloudPositive as positiveInteger, cloudInstant as utcInstant } from '../../../packages/contracts/src/cloud.ts'
import { retrievalLimits, retrievalProofSchema as proofSchema, retrievalBootstrapSchema as bootstrapSchema,
  retrievalAuthorizeSchema as authorizeSchema, retrievalReadSchema as readSchema, retrievalInitializationSchema as initializationSchema,
  retrievalManifestSchema as manifestSchema, retrievalProofBodySchema as proofBodySchema,
  cloudRosterBodySchema as rosterBodySchema, cloudRosterWireSchema as rosterWireSchema,
  cloudCheckpointBodySchema as checkpointBodySchema, cloudCheckpointWireSchema as checkpointSchema,
  cloudEnvelopeWireSchema as envelopeSchema, retrievalRecoveryBodySchema as recoveryBodySchema,
  cloudPullWireSchema as pullSchema, retrievalChallengeSchema as challengeSchema, retrievalControlSchema as controlSchema,
  retrievalAuthorizedSchema as authorizedSchema, retrievalOperationsSchema as operationsSchema,
} from '../../../packages/contracts/src/retrieval.ts'
export { canonicalJson, uuid, hexBytes, integer, positiveInteger, utcInstant, proofSchema, bootstrapSchema,
  authorizeSchema, readSchema, initializationSchema, manifestSchema, proofBodySchema, rosterBodySchema, rosterWireSchema,
  checkpointBodySchema, checkpointSchema, envelopeSchema, recoveryBodySchema, pullSchema, challengeSchema, controlSchema,
  authorizedSchema, operationsSchema }
export const RESPONSE_BYTES = retrievalLimits.responseBytes
export const REQUEST_BYTES = retrievalLimits.requestBytes
export const ROSTER_BYTES = retrievalLimits.rosterBytes
export const CHECKPOINT_BYTES = retrievalLimits.checkpointBytes
export const ENVELOPE_BYTES = retrievalLimits.envelopeBytes
export const ROSTER_PAGE_ROWS = retrievalLimits.rosters
export const OPERATION_PAGE_ROWS = retrievalLimits.operations
export const BUILD_TIMEOUT_MS = 25_000
export const hex32 = hexBytes(32)
export const initialSchema = bootstrapSchema.options[0]
export const continuationSchema = bootstrapSchema.options[1]
export const rosterPageSchema = challengeSchema.shape.rosterPage
export const metadataSchema = z.object({ seq: positiveInteger, opId: uuid, payloadHash: hex32,
  formatVersion: positiveInteger, keyEpoch: positiveInteger, deviceId: uuid }).strict()
export const failureCodes = ['authentication_failed', 'upgrade_required', 'invalid_request', 'too_large', 'retrieval_proof_invalid',
  'retrieval_boundary_changed', 'retrieval_capability_expired', 'retrieval_closed', 'retrieval_data_unavailable',
  'retrieval_configuration', 'retrieval_unavailable', 'retrieval_rate_limited'] as const
export const failureSchema = z.object({ ok: z.literal(false), version: z.literal(1), serverNow: utcInstant,
  error: z.enum(failureCodes), reason: z.enum(['unsupported_profile', 'incomplete_history', 'integrity_failure']).optional(),
}).strict().refine(value => (value.error === 'retrieval_data_unavailable') === (value.reason !== undefined))
export type Manifest = z.infer<typeof manifestSchema>
export type ProofBody = z.infer<typeof proofBodySchema>
export type InitialRequest = z.infer<typeof initialSchema>
export type RosterWire = z.infer<typeof rosterWireSchema>
export type CheckpointWire = z.infer<typeof checkpointSchema>
export type EnvelopeWire = z.infer<typeof envelopeSchema>
export type DataFailure = 'unsupported_profile' | 'incomplete_history' | 'integrity_failure'
export class RetrievalFailure extends Error {
  constructor(readonly code: typeof failureCodes[number], readonly reason?: DataFailure) { super(code) }
}
export class CommittedFailure extends Error {
  constructor(readonly result: z.infer<typeof failureSchema>) { super(result.error) }
}
export type Rpc = (name: string, args: Record<string, unknown>) => Promise<unknown>
export async function rpcResult(rpc: Rpc, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await rpc(name, args)
  if (result && typeof result === 'object' && 'ok' in result && result.ok === false) {
    const parsed = failureSchema.safeParse(result)
    if (!parsed.success) throw new RetrievalFailure('retrieval_unavailable')
    throw new CommittedFailure(parsed.data)
  }
  return result
}
export function dataFailure(reason: DataFailure): never { throw new RetrievalFailure('retrieval_data_unavailable', reason) }
export function sha256(value: string | Uint8Array): string { return hex(digest(typeof value === 'string' ? utf8(value) : value)) }
export function byteLength(value: unknown): number { return new TextEncoder().encode(JSON.stringify(value)).byteLength }
export function retrievalProofDigest(value: unknown): Uint8Array {
  return digest(utf8(`goalloom/retrieval-proof/v1|${canonicalJson(proofBodySchema.parse(value))}`))
}
