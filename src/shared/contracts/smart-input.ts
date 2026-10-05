/**
 * [INPUT]: Zod, entity schemas and the lightweight AI provider / feature / capability values.
 * [OUTPUT]: AI 服务标识、设备侧状态（每服务凭据/能力/失败/冷却，每功能所选服务与启用）、受限设置/判断动作、带修订回声的判断回复与可编辑预览 DTO；流程洞察的起草/复盘请求（有界看板文本、代码算出的信号、本机偏好）与回复。
 * [POS]: main 智能服务 ↔ preload ↔ renderer 的唯一契约；不含凭据明文，也不进入 workspace 表、导出或迁移。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { aiCapabilities, aiFeatures, aiProviders, childHorizons, periodHorizons } from './values'
import { dateSchema, flowColorSchema, horizonSchema, idSchema, instantSchema, statusSchema } from './entities'

export const smartChannel = 'goalloom:smart'
export const aiProviderSchema = z.enum(aiProviders)
export type AiProvider = z.infer<typeof aiProviderSchema>
export const aiFeatureSchema = z.enum(aiFeatures)
export type AiFeature = z.infer<typeof aiFeatureSchema>
export const aiCapabilitySchema = z.enum(aiCapabilities)
export type AiCapability = z.infer<typeof aiCapabilitySchema>

// --- Normalised failure kinds: each maps to one user-facing remedy, never a guessed "invalid key". ---
export const failureKindSchema = z.enum(['account_verification_required', 'rate_limited', 'quota_exhausted', 'payment_required', 'authentication_failed', 'permission_denied', 'routing_policy', 'unavailable', 'malformed_response', 'request_failed', 'too_large', 'credential_unreadable', 'credential_unavailable', 'not_enabled'])
export type FailureKind = z.infer<typeof failureKindSchema>
export const failureSchema = z.strictObject({ kind: failureKindSchema, message: z.string().max(500), status: z.number().int().nullable(), retryAt: instantSchema.nullable() })
export type Failure = z.infer<typeof failureSchema>

export const credentialStateSchema = z.enum(['missing', 'saved', 'unreadable', 'unavailable'])
// capabilities: when each model last passed its fixed sample with this key; lastFailure: the latest account-level problem, cleared by the next success.
export const providerStatusSchema = z.strictObject({
  credential: credentialStateSchema, keyHint: z.string().max(12).nullable(), consentedAt: instantSchema.nullable(), verifiedAt: instantSchema.nullable(),
  capabilities: z.strictObject({ jev: instantSchema.nullable(), chat: instantSchema.nullable() }), lastFailure: failureSchema.nullable(), cooldownUntil: instantSchema.nullable(),
})
export type ProviderStatus = z.infer<typeof providerStatusSchema>
// enabled: bound to the current workspace generation on a usable provider; paused: bound to an older generation.
export const featureStatusSchema = z.strictObject({ provider: aiProviderSchema.nullable(), revision: z.number().int().nonnegative(), enabled: z.boolean(), paused: z.boolean() })
export type FeatureStatus = z.infer<typeof featureStatusSchema>
export const noticeSchema = z.enum(['globalEntry', 'smartSetup'])
export type Notice = z.infer<typeof noticeSchema>
export const smartStatusSchema = z.strictObject({
  providers: z.strictObject({ openrouter: providerStatusSchema, 'vercel-gateway': providerStatusSchema }),
  features: z.strictObject({ smart: featureStatusSchema, insight: featureStatusSchema }),
  dismissed: z.array(noticeSchema), unsignedBuild: z.boolean(),
})
export type SmartStatus = z.infer<typeof smartStatusSchema>

// ok: at least one capability passed, so the key is saved; results: one entry per capability the provider offers; enabled: features this test switched on.
export const capabilityResultSchema = z.strictObject({ ok: z.boolean(), failure: failureSchema.nullable() })
export const testOutcomeSchema = z.strictObject({
  ok: z.boolean(), failure: failureSchema.nullable(), sampleMatched: z.boolean().nullable(),
  results: z.partialRecord(aiCapabilitySchema, capabilityResultSchema), enabled: z.array(aiFeatureSchema),
})
export type TestOutcome = z.infer<typeof testOutcomeSchema>

export const analyzeRequestSchema = z.strictObject({
  requestId: z.uuid(), draftSessionId: z.uuid(), inputRevision: z.number().int().nonnegative(), manualRevision: z.number().int().nonnegative(),
  generation: idSchema, providerRevision: z.number().int().nonnegative(), contextRevision: z.number().int().nonnegative(), referenceTime: instantSchema,
  text: z.string().max(20_000), parentHints: z.array(idSchema).max(8).default([]),
})
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>

// --- Flow insight: renderer-built, bounded text context; code computes the signals, the model only words them. ---
export const insightPrefsSchema = z.strictObject({
  about: z.string().max(1000), stepSize: z.enum(['smallest', 'hour', 'halfDay']), stepNotes: z.string().max(500),
  tone: z.enum(['direct', 'gentle', 'questions']), focus: z.array(z.enum(['gap', 'overload', 'skip', 'vague'])).max(4),
})
export type InsightPrefs = z.infer<typeof insightPrefsSchema>
const line = z.string().max(500)
export const draftTaskSchema = z.strictObject({
  id: z.string().min(1).max(64), parent: line, goal: line.nullable(),
  target: z.string().max(120), targetHorizon: z.enum(childHorizons),
  siblings: z.array(line).max(20),
})
export type DraftTask = z.infer<typeof draftTaskSchema>
export const insightBoardSchema = z.strictObject({
  today: dateSchema, periods: z.partialRecord(z.enum(periodHorizons), z.string().max(80)),
  goals: z.array(z.strictObject({ title: line, half: z.array(line).max(24), cycle: z.array(line).max(24), month: z.array(line).max(24), week: z.array(line).max(24), day: z.array(line).max(24) })).max(12),
  unlinked: z.strictObject({ half: z.array(line).max(24), cycle: z.array(line).max(24), month: z.array(line).max(24), week: z.array(line).max(24), day: z.array(line).max(24) }),
})
export type InsightBoard = z.infer<typeof insightBoardSchema>
export const insightSignalSchema = z.strictObject({ kind: z.enum(['gap', 'skip', 'pace', 'overload', 'vague']), goal: line, detail: z.string().max(300) })
export type InsightSignal = z.infer<typeof insightSignalSchema>
export const draftRequestSchema = z.strictObject({ requestId: z.uuid(), generation: idSchema, board: insightBoardSchema, tasks: z.array(draftTaskSchema).min(1).max(8), prefs: insightPrefsSchema })
export type DraftRequest = z.infer<typeof draftRequestSchema>
export const reviewRequestSchema = z.strictObject({ requestId: z.uuid(), generation: idSchema, scope: z.enum(['week', 'month', 'both']), board: insightBoardSchema, signals: z.array(insightSignalSchema).max(16), prefs: insightPrefsSchema })
export type ReviewRequest = z.infer<typeof reviewRequestSchema>
export const draftTitleSchema = z.strictObject({ id: z.string().max(64), title: z.string().min(1).max(60), why: z.string().max(80) })
export type DraftTitle = z.infer<typeof draftTitleSchema>
export const reviewTextSchema = z.strictObject({ headline: z.string().max(80), advice: z.string().max(100), flags: z.array(z.strictObject({ goal: line, kind: z.string().max(20), note: z.string().max(60) })).max(3) })
export type ReviewText = z.infer<typeof reviewTextSchema>
export const insightReplySchema = <T extends z.ZodType>(value: T) => z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('ready'), requestId: z.uuid(), value }),
  z.strictObject({ status: z.literal('failed'), requestId: z.uuid(), failure: failureSchema }),
])

export const smartActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('draft'), request: draftRequestSchema }),
  z.strictObject({ type: z.literal('review'), request: reviewRequestSchema }),
  z.strictObject({ type: z.literal('status'), generation: idSchema }),
  z.strictObject({ type: z.literal('connect'), generation: idSchema, provider: aiProviderSchema, apiKey: z.string().trim().min(8).max(512).nullable(), consent: z.literal(true) }),
  // Chooses a feature's provider and switches it on or off; enabling requires that provider's verified capability.
  z.strictObject({ type: z.literal('feature'), generation: idSchema, feature: aiFeatureSchema, provider: aiProviderSchema.nullable(), enabled: z.boolean() }),
  z.strictObject({ type: z.literal('forget'), generation: idSchema, provider: aiProviderSchema }),
  z.strictObject({ type: z.literal('dismiss'), generation: idSchema, notice: noticeSchema }),
  z.strictObject({ type: z.literal('openConsole'), provider: aiProviderSchema }),
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
  periods: z.record(z.enum(periodHorizons), periodRangeSchema),
  drafts: z.array(previewDraftSchema).min(1).max(8), candidates: z.array(candidateSchema).max(16), relations: z.array(relationSuggestionSchema).max(200),
  warnings: z.array(warningSchema).max(40), questionCount: z.number().int().nonnegative(), requests: z.number().int().min(1).max(2),
})
export type SmartPreview = z.infer<typeof smartPreviewSchema>
export const diagnosticsSchema = z.strictObject({ provider: aiProviderSchema, requestedModel: z.string(), routingCanonicalSlug: z.string().nullable(), modelVersion: z.string().nullable(), inputTokens: z.number().int().nullable(), estimatedInputTokens: z.number().int(), requestId: z.string().max(200).nullable(), latencyMs: z.number().int() })
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
  z.strictObject({ type: z.literal('draft'), reply: insightReplySchema(z.array(draftTitleSchema).min(1).max(8)) }),
  z.strictObject({ type: z.literal('review'), reply: insightReplySchema(reviewTextSchema) }),
])
export type SmartReply = z.infer<typeof smartReplySchema>
