/**
 * [INPUT]: Untrusted finite commands, entity/guidance schemas and explicit dependency/version guards.
 * [OUTPUT]: Guarded description rewrites, atomic assistance, lifecycle/planning commands and immutable receipts.
 * [POS]: Write contract accepting neither arbitrary effects nor model-generated commands.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { dateSchema, flowColorSchema, horizonSchema, idSchema, statusSchema, themeSchema } from './entities'
import { validationText } from '../i18n/validation'
import { calendarModes, policyHorizons } from './values'
import { assistanceGuardSchema, guidanceChangeSchema } from './assistance'

const envelope = { operationId: idSchema, generation: idSchema }
const target = { itemId: idSchema, expectedVersion: z.number().int().positive() }
export const createPeriodTargetSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('current') }),
  z.strictObject({ kind: z.literal('date'), startDate: dateSchema }),
])
export const movePeriodTargetSchema = z.discriminatedUnion('kind', [
  ...createPeriodTargetSchema.options,
  z.strictObject({ kind: z.literal('next') }),
])
export type CreatePeriodTarget = z.infer<typeof createPeriodTargetSchema>
export type MovePeriodTarget = z.infer<typeof movePeriodTargetSchema>
// Existing parents carry the version confirmed in the preview; draft parents only reference this batch.
export const parentRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('existing'), itemId: idSchema, expectedVersion: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('draft'), draftId: idSchema }),
])
export type ParentRef = z.infer<typeof parentRefSchema>
export const planItemSchema = z.strictObject({
  draftId: idSchema, title: z.string().trim().min(1).max(500), description: z.string().max(100_000).default(''), dueDate: dateSchema.nullable().default(null),
  horizon: horizonSchema, previewPeriodId: idSchema.nullable(), parentRefs: z.array(parentRefSchema).max(16).default([]), flowColor: flowColorSchema.nullable().default(null),
  // Absent = the current period; a date target lets a review write straight into the next week or month.
  period: createPeriodTargetSchema.optional(),
})
export const planLimit = 8
export const setupAnchorSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('today'), expected: dateSchema }),
  z.strictObject({ kind: z.literal('monthStart'), expected: dateSchema }),
  z.strictObject({ kind: z.literal('date'), date: dateSchema }),
])
export type SetupAnchor = z.infer<typeof setupAnchorSchema>
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, ...target, type: z.literal('applyAssistance'), expectedGuidanceRevision: z.number().int().nonnegative(),
    guidance: guidanceChangeSchema, guard: assistanceGuardSchema.optional(), contextId: z.uuid().optional(),
    description: z.string().trim().min(1).max(16_000).optional(),
    move: z.strictObject({ horizon: horizonSchema, startDate: dateSchema.nullable(), expectedPlacementVersion: z.number().int().positive(),
      previewPeriodId: idSchema.nullable(), confirmedLater: z.boolean().default(false) }).optional(),
  }).refine(value => value.guidance.kind !== 'keep' || value.move !== undefined || value.description !== undefined)
    .refine(value => value.description === undefined || !!value.guard && !!value.contextId && value.guidance.kind === 'keep' && !value.move)
    .refine(value => value.guidance.kind !== 'set' || value.guidance.value.authorship !== 'ai_assisted' || !!value.guard && !!value.contextId),
  z.strictObject({ ...envelope, type: z.literal('confirmSetup'), mode: z.enum(calendarModes), timezone: z.string().max(100), weekStart: z.number().int().min(1).max(7), anchor: setupAnchorSchema, confirmed: z.literal(true) }),
  z.strictObject({ ...envelope, type: z.literal('create'), title: z.string().trim().min(1).max(500), description: z.string().max(100_000).default(''), dueDate: dateSchema.nullable().default(null), horizon: horizonSchema, period: createPeriodTargetSchema.optional(), parentId: idSchema.nullable().default(null), expectedParentVersion: z.number().int().positive().nullable().default(null), flowColor: flowColorSchema.nullable().default(null) }),
  z.strictObject({ ...envelope, type: z.literal('createPlan'), items: z.array(planItemSchema).min(1).max(planLimit) }),
  z.strictObject({ ...envelope, ...target, type: z.literal('edit'), title: z.string().trim().min(1).max(500), description: z.string().max(100_000), dueDate: dateSchema.nullable() }),
  z.strictObject({ ...envelope, ...target, type: z.literal('flowColor'), flowColor: flowColorSchema.nullable() }),
  z.strictObject({ ...envelope, ...target, type: z.literal('move'), horizon: horizonSchema, period: movePeriodTargetSchema.optional(), beforeId: idSchema.nullable().default(null), expectedPlacementVersion: z.number().int().positive(), parentOrder: z.boolean().optional() }),
  z.strictObject({ ...envelope, type: z.literal('materializeParentOrder') }),
  z.strictObject({ ...envelope, type: z.literal('link'), parentId: idSchema, childId: idSchema, expectedParentVersion: z.number().int().positive(), expectedChildVersion: z.number().int().positive(), adoptParentFlow: z.literal(true).optional() }),
  z.strictObject({ ...envelope, ...target, type: z.literal('status'), status: statusSchema }),
  z.strictObject({ ...envelope, ...target, type: z.literal('archive'), archived: z.boolean() }),
  z.strictObject({ ...envelope, ...target, type: z.literal('delete') }),
  z.strictObject({ ...envelope, ...target, type: z.literal('discardEmpty') }),
  z.strictObject({ ...envelope, ...target, type: z.literal('restoreItem'), deletionSource: idSchema.nullable().default(null) }),
  z.strictObject({ ...envelope, type: z.literal('unlink'), relationId: idSchema, expectedParentVersion: z.number().int().positive(), expectedChildVersion: z.number().int().positive() }),
  z.strictObject({ ...envelope, type: z.literal('undo'), originalOperationId: idSchema }),
  z.strictObject({ ...envelope, type: z.literal('preferences'), theme: themeSchema.optional(), style: z.enum(['paper', 'minimal']).optional(), checkStyle: z.enum(['outline', 'paper', 'tint']).optional() }).refine(command => command.theme || command.style || command.checkStyle, { error: () => validationText().missingPreference }),
  z.strictObject({ ...envelope, type: z.literal('arrangeBacklog'), horizon: horizonSchema, items: z.array(z.strictObject({ ...target, expectedPlacementVersion: z.number().int().positive() })).min(1).max(1000) }),
  z.strictObject({ ...envelope, type: z.literal('policy'), horizon: z.enum(policyHorizons), mode: z.enum(['auto', 'manual']), expectedVersion: z.number().int().positive() }),
  z.strictObject({ ...envelope, type: z.literal('confirmRollover'), confirmed: z.literal(true) }),
  z.strictObject({ ...envelope, type: z.literal('confirmClock'), confirmed: z.literal(true) }),
  z.strictObject({ ...envelope, type: z.literal('backupPreferences'), enabled: z.boolean(), retention: z.number().int().min(1).max(100) }),
  z.strictObject({ ...envelope, type: z.literal('undoBatch'), originalOperationId: idSchema }),
])
export type Command = z.infer<typeof commandSchema>
export type CommandInput = z.input<typeof commandSchema>
export type CommandOf<T extends Command['type']> = Extract<Command, { type: T }>
export const resultSchema = z.strictObject({
  operationId: idSchema, generation: idSchema, changed: z.boolean(), undoable: z.boolean(),
  outcome: z.enum(['committed', 'conflict_skipped']), itemId: idSchema.nullable(),
  label: z.string(), warnings: z.array(z.string()), restoreSource: idSchema.nullable(),
  originalOperationId: idSchema.nullable(),
  // Plan receipts only: ordered topological item IDs; absent on every other operation.
  itemIds: z.array(idSchema).max(planLimit).optional(),
})
export type CommandResult = z.infer<typeof resultSchema>
export class DomainError extends Error {
  constructor(public code: 'invalid' | 'stale' | 'stale_preview' | 'conflict' | 'generation' | 'setup' | 'maintenance' | 'storage' | 'startup' | 'backup' | 'import' | 'restore' | 'read', message: string) { super(message) }
}
export const replySchema = z.discriminatedUnion('ok', [
  z.strictObject({ ok: z.literal(true), result: resultSchema }),
  z.strictObject({ ok: z.literal(false), code: z.string(), message: z.string() }),
])
export type CommandReply = z.infer<typeof replySchema>
