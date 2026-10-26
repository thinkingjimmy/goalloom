/**
 * [INPUT]: Validated finite billing IPC and account-bound main notifications.
 * [OUTPUT]: Live trusted Plus state and explicit actions with account-revision guards.
 * [POS]: Renderer subscription only. Eligibility and all payment decisions stay in the backend.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useCallback, useEffect, useState } from 'react'
import type { BillingAction, BillingState } from '../../shared/contracts/billing'
import { desktopApi } from './use-workspace'

export function useBilling(): { state: BillingState | null; run: (action: BillingAction) => Promise<BillingState | null> } {
  const [state, setState] = useState<BillingState | null>(null)
  useEffect(() => {
    const api = desktopApi()
    let live = true, revision = 0
    const dispose = api.onBilling(next => { revision++; if (live) setState(next) })
    const start = revision
    void api.billing({ type: 'status' }).then(next => { if (live && revision === start) setState(next) }).catch(() => undefined)
    return () => { live = false; dispose() }
  }, [])
  const run = useCallback(async (action: BillingAction) => {
    const owner = state?.accountId
    if (action.type !== 'status' && action.type !== 'refresh' && !owner) return null
    try { return await desktopApi().billing(action.type === 'status' || action.type === 'refresh' ? action : { ...action, expectedAccountId: owner! }) }
    catch { setState(current => current ? { ...current, busy: false, error: 'billing_unavailable' } : current); return null }
  }, [state?.accountId])
  return { state, run }
}
