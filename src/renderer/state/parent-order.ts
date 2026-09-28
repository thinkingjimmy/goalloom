/**
 * [INPUT]: Device storage and confirmed materialization receipts with generation/revision guards.
 * [OUTPUT]: Local ordering preference and a temporary projection until visible planning reads catch up.
 * [POS]: Display preference store; persisted order belongs to the workspace, the switch does not.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useSyncExternalStore } from 'react'

const key = 'goalloom.parent-order'
function load(): boolean { try { return localStorage.getItem(key) === 'true' } catch { return false } }
let state: { enabled: boolean; pending: { generation: string; revision: number } | null } = { enabled: load(), pending: null }
const listeners = new Set<() => void>()
function update(next: typeof state) {
  state = next
  try { localStorage.setItem(key, String(next.enabled)) } catch { /* Keep this session usable when device storage is unavailable. */ }
  for (const listener of listeners) listener()
}
export function enableParentOrder() { update({ enabled: true, pending: null }) }
export function parentOrderMaterialized(generation: string, revision: number) { update({ enabled: false, pending: { generation, revision } }) }
export function finishParentOrder(generation: string, revision: number, ready: boolean) {
  if (state.pending && (state.pending.generation !== generation || ready && revision >= state.pending.revision)) update({ ...state, pending: null })
}
export function useParentOrder() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => state)
}
