/**
 * [INPUT]: Sync actions from the settings pane.
 * [OUTPUT]: A status snapshot, including whether a ready workspace is exchanging right now. The sync password is never returned.
 * [POS]: Preload boundary for desktop sync. The renderer imports the types and does not bundle this schema.
 */
import { z } from 'zod'

export const syncChannel = 'goalloom:sync'
export const syncEvent = 'goalloom:sync-state'

export const syncPhases = ['unconfigured', 'locked', 'signed-out', 'signing-in', 'setup', 'enter-key', 'choose', 'ready'] as const
export const syncErrors = ['network', 'password', 'auth', 'key', 'mismatch', 'busy', 'port', 'storage'] as const

export const syncStatusSchema = z.strictObject({
  phase: z.enum(syncPhases),
  email: z.string().nullable(),
  pending: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  paused: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  error: z.enum(syncErrors).nullable(),
  localItems: z.number().int().nonnegative(),
  offline: z.boolean(),
  syncing: z.boolean(),
})

const password = z.string().max(128)

export const syncActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status') }),
  z.strictObject({ type: z.literal('sign-in') }),
  z.strictObject({ type: z.literal('sign-out') }),
  z.strictObject({ type: z.literal('create'), password }),
  z.strictObject({ type: z.literal('cancel') }),
  z.strictObject({ type: z.literal('submit-password'), password }),
  z.strictObject({ type: z.literal('change-password'), password }),
  z.strictObject({ type: z.literal('reset-sync'), password }),
  z.strictObject({ type: z.literal('join'), choice: z.enum(['use-remote', 'merge']), acknowledged: z.boolean() }),
  z.strictObject({ type: z.literal('retry') }),
])

export const syncReplySchema = z.strictObject({
  status: syncStatusSchema,
})

export type SyncStatus = z.infer<typeof syncStatusSchema>
export type SyncAction = z.infer<typeof syncActionSchema>
export type SyncReply = z.infer<typeof syncReplySchema>
