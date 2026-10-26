/**
 * [INPUT]: Untrusted version-1 cloud metadata and fixed server identities.
 * [OUTPUT]: Strict finite DTOs with identity-free deleted initialization, live initialization guards and unchanged signed timestamps.
 * [POS]: Shared cloud boundary; no transport, credentials or storage side effects.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { cloudEnvironment, cloudHex, cloudInstant, cloudInteger, cloudPositive, cloudProject, cloudTargetSchema, cloudUuid } from './cloud'

const initialization = z.union([
  z.strictObject({ state: z.literal('not_applicable') }),
  z.strictObject({ state: z.literal('not_seeded') }),
  z.strictObject({ state: z.enum(['preparing', 'final_received', 'complete']), initializationId: cloudUuid }),
])
const state = z.enum(['active', 'retained', 'closed', 'deleting', 'deleted'])
export const generationViewSchema = z.strictObject({
  state, target: cloudTargetSchema, lifecycleVersion: cloudPositive,
  reason: z.enum(['ordinary_expiry', 'explicit_cloud', 'account_delete', 'reset_sync']).nullable(),
  scheduledAccessEnd: cloudInstant.nullable(), accessEndedAt: cloudInstant.nullable(), retrieveUntil: cloudInstant.nullable(),
  closedAt: cloudInstant.nullable(), onlineDeleteBy: cloudInstant.nullable(), onlineDeletedAt: cloudInstant.nullable(),
  retrievalWindowOpen: z.boolean(), newCreateRequired: z.boolean(), initialization,
}).refine(value => (value.state === 'deleted') === (value.initialization.state === 'not_applicable'), {
  path: ['initialization'], message: 'Initialization must match the generation state',
})
export type GenerationView = z.infer<typeof generationViewSchema>
const cursor = cloudTargetSchema.extend({ accountRevision: cloudInteger })
export const lifecycleStatusRequestSchema = z.strictObject({ version: z.literal(1), query: z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('discover'), after: cursor.nullable() }),
  z.strictObject({ kind: z.literal('generation'), target: cloudTargetSchema }),
]) })
export const lifecycleStatusReplySchema = z.strictObject({
  ok: z.literal(true), version: z.literal(1), environment: cloudEnvironment, projectRef: cloudProject,
  serverNow: cloudInstant, accountRevision: cloudInteger, canCreateCloud: z.boolean(),
  entries: z.array(z.union([generationViewSchema, z.strictObject({ state: z.literal('none'), newCreateRequired: z.literal(true) })])).max(32),
  nextAfter: cursor.nullable(),
})
export type LifecycleStatusRequest = z.infer<typeof lifecycleStatusRequestSchema>
export type LifecycleStatusReply = z.infer<typeof lifecycleStatusReplySchema>
export const finishInitializationSchema = z.strictObject({
  version: z.literal(1), requestId: cloudUuid, target: cloudTargetSchema, creatorDeviceId: cloudUuid,
  finalOpId: cloudUuid, finalPayloadHash: cloudHex(32), finalSeq: cloudPositive,
})
export const initializationReceiptSchema = z.strictObject({
  ok: z.literal(true), version: z.literal(1), serverNow: cloudInstant, requestId: cloudUuid,
  target: cloudTargetSchema, finalOpId: cloudUuid, finalPayloadHash: cloudHex(32), finalSeq: cloudPositive,
  completedAt: cloudInstant, initialization: z.literal('complete'), lifecycleVersion: cloudPositive, lifecycleState: state,
})
export type FinishInitialization = z.infer<typeof finishInitializationSchema>
export type InitializationReceipt = z.infer<typeof initializationReceiptSchema>
const scope = z.enum(['cloud', 'account'])
export const prepareDeleteSchema = z.strictObject({
  version: z.literal(1), requestId: cloudUuid, scope, target: cloudTargetSchema.nullable(),
  expectedRevision: cloudInteger, receiptDigest: cloudHex(32),
}).refine(value => (value.scope === 'account') === (value.target === null))
export const preparedDeleteSchema = z.strictObject({
  version: z.literal(1), requestId: cloudUuid, scope, preparedAt: cloudInstant, prepareExpiresAt: cloudInstant, serverNow: cloudInstant,
})
export const confirmDeleteSchema = z.strictObject({ version: z.literal(1), requestId: cloudUuid, expectedRevision: cloudInteger, acknowledge: z.literal(true) })
export const readDeleteReceiptSchema = z.strictObject({ version: z.literal(1), environment: cloudEnvironment, requestId: cloudUuid, secret: cloudHex(32) })
export const deletionProgressSchema = z.strictObject({
  version: z.literal(1), requestId: cloudUuid, scope, serverNow: cloudInstant, accepted: z.boolean(),
  confirmedAt: cloudInstant.nullable(), onlineDeleteBy: cloudInstant.nullable(), statusExpiresAt: cloudInstant,
  intent: z.enum(['not_started', 'pending', 'durable']), content: z.enum(['not_started', 'pending', 'deleting', 'deleted']),
  auth: z.enum(['not_applicable', 'not_started', 'pending', 'deleted']),
  renewal: z.enum(['not_applicable', 'not_started', 'pending', 'stopped', 'attention_required']),
})
export type PrepareDelete = z.infer<typeof prepareDeleteSchema>
export type PreparedDelete = z.infer<typeof preparedDeleteSchema>
export type ConfirmDelete = z.infer<typeof confirmDeleteSchema>
export type ReadDeleteReceipt = z.infer<typeof readDeleteReceiptSchema>
export type DeletionProgress = z.infer<typeof deletionProgressSchema>
