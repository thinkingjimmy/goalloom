/**
 * [INPUT]: zod 与纯日历校验。
 * [OUTPUT]: 工作区/条目/位置/多父 DAG 边/周期的严格 schema 和 DTO。
 * [POS]: 持久化、IPC、导入的共同数据契约；无 Electron 依赖。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { z } from 'zod'
import { parseDate, validateCalendar } from '../../domain/calendar'

export const idSchema = z.string().min(1).max(180).regex(/^[a-zA-Z0-9:_-]+$/)
export const dateSchema = z.string().refine(value => { try { parseDate(value); return true } catch { return false } }, '日期无效')
export const instantSchema = z.iso.datetime({ offset: true })
export const horizonSchema = z.enum(['later', 'cycle', 'month', 'week', 'day'])
export const periodHorizonSchema = z.enum(['cycle', 'month', 'week', 'day'])
export const statusSchema = z.enum(['todo', 'done', 'cancelled'])
export const calendarSchema = z.strictObject({ id: idSchema, timezone: z.string().max(100), weekStart: z.number().int().min(1).max(7), cycleAnchor: dateSchema })
  .refine(value => { try { validateCalendar(value); return true } catch { return false } }, '日历配置无效')
export const periodSchema = z.strictObject({
  id: idSchema, horizon: periodHorizonSchema, startDate: dateSchema, endDate: dateSchema,
  startAt: instantSchema, endAt: instantSchema,
})
export const itemRecordSchema = z.strictObject({
  id: idSchema, title: z.string().trim().min(1).max(500), description: z.string().max(100_000), dueDate: dateSchema.nullable(),
  status: statusSchema, completedAt: instantSchema.nullable(), cancelledAt: instantSchema.nullable(),
  archivedAt: instantSchema.nullable(), deletedAt: instantSchema.nullable(), deletedBy: idSchema.nullable(),
  createdAt: instantSchema, updatedAt: instantSchema, version: z.number().int().positive(),
})
export const placementSchema = z.strictObject({
  itemId: idSchema, horizon: horizonSchema, periodId: idSchema.nullable(), sortKey: z.number().finite(),
  version: z.number().int().positive(), holdPeriodId: idSchema.nullable(),
})
export const itemSchema = itemRecordSchema.extend({ placement: placementSchema })
export const relationSchema = z.strictObject({
  id: idSchema, parentId: idSchema, childId: idSchema, invalidatedAt: instantSchema.nullable(),
  invalidatedBy: idSchema.nullable(), reason: z.enum(['unlink', 'delete']).nullable(), createdAt: instantSchema,
})
export const policySchema = z.strictObject({
  horizon: periodHorizonSchema, mode: z.enum(['auto', 'manual']), version: z.number().int().positive(), effectiveFromPeriodId: idSchema,
})
export const workspaceSchema = z.strictObject({
  generation: idSchema, calendar: calendarSchema.nullable(), setupConfirmedAt: instantSchema.nullable(),
  pausedAfterRestore: z.boolean(), revision: z.number().int().nonnegative(), lastObservedAt: instantSchema.nullable(),
  clockAnomaly: z.boolean(), theme: z.enum(['system', 'light', 'dark']), backupEnabled: z.boolean(), backupRetention: z.number().int().min(1).max(100),
})
export type CalendarConfig = z.infer<typeof calendarSchema>
export type PlanningPeriod = z.infer<typeof periodSchema>
export type ItemRecord = z.infer<typeof itemRecordSchema>
export type Placement = z.infer<typeof placementSchema>
export type Item = z.infer<typeof itemSchema>
export type Relation = z.infer<typeof relationSchema>
export type Workspace = z.infer<typeof workspaceSchema>
export type Policy = z.infer<typeof policySchema>
export type ItemHorizon = z.infer<typeof horizonSchema>
export const horizons: ItemHorizon[] = ['later', 'cycle', 'month', 'week', 'day']
