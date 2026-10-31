/**
 * [INPUT]: Device-local storage and React useSyncExternalStore.
 * [OUTPUT]: useRelationLines: whether a single-flow filter draws parent/child lines, plus its setter shared by Settings and the board.
 * [POS]: Renderer display preference. The switch syncs and stays out of task history; defaults to on and stores only `false`.
 */
import { useSyncExternalStore } from 'react'
import { noteDevicePref } from './device-pref-bus'

const key = 'goalloom.relationLines'

function load(): boolean {
  try { return localStorage.getItem(key) !== 'false' } catch { return true }
}

let enabled = load()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }

function save(next: boolean, report: boolean) {
  enabled = next
  try { next ? localStorage.removeItem(key) : localStorage.setItem(key, 'false') } catch { /* Display preference only; the session keeps working without persistence. */ }
  listeners.forEach(listener => listener())
  if (report) noteDevicePref('relationLines', next)
}

export function currentRelationLines(): boolean { return enabled }
export function applyRelationLines(next: boolean): void { if (enabled !== next) save(next, false) }

export function useRelationLines(): { enabled: boolean; setEnabled: (next: boolean) => void } {
  return { enabled: useSyncExternalStore(subscribe, () => enabled), setEnabled: next => save(next, true) }
}
