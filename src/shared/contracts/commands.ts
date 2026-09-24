/**
 * [INPUT]: Untrusted command input and entity schemas.
 * [OUTPUT]: Finite commands, versioned parent references, generation guards, receipts and stable error codes.
 * [POS]: Write boundary; accepts neither SQL nor caller-defined effects.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { dateSchema, flowColorSchema, horizonSchema, idSchema, statusSchema, themeSchema } from './entities'
import { validationText } from '../i18n/validation'

const envelope = { operationId: idSchema, generation: idSchema }
const target = { itemId: idSchema, expectedVersion: z.number().int().positive() }
// Existing parents carry the version confirmed in the preview; draft parents only reference this batch.
export const parentRefSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('existing'), itemId: idSchema, expectedVersion: z.number().int().positive() }),
  z.strictObject({ kind: z.literal('draft'), draftId: idSchema }),
])
export type ParentRef = z.infer<typeof parentRefSchema>
export const planItemSchema = z.strictObject({
  draftId: idSchema, title: z.string().trim().min(1).max(500), description: z.string().max(100_000).default(''), dueDate: dateSchema.nullable().default(null),
  horizon: horizonSchema, previewPeriodId: idSchema.nullable(), parentRefs: z.array(parentRefSchema).max(16).default([]), flowColor: flowColorSchema.nullable().default(null),
})
export const planLimit = 8
export const commandSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...envelope, type: z.literal('confirmSetup'), timezone: z.string().max(100), weekStart: z.number().int().min(1).max(7), cycleAnchor: dateSchema, confirmed: z.literal(true) }),
  z.strictObject({ ...envelope, type: z.literal('create'), title: z.string().trim().min(1).max(500), description: z.string().max(100_000).default(''), dueDate: dateSchema.nullable().default(null), horizon: horizonSchema, parentId: idSchema.nullable().default(null), expectedParentVersion: z.number().int().positive().nullable().default(null), flowColor: flowColorSchema.nullable().default(null) }),
  z.strictObject({ ...envelope, type: z.literal('createPlan'), items: z.array(planItemSchema).min(1).max(planLimit) }),
  z.strictObject({ ...envelope, ...target, type: z.literal('edit'), title: z.string().trim().min(1).max(500), description: z.string().max(100_000), dueDate: dateSchema.nullable() }),
  z.strictObject({ ...envelope, ...target, type: z.literal('flowColor'), flowColor: flowColorSchema.nullable() }),
  z.strictObject({ ...envelope, ...target, type: z.literal('move'), horizon: horizonSchema, beforeId: idSchema.nullable().default(null), expectedPlacementVersion: z.number().int().positive() }),
  z.strictObject({ ...envelope, type: z.literal('link'), parentId: idSchema, childId: idSchema, expectedParentVersion: z.number().int().positive(), expectedChildVersion: z.number().int().positive() }),
  z.strictObject({ ...envelope, ...target, type: z.literal('status'), status: statusSchema }),
  z.strictObject({ ...envelope, ...target, type: z.literal('archive'), archived: z.boolean() }),
  z.strictObject({ ...envelope, ...target, type: z.literal('delete') }),
  z.strictObject({ ...envelope, ...target, type: z.literal('restoreItem'), deletionSource: idSchema.nullable().default(null) }),
  z.strictObject({ ...envelope, type: z.literal('unlink'), relationId: idSchema, expectedParentVersion: z.number().int().positive(), expectedChildVersion: z.number().int().positive() }),
  z.strictObject({ ...envelope, type: z.literal('undo'), originalOperationId: idSchema }),
  z.strictObject({ ...envelope, type: z.literal('preferences'), theme: themeSchema.optional(), style: z.enum(['paper', 'minimal']).optional(), checkStyle: z.enum(['outline', 'paper', 'tint']).optional() }).refine(command => command.theme || command.style || command.checkStyle, { error: () => validationText().missingPreference }),
  z.strictObject({ ...envelope, type: z.literal('arrangeBacklog'), horizon: horizonSchema, items: z.array(z.strictObject({ ...target, expectedPlacementVersion: z.number().int().positive() })).min(1).max(1000) }),
  z.strictObject({ ...envelope, type: z.literal('policy'), horizon: z.enum(['cycle', 'month', 'week', 'day']), mode: z.enum(['auto', 'manual']), expectedVersion: z.number().int().positive() }),
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
