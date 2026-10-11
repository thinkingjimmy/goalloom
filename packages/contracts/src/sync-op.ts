/**
 * [INPUT]: Untrusted sync payloads (formatVersion 1).
 * [OUTPUT]: A strict SyncOp. Canonical bytes are canonicalJson(op); payloadHash covers v, opId, deviceId, at and actions.
 * [POS]: Protocol boundary shared by desktop, mobile and tests. Command replay is intentionally not this schema.
 */
import { z } from 'zod'
import { canonicalJson } from './canonical'

const horizon = z.enum(['later', 'year', 'half', 'cycle', 'month', 'week', 'day'])
const periodHorizon = z.enum(['year', 'half', 'cycle', 'month', 'week', 'day'])
const id = z.string().min(1).max(180).regex(/^[a-zA-Z0-9:_-]+$/)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const instant = z.string().min(20).max(40)

export const periodKeySchema = z.strictObject({ horizon: periodHorizon, startDate: date })
export const sortHintSchema = z.strictObject({ afterId: id.nullable(), beforeId: id.nullable() })
export const rolloverFromSchema = z.strictObject({ periodKey: periodKeySchema, placementSeq: z.number().int().nonnegative() })
export const blobRefSchema = z.strictObject({
  blobId: z.uuid(), sha256: z.string().regex(/^[a-f0-9]{64}$/), size: z.number().int().positive().max(2_097_152),
})
const guidanceValueSchema = z.strictObject({
  formatVersion: z.literal(1),
  kind: z.enum(['next_step', 'working_scope', 'resume_point', 'waiting_note']),
  nextAction: z.string().min(1).max(600),
  contextNote: z.string().min(1).max(300).nullable(),
  scopeNote: z.string().min(1).max(300).nullable(),
  authorship: z.enum(['user', 'ai_assisted']),
})
const calendarSchema = z.strictObject({
  id: id, mode: z.enum(['rolling', 'natural']), timezone: z.string().min(1).max(100),
  weekStart: z.number().int().min(1).max(7), cycleAnchor: date,
})

const description = z.string().max(100_000)
const itemFields = z.strictObject({
  title: z.string().trim().min(1).max(500).optional(),
  description: description.optional(),
  dueDate: date.nullable().optional(),
  flowColor: z.number().int().min(0).max(7).nullable().optional(),
}).refine(fields => Object.keys(fields).length > 0)

export const actionSchema = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('item.create'), id, title: z.string().trim().min(1).max(500), description, dueDate: date.nullable(),
    horizon, periodKey: periodKeySchema.nullable(), sortHint: sortHintSchema, parentId: id.optional(), flowColor: z.number().int().min(0).max(7).nullable().optional(),
    blobRef: blobRefSchema.optional(),
  }),
  z.strictObject({ t: z.literal('item.set'), id, fields: itemFields, blobRef: blobRefSchema.optional() }),
  z.strictObject({
    t: z.literal('item.status'), id, status: z.enum(['todo', 'done', 'cancelled']),
    completedAt: instant.nullable(), cancelledAt: instant.nullable(),
  }),
  z.strictObject({
    t: z.literal('item.place'), id, horizon, periodKey: periodKeySchema.nullable(), sortHint: sortHintSchema,
    reason: z.enum(['move', 'arrange', 'rollover']),
  }),
  z.strictObject({ t: z.literal('item.archive'), id, archivedAt: instant.nullable() }),
  z.strictObject({ t: z.literal('item.delete'), id }),
  z.strictObject({ t: z.literal('item.discardIfEmpty'), id, expectVersion: z.number().int().positive() }),
  z.strictObject({ t: z.literal('item.restore'), id, expectedDeleteOpId: id }),
  z.strictObject({ t: z.literal('item.rollover'), id, from: rolloverFromSchema, to: periodKeySchema, position: z.literal('append') }),
  z.strictObject({ t: z.literal('rel.link'), id, parentId: id, childId: id, adoptParentFlow: z.boolean().optional() }),
  z.strictObject({ t: z.literal('rel.unlink'), id }),
  z.strictObject({ t: z.literal('guidance.set'), itemId: id, value: guidanceValueSchema.nullable(), baseRevision: z.number().int().nonnegative() }),
  z.strictObject({ t: z.literal('policy.set'), horizon: periodHorizon, mode: z.enum(['auto', 'manual']), effectiveFromKey: periodKeySchema }),
  z.strictObject({ t: z.literal('calendar.setup'), calendar: calendarSchema }),
  z.strictObject({ t: z.literal('revert'), targetOpId: z.uuid(), mode: z.enum(['all_or_nothing', 'per_dimension']) }),
])

export const syncOpSchema = z.strictObject({
  v: z.literal(1),
  opId: z.uuid(),
  deviceId: z.string().min(1).max(64),
  at: instant,
  actions: z.array(actionSchema).min(1).max(500),
})

export type PeriodKey = z.infer<typeof periodKeySchema>
export type SortHint = z.infer<typeof sortHintSchema>
export type Action = z.infer<typeof actionSchema>
export type SyncOp = z.infer<typeof syncOpSchema>
export type GuidanceWire = z.infer<typeof guidanceValueSchema>
export type CalendarWire = z.infer<typeof calendarSchema>

export function parseSyncOp(input: unknown): SyncOp {
  return syncOpSchema.parse(input)
}

export function syncOpPayload(op: SyncOp): string {
  return canonicalJson(op)
}

/** Commands that never become a SyncOp. */
export const localOnlyCommands = ['preferences', 'backupPreferences', 'confirmClock', 'confirmRollover'] as const
export type LocalOnlyCommand = typeof localOnlyCommands[number]

export const sendStates = ['never_sent', 'send_unknown', 'accepted', 'applied', 'reverted_local', 'quarantined'] as const
export type SendState = typeof sendStates[number]
export const pendingSendStates = ['never_sent', 'send_unknown', 'accepted'] as const
