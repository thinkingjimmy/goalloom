/**
 * [INPUT]: 不含正文的业务事件和当前条目 DTO。
 * [OUTPUT]: 活动分页与只读周期历史 schema。
 * [POS]: 共享历史/导入边界，期末状态与当前内容分离。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { z } from 'zod'
import { horizonSchema, idSchema, itemSchema, periodSchema, statusSchema, instantSchema } from './entities'
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
  rows: z.array(z.strictObject({ item: itemSchema, endState: businessStateSchema.nullable(), later: z.array(eventSchema), laterCount: z.number().int().nonnegative(), anomalous: z.boolean() })),
})
export type HistoryPage = z.infer<typeof historyPageSchema>
export type Activity = z.infer<typeof activitySchema>
