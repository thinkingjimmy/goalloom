/**
 * [INPUT]: Authoritative event projections and bounded calendar/activity queries.
 * [OUTPUT]: Quality-bearing execution facts, pressure windows and frozen cursor pages.
 * [POS]: Read-only contract; the renderer and models cannot set pressure or invent facts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { dateSchema, horizonSchema, idSchema, instantSchema, periodHorizonSchema, periodSchema, statusSchema } from './entities'
import { eventSchema } from './history'
import { periodHorizons } from './values'

export const factQualitySchema = z.enum(['complete', 'partial', 'unknown', 'anomalous'])
export type FactQuality = z.infer<typeof factQualitySchema>
export const factSchema = <T extends z.ZodType>(value: T) => z.strictObject({ value: value.nullable(), quality: factQualitySchema, reason: z.string().max(200).nullable() })
export interface Fact<T> { value: T | null; quality: FactQuality; reason: string | null }
const count = z.number().int().nonnegative()
const sourceCountsSchema = z.strictObject({ user: count, system: count, unknown: count })
export const countBreakdownSchema = z.strictObject({ total: count, bySource: sourceCountsSchema, byHorizon: z.record(periodHorizonSchema, sourceCountsSchema) })
  .refine(value => value.total === Object.values(value.bySource).reduce((sum, n) => sum + n, 0)
    && Object.values(value.bySource).every((_, index) => Object.values(value.byHorizon).reduce((sum, group) => sum + Object.values(group)[index]!, 0) === Object.values(value.bySource)[index]))
export type CountBreakdown = z.infer<typeof countBreakdownSchema>
const pressureWindowSchema = z.strictObject({ startLocalDate: dateSchema, endLocalDateExclusive: dateSchema, distinctSourcePeriods: count, distinctOperationDates: count, thresholdMet: z.boolean() })
export const evidenceSchema = z.strictObject({
  eventId: idSchema, operationId: idSchema, category: z.enum(['carry_after_period', 'advance_reschedule', 'placement_change', 'state', 'guidance', 'other']),
  source: z.enum(['user', 'system', 'unknown']), at: instantSchema, effective: z.boolean().nullable(), fromPeriodId: idSchema.nullable(), toPeriodId: idSchema.nullable(),
  fromPeriod: periodSchema.nullable(), toPeriod: periodSchema.nullable(),
})
export type ExecutionEvidence = z.infer<typeof evidenceSchema>
export const executionFactsSchema = z.strictObject({
  calculationVersion: z.literal(1), itemId: idSchema, generation: idSchema, asOf: instantSchema, timezone: z.string().max(100), sourceRevision: z.string().max(180),
  coverage: z.strictObject({ quality: factQualitySchema, earliestKnownAt: instantSchema.nullable(), reasons: z.array(z.string().max(200)).max(12) }),
  current: z.strictObject({ quality: factQualitySchema, status: statusSchema, horizon: horizonSchema, periodId: idSchema.nullable(), dueDate: dateSchema.nullable(), archived: z.boolean(), deleted: z.boolean() }),
  createdAt: factSchema(instantSchema), createdAgeDays: factSchema(count), currentEpisode: factSchema(z.strictObject({ since: instantSchema, elapsedCalendarDays: count })),
  currentPlacement: factSchema(z.strictObject({ enteredAt: instantSchema, eligibleSince: instantSchema.nullable() })),
  carryovers: z.strictObject({ currentEpisode: factSchema(countBreakdownSchema), lifetime: factSchema(countBreakdownSchema) }),
  scheduleChanges: z.strictObject({ advanceReschedule: factSchema(countBreakdownSchema), otherPlacementChanges: factSchema(count) }),
  placementDurations: z.record(z.enum(periodHorizons), factSchema(z.number().finite().nonnegative())), deadlineNow: factSchema(z.strictObject({ overdueDays: count })),
  pressure: z.strictObject({ level: factSchema(z.enum(['normal', 'carryover', 'reconfirm', 'overdue'])),
    windows: z.strictObject({ day: factSchema(pressureWindowSchema), week: factSchema(pressureWindowSchema) }),
    suppression: factSchema(z.strictObject({ guidanceBoundary: z.strictObject({ eventSeq: count, at: instantSchema }).nullable(), hasNewSourcePeriod: z.boolean(), reconfirmationSuppressed: z.boolean() })),
  }), evidence: z.array(evidenceSchema).max(6),
})
export type ExecutionFacts = z.infer<typeof executionFactsSchema>
export const activityCursorSchema = z.strictObject({
  generation: idSchema, itemId: idSchema, sourceRevision: z.string().max(180), upperSeq: count, beforeSeq: count, asOf: instantSchema,
  selection: z.string().max(20),
})
export type ActivityCursor = z.infer<typeof activityCursorSchema>
export const activityReadSchema = z.strictObject({
  generation: idSchema, itemId: idSchema, cursor: activityCursorSchema.optional(), limit: z.number().int().min(1).max(100).default(50),
})
export const activityEntrySchema = z.strictObject({ event: eventSchema, evidence: evidenceSchema })
export const activityEntriesSchema = z.strictObject({
  generation: idSchema, itemId: idSchema, sourceRevision: z.string().max(180), asOf: instantSchema, selection: z.string().max(20),
  entries: z.array(activityEntrySchema).max(100), cursor: activityCursorSchema.nullable(),
})
export type ActivityEntries = z.infer<typeof activityEntriesSchema>
export const activityMonthSchema = z.strictObject({
  generation: idSchema, itemId: idSchema, sourceRevision: z.string().max(180), asOf: instantSchema, month: dateSchema,
  dates: z.array(z.strictObject({ date: dateSchema, total: count, categories: z.array(evidenceSchema.shape.category).max(6) })).max(31),
})
export type ActivityMonth = z.infer<typeof activityMonthSchema>
