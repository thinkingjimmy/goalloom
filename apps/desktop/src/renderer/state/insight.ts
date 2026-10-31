/**
 * [INPUT]: Device-local storage, React useSyncExternalStore, the preload smart API and the current SmartStatus.
 * [OUTPUT]: useInsightSettings, insightReady, separate bounded completion/dismissal marks and draft/review IPC helpers with preference snapshots.
 * [POS]: renderer/state 的流程洞察入口。偏好、断点和复盘开关会同步；已复盘、已忽略和引导标记留在本机。模型调用经 main 的 smart 通道。
 */
import { aiSourceOptions } from './ai-scope'
import { useSyncExternalStore } from 'react'
import type { DraftRequest, DraftTitle, Failure, InsightPrefs, ReviewRequest, ReviewText, SmartStatus } from '../../shared/contracts/smart-input'
import { noteDevicePref } from './device-pref-bus'
import { desktopApi } from './use-workspace'

export interface InsightSettings {
  prefs: InsightPrefs
  breakpoints: boolean
  reviews: boolean
  onboarded: boolean
  // Period keys (`week:2026-09-21`) that were reviewed or skipped; bounded so the entry stays small.
  reviewed: string[]
  // Dismissal keys include the workspace generation and never mark a review complete.
  dismissed: string[]
}
const key = 'goalloom.insight'
export const defaultPrefs: InsightPrefs = { about: '', stepSize: 'hour', stepNotes: '', tone: 'direct', focus: ['gap', 'overload'] }
const defaults: InsightSettings = { prefs: defaultPrefs, breakpoints: true, reviews: true, onboarded: false, reviewed: [], dismissed: [] }

function load(): InsightSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<InsightSettings> | null
    if (!raw || typeof raw !== 'object') return defaults
    const prefs = { ...defaultPrefs, ...(raw.prefs ?? {}) }
    return { ...defaults, ...raw, prefs,
      reviewed: Array.isArray(raw.reviewed) ? raw.reviewed.filter(value => typeof value === 'string').slice(-24) : [],
      dismissed: Array.isArray(raw.dismissed) ? raw.dismissed.filter(value => typeof value === 'string').slice(-24) : [] }
  } catch { return defaults }
}

let current = load()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
function samePrefs(left: InsightPrefs, right: InsightPrefs): boolean {
  return left.about === right.about && left.stepSize === right.stepSize && left.stepNotes === right.stepNotes && left.tone === right.tone
    && left.focus.length === right.focus.length && left.focus.every((item, index) => item === right.focus[index])
}

export function updateInsight(change: (value: InsightSettings) => InsightSettings, report = true): void {
  const previous = current
  current = change(current)
  try { localStorage.setItem(key, JSON.stringify(current)) } catch { /* Device preference only; the session keeps working without persistence. */ }
  listeners.forEach(listener => listener())
  if (!report) return
  if (!samePrefs(previous.prefs, current.prefs)) noteDevicePref('insight.prefs', current.prefs)
  if (previous.breakpoints !== current.breakpoints) noteDevicePref('insight.breakpoints', current.breakpoints)
  if (previous.reviews !== current.reviews) noteDevicePref('insight.reviews', current.reviews)
}

export function applyInsightPrefs(prefs: InsightPrefs): void {
  updateInsight(value => ({ ...value, prefs: { ...defaultPrefs, ...prefs, focus: Array.isArray(prefs.focus) ? prefs.focus : value.prefs.focus } }), false)
}
export function applyInsightBreakpoints(breakpoints: boolean): void {
  if (current.breakpoints !== breakpoints) updateInsight(value => ({ ...value, breakpoints }), false)
}
export function applyInsightReviews(reviews: boolean): void {
  if (current.reviews !== reviews) updateInsight(value => ({ ...value, reviews }), false)
}
export const insightSettings = (): InsightSettings => current
export function useInsightSettings(): InsightSettings { return useSyncExternalStore(subscribe, () => current) }
export function markReviewed(periodKeys: string[]): void {
  updateInsight(value => periodKeys.every(key => value.reviewed.includes(key)) ? value
    : { ...value, reviewed: [...new Set([...value.reviewed, ...periodKeys])].slice(-24) })
}
export function dismissReviews(generation: string, periodKeys: string[]): void {
  const keys = periodKeys.map(key => `${generation}:${key}`)
  updateInsight(value => keys.every(key => value.dismissed.includes(key)) ? value
    : { ...value, dismissed: [...new Set([...value.dismissed, ...keys])].slice(-24) })
}

// Drafting follows the insight feature's own switch and provider, independent of smart input.
export function insightReady(status: SmartStatus | null): boolean {
  return !!status?.features.insight.enabled
}

export type InsightResult<T> = { ok: true; value: T } | { ok: false; failure: Failure | null }
export async function requestDraft(request: Omit<DraftRequest, 'requestId' | 'prefs'>, prefs: InsightPrefs = current.prefs, regenerate = false): Promise<InsightResult<DraftTitle[]>> {
  try {
    const reply = await desktopApi().smart({ type: 'draft', ...aiSourceOptions('insight'), request: { ...request, requestId: crypto.randomUUID(), ...(regenerate ? { retryId: crypto.randomUUID() } : {}), prefs } })
    if (reply.type !== 'draft') return { ok: false, failure: null }
    return reply.reply.status === 'ready' ? { ok: true, value: reply.reply.value } : { ok: false, failure: reply.reply.failure }
  } catch { return { ok: false, failure: null } }
}
export async function requestReview(request: Omit<ReviewRequest, 'requestId' | 'prefs'>, prefs: InsightPrefs = current.prefs, regenerate = false): Promise<InsightResult<ReviewText>> {
  try {
    const reply = await desktopApi().smart({ type: 'review', ...aiSourceOptions('insight'), request: { ...request, requestId: crypto.randomUUID(), ...(regenerate ? { retryId: crypto.randomUUID() } : {}), prefs } })
    if (reply.type !== 'review') return { ok: false, failure: null }
    return reply.reply.status === 'ready' ? { ok: true, value: reply.reply.value } : { ok: false, failure: reply.reply.failure }
  } catch { return { ok: false, failure: null } }
}
