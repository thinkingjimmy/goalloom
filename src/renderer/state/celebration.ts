/**
 * [INPUT]: Canonical planning horizons, device-local storage, system motion preference and React useSyncExternalStore.
 * [OUTPUT]: Per-column controls, settings previews, generation-bound review celebration requests and useReducedMotion.
 * [POS]: Renderer display preferences outside workspace history, exports and backups; only overrides are persisted.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useSyncExternalStore } from 'react'
import type { ItemHorizon } from '../../shared/contracts/entities'
import { horizons } from '../../shared/contracts/values'

const key = 'goalloom.celebration'
const defaults: Record<ItemHorizon, boolean> = { later: false, year: true, half: true, cycle: true, month: true, week: true, day: false }

function load(): Record<ItemHorizon, boolean> {
  const result = { ...defaults }
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? '{}')
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const stored = value as Record<string, unknown>
      for (const horizon of horizons) {
        if (typeof stored[horizon] === 'boolean') result[horizon] = stored[horizon]
      }
    }
  } catch { /* Missing or invalid storage uses the per-column defaults. */ }
  return result
}

let enabled = load()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

function setEnabled(horizon: ItemHorizon, next: boolean) {
  if (enabled[horizon] === next) return
  enabled = { ...enabled, [horizon]: next }
  const overrides = Object.fromEntries(horizons.filter(entry => enabled[entry] !== defaults[entry]).map(entry => [entry, enabled[entry]]))
  try {
    if (Object.keys(overrides).length) localStorage.setItem(key, JSON.stringify(overrides))
    else localStorage.removeItem(key)
  } catch { /* Display preference only; the session keeps working without persistence. */ }
  listeners.forEach(listener => listener())
}

export function isCelebrationEnabled(horizon: ItemHorizon): boolean { return enabled[horizon] }

export function useCelebration(): { enabled: Record<ItemHorizon, boolean>; setEnabled: (horizon: ItemHorizon, next: boolean) => void } {
  return { enabled: useSyncExternalStore(subscribe, () => enabled), setEnabled }
}

const previewListeners = new Set<() => void>()
/** Plays one celebration now regardless of column settings; the player still honours reduced motion. */
export function previewCelebration() { previewListeners.forEach(listener => listener()) }
export function onCelebrationPreview(listener: () => void): () => void {
  previewListeners.add(listener)
  return () => { previewListeners.delete(listener) }
}

interface ReviewCelebration { id: string; generation: string; horizon: 'week' | 'month' }
const reviewListeners = new Set<(event: ReviewCelebration) => void>()
export function requestReviewCelebration(generation: string, horizon: 'week' | 'month'): void {
  const event = { id: `review:${crypto.randomUUID()}`, generation, horizon }
  reviewListeners.forEach(listener => listener(event))
}
export function onReviewCelebration(listener: (event: ReviewCelebration) => void): () => void {
  reviewListeners.add(listener)
  return () => { reviewListeners.delete(listener) }
}

const motion = typeof window === 'undefined' ? undefined : window.matchMedia('(prefers-reduced-motion: reduce)')
const subscribeMotion = (listener: () => void) => {
  motion?.addEventListener('change', listener)
  return () => motion?.removeEventListener('change', listener)
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, () => motion?.matches ?? false)
}
