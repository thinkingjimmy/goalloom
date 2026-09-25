/**
 * [INPUT]: zod；实体 schema。
 * [OUTPUT]: Jev 服务标识、设备侧智能输入状态、受限设置/判断动作、带修订回声的判断回复与可编辑预览 DTO。
 * [POS]: main 智能服务 ↔ preload ↔ renderer 的唯一契约；不含凭据明文，也不进入 workspace 表、导出或迁移。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { z } from 'zod'
import { dateSchema, flowColorSchema, horizonSchema, idSchema, instantSchema, statusSchema } from './entities'

export const smartChannel = 'goalloom:smart'
export const jevProviderSchema = z.enum(['typesafe', 'vercel-gateway', 'openrouter'])
export type JevProvider = z.infer<typeof jevProviderSchema>
export const jevProviders: JevProvider[] = [...jevProviderSchema.options]

// --- Normalised failure kinds: each maps to one user-facing remedy, never a guessed "invalid key". ---
export const failureKindSchema = z.enum(['account_verification_required', 'rate_limited', 'quota_exhausted', 'payment_required', 'authentication_failed', 'permission_denied', 'routing_policy', 'unavailable', 'malformed_response', 'request_failed', 'too_large', 'credential_unreadable', 'credential_unavailable', 'not_enabled'])
export type FailureKind = z.infer<typeof failureKindSchema>
export const failureSchema = z.strictObject({ kind: failureKindSchema, message: z.string().max(500), status: z.number().int().nullable(), retryAt: instantSchema.nullable() })
export type Failure = z.infer<typeof failureSchema>

export const credentialStateSchema = z.enum(['missing', 'saved', 'unreadable', 'unavailable'])
export const providerStatusSchema = z.strictObject({ credential: credentialStateSchema, keyHint: z.string().max(12).nullable(), consentedAt: instantSchema.nullable(), verifiedAt: instantSchema.nullable() })
export const noticeSchema = z.enum(['globalEntry', 'smartSetup'])
export type Notice = z.infer<typeof noticeSchema>
export const smartStatusSchema = z.strictObject({
  activeProvider: jevProviderSchema.nullable(), providerRevision: z.number().int().nonnegative(),
  // enabled: bound to the current workspace generation with a readable key and consent; paused: bound to an older generation.
  enabled: z.boolean(), paused: z.boolean(),
  providers: z.strictObject({ typesafe: providerStatusSchema, 'vercel-gateway': providerStatusSchema, openrouter: providerStatusSchema }),
  lastFailure: failureSchema.nullable(), cooldownUntil: instantSchema.nullable(), dismissed: z.array(noticeSchema), unsignedBuild: z.boolean(),
})
export type SmartStatus = z.infer<typeof smartStatusSchema>

export const testOutcomeSchema = z.strictObject({ ok: z.boolean(), failure: failureSchema.nullable(), sampleMatched: z.boolean().nullable() })
export type TestOutcome = z.infer<typeof testOutcomeSchema>

export const analyzeRequestSchema = z.strictObject({
  requestId: z.uuid(), draftSessionId: z.uuid(), inputRevision: z.number().int().nonnegative(), manualRevision: z.number().int().nonnegative(),
  generation: idSchema, providerRevision: z.number().int().nonnegative(), contextRevision: z.number().int().nonnegative(), referenceTime: instantSchema,
  text: z.string().max(20_000), parentHints: z.array(idSchema).max(8).default([]),
})
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>

export const smartActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status'), generation: idSchema }),
  z.strictObject({ type: z.literal('connect'), generation: idSchema, provider: jevProviderSchema, apiKey: z.string().trim().min(8).max(512).nullable(), consent: z.literal(true) }),
  z.strictObject({ type: z.literal('disable'), generation: idSchema }),
  z.strictObject({ type: z.literal('forget'), generation: idSchema, provider: jevProviderSchema }),
  z.strictObject({ type: z.literal('dismiss'), generation: idSchema, notice: noticeSchema }),
  z.strictObject({ type: z.literal('openConsole'), provider: jevProviderSchema }),
  z.strictObject({ type: z.literal('analyze'), request: analyzeRequestSchema }),
  z.strictObject({ type: z.literal('cancel'), draftSessionId: z.uuid() }),
])
export type SmartAction = z.infer<typeof smartActionSchema>

// --- Preview: code-computed values plus per-field support; nothing here is written until the user confirms. ---
export const metricsSchema = z.strictObject({ top: z.number(), margin: z.number(), concentration: z.number(), decimals: z.number().int().nullable(), source: z.enum(['response', 'adapter']).nullable() })
export const horizonChoiceSchema = z.union([horizonSchema, z.literal('future')])
export type HorizonChoice = z.infer<typeof horizonChoiceSchema>
const suggestion = <T extends z.ZodType>(value: T) => z.strictObject({ value, certain: z.boolean(), metrics: metricsSchema.nullable() })
export const candidateSchema = z.strictObject({ ref: z.string().max(8), itemId: idSchema, title: z.string(), status: statusSchema, horizon: horizonSchema, archived: z.boolean(), flowColor: flowColorSchema.nullable(), version: z.number().int().positive(), named: z.boolean() })
export type Candidate = z.infer<typeof candidateSchema>
export const parentKeySchema = z.discriminatedUnion('kind', [z.strictObject({ kind: z.literal('existing'), itemId: idSchema }), z.strictObject({ kind: z.literal('draft'), draftId: idSchema })])
export type ParentKey = z.infer<typeof parentKeySchema>
export const relationSuggestionSchema = z.strictObject({ parent: parentKeySchema, childDraftId: idSchema, state: z.enum(['yes', 'maybe', 'no', 'not_evaluated']), probability: z.number().nullable() })
export type RelationSuggestion = z.infer<typeof relationSuggestionSchema>
export const previewDraftSchema = z.strictObject({
  draftId: idSchema, source: z.string(), title: z.string().max(500), description: z.string().max(100_000), roleCertain: z.boolean(),
  horizon: suggestion(horizonChoiceSchema), due: suggestion(dateSchema.nullable()),
  // Jev's guess when the text states no execution time; never overrides a written one.
  inferredHorizon: suggestion(horizonSchema).nullable(),
})
export type PreviewDraft = z.infer<typeof previewDraftSchema>
export const warningSchema = z.strictObject({ kind: z.enum(['reminder', 'repeat', 'clock_time', 'future', 'ambiguous_date', 'relations_partial', 'precision', 'layout']), draftId: idSchema.nullable(), text: z.string().max(300) })
export type PreviewWarning = z.infer<typeof warningSchema>
export const periodRangeSchema = z.strictObject({ id: idSchema, startDate: dateSchema, endDate: dateSchema })
export const smartPreviewSchema = z.strictObject({
  layout: suggestion(z.enum(['single', 'list', 'plan', 'unclear'])), referenceDate: dateSchema,
  periods: z.record(z.enum(['day', 'week', 'month', 'cycle']), periodRangeSchema),
  drafts: z.array(previewDraftSchema).min(1).max(8), candidates: z.array(candidateSchema).max(16), relations: z.array(relationSuggestionSchema).max(200),
  warnings: z.array(warningSchema).max(40), questionCount: z.number().int().nonnegative(), requests: z.number().int().min(1).max(2),
})
export type SmartPreview = z.infer<typeof smartPreviewSchema>
export const diagnosticsSchema = z.strictObject({ provider: jevProviderSchema, requestedModel: z.string(), routingCanonicalSlug: z.string().nullable(), modelVersion: z.string().nullable(), inputTokens: z.number().int().nullable(), estimatedInputTokens: z.number().int(), requestId: z.string().max(200).nullable(), latencyMs: z.number().int() })
export type Diagnostics = z.infer<typeof diagnosticsSchema>
const echo = z.strictObject({ requestId: z.uuid(), draftSessionId: z.uuid(), inputRevision: z.number().int(), manualRevision: z.number().int(), generation: idSchema, providerRevision: z.number().int(), contextRevision: z.number().int(), referenceTime: instantSchema })
export type AnalyzeEcho = z.infer<typeof echo>
export const analyzeReplySchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ready'), echo, preview: smartPreviewSchema, diagnostics: z.array(diagnosticsSchema).max(2) }),
  z.strictObject({ status: z.literal('failed'), echo, failure: failureSchema }),
  z.strictObject({ status: z.literal('cancelled'), echo }),
])
export type AnalyzeReply = z.infer<typeof analyzeReplySchema>
export const smartReplySchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('status'), status: smartStatusSchema, test: testOutcomeSchema.nullable() }),
  z.strictObject({ type: z.literal('analysis'), reply: analyzeReplySchema }),
  z.strictObject({ type: z.literal('cancelled') }),
])
export type SmartReply = z.infer<typeof smartReplySchema>
