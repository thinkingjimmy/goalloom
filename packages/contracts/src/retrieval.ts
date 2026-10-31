/**
 * [INPUT]: Untrusted version-1 cloud metadata and fixed server identities.
 * [OUTPUT]: Strict finite DTOs with canonical identities, bounds and unchanged signed timestamps.
 * [POS]: Shared cloud boundary; no transport, credentials or storage side effects.
 */
import { z } from 'zod'
import { cloudEnvironment, cloudHex, cloudInstant, cloudInteger, cloudPositive, cloudProject, cloudUuid } from './cloud'

export const retrievalLimits = { responseBytes: 4_194_304, requestBytes: 2_048, rosterBytes: 65_536, checkpointBytes: 4_096, envelopeBytes: 65_536, rosters: 64, operations: 200 } as const
export const retrievalInitializationSchema = z.strictObject({ requestId: cloudUuid, creatorDeviceId: cloudUuid, finalOpId: cloudUuid, finalPayloadHash: cloudHex(32), finalSeq: cloudPositive })
export const retrievalProofSchema = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('recovery') }), z.strictObject({ kind: z.literal('device'), deviceId: cloudUuid })])
export const retrievalBootstrapSchema = z.union([
  z.strictObject({ version: z.literal(1), workspaceId: cloudUuid, generation: cloudUuid, proof: retrievalProofSchema }),
  z.strictObject({ version: z.literal(1), challengeId: cloudUuid, afterRosterVersion: cloudInteger }),
])
export const retrievalAuthorizeSchema = z.strictObject({ version: z.literal(1), challengeId: cloudUuid, signature: cloudHex(64) })
export const retrievalReadSchema = z.strictObject({ version: z.literal(1), capability: cloudHex(32), afterSeq: cloudInteger })
export const retrievalManifestSchema = z.strictObject({
  version: z.literal(1), purpose: z.literal('retained-copy'), environment: cloudEnvironment, projectRef: cloudProject,
  workspaceId: cloudUuid, generation: cloudUuid, lifecycleVersion: cloudPositive, accessEndedAt: cloudInstant, retrieveUntil: cloudInstant,
  headSeq: cloudInteger, minRetainedSeq: z.literal(0), operationCount: cloudInteger, headHash: cloudHex(32), keyEpoch: z.literal(1),
  checkpointVersion: z.literal(1), checkpointHash: cloudHex(32), rosterVersion: cloudPositive, rosterHash: cloudHex(32), recoveryKeyId: cloudHex(32),
  envelopeSetHash: cloudHex(32), proofKind: z.enum(['recovery', 'device']), deviceId: cloudUuid.nullable(), initialization: retrievalInitializationSchema.nullable(),
}).refine(value => value.operationCount === value.headSeq && (value.proofKind === 'recovery') === (value.deviceId === null)
  && (!value.initialization || value.initialization.finalSeq <= value.headSeq))
export const retrievalProofBodySchema = z.strictObject({
  version: z.literal(1), purpose: z.literal('retained-copy'), environment: cloudEnvironment, projectRef: cloudProject,
  ownerId: cloudUuid, authSessionId: cloudUuid, challengeId: cloudUuid, nonce: cloudHex(32), manifestHash: cloudHex(32),
  workspaceId: cloudUuid, generation: cloudUuid, lifecycleVersion: cloudPositive, headSeq: cloudInteger, headHash: cloudHex(32),
  checkpointHash: cloudHex(32), rosterHash: cloudHex(32), retrieveUntil: cloudInstant, challengeExpiresAt: cloudInstant,
  proofKind: z.enum(['recovery', 'device']), deviceId: cloudUuid.nullable(),
}).refine(value => (value.proofKind === 'recovery') === (value.deviceId === null))
export const cloudRosterBodySchema = z.strictObject({ workspaceId: cloudUuid, version: cloudPositive, epoch: cloudPositive, prevHash: cloudHex(32).nullable(),
  devices: z.array(z.strictObject({ id: cloudUuid, signPub: cloudHex(32), boxPub: cloudHex(32) })).min(1), recoverySignPub: cloudHex(32), recoveryBoxPub: cloudHex(32) })
