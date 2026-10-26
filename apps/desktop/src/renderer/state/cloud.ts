/**
 * [INPUT]: Finite cloud IPC and account changes from the sync projection.
 * [OUTPUT]: Shared non-secret lifecycle/copy state without interrupting editor focus.
 * [POS]: Renderer cloud subscription. Main owns all requests, receipts and file grants.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useEffect, useSyncExternalStore } from 'react'
import type { CloudAction, CloudState } from '../../shared/contracts/cloud'
import { desktopApi } from './use-workspace'
let state: CloudState | null = null
const listeners = new Set<() => void>()
const publish = () => { for (const listener of listeners) listener() }
export async function runCloud(action: CloudAction) {
  const reply = await desktopApi().cloud(action)
  if (reply.type === 'state') { state = reply.state; publish() }
  else if (reply.type === 'copy') { const current = await desktopApi().cloud({ type: 'status' }); if (current.type === 'state') { state = current.state; publish() } }
  return reply
}
export function useCloud(accountId?: string | null) {
  const value = useSyncExternalStore(callback => { listeners.add(callback); return () => { listeners.delete(callback) } }, () => state, () => state)
  useEffect(() => {
    if (accountId === undefined) return
    const check = () => { void runCloud(accountId ? { type: 'refresh', expectedAccountId: accountId } : { type: 'status' }).catch(() => undefined) }
    check()
    const timer = setInterval(() => { if (document.visibilityState === 'visible') check() }, 60_000)
    return () => clearInterval(timer)
  }, [accountId])
  return value
}
