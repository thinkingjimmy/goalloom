/**
 * [INPUT]: Untrusted assistance input, entity identities and the five UI locales.
 * [OUTPUT]: Strict complete-note rewrites, legacy guidance/proposals, request echoes and dependency guards.
 * [POS]: Assistance boundary shared by main, worker and preload; models never supply commands.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { dateSchema, horizonSchema, idSchema, instantSchema, itemSchema, periodSchema, statusSchema } from './entities'
import { insightPrefsSchema } from './insight-preferences'
import { locales } from '../i18n/locale'
import { aiFailureKinds } from './values'
import { executionFactsSchema } from './execution'

export const assistanceConsentVersion = 1
export const guidanceKinds = ['next_step', 'working_scope', 'resume_point', 'waiting_note'] as const
const guidanceBody = {
  formatVersion: z.literal(1), kind: z.enum(guidanceKinds), nextAction: z.string().trim().min(1).max(600),
  contextNote: z.string().trim().min(1).max(300).nullable(), scopeNote: z.string().trim().min(1).max(300).nullable(),
}
export const guidanceValueSchema = z.strictObject({ ...guidanceBody, authorship: z.enum(['user', 'ai_assisted']) })
export type GuidanceValue = z.infer<typeof guidanceValueSchema>
export const guidanceRecordSchema = z.strictObject({
  itemId: idSchema, revision: z.number().int().positive(), value: guidanceValueSchema.nullable(), updatedAt: instantSchema, operationId: idSchema,
})
export type GuidanceRecord = z.infer<typeof guidanceRecordSchema>
export const guidanceChangeSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('keep') }), z.strictObject({ kind: z.literal('clear') }),
  z.strictObject({ kind: z.literal('set'), value: guidanceValueSchema }),
])
const moveSuggestionSchema = z.strictObject({ horizon: horizonSchema, localDate: dateSchema.nullable() })
  .refine(value => value.horizon === 'later' ? value.localDate === null : value.localDate !== null)
export const assistanceOutputSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('rewrite'), description: z.string().trim().min(1).max(16_000) }),
  z.strictObject({ kind: z.literal('clarify'), question: z.string().trim().min(1).max(200) }),
  z.strictObject({ kind: z.literal('proposal'), explanation: z.string().trim().min(1).max(400),
    guidance: z.strictObject(guidanceBody).nullable(), moveSuggestion: moveSuggestionSchema.nullable(),
  }).refine(value => value.guidance !== null || value.moveSuggestion !== null),
])
export type AssistanceOutput = z.infer<typeof assistanceOutputSchema>
export const assistanceEchoSchema = z.strictObject({
  requestId: z.uuid(), sessionId: z.uuid(), itemId: idSchema, generation: idSchema,
  inputRevision: z.number().int().nonnegative(), manualRevision: z.number().int().nonnegative(), featureRevision: z.number().int().nonnegative(),
  contextId: z.uuid(), locale: z.enum(locales), turn: z.number().int().min(1).max(3),
})
export const assistanceRequestSchema = assistanceEchoSchema.extend({
  mode: z.literal('rewrite').optional(),
  prefs: insightPrefsSchema.optional(), text: z.string().max(2000), answer: z.string().max(2000).nullable(), adjustment: z.string().max(2000).nullable(),
})
export type AssistanceRequest = z.infer<typeof assistanceRequestSchema>
export type AssistanceEcho = z.infer<typeof assistanceEchoSchema>
export const assistancePrepareSchema = z.strictObject({ sessionId: z.uuid(), itemId: idSchema, generation: idSchema, locale: z.enum(locales) })
export type AssistancePrepare = z.infer<typeof assistancePrepareSchema>
export const assistanceGuardSchema = z.strictObject({
  today: dateSchema, calendarId: idSchema, sourceRevision: z.string().max(180),
  dependencies: z.array(z.strictObject({ itemId: idSchema, version: z.number().int().positive() })).min(1).max(20),
  guidanceRevision: z.number().int().nonnegative(), parentRelationCount: z.number().int().nonnegative(), parentRelationIds: z.array(idSchema).max(3),
})
export type AssistanceGuard = z.infer<typeof assistanceGuardSchema>
const contextItemSchema = z.strictObject({
  id: idSchema, title: z.string().max(500), status: statusSchema, archived: z.boolean(), horizon: horizonSchema, periodId: idSchema.nullable(),
  note: z.string().max(120).nullable(), guidance: z.string().max(600).nullable(),
})
export const assistanceContextSchema = z.strictObject({
  item: itemSchema, guidance: guidanceRecordSchema.nullable(), period: periodSchema.nullable(),
  parents: z.array(contextItemSchema).max(3), children: z.array(contextItemSchema).max(8), siblings: z.array(contextItemSchema).max(8),
  recentGuidance: z.array(guidanceValueSchema).max(2), facts: executionFactsSchema, guard: assistanceGuardSchema,
  truncatedSections: z.array(z.string().max(80)).max(12), omitted: z.record(z.string().max(80), z.number().int().nonnegative()),
})
export type AssistanceContext = z.infer<typeof assistanceContextSchema>
export const assistancePreparedSchema = z.strictObject({
  contextId: z.uuid(), sessionId: z.uuid(), itemId: idSchema, generation: idSchema, locale: z.enum(locales), expiresAt: instantSchema,
  featureRevision: z.number().int().nonnegative(), provider: z.enum(['openrouter', 'vercel-gateway']).nullable(),
  enabled: z.boolean(), consented: z.boolean(), context: assistanceContextSchema,
})
export type AssistancePrepared = z.infer<typeof assistancePreparedSchema>
export const assistanceReplySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ready'), echo: assistanceEchoSchema, provider: z.enum(['openrouter', 'vercel-gateway']),
    value: assistanceOutputSchema, facts: executionFactsSchema, truncatedSections: z.array(z.string().max(80)).max(12) }),
  z.strictObject({ status: z.enum(['cancelled', 'stale']), echo: assistanceEchoSchema }),
  z.strictObject({ status: z.literal('failed'), echo: assistanceEchoSchema, failure: z.strictObject({ kind: z.enum(aiFailureKinds), message: z.string().max(500), status: z.number().int().nullable(), retryAt: instantSchema.nullable() }) }),
])
export type AssistanceReply = z.infer<typeof assistanceReplySchema>
