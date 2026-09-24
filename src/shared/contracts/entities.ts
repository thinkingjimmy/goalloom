/**
 * [INPUT]: Zod and date/calendar wire validation.
 * [OUTPUT]: Strict workspace, item summary/detail, placement, relation and period DTOs.
 * [POS]: Persistence, IPC and import schemas without Electron dependencies.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { measureDate } from './validation-metrics'
import { z } from 'zod'
import { validDate, validTimezone } from './wire-calendar'
import { validationText } from '../i18n/validation'

export const idSchema = z.string().min(1).max(180).regex(/^[a-zA-Z0-9:_-]+$/)
export const dateSchema = z.string().refine(value => measureDate(() => validDate(value)), { error: () => validationText().invalidDate })
export const instantSchema = z.iso.datetime({ offset: true })
export const horizonSchema = z.enum(['later', 'cycle', 'month', 'week', 'day'])
export const periodHorizonSchema = z.enum(['cycle', 'month', 'week', 'day'])
export const statusSchema = z.enum(['todo', 'done', 'cancelled'])
// Fixed palette index owned by a flow root; schema v1 data has no field and reads as null.
export const flowColorSchema = z.number().int().min(0).max(7)
export const calendarSchema = z.strictObject({ id: idSchema, timezone: z.string().max(100), weekStart: z.number().int().min(1).max(7), cycleAnchor: dateSchema })
  .refine(value => measureDate(() => validTimezone(value.timezone)), { error: () => validationText().invalidCalendarConfig })
export const periodSchema = z.strictObject({
  id: idSchema, horizon: periodHorizonSchema, startDate: dateSchema, endDate: dateSchema,
  startAt: instantSchema, endAt: instantSchema,
})
export const itemRecordSchema = z.strictObject({
  id: idSchema, title: z.string().trim().min(1).max(500), description: z.string().max(100_000), dueDate: dateSchema.nullable(),
  status: statusSchema, completedAt: instantSchema.nullable(), cancelledAt: instantSchema.nullable(),
  archivedAt: instantSchema.nullable(), deletedAt: instantSchema.nullable(), deletedBy: idSchema.nullable(),
  createdAt: instantSchema, updatedAt: instantSchema, version: z.number().int().positive(),
  flowColor: flowColorSchema.nullable().default(null),
})
export const placementSchema = z.strictObject({
  itemId: idSchema, horizon: horizonSchema, periodId: idSchema.nullable(), sortKey: z.number().finite(),
  version: z.number().int().positive(), holdPeriodId: idSchema.nullable(),
})
export const itemSchema = itemRecordSchema.extend({ placement: placementSchema })
export const itemSummarySchema = itemRecordSchema.omit({ description: true }).extend({ hasDescription: z.boolean(), placement: placementSchema })
export type ItemSummary = z.infer<typeof itemSummarySchema>
export const relationSchema = z.strictObject({
  id: idSchema, parentId: idSchema, childId: idSchema, invalidatedAt: instantSchema.nullable(),
  invalidatedBy: idSchema.nullable(), reason: z.enum(['unlink', 'delete']).nullable(), createdAt: instantSchema,
})
export const policySchema = z.strictObject({
  horizon: periodHorizonSchema, mode: z.enum(['auto', 'manual']), version: z.number().int().positive(), effectiveFromPeriodId: idSchema,
})
export const themeSchema = z.enum(['system', 'light', 'dark'])
// Pre-v4 databases and datasets carry no style column; they keep the default paper look.
export const styleSchema = z.enum(['paper', 'minimal']).default('paper')
// Pre-v5 databases and datasets carry no checkbox style; they get the outline default.
export const checkStyleSchema = z.enum(['outline', 'paper', 'tint']).default('outline')
export const workspaceSchema = z.strictObject({
  generation: idSchema, calendar: calendarSchema.nullable(), setupConfirmedAt: instantSchema.nullable(),
  pausedAfterRestore: z.boolean(), revision: z.number().int().nonnegative(), lastObservedAt: instantSchema.nullable(),
  clockAnomaly: z.boolean(), theme: themeSchema, style: styleSchema, checkStyle: checkStyleSchema, backupEnabled: z.boolean(), backupRetention: z.number().int().min(1).max(100),
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
