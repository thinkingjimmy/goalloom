// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Verified owner/session, fixed server scope and short-lived service-only SQL pages.
 * [OUTPUT]: Exact complete-log manifest after streamed control/metadata checks and final SQL CAS.
 * [POS]: Retrieval orchestration. Each RPC releases locks before the next network operation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { sha256 as streamingSha256 } from '@noble/hashes/sha2.js'
import { hex, utf8 } from '../../../packages/crypto/src/bytes.ts'
import type { RetainedBoundary, Environment } from '../lifecycle/contract.ts'
import { ControlVerifier } from './control.ts'
import { BUILD_TIMEOUT_MS, canonicalJson, challengeSchema, checkpointSchema, dataFailure, envelopeSchema, hex32,
  initializationSchema, integer, manifestSchema, metadataSchema, positiveInteger, RetrievalFailure, rosterWireSchema,
  rpcResult, sha256, utcInstant, uuid, type InitialRequest, type Rpc } from './protocol.ts'
const boundarySchema = z.object({ ownerId: uuid, workspaceId: uuid, generation: uuid, lifecycleVersion: positiveInteger,
  state: z.literal('retained'), accessEndedAt: utcInstant, retrieveUntil: utcInstant, onlineDeleteBy: utcInstant,
  headSeq: integer, minRetainedSeq: integer, keyEpoch: positiveInteger, rosterVersion: positiveInteger,
  checkpointVersion: positiveInteger, initialization: initializationSchema.nullable(), initializationCompleted: z.boolean().nullable(),
}).strict() satisfies z.ZodType<RetainedBoundary>
const preparedSchema = z.object({ ok: z.literal(true), version: z.literal(1), serverNow: utcInstant, buildId: uuid,
  boundary: boundarySchema, checkpoint: checkpointSchema, recoveryEnvelope: envelopeSchema, proofPublicKey: hex32 }).strict()
const sourceSchema = z.object({ ok: z.literal(true), version: z.literal(1), serverNow: utcInstant,
  after: integer, next: integer, done: z.boolean(), rows: z.array(z.unknown()).max(200) }).strict()
