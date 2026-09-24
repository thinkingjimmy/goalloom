/**
 * [INPUT]: Provider-owned credentials, bounded question payloads, abort signals and controlled HTTP.
 * [OUTPUT]: Fixed System One (TypeSafe native / OpenRouter) and Gateway adapters, normalized distributions and typed failures.
 * [POS]: Provider boundary; no task-body or credential logging, and no alternate API protocols.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { APIConnectionError, APIError, APIUserAbortError, TypeSafeClient, type Questions } from '@typesafe-ai/sdk'
import type { Answer, Precision } from '../../domain/smart/distribution'
import { validDecimals } from '../../domain/smart/distribution'
import type { Json, NeutralQuestion } from '../../domain/smart/questions'
import { estimateTokens, payloadLimit, tokenBudget } from '../../domain/smart/questions'
import type { Failure, FailureKind, JevProvider } from '../../shared/contracts/smart-input'
import { serverText } from '../../shared/i18n/server'

export const JEV_PROVIDERS = {
  typesafe: { protocol: 'typesafe-system-one', baseURL: 'https://api.typesafe.ai', model: 'jev-latest', console: 'https://typesafe.ai' },
  // OpenRouter serves TypeSafe's System One shapes at /api/v1/systemone; the SDK appends /v1/systemone to this base.
  openrouter: { protocol: 'typesafe-system-one', baseURL: 'https://openrouter.ai/api', model: 'typesafe/jev-1.13', console: 'https://openrouter.ai/settings/keys' },
  'vercel-gateway': { protocol: 'gateway-evaluate', endpoint: 'https://ai-gateway.vercel.sh/v1/evaluate', model: 'typesafe-ai/jev', providerOptions: { gateway: { only: ['typesafe-ai'] } }, console: 'https://vercel.com/dashboard' },
} as const
export const requestTimeoutMs = 8_000
export const cooldownMs = 30_000
// Official TypeSafe adapter declares two-decimal probabilities for System One (OpenRouter forwards TypeSafe's answers); Gateway must state its own.
const nativeDecimals = 2

export interface EvaluateInput { state: { [key: string]: Json }; questions: Record<string, NeutralQuestion>; signal: AbortSignal }
export interface EvaluateOutput {
  answers: Record<string, Answer>; precision: Precision
  meta: { requestedModel: string; routingCanonicalSlug: string | null; modelVersion: string | null; inputTokens: number | null; requestId: string | null }
}
export class ProviderFailure extends Error { constructor(readonly failure: Failure) { super(failure.message) } }
export class Aborted extends Error {}
export type Adapter = (apiKey: string, input: EvaluateInput) => Promise<EvaluateOutput>
type Fetch = (input: string, init?: RequestInit) => Promise<Response>

const names: Record<JevProvider, string> = { typesafe: 'TypeSafe', 'vercel-gateway': 'AI Gateway', openrouter: 'OpenRouter' }
export function failure(kind: FailureKind, provider: JevProvider, status: number | null = null, retryAt: string | null = null): Failure {
  const name = names[provider]
  return { kind, message: serverText().smart.failures[kind](name, status), status, retryAt }
}

// --- Specific account/quota/limit reasons win over generic auth; status alone never proves an invalid key. ---
export function classifyFailure(provider: JevProvider, status: number, body: unknown, headers: Headers, now: number): Failure {
  const error = typeof body === 'object' && body !== null ? ((body as { error?: unknown }).error ?? body) as Record<string, unknown> : {}
  const tag = [error.type, error.code].filter(value => typeof value === 'string' || typeof value === 'number').join(' ').toLowerCase()
  if (/customer_verification_required|verification_required/.test(tag)) return failure('account_verification_required', provider, status)
  if (/payment_required|payment_method/.test(tag) || status === 402) return failure('payment_required', provider, status)
  if (/quota|insufficient_(balance|credits?|funds)|credit_limit|balance/.test(tag)) return failure('quota_exhausted', provider, status)
  if (status === 429 || /rate_limit/.test(tag)) return failure('rate_limited', provider, status, retryAfter(headers, now))
  if (status === 401 || /authentication/.test(tag)) return failure('authentication_failed', provider, status)
  if (status === 403 || /forbidden|permission/.test(tag)) return failure('permission_denied', provider, status)
  if (status === 408 || status >= 500) return failure('unavailable', provider, status)
  return failure('request_failed', provider, status)
}
export function retryAfter(headers: Headers, now: number): string {
  const ms = Number(headers.get('retry-after-ms')), seconds = headers.get('retry-after')
  const delay = Number.isFinite(ms) && ms > 0 ? ms : seconds && /^\d+$/.test(seconds) ? Number(seconds) * 1000 : seconds && Number.isFinite(Date.parse(seconds)) ? Date.parse(seconds) - now : cooldownMs
  return new Date(now + Math.min(Math.max(delay, 1_000), 3_600_000)).toISOString()
}

function unify(answers: unknown, questions: Record<string, NeutralQuestion>, provider: JevProvider): Record<string, Answer> {
  if (typeof answers !== 'object' || answers === null) throw new ProviderFailure(failure('malformed_response', provider))
  const keys = Object.keys(answers)
  if (keys.length !== Object.keys(questions).length || keys.some(key => !questions[key])) throw new ProviderFailure(failure('malformed_response', provider))
  const out: Record<string, Answer> = {}
  for (const [id, question] of Object.entries(questions)) {
    const raw = (answers as Record<string, Record<string, unknown>>)[id]!
    if (question.type === 'choice' && raw.type === 'choice') out[id] = { type: 'choice', choice: raw.choice as string, probabilities: (raw.probabilities ?? null) as Record<string, number> | null }
    else if (question.type === 'boolean' && (raw.type === 'noul' || raw.type === 'boolean')) out[id] = { type: 'boolean', probability: (raw.type === 'noul' ? raw.noul : raw.probability) as number }
    else throw new ProviderFailure(failure('malformed_response', provider))
  }
  return out
}
const numberOrNull = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
function requestBody(value: unknown, provider: JevProvider): string {
  const body = JSON.stringify(value)
  if (Buffer.byteLength(body) > payloadLimit || estimateTokens(body) > tokenBudget) throw new ProviderFailure(failure('too_large', provider))
  return body
}

export function systemOneAdapter(provider: 'typesafe' | 'openrouter', fetch?: Fetch): Adapter {
  return async (apiKey, { state, questions, signal }) => {
    const preset = JEV_PROVIDERS[provider]
    const client = new TypeSafeClient({ apiKey, baseURL: preset.baseURL, defaultModel: preset.model, retry: { maxRetries: 0 }, timeout: requestTimeoutMs, logLevel: 'off', ...(fetch ? { fetch } : {}) })
    const native: Questions = Object.fromEntries(Object.entries(questions).map(([id, question]) => [id, question.type === 'choice'
      ? { type: 'choice', instructions: question.instructions, criteria: question.criteria }
      : { type: 'noul', instructions: question.instructions, criteria: question.criteria }]))
    try {
      requestBody({ state, questions: native, model: preset.model }, provider)
      const { data, requestId } = await client.systemOne({ state, questions: native, model: preset.model }, { signal }).withResponse()
      // OpenRouter reports its generation id in the body rather than a TypeSafe request-id header.
      const generationId = (data as { id?: unknown }).id
      return { answers: unify(data.answers, questions, provider), precision: { decimals: nativeDecimals, source: 'adapter' },
        meta: { requestedModel: preset.model, routingCanonicalSlug: null, modelVersion: typeof data.model === 'string' ? data.model.slice(0, 100) : null, inputTokens: numberOrNull(data.usage?.input_tokens),
          requestId: (requestId ?? (typeof generationId === 'string' ? generationId : null))?.slice(0, 200) ?? null } }
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      if (error instanceof APIUserAbortError || signal.aborted) throw new Aborted()
      if (error instanceof APIError) throw new ProviderFailure(classifyFailure(provider, error.status, error.body, error.headers, Date.now()))
      if (error instanceof APIConnectionError) throw new ProviderFailure(failure('unavailable', provider))
      throw new ProviderFailure(failure('malformed_response', provider))
    }
  }
}

export function gatewayAdapter(fetch: Fetch = globalThis.fetch): Adapter {
  return async (apiKey, { state, questions, signal }) => {
    const preset = JEV_PROVIDERS['vercel-gateway']
    const body = requestBody({ model: preset.model, state, questions, providerOptions: preset.providerOptions }, 'vercel-gateway')
    let response: Response
    try {
      response = await fetch(preset.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body, signal: AbortSignal.any([signal, AbortSignal.timeout(requestTimeoutMs)]), redirect: 'error' })
    } catch { if (signal.aborted) throw new Aborted(); throw new ProviderFailure(failure('unavailable', 'vercel-gateway')) }
    let data: Record<string, unknown>
    try { data = await response.json() as Record<string, unknown> }
    catch { if (signal.aborted) throw new Aborted(); throw new ProviderFailure(response.ok ? failure('malformed_response', 'vercel-gateway') : classifyFailure('vercel-gateway', response.status, null, response.headers, Date.now())) }
    if (response.status === 400 && /only|provider_?options|routing/i.test(JSON.stringify((data as { error?: unknown }).error ?? '').slice(0, 2000))) throw new ProviderFailure(failure('routing_policy', 'vercel-gateway', 400))
    if (!response.ok) throw new ProviderFailure(classifyFailure('vercel-gateway', response.status, data, response.headers, Date.now()))
    const warnings = Array.isArray(data.warnings) ? data.warnings as { type?: string; feature?: string }[] : []
    if (warnings.some(warning => warning.type === 'unsupported' && /only|provider|routing/i.test(warning.feature ?? ''))) throw new ProviderFailure(failure('routing_policy', 'vercel-gateway'))
    const routing = ((data.providerMetadata as Record<string, Record<string, unknown>> | undefined)?.gateway?.routing ?? null) as Record<string, unknown> | null
    const served = [routing?.finalProvider, routing?.resolvedProvider].filter(value => typeof value === 'string')
    if (served.some(value => value !== 'typesafe-ai')) throw new ProviderFailure(failure('routing_policy', 'vercel-gateway'))
    const rounding = data.rounding as { probabilityDecimals?: unknown } | undefined
    if (rounding?.probabilityDecimals !== undefined && !validDecimals(rounding.probabilityDecimals)) throw new ProviderFailure(failure('malformed_response', 'vercel-gateway'))
    const decimals = rounding?.probabilityDecimals as number | undefined
    return { answers: unify(data.answers, questions, 'vercel-gateway'), precision: decimals === undefined ? { decimals: null, source: null } : { decimals, source: 'response' },
      meta: { requestedModel: preset.model, routingCanonicalSlug: typeof routing?.canonicalSlug === 'string' ? routing.canonicalSlug.slice(0, 100) : null, modelVersion: null,
        inputTokens: numberOrNull((data.usage as { inputTokens?: unknown } | undefined)?.inputTokens), requestId: typeof (data.providerMetadata as Record<string, Record<string, unknown>> | undefined)?.gateway?.generationId === 'string' ? String((data.providerMetadata as Record<string, Record<string, unknown>>).gateway!.generationId).slice(0, 200) : response.headers.get('x-vercel-id')?.slice(0, 200) ?? null } }
  }
}
