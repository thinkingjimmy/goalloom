/**
 * [INPUT]: Explicit account-only login and sync actions from setup/settings.
 * [OUTPUT]: Strict lifecycle/review actions, bounded comparison replies and status including password-storage, Realtime and upload-wait metadata. Passwords are never returned.
 * [POS]: Preload boundary for desktop sync. The renderer imports the types and does not bundle this schema.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { syncReviewPageSchema } from './sync-review'

export const syncChannel = 'goalloom:sync'
export const syncEvent = 'goalloom:sync-state'
export const authProviderSchema = z.enum(['google', 'apple'])
export type AuthProvider = z.infer<typeof authProviderSchema>

export const syncPhases = ['unconfigured', 'locked', 'signed-out', 'signing-in', 'account', 'setup', 'enter-key', 'choose', 'ready'] as const
export const syncErrors = ['network', 'password', 'auth', 'key', 'mismatch', 'busy', 'port', 'storage', 'cleanup', 'configuration'] as const

export const syncStatusSchema = z.strictObject({
  phase: z.enum(syncPhases),
  accountId: z.uuid().nullable().optional(),
  signingInProvider: authProviderSchema.optional(),
  email: z.string().nullable(),
  pending: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  paused: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  error: z.enum(syncErrors).nullable(),
  localItems: z.number().int().nonnegative(),
  offline: z.boolean(),
  syncing: z.boolean(),
  awaitingTasks: z.boolean().optional(),
  uploadWait: z.strictObject({ retryAt: z.iso.datetime(), reason: z.enum(['quota', 'network']) }).optional(),
  realtimeConnected: z.boolean().optional(),
  credentialStorage: z.literal('password').optional(),
})

const password = z.string().max(128)

export const syncActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status') }),
  z.strictObject({ type: z.literal('prepare-sync') }),
  z.strictObject({ type: z.literal('reviews'), generation: z.uuid() }),
  z.strictObject({ type: z.literal('sign-in'), provider: authProviderSchema, purpose: z.enum(['sync', 'ai']).optional() }),
  z.strictObject({ type: z.literal('sign-out'), clearLocal: z.boolean().optional() }),
  z.strictObject({ type: z.literal('create'), password }),
  z.strictObject({ type: z.literal('cancel') }),
  z.strictObject({ type: z.literal('submit-password'), password }),
  z.strictObject({ type: z.literal('change-password'), password }),
  z.strictObject({ type: z.literal('create-new-workspace'), password }),
  z.strictObject({ type: z.literal('reset-sync'), password, confirmation: z.literal('DELETE ALL CLOUD DATA') }),
  z.strictObject({ type: z.literal('join'), choice: z.enum(['use-remote', 'merge']), acknowledged: z.boolean() }),
  z.strictObject({ type: z.literal('retry') }),
])

export const syncReplySchema = z.strictObject({
  status: syncStatusSchema,
  reviews: syncReviewPageSchema.optional(),
})

export type SyncStatus = z.infer<typeof syncStatusSchema>
export type SyncAction = z.infer<typeof syncActionSchema>
export type SyncReply = z.infer<typeof syncReplySchema>
