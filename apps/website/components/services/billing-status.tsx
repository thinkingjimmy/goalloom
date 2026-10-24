/**
 * [INPUT]: Localized billing copy, exact route kind and finite BILL-12 browser/session fields.
 * [OUTPUT]: Scrubbed URL, session-only locale recovery, explicit fixed app navigation and manual fallback.
 * [POS]: Static handoff only; no authentication, backend fetch, payment-status inference or automatic app opening.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
'use client'
import { useEffect, useRef, useState } from 'react'
import { appReturn, clearContinuation, continuationSession, type BillingKind, type ContinuationSession } from '@/lib/services/continuation'
import { SITE_URL } from '@/lib/seo/site'
import type { BillingState, ServiceCatalog } from '@/lib/services/types'

export function BillingStatus({ copy, kind }: { copy: ServiceCatalog['billing']; kind: BillingKind }) {
  const [state, setState] = useState<BillingState>('unavailable')
  const [ready, setReady] = useState(false)
  const [session, setSession] = useState<ContinuationSession>({ continuation: null, expiresAt: null, invalid: false })
  const initialized = useRef(false)
  const lastRead = useRef<string | null>(null)
  function update(value: ContinuationSession) {
    setState(!navigator.onLine ? 'offline' : value.invalid ? 'invalid' : value.continuation ? 'appClosed' : 'unavailable')
  }
  useEffect(() => {
    function read() {
      if (lastRead.current === location.href) return
      const search = location.search, hash = location.hash
      if (search || hash) history.replaceState(null, '', location.pathname)
      lastRead.current = location.href
      let value: ContinuationSession = { continuation: null, expiresAt: null, invalid: false }
      try {
        if (location.origin === SITE_URL) value = continuationSession(kind, search, hash, sessionStorage, Date.now())
        else { clearContinuation(sessionStorage); value.invalid = Boolean(search || hash) }
      } catch { /* Restricted storage leaves manual recovery instructions available. */ }
      setSession(value)
      update(value)
      setReady(true)
    }
    if (!initialized.current) { initialized.current = true; read() }
    // Fragment-only navigation does not remount this component.
    window.addEventListener('hashchange', read)
    window.addEventListener('popstate', read)
    return () => { window.removeEventListener('hashchange', read); window.removeEventListener('popstate', read) }
  }, [kind])
  useEffect(() => {
    if (!session.expiresAt) return
    const timer = window.setTimeout(expire, Math.max(0, session.expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [session.expiresAt])
  function expire() {
    try { clearContinuation(sessionStorage) } catch { /* Manual reconciliation does not need browser storage. */ }
    const value = { continuation: null, expiresAt: null, invalid: true }
    setSession(value)
    update(value)
  }
  function check() {
    if (session.expiresAt && Date.now() >= session.expiresAt) expire()
    else update(session)
  }
  return <div className="billing-state" data-billing-state={state}>
    <h2 role="status" aria-live="polite">{copy.states[state]}</h2>
    <p>{copy.explanation}</p>
    {session.continuation && <a className="service-action" data-billing-return href={appReturn(session.continuation)} rel="noreferrer" onClick={event => {
      if (session.expiresAt && Date.now() >= session.expiresAt) { event.preventDefault(); expire() }
    }}>{copy.openApp}</a>}
    <button className="service-action secondary" disabled={!ready} aria-busy={!ready} onClick={check}>{copy.check}</button>
    <p className="billing-manual">{copy.manual}</p>
    <noscript><p>{copy.noScript}</p></noscript>
  </div>
}