export type BuildScope = { ownerId: string; sessionId: string; environment: Environment; projectRef: string }
export async function buildManifest(input: InitialRequest, scope: BuildScope, rpc: Rpc,
  options: { now?: () => number; timeoutMs?: number } = {}) {
  const now = options.now ?? (() => performance.now()), deadline = now() + (options.timeoutMs ?? BUILD_TIMEOUT_MS)
  const args = (request: unknown) => ({ p_owner: scope.ownerId, p_session: scope.sessionId, p_environment: scope.environment, p_request: request })
  const call = async (name: string, request: unknown): Promise<unknown> => {
    if (now() >= deadline) throw new RetrievalFailure('retrieval_unavailable')
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new RetrievalFailure('retrieval_unavailable')), Math.max(1, deadline - now()))
    })
    let result: unknown
    try { result = await Promise.race([rpcResult(rpc, name, args(request)), timedOut]) }
    finally { clearTimeout(timer) }
    if (now() >= deadline) throw new RetrievalFailure('retrieval_unavailable')
    return result
  }
  const parsed = preparedSchema.safeParse(await call('service_retrieval_prepare', input))
  if (!parsed.success) throw new RetrievalFailure('retrieval_unavailable')
  const prepared = parsed.data, boundary = prepared.boundary
  if (boundary.ownerId !== scope.ownerId || boundary.workspaceId !== input.workspaceId || boundary.generation !== input.generation) dataFailure('integrity_failure')
  if (boundary.minRetainedSeq !== 0 || boundary.keyEpoch !== 1 || boundary.checkpointVersion !== 1) dataFailure('unsupported_profile')
  if ((boundary.initialization === null) !== (boundary.initializationCompleted === null)) dataFailure('integrity_failure')
  if (boundary.initialization && (boundary.initialization.finalSeq > boundary.headSeq
    || (!boundary.initializationCompleted && boundary.initialization.finalSeq !== boundary.headSeq))) dataFailure('incomplete_history')
  const verifier = new ControlVerifier(input, prepared.checkpoint, prepared.recoveryEnvelope)
  const walk = async (section: 'rosters' | 'metadata', head: number, accept: (row: unknown, position: number) => void) => {
    let after = 0
    do {
      const result = sourceSchema.safeParse(await call('service_retrieval_source', { buildId: prepared.buildId, section, after }))
      if (!result.success) throw new RetrievalFailure('retrieval_unavailable')
      const page = result.data
      if (page.after !== after || page.next !== after + page.rows.length || page.next > head
        || page.done !== (page.next === head) || (!page.done && page.rows.length === 0)
        || (section === 'rosters' && page.rows.length > 64)) dataFailure('incomplete_history')
      for (let index = 0; index < page.rows.length; index++) accept(page.rows[index], after + index + 1)
      after = page.next
      if (page.done) break
    } while (true)
  }
  await walk('rosters', boundary.rosterVersion, (value, position) => {
    const row = rosterWireSchema.safeParse(value)
    if (!row.success || row.data.version !== position) dataFailure('integrity_failure')
    verifier.add(row.data)
  })
  const hashes = verifier.finish(boundary.rosterVersion, prepared.proofPublicKey)
  const hash = streamingSha256.create().update(utf8('{"entries":['))
  let count = 0
  await walk('metadata', boundary.headSeq, (value, position) => {
    const row = metadataSchema.safeParse(value)
    if (!row.success || row.data.seq !== position) dataFailure('incomplete_history')
    const op = row.data
    if (op.formatVersion !== 1 || op.keyEpoch !== 1) dataFailure('unsupported_profile')
    if (boundary.initialization?.finalSeq === position && (op.opId !== boundary.initialization.finalOpId
      || op.payloadHash !== boundary.initialization.finalPayloadHash || op.deviceId !== boundary.initialization.creatorDeviceId)) dataFailure('integrity_failure')
    if (count++) hash.update(utf8(','))
    hash.update(utf8(canonicalJson([op.seq, op.opId, op.payloadHash, op.formatVersion, op.keyEpoch])))
  })
  hash.update(utf8(`],"generation":${JSON.stringify(input.generation)},"headSeq":${boundary.headSeq},"workspaceId":${JSON.stringify(input.workspaceId)}}`))
  const manifest = manifestSchema.parse({ version: 1, purpose: 'retained-copy', environment: scope.environment, projectRef: scope.projectRef,
    workspaceId: input.workspaceId, generation: input.generation, lifecycleVersion: boundary.lifecycleVersion,
    accessEndedAt: boundary.accessEndedAt, retrieveUntil: boundary.retrieveUntil, headSeq: boundary.headSeq, minRetainedSeq: 0,
    operationCount: count, headHash: hex(hash.digest()), keyEpoch: 1, checkpointVersion: 1, ...hashes,
    rosterVersion: boundary.rosterVersion, proofKind: input.proof.kind, deviceId: input.proof.kind === 'device' ? input.proof.deviceId : null,
    initialization: boundary.initialization })
  const finalized = challengeSchema.safeParse(await call('service_retrieval_finalize', { buildId: prepared.buildId, manifest }))
  if (!finalized.success) throw new RetrievalFailure('retrieval_unavailable')
  const result = finalized.data, proof = result.proofBody
  if (canonicalJson(result.manifest) !== canonicalJson(manifest) || result.manifestHash !== sha256(canonicalJson(manifest))
    || canonicalJson(result.checkpoint) !== canonicalJson(prepared.checkpoint)
    || canonicalJson(result.recoveryEnvelope) !== canonicalJson(prepared.recoveryEnvelope)
    || proof.ownerId !== scope.ownerId || proof.authSessionId !== scope.sessionId || proof.manifestHash !== result.manifestHash
    || proof.environment !== scope.environment || proof.projectRef !== scope.projectRef || proof.workspaceId !== input.workspaceId
    || proof.generation !== input.generation || proof.lifecycleVersion !== manifest.lifecycleVersion || proof.headSeq !== manifest.headSeq
    || proof.headHash !== manifest.headHash || proof.checkpointHash !== manifest.checkpointHash || proof.rosterHash !== manifest.rosterHash
    || proof.retrieveUntil !== manifest.retrieveUntil || proof.proofKind !== manifest.proofKind || proof.deviceId !== manifest.deviceId
    || result.rosterPage.afterRosterVersion !== 0 || result.rosterPage.nextAfterRosterVersion !== result.rosterPage.rosters.length
    || result.rosterPage.done !== (result.rosterPage.nextAfterRosterVersion === manifest.rosterVersion)
    || result.rosterPage.rosters.length === 0 || result.rosterPage.rosters.some((row, index) => row.version !== index + 1
      || row.roster.version !== row.version || row.roster.workspaceId !== input.workspaceId
      || row.bodyHash !== sha256(canonicalJson(row.roster)))) dataFailure('integrity_failure')
  return result
}
