/**
 * [INPUT]: Destination period, bounded drafting inputs/preferences, localStorage and the existing draft IPC helper.
 * [OUTPUT]: Scoped persisted suggestions, stable automatic intent keys, explicit regeneration and shared pending requests.
 * [POS]: Review-only draft cache; stores at most 24 sanitised results and prompt hashes, never prompts or keys.
 */
import { cleanTitle, draftPrompt } from '../../domain/smart/insight'
import type { DraftRequest, DraftTitle, InsightPrefs } from '../../shared/contracts/smart-input'
import { aiScope } from './ai-scope'
import { enrichInsightRequest, insightDependencyKey } from './insight-context'
import { insightSettings, requestDraft, type InsightResult } from './insight'

type Request = Omit<DraftRequest, 'requestId' | 'prefs'>
interface Entry { key: string; fingerprint: string; value: DraftTitle[] }
interface Cache { version: 1; generation: string; entries: Entry[] }
const storageKey = 'goalloom.review-drafts'
let cache: Cache | null = null
const pending = new Map<string, { scope: string | null; input: string; ticket: object; promise: Promise<InsightResult<DraftTitle[]>> }>()
const failed = (): InsightResult<DraftTitle[]> => ({ ok: false, failure: null })

function persist(value: Cache): void {
  try { localStorage.setItem(storageKey, JSON.stringify(value)) } catch { /* Session reuse still works when storage is unavailable. */ }
}
function validTitles(value: unknown): value is DraftTitle[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 8 && value.every(entry => {
    if (!entry || typeof entry !== 'object') return false
    return typeof entry.id === 'string' && entry.id.length <= 64 &&
      typeof entry.title === 'string' && cleanTitle(entry.title) === entry.title &&
      typeof entry.why === 'string' && entry.why.length <= 80
  })
}
export function syncReviewDraftGeneration(generation: string): void {
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
          return validTitles(entry.value) ? [{ key: entry.key, fingerprint: entry.fingerprint, value: entry.value }] : []
        } catch { return [] }
      })
    }
  } catch { /* Invalid saved data is a cache miss. */ }
  persist(cache)
}

export function requestReviewDraft(request: Request, periodKey: string, prefs: InsightPrefs = insightSettings().prefs, regenerate = false): Promise<InsightResult<DraftTitle[]>> {
  syncReviewDraftGeneration(request.generation)
  const current = cache!
  // Use the actual prompt: text, periods and drafting preferences matter; versions and review-only preferences do not.
  const input = JSON.stringify([request.generation, periodKey, draftPrompt({ ...request, requestId: '', prefs })])
  const existing = pending.get(periodKey)
  if (existing?.input === input && existing.scope === aiScope()) return existing.promise
  const ticket = {}
  let scope = aiScope()
  const ownsTicket = () => cache === current && pending.get(periodKey)?.ticket === ticket
  const ownsRequest = () => scope === aiScope() && ownsTicket()
  const promise = (async (): Promise<InsightResult<DraftTitle[]>> => {
    const projected = await enrichInsightRequest(request)
    if (scope !== null && scope !== aiScope()) return failed()
    scope = aiScope()
    const entry = pending.get(periodKey)
    if (entry?.ticket === ticket) entry.scope = scope
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([input, scope, insightDependencyKey(projected)])))
    if (!ownsRequest()) return failed()
    const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
    const saved = current.entries.find(entry => entry.key === periodKey && entry.fingerprint === fingerprint)
    if (saved && !regenerate) return { ok: true, value: saved.value }
    const result = await requestDraft({ ...projected, intentKey: periodKey }, prefs, regenerate)
    if (!ownsRequest()) return failed()
    if (result.ok) {
      current.entries = [...current.entries.filter(entry => entry.key !== periodKey), { key: periodKey, fingerprint, value: result.value }].slice(-24)
      persist(current)
    }
    return result
  })().catch(failed).finally(() => { if (ownsTicket()) pending.delete(periodKey) })
  pending.set(periodKey, { scope, input, ticket, promise })
  return promise
}
