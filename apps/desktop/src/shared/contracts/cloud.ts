/**
 * [INPUT]: Renderer-owned finite privacy/retrieval intent and main-owned non-secret results.
 * [OUTPUT]: Narrow cloud IPC DTOs; no paths, tokens, keys, ciphertext or generic worker dispatch.
 * [POS]: Desktop cloud Settings/read-only-copy boundary. Network ownership stays in main.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { cloudTargetSchema, deletionProgressSchema, generationViewSchema, preparedDeleteSchema } from '@goalloom/contracts'
import { dataReplySchema } from './transfer'

export const cloudChannel = 'goalloom:cloud'
const account = { expectedAccountId: z.uuid() }
export const copyArtifactSchema = z.strictObject({ artifactId: z.uuid(), target: cloudTargetSchema,
  environment: z.enum(['development', 'production']), projectRef: z.string(), lifecycleVersion: z.number().int().positive(),
  manifestHash: z.string().regex(/^[0-9a-f]{64}$/), headSeq: z.number().int().nonnegative(), verifiedAt: z.string(),
  historyMode: z.literal('baseline'), counts: z.strictObject({ items: z.number().int().nonnegative(), relations: z.number().int().nonnegative(), periods: z.number().int().nonnegative(), guidance: z.number().int().nonnegative() }),
})
export type CopyArtifact = z.infer<typeof copyArtifactSchema>
export const cloudActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status') }),
  z.strictObject({ type: z.literal('refresh'), ...account }),
  z.strictObject({ type: z.literal('prepare'), ...account, scope: z.enum(['cloud', 'account']), target: cloudTargetSchema.nullable(), expectedRevision: z.number().int().nonnegative() }),
  z.strictObject({ type: z.literal('confirm'), ...account, requestId: z.uuid(), acknowledge: z.literal(true) }),
  z.strictObject({ type: z.literal('cancel-preparation'), ...account, requestId: z.uuid() }),
  z.strictObject({ type: z.literal('receipt'), requestId: z.uuid() }),
  z.strictObject({ type: z.literal('acknowledge'), requestId: z.uuid() }),
  z.strictObject({ type: z.literal('dismiss'), ...account, target: cloudTargetSchema, stage: z.enum(['ended', 'week', 'cutoff', 'deleted']) }),
  z.strictObject({ type: z.literal('cancel-retrieval'), ...account }),
  z.strictObject({ type: z.literal('retrieve'), ...account, target: cloudTargetSchema, password: z.string().min(8).max(128) }),
  z.strictObject({ type: z.literal('inspect'), artifactId: z.uuid(), offset: z.number().int().nonnegative(), limit: z.number().int().min(1).max(100) }),
  z.strictObject({ type: z.literal('export'), artifactId: z.uuid(), format: z.enum(['json', 'sqlite']) }),
  z.strictObject({ type: z.literal('replace'), artifactId: z.uuid(), generation: z.uuid() }),
])
export type CloudAction = z.infer<typeof cloudActionSchema>
export const cloudStateSchema = z.strictObject({
  accountId: z.uuid().nullable(), accountRevision: z.number().int().nonnegative(), serverNow: z.string().nullable(),
  entries: z.array(generationViewSchema).max(1024), canCreateCloud: z.boolean(),
  pendingReceipts: z.array(z.strictObject({ requestId: z.uuid(), confirmationSent: z.boolean() })).max(100),
  prepared: preparedDeleteSchema.nullable(), progress: z.array(deletionProgressSchema).max(100), copies: z.array(copyArtifactSchema).max(100),
  notices: z.array(z.strictObject({ target: cloudTargetSchema, stage: z.enum(['ended', 'week', 'cutoff', 'deleted']), retrieveUntil: z.string().nullable() })).max(1024),
  error: z.string().max(80).nullable(),
})
export type CloudState = z.infer<typeof cloudStateSchema>
export const cloudReplySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('state'), state: cloudStateSchema }),
  z.strictObject({ type: z.literal('copy'), artifact: copyArtifactSchema }),
  z.strictObject({ type: z.literal('saved'), saved: z.boolean() }),
  z.strictObject({ type: z.literal('preview'), reply: dataReplySchema }),
  z.strictObject({ type: z.literal('items'), total: z.number().int().nonnegative(), items: z.array(z.strictObject({ id: z.string(), title: z.string(), description: z.string(), status: z.enum(['todo', 'done', 'cancelled']), horizon: z.string(), archived: z.boolean(), deleted: z.boolean() })).max(100) }),
])
export type CloudReply = z.infer<typeof cloudReplySchema>
