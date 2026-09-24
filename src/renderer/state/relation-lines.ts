/**
 * [INPUT]: Device-local storage and React useSyncExternalStore.
 * [OUTPUT]: useRelationLines: whether a single-flow filter draws parent/child lines, plus its setter shared by Settings and the board.
 * [POS]: Local renderer display preference outside workspace history, exports and backups; defaults to on and stores only `false`.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useSyncExternalStore } from 'react'

const key = 'goalloom.relationLines'

function load(): boolean {
  try { return localStorage.getItem(key) !== 'false' } catch { return true }
}

let enabled = load()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

function save(next: boolean) {
  enabled = next
  try { next ? localStorage.removeItem(key) : localStorage.setItem(key, 'false') } catch { /* Display preference only; the session keeps working without persistence. */ }
  listeners.forEach(listener => listener())
}

export function useRelationLines(): { enabled: boolean; setEnabled: (next: boolean) => void } {
  return { enabled: useSyncExternalStore(subscribe, () => enabled), setEnabled: save }
}
