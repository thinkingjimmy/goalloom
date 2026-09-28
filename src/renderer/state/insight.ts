/**
 * [INPUT]: Device-local storage, React useSyncExternalStore, the preload smart API and the current SmartStatus.
 * [OUTPUT]: useInsightSettings (preferences, toggles, onboarding/review marks), insightReady(status), requestDraft / requestReview.
 * [POS]: renderer/state 的流程洞察入口；偏好只存本机（不进工作区、导出或备份），模型调用经 main 的 smart 通道。
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useSyncExternalStore } from 'react'
import type { DraftRequest, DraftTitle, Failure, InsightPrefs, ReviewRequest, ReviewText, SmartStatus } from '../../shared/contracts/smart-input'
import { desktopApi } from './use-workspace'

export interface InsightSettings {
  prefs: InsightPrefs
  breakpoints: boolean
  reviews: boolean
  onboarded: boolean
  // Period keys (`week:2026-09-21`) that were reviewed or skipped; bounded so the entry stays small.
  reviewed: string[]
}
const key = 'goalloom.insight'
export const defaultPrefs: InsightPrefs = { about: '', stepSize: 'hour', stepNotes: '', tone: 'direct', focus: ['gap', 'overload'] }
const defaults: InsightSettings = { prefs: defaultPrefs, breakpoints: true, reviews: true, onboarded: false, reviewed: [] }

function load(): InsightSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<InsightSettings> | null
    if (!raw || typeof raw !== 'object') return defaults
    const prefs = { ...defaultPrefs, ...(raw.prefs ?? {}) }
    return { ...defaults, ...raw, prefs, reviewed: Array.isArray(raw.reviewed) ? raw.reviewed.filter(value => typeof value === 'string').slice(-24) : [] }
  } catch { return defaults }
}

let current = load()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function updateInsight(change: (value: InsightSettings) => InsightSettings): void {
  current = change(current)
  try { localStorage.setItem(key, JSON.stringify(current)) } catch { /* Device preference only; the session keeps working without persistence. */ }
  listeners.forEach(listener => listener())
}
export const insightSettings = (): InsightSettings => current
export function useInsightSettings(): InsightSettings { return useSyncExternalStore(subscribe, () => current) }
export function markReviewed(periodKey: string): void {
  updateInsight(value => value.reviewed.includes(periodKey) ? value : { ...value, reviewed: [...value.reviewed, periodKey].slice(-24) })
}

// The flash model needs the OpenRouter key; Jev on another provider does not make drafting available.
export function insightReady(status: SmartStatus | null): boolean {
  return !!status?.enabled && status.providers.openrouter.credential === 'saved' && !!status.providers.openrouter.consentedAt
}

export type InsightResult<T> = { ok: true; value: T } | { ok: false; failure: Failure | null }
export async function requestDraft(request: Omit<DraftRequest, 'requestId' | 'prefs'>): Promise<InsightResult<DraftTitle[]>> {
  try {
    const reply = await desktopApi().smart({ type: 'draft', request: { ...request, requestId: crypto.randomUUID(), prefs: current.prefs } })
    if (reply.type !== 'draft') return { ok: false, failure: null }
    return reply.reply.status === 'ready' ? { ok: true, value: reply.reply.value } : { ok: false, failure: reply.reply.failure }
  } catch { return { ok: false, failure: null } }
}
export async function requestReview(request: Omit<ReviewRequest, 'requestId' | 'prefs'>, prefs: InsightPrefs = current.prefs): Promise<InsightResult<ReviewText>> {
  try {
    const reply = await desktopApi().smart({ type: 'review', request: { ...request, requestId: crypto.randomUUID(), prefs } })
    if (reply.type !== 'review') return { ok: false, failure: null }
    return reply.reply.status === 'ready' ? { ok: true, value: reply.reply.value } : { ok: false, failure: reply.reply.failure }
  } catch { return { ok: false, failure: null } }
}
