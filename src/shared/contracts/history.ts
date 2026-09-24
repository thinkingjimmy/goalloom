/**
 * [INPUT]: Body-free business events and current item summaries.
 * [OUTPUT]: Strict activity pages and read-only period history DTOs.
 * [POS]: History/import boundary separating historical state from current content.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { horizonSchema, idSchema, itemSummarySchema, periodSchema, statusSchema, instantSchema } from './entities'
export const businessStateSchema = z.strictObject({
  status: statusSchema, completedAt: instantSchema.nullable(), cancelledAt: instantSchema.nullable(),
  archivedAt: instantSchema.nullable(), deletedAt: instantSchema.nullable(), deletedBy: idSchema.nullable(),
  version: z.number().int().positive(), horizon: horizonSchema, periodId: idSchema.nullable(),
  sortKey: z.number().finite(), holdPeriodId: idSchema.nullable(),
})
export const eventSchema = z.strictObject({
  seq: z.number().int().positive(), id: idSchema, operationId: idSchema, eventIndex: z.number().int().nonnegative(), itemId: idSchema,
  at: instantSchema, type: z.enum(['created', 'baseline', 'moved', 'rolled_over', 'status_changed', 'archived', 'unarchived', 'deleted', 'item_restored', 'undo']),
  before: businessStateSchema.nullable(), after: businessStateSchema, undoOf: idSchema.nullable(),
})
export const activitySchema = z.strictObject({ events: z.array(eventSchema), more: z.boolean() })
export const historyPageSchema = z.strictObject({
  period: periodSchema, previous: periodSchema.nullable(), next: periodSchema,
  total: z.number().int().nonnegative(),
  rows: z.array(z.strictObject({ item: itemSummarySchema, endState: businessStateSchema.nullable(), later: z.array(eventSchema), laterCount: z.number().int().nonnegative(), anomalous: z.boolean() })),
})
export type HistoryPage = z.infer<typeof historyPageSchema>
export type Activity = z.infer<typeof activitySchema>
