/**
 * [INPUT]: Finite generation/item/date/cursor requests and bounded strict response schemas.
 * [OUTPUT]: Current/past summaries, optional guidance detail, execution facts and frozen activity/context reads.
 * [POS]: Read contract; only on-demand details/context carry bounded task bodies.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { dateSchema, flowColorSchema, horizonSchema, idSchema, instantSchema, itemSchema, itemSummarySchema, periodHorizonSchema, periodSchema, policySchema, relationSchema, workspaceSchema } from './entities'
import { periodHorizons } from './values'
import { guidanceRecordSchema } from './assistance'
import { activityReadSchema } from './execution'

export const querySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('executionSummary'), generation: idSchema, itemId: idSchema, cutoff: instantSchema.optional() }),
  z.strictObject({ type: z.literal('assistanceContext'), generation: idSchema, itemId: idSchema }),
  z.strictObject({ type: z.literal('insightTaskContext'), generation: idSchema, itemId: idSchema, cutoff: instantSchema.optional() }),
  z.strictObject({ type: z.literal('activityMonth'), generation: idSchema, itemId: idSchema, month: dateSchema }),
  activityReadSchema.extend({ type: z.literal('activityDay'), date: dateSchema }),
  activityReadSchema.extend({ type: z.literal('activityPage') }),
  z.strictObject({ type: z.literal('snapshot') }),
  z.strictObject({ type: z.literal('reviewContext'), generation: idSchema, periods: z.array(z.strictObject({ horizon: z.enum(['week', 'month']), startDate: dateSchema })).min(1).max(2) }),
  z.strictObject({ type: z.literal('boardPeriods'), generation: idSchema, periods: z.array(z.strictObject({ horizon: periodHorizonSchema, startDate: dateSchema })).min(1).max(periodHorizons.length) }),
  z.strictObject({ type: z.literal('item'), itemId: idSchema }),
  z.strictObject({ type: z.literal('list'), view: z.enum(['search', 'done', 'cancelled', 'archived', 'trash', 'backlog']), query: z.string().max(500).default(''), horizon: horizonSchema.optional(), offset: z.number().int().min(0).max(100_000).default(0), limit: z.number().int().min(1).max(100).default(50) }),
  z.strictObject({ type: z.literal('receipt'), operationId: idSchema, generation: idSchema }),
  z.strictObject({ type: z.literal('pastPeriod'), generation: idSchema, horizon: periodHorizonSchema, startDate: dateSchema, offset: z.number().int().min(0).max(100_000).default(0), limit: z.number().int().min(1).max(100).default(50) }),
  z.strictObject({ type: z.literal('history'), horizon: periodHorizonSchema, startDate: dateSchema, offset: z.number().int().min(0).max(100_000).default(0), limit: z.number().int().min(1).max(100).default(50) }),
  z.strictObject({ type: z.literal('historyIndex'), horizon: periodHorizonSchema }),
  z.strictObject({ type: z.literal('activity'), itemId: idSchema, beforeSeq: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).default(50) }),
  z.strictObject({ type: z.literal('batches') }),
  z.strictObject({ type: z.literal('batchItems'), operationId: idSchema, offset: z.number().int().min(0).max(100_000), limit: z.number().int().min(1).max(100) }),
  z.strictObject({ type: z.literal('counts') }),
  z.strictObject({ type: z.literal('backupSummary') }),
  z.strictObject({ type: z.literal('activitySummary'), itemId: idSchema }),
])
export type Query = z.infer<typeof querySchema>
export type ListView = Extract<Query, { type: 'list' }>['view']
export const relationViewSchema = relationSchema.extend({ parentTitle: z.string(), childTitle: z.string(), parentArchived: z.boolean(), childArchived: z.boolean() })
export const topologySchema = relationSchema.pick({ id: true, parentId: true, childId: true })
export const flowSchema = z.strictObject({ id: idSchema, title: z.string(), flowColor: flowColorSchema, archived: z.boolean() })
export const orderNodeSchema = z.strictObject({ id: idSchema, horizon: horizonSchema, periodId: idSchema.nullable(), sortKey: z.number().finite(), periodStart: dateSchema.nullable(), periodEnd: instantSchema.nullable() })
export type OrderNode = z.infer<typeof orderNodeSchema>
export const snapshotSchema = z.strictObject({
  workspace: workspaceSchema, periods: z.array(periodSchema), items: z.array(itemSummarySchema), relations: z.array(topologySchema), policies: z.array(policySchema),
  backlog: z.record(z.string(), z.number().int().nonnegative()), observedAt: z.string(), maintenance: z.boolean(), backupError: z.string().nullable(),
  rolloverSources: z.record(idSchema, dateSchema), flows: z.array(flowSchema), orderNodes: z.array(orderNodeSchema),
})
export const itemPageSchema = z.strictObject({ items: z.array(itemSummarySchema), total: z.number().int().nonnegative(), periods: z.array(periodSchema).optional() })
export const boardPeriodsSchema = snapshotSchema.pick({ periods: true, items: true, rolloverSources: true, orderNodes: true }).extend({ generation: idSchema, revision: z.number().int().nonnegative() })
export type BoardPeriods = z.infer<typeof boardPeriodsSchema>
export const detailSchema = z.strictObject({ item: itemSchema, period: periodSchema.nullable(), relations: z.array(relationViewSchema), guidance: guidanceRecordSchema.nullable().optional() })
export type Snapshot = z.infer<typeof snapshotSchema>
export const reviewContextSchema = z.strictObject({
  board: snapshotSchema, planning: snapshotSchema, closing: z.array(itemSummarySchema), sourcePeriods: z.array(periodSchema), unknown: z.number().int().nonnegative(),
})
export type ReviewContext = z.infer<typeof reviewContextSchema>
export type Flow = z.infer<typeof flowSchema>
export type ItemPage = z.infer<typeof itemPageSchema>
export type ItemDetail = z.infer<typeof detailSchema>

export const itemCountsSchema = z.strictObject({ done: z.number().int().nonnegative(), cancelled: z.number().int().nonnegative(), archived: z.number().int().nonnegative(), trash: z.number().int().nonnegative() })
export const activitySummarySchema = z.strictObject({ total: z.number().int().nonnegative(), latest: z.strictObject({ type: z.string(), at: z.string() }).nullable() })
export type ItemCounts = z.infer<typeof itemCountsSchema>
export type ActivitySummary = z.infer<typeof activitySummarySchema>
export type WorkspaceMetadata = Pick<Snapshot, 'workspace' | 'periods' | 'maintenance' | 'observedAt' | 'backupError'>

export const backupSummarySchema = z.strictObject({ latest: z.string().nullable(), total: z.number().int().nonnegative() })
export type BackupSummary = z.infer<typeof backupSummarySchema>
