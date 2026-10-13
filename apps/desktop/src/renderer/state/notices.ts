/**
 * [INPUT]: A notice id and the token for its current condition (null when the condition is absent).
 * [OUTPUT]: Whether that notice is open, and a device-local dismissal that lasts until the token changes.
 * [POS]: Renderer display preference outside workspace history, exports and backups.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useSyncExternalStore } from 'react'

const storageKey = 'goalloom.dismissedNotices'

export function readDismissed(raw: string | null): Record<string, string> {
  try {
    const value: unknown = JSON.parse(raw ?? '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
  } catch { return {} }
}

/** Open only while a condition exists and it is not the one the user already closed. */
export function noticeOpen(dismissed: string | undefined, token: string | null): boolean {
  return token !== null && dismissed !== token
}

/** The mismatch is the system zone paired with the workspace zone the banner names. */
export function timezoneNoticeToken(systemZone: string, workspaceZone: string): string | null {
  return systemZone === workspaceZone ? null : `${systemZone}\n${workspaceZone}`
}

export function withDismissal(raw: string | null, id: string, token: string): string {
  return JSON.stringify({ ...readDismissed(raw), [id]: token })
}

let current = readStored()
const listeners = new Set<() => void>()

function readStored(): Record<string, string> {
  try { return readDismissed(localStorage.getItem(storageKey)) } catch { return {} }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function commit(next: Record<string, string>) {
  current = next
  try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* This session still hides the notice. */ }
  for (const listener of listeners) listener()
}

export function useDismissedNotice(id: string, token: string | null): { open: boolean; dismiss: () => void } {
  const map = useSyncExternalStore(subscribe, () => current)
  const dismiss = useCallback(() => {
    if (token === null) return
    commit({ ...current, [id]: token })
  }, [id, token])
  return { open: noticeOpen(map[id], token), dismiss }
}