export const cloudRosterWireSchema = z.strictObject({ version: cloudPositive, roster: cloudRosterBodySchema, bodyHash: cloudHex(32), signature: cloudHex(64), signerType: z.enum(['device', 'recovery']), signerDevice: cloudUuid.nullable() })
export const cloudCheckpointBodySchema = z.strictObject({ workspaceId: cloudUuid, cpVersion: cloudPositive, rosterVersion: cloudPositive, rosterHash: cloudHex(32), epoch: cloudPositive, recoverySignPub: cloudHex(32), recoveryBoxPub: cloudHex(32), prevCpHash: cloudHex(32).nullable() })
export const cloudCheckpointWireSchema = z.strictObject({ cpVersion: cloudPositive, body: cloudCheckpointBodySchema, recSig: cloudHex(64), devSig: cloudHex(64) })
export const cloudEnvelopeWireSchema = z.strictObject({ epoch: cloudPositive, recipient: z.string(), ciphertext: z.string().min(2).max(retrievalLimits.envelopeBytes * 2).regex(/^(?:[0-9a-f]{2})+$/), signature: cloudHex(64), rosterVersion: cloudPositive, signerDevice: cloudUuid.nullable() })
export const cloudPullWireSchema = z.strictObject({ seq: cloudPositive, opId: cloudUuid, payloadHash: cloudHex(32), formatVersion: z.literal(1), keyEpoch: z.literal(1), ciphertext: z.string().min(2).max(2_097_152).regex(/^(?:[0-9a-f]{2})+$/) })
export const retrievalRecoveryBodySchema = z.strictObject({ v: z.literal(2), kdf: z.strictObject({ alg: z.literal('argon2id'), salt: cloudHex(16), m: cloudInteger.refine(value => value >= 8192 && value <= 65536), t: cloudInteger.refine(value => value >= 1 && value <= 4), p: z.literal(1) }), lock: cloudHex(104),
  wrap: z.strictObject({ v: z.literal(1), ctx: z.string(), senderId: cloudUuid, recipientId: z.literal('recovery'), ephPub: cloudHex(32), nonce: cloudHex(24), ct: cloudHex(48), sig: cloudHex(64) }) })
const rosterPage = z.strictObject({ afterRosterVersion: cloudInteger, nextAfterRosterVersion: cloudInteger, rosters: z.array(cloudRosterWireSchema).max(retrievalLimits.rosters), done: z.boolean() })
const common = { ok: z.literal(true), version: z.literal(1), serverNow: cloudInstant }
export const retrievalChallengeSchema = z.strictObject({ ...common, kind: z.literal('challenge'), manifest: retrievalManifestSchema, manifestHash: cloudHex(32), checkpoint: cloudCheckpointWireSchema, recoveryEnvelope: cloudEnvelopeWireSchema, proofBody: retrievalProofBodySchema, rosterPage })
export const retrievalControlSchema = z.strictObject({ ...common, kind: z.literal('control'), challengeId: cloudUuid, manifestHash: cloudHex(32), rosterPage })
export const retrievalAuthorizedSchema = z.strictObject({ ...common, capability: cloudHex(32), manifestHash: cloudHex(32), expiresAt: cloudInstant })
export const retrievalOperationsSchema = z.strictObject({ ...common, manifestHash: cloudHex(32), afterSeq: cloudInteger, nextAfterSeq: cloudInteger, operations: z.array(cloudPullWireSchema).max(retrievalLimits.operations), done: z.boolean() })
export type RetrievalManifest = z.infer<typeof retrievalManifestSchema>
export type RetrievalProofBody = z.infer<typeof retrievalProofBodySchema>
export type RetrievalBootstrap = z.infer<typeof retrievalBootstrapSchema>
export type RetrievalChallenge = z.infer<typeof retrievalChallengeSchema>
export type RetrievalControl = z.infer<typeof retrievalControlSchema>
export type RetrievalAuthorized = z.infer<typeof retrievalAuthorizedSchema>
export type RetrievalOperations = z.infer<typeof retrievalOperationsSchema>
export type RetrievalAuthorize = z.infer<typeof retrievalAuthorizeSchema>
export type RetrievalRead = z.infer<typeof retrievalReadSchema>
