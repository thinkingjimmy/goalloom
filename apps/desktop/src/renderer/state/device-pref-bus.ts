/**
 * [INPUT]: Renderer preference writes and the preload device-prefs channel.
 * [OUTPUT]: Debounced reports of user changes, and a suppress flag while a remote batch is applied.
 * [POS]: Renderer side of settings sync. Reviewed, dismissed, onboarded and in-flight parent-order receipts never enter this bus.
 */
import type { DevicePrefEntry } from '../../shared/contracts/runtime'

let suppress = 0
const pending = new Map<string, unknown>()
let timer: ReturnType<typeof setTimeout> | undefined

function bridge() {
  return typeof window === 'undefined' ? undefined : window.goalloom
}

export function noteDevicePref(key: string, value: unknown): void {
  if (suppress > 0 || !bridge()) return
  pending.set(key, value)
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { void flush() }, 250)
}

async function flush(): Promise<void> {
  timer = undefined
  const api = bridge()
  const entries: DevicePrefEntry[] = [...pending].map(([key, value]) => ({ key, value }))
  pending.clear()
  if (!entries.length || !api) return
  try { await api.reportDevicePrefs(entries, 'change') } catch { /* The next local edit reports again. */ }
}

export async function suppressDevicePrefs(fn: () => void | Promise<void>): Promise<void> {
  suppress += 1
  try { await fn() } finally { suppress -= 1 }
}
