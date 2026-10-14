/**
 * [INPUT]: A provider id, a candidate API key, consent, and an HTTP status from that provider's key check.
 * [OUTPUT]: Whether the form may submit, the key-check URL, and whether that check passed.
 * [POS]: Shared AI-connect decisions for the mobile sheet. No React Native and no credential storage.
 */

export const AI_PROVIDERS = ['openrouter', 'vercel-gateway'] as const
export type AiProviderId = (typeof AI_PROVIDERS)[number]

export interface AiConnection { provider: AiProviderId }

export interface AiCredential extends AiConnection {
  apiKey: string
  consentedAt: string
  verifiedAt: string
}

/** Official console for the selected provider. The link label uses the provider's display name. */
export const AI_KEY_URL: Record<AiProviderId, string> = {
  openrouter: 'https://openrouter.ai/settings/keys',
  'vercel-gateway': 'https://vercel.com/dashboard',
}

/**
 * Authenticated reads that do not run a model.
 * OpenRouter's key endpoint and the Gateway credits endpoint both require the key and reject a bad one with 401.
 */
export const AI_PROBE_URL: Record<AiProviderId, string> = {
  openrouter: 'https://openrouter.ai/api/v1/key',
  'vercel-gateway': 'https://ai-gateway.vercel.sh/v1/credits',
}

const KEY_MIN = 8
const KEY_MAX = 512

export function aiKeyAccepted(key: string, consent: boolean): boolean {
  const trimmed = key.trim()
  return consent && trimmed.length >= KEY_MIN && trimmed.length <= KEY_MAX
}

export type AiProbe = 'ok' | 'rejected' | 'unavailable'

export function aiProbeResult(status: number | null): AiProbe {
  if (status !== null && status >= 200 && status < 300) return 'ok'
  if (status === 401 || status === 403) return 'rejected'
  return 'unavailable'
}

export interface AiProbeResponse { status: number }
export type AiProbeFetch = (url: string, init: { method: 'GET'; headers: { Authorization: string; Accept: string }; redirect: 'error'; signal: AbortSignal }) => Promise<AiProbeResponse>

export async function probeAiKey(provider: AiProviderId, apiKey: string, fetchImpl: AiProbeFetch = (url, init) => globalThis.fetch(url, init)): Promise<AiProbe> {
  try {
    const response = await fetchImpl(AI_PROBE_URL[provider], {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey.trim()}`, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
    })
    return aiProbeResult(response.status)
  } catch {
    return 'unavailable'
  }
}

export function parseAiCredential(raw: string | null): AiCredential | null {
  if (!raw) return null
  let value: unknown
  try { value = JSON.parse(raw) } catch { return null }
  if (typeof value !== 'object' || value === null) return null
  const record = value as { provider?: unknown; apiKey?: unknown; consentedAt?: unknown; verifiedAt?: unknown }
  if (record.provider !== 'openrouter' && record.provider !== 'vercel-gateway') return null
  if (typeof record.apiKey !== 'string' || !aiKeyAccepted(record.apiKey, true)) return null
  return {
    provider: record.provider,
    apiKey: record.apiKey.trim(),
    consentedAt: typeof record.consentedAt === 'string' ? record.consentedAt : '',
    verifiedAt: typeof record.verifiedAt === 'string' ? record.verifiedAt : '',
  }
}

export function serializeAiCredential(value: AiCredential): string {
  return JSON.stringify({
    provider: value.provider,
    apiKey: value.apiKey.trim(),
    consentedAt: value.consentedAt,
    verifiedAt: value.verifiedAt,
  })
}
