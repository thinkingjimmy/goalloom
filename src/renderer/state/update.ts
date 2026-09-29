/**
 * [INPUT]: preload update API (status/check/install and pushed phase changes).
 * [OUTPUT]: useUpdate: one shared app version + updater phase for the top bar dot, Settings nav and About pane; checkForUpdate / installUpdate; hasUpdate derivation.
 * [POS]: renderer/state's single software-update store; subscribes once per renderer and never polls — main owns the schedule.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useSyncExternalStore } from 'react'
import type { UpdateInfo } from '../../shared/contracts/update'
import { desktopApi } from './use-workspace'

let info: UpdateInfo | null = null
let started = false
const listeners = new Set<() => void>()

function publish(next: UpdateInfo): void {
  info = next
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (!started) {
    started = true
    try {
      desktopApi().onUpdate(publish)
      void desktopApi().update('status').then(publish, () => undefined)
    } catch { /* Without the desktop bridge there is nothing to update. */ }
  }
  return () => { listeners.delete(listener) }
}

export function useUpdate(): UpdateInfo | null { return useSyncExternalStore(subscribe, () => info) }
export const checkForUpdate = () => { void desktopApi().update('check').then(publish, () => undefined) }
export const installUpdate = () => { void desktopApi().update('install').catch(() => undefined) }
// Shown as soon as a newer release is found, not only once it is staged.
export const hasUpdate = (value: UpdateInfo | null): boolean => value?.state.phase === 'downloading' || value?.state.phase === 'ready'
