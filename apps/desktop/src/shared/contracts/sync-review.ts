/**
 * [INPUT]: Task-grouped conflict metadata from the storage worker.
 * [OUTPUT]: Bounded read-only comparisons and an owned-value preview token.
 * [POS]: Sync review IPC contract; no renderer-supplied task fields can be written.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { dateSchema, flowColorSchema, horizonSchema, idSchema, statusSchema } from './entities'

export const syncReviewSnapshotSchema = z.strictObject({
  id: idSchema, title: z.string().max(500), description: z.string().max(100_000), dueDate: dateSchema.nullable(),
  status: statusSchema, deleted: z.boolean(), missing: z.boolean(), archived: z.boolean(), flowColors: z.array(flowColorSchema).max(8),
  horizon: horizonSchema, periodStart: dateSchema.nullable(), periodEnd: dateSchema.nullable(),
  parents: z.array(z.string().max(500)).max(500),
})
export const syncReviewSchema = z.strictObject({
  itemId: idSchema, token: z.string().regex(/^[a-f0-9]{64}$/),
  local: syncReviewSnapshotSchema, current: syncReviewSnapshotSchema,
  canUseLocal: z.boolean(), reason: z.enum(['changed', 'deleted', 'relation', 'placement', 'missing']),
})
export const syncReviewPageSchema = z.strictObject({
  generation: idSchema, remaining: z.number().int().nonnegative(), review: syncReviewSchema.nullable(),
})
export type SyncReviewSnapshot = z.infer<typeof syncReviewSnapshotSchema>
export type SyncReview = z.infer<typeof syncReviewSchema>
export type SyncReviewPage = z.infer<typeof syncReviewPageSchema>
