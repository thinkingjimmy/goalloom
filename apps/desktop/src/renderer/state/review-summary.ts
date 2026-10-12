/**
 * [INPUT]: Reviewed period keys, bounded review context/preferences, localStorage and the existing review IPC helper.
 * [OUTPUT]: Prepared summary identities, generation-scoped persistence and shared pending requests with optional refresh.
 * [POS]: Device-only review cache; stores at most 24 results and prompt hashes, never prompts, keys or workspace writes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { parseReview, reviewPrompt } from '../../domain/smart/insight'
import type { InsightPrefs, ReviewRequest, ReviewText } from '../../shared/contracts/smart-input'
import { enrichInsightRequest, insightDependencyKey } from './insight-context'
import { requestReview, type InsightResult } from './insight'

type Request = Omit<ReviewRequest, 'requestId' | 'prefs'>
interface Entry { key: string; fingerprint: string; value: ReviewText }
interface Cache { version: 1; generation: string; entries: Entry[] }
const storageKey = 'goalloom.review-summaries'
let cache: Cache | null = null
const pending = new Map<string, { input: string; ticket: object; promise: Promise<InsightResult<ReviewText>> }>()
const failed = (): InsightResult<ReviewText> => ({ ok: false, failure: null })

function persist(value: Cache): void {
  try { localStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* Keep the session cache when storage is unavailable. */ }
}
export function syncReviewSummaryGeneration(generation: string): void {
  if (cache?.generation === generation) return
  pending.clear()
  cache = { version: 1, generation, entries: [] }
  try {
    const raw = localStorage.getItem(storageKey)
    const saved = raw && raw.length <= 256_000 ? JSON.parse(raw) : null
    if (saved?.version === 1 && saved.generation === generation && Array.isArray(saved.entries)) {
      cache.entries = saved.entries.slice(-24).flatMap((entry: Entry) => {
        try {
          if (typeof entry.key !== 'string' || entry.key.length > 256 || !/^[a-f0-9]{64}$/.test(entry.fingerprint)) return []
          return [{ key: entry.key, fingerprint: entry.fingerprint, value: parseReview(JSON.stringify(entry.value)) }]
        } catch { return [] }
      })
    }
  } catch { /* Invalid saved data is a cache miss. */ }
  persist(cache)
}

export function prepareReviewSummary(request: Request, periods: string[], prefs: InsightPrefs) {
  const key = JSON.stringify([request.scope, ...periods])
  // Hash the real prompt so wording changes invalidate results, while draft-only preferences do not.
  const input = JSON.stringify([request.generation, key, reviewPrompt({ ...request, requestId: '', prefs })])
  return { key, input, request, prefs }
}

export function loadReviewSummary(prepared: ReturnType<typeof prepareReviewSummary>, refresh = false): Promise<InsightResult<ReviewText>> {
  const { key, input, request, prefs } = prepared
  syncReviewSummaryGeneration(request.generation)
  const current = cache!
  const existing = pending.get(key)
  if (existing?.input === input) return existing.promise
  const ticket = {}
  const ownsRequest = () => cache === current && pending.get(key)?.ticket === ticket
  const promise = (async (): Promise<InsightResult<ReviewText>> => {
    const projected = await enrichInsightRequest(request)
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([input, insightDependencyKey(projected)])))
    if (!ownsRequest()) return failed()
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const saved = current.entries.find(entry => entry.key === key && entry.fingerprint === fingerprint)
    if (saved && !refresh) return { ok: true, value: saved.value }
    const result = await requestReview(projected, prefs)
    if (result.ok && ownsRequest()) {
      current.entries = [...current.entries.filter(entry => entry.key !== key), { key, fingerprint, value: result.value }].slice(-24)
      persist(current)
    }
    return result
  })().catch(failed).finally(() => { if (ownsRequest()) pending.delete(key) })
  pending.set(key, { input, ticket, promise })
  return promise
}
