/**
 * [INPUT]: Sync actions from the settings pane.
 * [OUTPUT]: A status snapshot. The recovery phrase is returned only by prepare, never by the polled status.
 * [POS]: Preload boundary for desktop sync. The renderer imports the types and does not bundle this schema.
 */
import { z } from 'zod'

export const syncChannel = 'goalloom:sync'
export const syncEvent = 'goalloom:sync-state'

export const syncPhases = ['unconfigured', 'locked', 'signed-out', 'signing-in', 'setup', 'confirm', 'enter-key', 'choose', 'ready'] as const
export const syncErrors = ['network', 'phrase', 'auth', 'key', 'mismatch', 'busy', 'port', 'storage'] as const

export const syncStatusSchema = z.strictObject({
  phase: z.enum(syncPhases),
  email: z.string().nullable(),
  pending: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  paused: z.string().nullable(),
  lastSyncedAt: z.string().nullable(),
  error: z.enum(syncErrors).nullable(),
  localItems: z.number().int().nonnegative(),
  checks: z.array(z.number().int().min(1).max(24)).nullable(),
  offline: z.boolean(),
})

export const syncActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status') }),
  z.strictObject({ type: z.literal('sign-in') }),
  z.strictObject({ type: z.literal('sign-out') }),
  z.strictObject({ type: z.literal('prepare') }),
  z.strictObject({ type: z.literal('copy') }),
  z.strictObject({ type: z.literal('confirm'), words: z.array(z.string().max(32)).length(3) }),
  z.strictObject({ type: z.literal('cancel') }),
  z.strictObject({ type: z.literal('submit-phrase'), phrase: z.string().max(400) }),
  z.strictObject({ type: z.literal('join'), choice: z.enum(['use-remote', 'merge']), acknowledged: z.boolean() }),
])

export const syncReplySchema = z.strictObject({
  status: syncStatusSchema,
  phrase: z.string().nullable(),
})

export type SyncStatus = z.infer<typeof syncStatusSchema>
export type SyncAction = z.infer<typeof syncActionSchema>
export type SyncReply = z.infer<typeof syncReplySchema>
