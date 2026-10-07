/**
 * [INPUT]: Untrusted source-aware JSON/SQLite data and explicit maintenance actions.
 * [OUTPUT]: Validated v1-v8 datasets, guidance/tombstones, v1/v2 effects and protected replacement previews.
 * [POS]: Transfer boundary preserving old receipts and rejecting inconsistent heads/history.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { calendarSchema, flowColorSchema, horizonSchema, idSchema, instantSchema, itemRecordSchema, periodSchema, placementSchema, policySchema, relationSchema, workspaceSchema } from './entities'
import { resultSchema } from './commands'
import { businessStateSchema, eventSchema } from './history'
import { policyHorizons } from './values'
import { guidanceRecordSchema, guidanceValueSchema } from './assistance'

const statusGroup = businessStateSchema.pick({ status: true, completedAt: true, cancelledAt: true })
const position = z.strictObject({ horizon: horizonSchema, periodId: idSchema.nullable(), previousId: idSchema.nullable(), nextId: idSchema.nullable() })
const edgeDelta = z.strictObject({ before: relationSchema.nullable(), after: relationSchema })
const visibility = z.strictObject({ deletedAt: instantSchema.nullable(), deletedBy: idSchema.nullable() })
export const effectSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('guidance'), itemId: idSchema,
    before: z.strictObject({ value: guidanceValueSchema.nullable(), operationId: idSchema.nullable() }),
    after: z.strictObject({ value: guidanceValueSchema.nullable(), operationId: idSchema }),
  }),
  z.strictObject({ kind: z.literal('create'), itemId: idSchema, status: statusGroup, horizon: horizonSchema, periodId: idSchema.nullable(), initialRelations: z.array(idSchema).max(100_000) }),
  z.strictObject({ kind: z.literal('status'), itemId: idSchema, before: statusGroup, after: statusGroup }),
  z.strictObject({ kind: z.literal('position'), itemId: idSchema, before: position, after: position }),
  z.strictObject({ kind: z.literal('archive'), itemId: idSchema, before: instantSchema.nullable(), after: instantSchema.nullable() }),
  z.strictObject({ kind: z.literal('visibility'), itemId: idSchema, before: visibility, after: visibility, edges: z.array(edgeDelta).max(100_000) }),
  z.strictObject({ kind: z.literal('relations'), itemId: idSchema, edges: z.array(edgeDelta).max(100_000), flowColor: z.strictObject({ before: flowColorSchema, after: z.null(), transferredTo: idSchema.optional() }).optional() }),
])
export const operationSchema = z.strictObject({
  id: idSchema, generation: idSchema, requestHash: z.string().regex(/^[a-f0-9]{64}$/), kind: z.string().min(1).max(60),
  source: z.enum(['user', 'system']), at: instantSchema, effectsVersion: z.union([z.literal(1), z.literal(2)]), effects: z.array(effectSchema).max(100_000), result: resultSchema,
}).refine(value => value.effectsVersion === (value.effects.some(effect => effect.kind === 'guidance') ? 2 : 1))
export const undoMarkerSchema = z.strictObject({ originalId: idSchema, effectIndex: z.number().int().nonnegative(), undoId: idSchema })
export const datasetSchema = z.strictObject({
  schemaVersion: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7), z.literal(8)]), historyMode: z.enum(['complete', 'baseline']).default('complete'), exportedAt: instantSchema,
  workspace: workspaceSchema, items: z.array(itemRecordSchema).max(100_000), placements: z.array(placementSchema).max(100_000),
  periods: z.array(periodSchema).max(100_000), relations: z.array(relationSchema).max(500_000), policies: z.array(policySchema).max(policyHorizons.length),
  events: z.array(eventSchema).max(1_000_000), operations: z.array(operationSchema).max(500_000), undoEffects: z.array(undoMarkerSchema).max(500_000),
  guidance: z.array(guidanceRecordSchema).max(100_000).default([]),
})
export type Dataset = z.infer<typeof datasetSchema>
export const backupRecordSchema = z.strictObject({
  id: z.uuid(), kind: z.enum(['daily', 'protective', 'manual']), createdAt: instantSchema, localDate: z.string().nullable(),
  generation: idSchema, revision: z.number().int().nonnegative(), size: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/),
})
export type BackupRecord = z.infer<typeof backupRecordSchema>
export const backupStatusSchema = z.strictObject({ directory: z.string(), records: z.array(backupRecordSchema), lastError: z.string().nullable() })
export type BackupStatus = z.infer<typeof backupStatusSchema>
export const previewSchema = z.strictObject({
  token: z.uuid(), mode: z.enum(['reset', 'restore']), generation: idSchema, revision: z.number().int().nonnegative(),
  items: z.number().int().nonnegative(), relations: z.number().int().nonnegative(), periods: z.number().int().nonnegative(), events: z.number().int().nonnegative(), operations: z.number().int().nonnegative(),
  sourceCalendar: calendarSchema.nullable(), warnings: z.array(z.string()), backup: backupRecordSchema.nullable(), backupPath: z.string().nullable(),
})
export type TransferPreview = z.infer<typeof previewSchema>
export const dataActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('backupStatus') }),
  z.strictObject({ type: z.literal('createBackup'), generation: idSchema }),
  z.strictObject({ type: z.literal('previewReset'), generation: idSchema }),
  z.strictObject({ type: z.literal('previewBackup'), generation: idSchema, backupId: z.uuid() }),
  z.strictObject({ type: z.literal('chooseImport'), generation: idSchema }),
  z.strictObject({ type: z.literal('prepare'), generation: idSchema, token: z.uuid() }),
  z.strictObject({ type: z.literal('commit'), generation: idSchema, token: z.uuid(), acknowledged: z.literal(true) }),
  z.strictObject({ type: z.literal('cancel'), generation: idSchema, token: z.uuid() }),
])
export type DataAction = z.infer<typeof dataActionSchema>
export const dataReplySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status'), status: backupStatusSchema }),
  z.strictObject({ type: z.literal('preview'), preview: previewSchema }),
  z.strictObject({ type: z.literal('replaced'), generation: idSchema }),
  z.strictObject({ type: z.literal('cancelled') }),
])
export type DataReply = z.infer<typeof dataReplySchema>
export const batchSchema = z.strictObject({ id: idSchema, at: instantSchema, total: z.number().int().nonnegative(), undone: z.number().int().nonnegative() })
export const batchPageSchema = z.strictObject({ total: z.number().int().nonnegative(), items: z.array(z.strictObject({ id: idSchema, title: z.string(), from: z.string(), to: z.string() })) })
export type BatchPage = z.infer<typeof batchPageSchema>
export type BatchSummary = z.infer<typeof batchSchema>
