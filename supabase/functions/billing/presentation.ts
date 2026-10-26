// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Validated fixed catalogue, authoritative status and finite operation-bound continuation.
 * [OUTPUT]: Safe cycle/amount presentation and canonical website return URLs without client destinations.
 * [POS]: D1 billing HTTP presentation. It neither grants access nor derives identity from a return.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { priceCatalog, uuid, type BillingConfig, type Cycle } from './config.ts'
export type Continuation = { version: 1; id: string; locale: 'en'|'zh-CN'|'ja'|'es'|'fr' }
  & ({ transport: 'app' } | { transport: 'loopback'; port: number })
export function parseContinuation(value: unknown, environment: BillingConfig['environment']): Continuation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid_request')
  const data = value as Record<string, unknown>
  const keys = environment === 'development' ? ['version','id','locale','transport','port'] : ['version','id','locale','transport']
  if (Object.keys(data).length !== keys.length || Object.keys(data).some(key => !keys.includes(key))
    || data.version !== 1 || typeof data.id !== 'string' || !uuid.test(data.id)
    || !['en','zh-CN','ja','es','fr'].includes(String(data.locale))
    || (environment === 'development' ? data.transport !== 'loopback' || !Number.isInteger(data.port)
      || Number(data.port) < 1024 || Number(data.port) > 65535 : data.transport !== 'app')) throw Error('invalid_request')
  return data as Continuation
}
export function continuationUrls(config: BillingConfig, continuation: Continuation): { success: string; cancel: string } {
  const prefix = continuation.locale === 'en' ? '' : `/${continuation.locale}`
  const make = (page: string) => {
    const url = new URL(`https://www.goalloom.com${prefix}/billing/${page}/`)
    url.searchParams.set('v','1'); url.searchParams.set('environment',config.environment)
    url.searchParams.set('continue',continuation.id); url.searchParams.set('transport',continuation.transport)
    if (continuation.transport === 'loopback') url.searchParams.set('port',String(continuation.port))
    return url.href
  }
  return { success: make('return'), cancel: make('continue') }
}
export function presentStatus(value: Record<string, unknown>, config: BillingConfig): Record<string, unknown> {
  if (value.version !== 1 || typeof value.eligible !== 'boolean') return value
  const cycle = (price: unknown): Cycle | null => {
    if (price === null || price === undefined) return null
    for (const name of ['monthly','annual'] as const) if (price === config.prices[name]) return name
    throw Error('billing_review_required')
  }
  if (!Array.isArray(value.subscriptions)) throw Error('billing_configuration')
  return { ...value, environment: config.environment, priceCatalog, subscriptions: value.subscriptions.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw Error('billing_configuration')
    const sub = item as Record<string, unknown>
    return { ...sub, cycle: cycle(sub.price), nextCycle: cycle(sub.nextPrice) }
  }) }
}
