/**
 * [INPUT]: Device storage, synced display preferences, board interaction holds and React subscriptions.
 * [OUTPUT]: A default-inline completed-task preference with local persistence and settings sync.
 * [POS]: Board display store; completion never changes task positions or undo membership.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useSyncExternalStore } from 'react'
import { noteDevicePref } from './device-pref-bus'

const key = 'goalloom.collapse-completed'
function load(): boolean { try { return localStorage.getItem(key) === 'true' } catch { return false } }
let collapsed = load()
let pendingRemote: boolean | null = null
const holds = new Set<symbol>()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

function update(value: boolean, report: boolean) {
  if (collapsed === value) return
  collapsed = value
  try { localStorage.setItem(key, String(value)) } catch { /* Keep the display usable when device storage is unavailable. */ }
  listeners.forEach(listener => listener())
  if (report) noteDevicePref('collapseCompleted', value)
}

export function currentCollapseCompleted(): boolean { return collapsed }
export function setCollapseCompleted(value: boolean): void { pendingRemote = null; update(value, true) }
export function applyCollapseCompleted(value: boolean): void {
  if (holds.size) { pendingRemote = value; return }
  update(value, false)
}
/** A remote layout change must not unmount an active title draft or drag source. */
export function holdCompletedLayout(): () => void {
  const token = Symbol()
  holds.add(token)
  return () => {
    holds.delete(token)
    if (!holds.size && pendingRemote !== null) {
      const value = pendingRemote; pendingRemote = null
      update(value, false)
    }
  }
}
export function useCollapseCompleted(): boolean { return useSyncExternalStore(subscribe, currentCollapseCompleted) }
