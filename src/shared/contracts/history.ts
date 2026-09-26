/**
 * [INPUT]: Body-free business events and current item summaries.
 * [OUTPUT]: Strict activity pages, read-only period history DTOs with per-outcome summary, and the past-period index.
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
const count = z.number().int().nonnegative()
export const historyOutcomeSchema = z.enum(['done', 'open', 'moved', 'cancelled', 'unknown'])
export const historyPageSchema = z.strictObject({
  // previous is null once no earlier period of this scale was ever materialised in the workspace.
  period: periodSchema, previous: periodSchema.nullable(), next: periodSchema,
  total: count, summary: z.record(historyOutcomeSchema, count),
  rows: z.array(z.strictObject({ item: itemSummarySchema, endState: businessStateSchema.nullable(), outcome: historyOutcomeSchema, later: z.array(eventSchema), laterCount: count, anomalous: z.boolean() })),
})
export const historyIndexSchema = z.strictObject({ periods: z.array(z.strictObject({ period: periodSchema, total: count, done: count })) })
export type HistoryPage = z.infer<typeof historyPageSchema>
export type HistoryIndex = z.infer<typeof historyIndexSchema>
export type HistoryOutcome = z.infer<typeof historyOutcomeSchema>
export type Activity = z.infer<typeof activitySchema>
