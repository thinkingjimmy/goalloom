/**
 * [INPUT]: Entity identities, horizons, periods and revision-bound smart requests.
 * [OUTPUT]: Immediate-capture intent, transaction-created guards and bounded goal/ownership selections.
 * [POS]: Shared capture contract without provider, renderer or command dependencies.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { z } from 'zod'
import { dateSchema, horizonSchema, idSchema, instantSchema } from './entities'

export const analyzeRequestSchema = z.strictObject({
  requestId: z.uuid(), draftSessionId: z.uuid(), inputRevision: z.number().int().nonnegative(), manualRevision: z.number().int().nonnegative(),
  generation: idSchema, providerRevision: z.number().int().nonnegative(), contextRevision: z.number().int().nonnegative(), referenceTime: instantSchema,
  text: z.string().max(20_000), parentHints: z.array(idSchema).max(500).default([]),
  target: z.strictObject({ horizon: horizonSchema, startDate: dateSchema.nullable() }).optional(),
})
export type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>
export const smartCaptureSchema = z.strictObject({ request: analyzeRequestSchema, allowPlacement: z.boolean(), allowParents: z.boolean() })
export type SmartCapture = z.infer<typeof smartCaptureSchema>
export const captureGuardSchema = z.strictObject({
  requestId: z.uuid(), itemId: idSchema, itemVersion: z.number().int().positive(), placementVersion: z.number().int().positive(),
  allowPlacement: z.boolean(), allowParents: z.boolean(), autoPlace: z.boolean(), pending: z.boolean(),
})
export type CaptureGuard = z.infer<typeof captureGuardSchema>
export const semanticParentSchema = z.strictObject({ itemId: idSchema, title: z.string().max(500), horizon: horizonSchema, periodId: idSchema.nullable().optional(), parentIds: z.array(idSchema).max(500), explicit: z.boolean().optional() })
export type SemanticParent = z.infer<typeof semanticParentSchema>
export const semanticOwnerSchema = semanticParentSchema.extend({ periodId: idSchema.nullable(), version: z.number().int().positive(), placementVersion: z.number().int().positive() })
export const creationSelectionSchema = z.strictObject({ horizon: horizonSchema, previewPeriodId: idSchema.nullable(), parents: z.array(semanticParentSchema).max(500), nesting: semanticOwnerSchema.optional() })
export type CreationSelection = z.infer<typeof creationSelectionSchema>
