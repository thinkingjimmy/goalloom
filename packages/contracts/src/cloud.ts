/**
 * [INPUT]: Untrusted version-1 cloud metadata and fixed server identities.
 * [OUTPUT]: Strict finite DTOs with canonical identities, bounds and unchanged signed timestamps.
 * [POS]: Shared cloud boundary; no transport, credentials or storage side effects.
 */
import { z } from 'zod'

export const cloudUuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
export const cloudHex = (bytes: number) => z.string().length(bytes * 2).regex(/^[0-9a-f]+$/)
export const cloudInteger = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).refine(value => !Object.is(value, -0))
export const cloudPositive = cloudInteger.refine(value => value > 0)
export const cloudInstant = z.string().regex(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/).refine(value => {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 23) === value.slice(0, 23)
})
export const cloudEnvironment = z.enum(['development', 'production'])
export const cloudProject = z.string().regex(/^[a-z]{20}$/)
export const cloudTargetSchema = z.strictObject({ workspaceId: cloudUuid, generation: cloudUuid })
export type CloudTarget = z.infer<typeof cloudTargetSchema>
export const D2_MIN_CLOUD_SERVICE_VERSION = 2
export const HOSTED_AI_SERVICE_VERSION = 1
export const cloudServiceHeaders = { 'x-goalloom-service-version': String(D2_MIN_CLOUD_SERVICE_VERSION) } as const
export const hostedAiServiceHeaders = { 'x-goalloom-service-version': String(HOSTED_AI_SERVICE_VERSION) } as const
