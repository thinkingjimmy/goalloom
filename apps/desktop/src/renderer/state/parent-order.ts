/**
 * [INPUT]: Device storage and synchronized preference changes.
 * [OUTPUT]: Automatic-placement preference; toggles never mutate existing task order.
 * [POS]: Submission policy only. The board always follows persisted placements.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useSyncExternalStore } from 'react'
import { noteDevicePref } from './device-pref-bus'

const key = 'goalloom.parent-order'
function load(): boolean { try { return localStorage.getItem(key) === 'true' } catch { return false } }
let state = { enabled: load() }
const listeners = new Set<() => void>()
function update(enabled: boolean, report: boolean) {
  if (state.enabled === enabled) return
  state = { enabled }
  try { localStorage.setItem(key, String(enabled)) } catch { /* Keep this session usable if device storage is unavailable. */ }
  for (const listener of listeners) listener()
  if (report) noteDevicePref('parentOrder', enabled)
}
export function currentParentOrder(): boolean { return state.enabled }
export function applyParentOrder(enabled: boolean) { update(enabled, false) }
export function setParentOrder(enabled: boolean) { update(enabled, true) }
export function useParentOrder() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => state)
}
