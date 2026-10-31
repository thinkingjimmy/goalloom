/**
 * [INPUT]: Main-owned device preference, legacy local storage and synchronized changes.
 * [OUTPUT]: Hydrated automatic-placement state and immediate local preference updates without remote echoes or debounced reports; toggles never mutate existing task order.
 * [POS]: Renderer preference mirror; startup hydration precedes the first snapshot and system reconciliation.
 */
import { useSyncExternalStore } from 'react'

const key = 'goalloom.parent-order'
function load(): boolean { try { return localStorage.getItem(key) === 'true' } catch { return false } }
let state = { enabled: load() }
let revision = 0, writeRevision = 0, pending = 0, subscribed = false
const listeners = new Set<() => void>()
function update(enabled: boolean) {
  if (state.enabled === enabled) return
  state = { enabled }; revision++
  try { localStorage.setItem(key, String(enabled)) } catch { /* Keep this session usable if device storage is unavailable. */ }
  for (const listener of listeners) listener()
}
export async function startParentOrder(): Promise<void> {
  const api = window.goalloom
  if (!subscribed && api?.onDevicePrefs) {
    subscribed = true
    api.onDevicePrefs(entries => {
      for (const entry of entries) if (entry.key === 'parentOrder' && typeof entry.value === 'boolean') applyParentOrder(entry.value)
    })
  }
  const before = revision
  const enabled = await api?.initializeParentOrder?.(state.enabled).catch(() => undefined)
  if (before === revision && !pending && typeof enabled === 'boolean') update(enabled)
}
export function currentParentOrder(): boolean { return state.enabled }
export function applyParentOrder(enabled: boolean) { if (!pending) update(enabled) }
export function setParentOrder(enabled: boolean) {
  if (state.enabled === enabled) return
  update(enabled)
  const api = typeof window === 'undefined' ? undefined : window.goalloom
  if (!api?.setParentOrder) return
  const request = pending = ++writeRevision
  void api.setParentOrder(enabled).then(current => {
    if (pending !== request) return
    pending = 0; update(current)
  }).catch(() => { if (pending === request) pending = 0 })
}
export function useParentOrder() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => state)
}
