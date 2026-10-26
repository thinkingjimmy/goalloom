// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Authenticated finite actions or byte-exact signed provider webhook requests.
 * [OUTPUT]: Live-account billing responses, subject-routed inbox and active/settlement-only worker attempts.
 * [POS]: Edge HTTP boundary. No return parameter, event arrival order or client identity grants service.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { type BillingConfig, uuid, validateConfig } from './config.ts'
import { parseJson, rawBody, reply, secretMatches, verifyHmac } from './http.ts'
import { BillingProviders, iso, objectId } from './providers.ts'
import { BillingService, type BillingAction, type OperationIntent, type Rpc } from './service.ts'
import { parseContinuation, presentStatus } from './presentation.ts'
import { ClosedOperation } from './operation.ts'
type Inbox = { provider: string; event_id: string; event_type: string; object_id: string | null; subject_id: string | null; lease: string }
const stripeTypes = new Set(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired',
  'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed',
  'invoice.payment_action_required','charge.refunded','refund.created','refund.updated','charge.dispute.created','charge.dispute.updated',
  'charge.dispute.closed','subscription_schedule.updated','subscription_schedule.released','subscription_schedule.canceled'])
export function createBillingHandler(config: BillingConfig, dependencies: { fetch?: typeof fetch; rpc?: Rpc; providers?: BillingProviders } = {}): (request: Request) => Promise<Response> {
  try { validateConfig(config) }
  catch { return async () => reply({ error: 'billing_configuration' }, 503) }
  const http = dependencies.fetch ?? fetch
  const rpc: Rpc = dependencies.rpc ?? (async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const response = await http(`${config.url}/rest/v1/rpc/${name}`, { method: 'POST',
      headers: { authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey, 'content-type': 'application/json' },
      body: JSON.stringify(args), signal: AbortSignal.timeout(15_000), redirect: 'error' })
    const body = await response.text(); if (body.length > 2 * 1024 * 1024) throw Error('billing_backend_unavailable')
    if (!response.ok) {
      let message: unknown
      try { message = JSON.parse(body).message } catch { /* Unknown backend failures retain the operation. */ }
      if (typeof message === 'string' && ['billing_request_conflict','billing_review_required','invalid_request','continuation_expired','authentication_failed','service_revoked'].includes(message)) throw Error(message)
      throw Error('billing_backend_unavailable')
    }
    return (body.trim() ? JSON.parse(body) : null) as T
  })
  const providers = dependencies.providers ?? new BillingProviders(config, http)
  const service = new BillingService(config, rpc, providers)
  const authenticate = async (request: Request): Promise<{ id: string; sessionId: string | null }> => {
    const authorization = request.headers.get('authorization')
    if (!authorization?.startsWith('Bearer ')) throw Error('authentication_failed')
    let claims
    try { claims = JSON.parse(atob(authorization.slice(7).split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))) }
    catch { throw Error('authentication_failed') }
    if (claims.iss !== `${config.url}/auth/v1` || claims.role !== 'authenticated' || !uuid.test(claims.sub ?? '')
      || !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) throw Error('authentication_failed')
    const auth = await http(`${config.url}/auth/v1/user`, { headers: { authorization, apikey: config.serviceKey }, signal: AbortSignal.timeout(10_000), redirect: 'error' })
    if (!auth.ok) throw Error([401,403].includes(auth.status) ? 'authentication_failed' : 'billing_unavailable')
    const user = await auth.json() as { id?: string }
    if (user.id !== claims.sub) throw Error('authentication_failed')
    return { id: user.id!, sessionId: typeof claims.session_id === 'string' && uuid.test(claims.session_id) ? claims.session_id : null }
  }
  const receive = async (provider: string, id: string, type: string, user: string | null, object: string | null, occurred: number, reason: string | null) => {
    const identity = user ? await service.identity(user) : null
    return rpc('billing_receive', { p_environment: config.environment, p_provider: provider, p_event: id, p_type: type,
      p_user: identity?.subjectId ?? null, p_object: object, p_occurred: iso(occurred), p_reason: reason })
  }
  const customerFor = async (event: Inbox): Promise<string | null> => {
    const id = event.object_id
    if (!id) return null
    if (event.event_type.startsWith('checkout.session.')) return objectId((await providers.stripe.checkout.sessions.retrieve(id)).customer)
    if (event.event_type.startsWith('customer.subscription.')) return objectId((await providers.stripe.subscriptions.retrieve(id)).customer)
    if (event.event_type.startsWith('invoice.')) return objectId((await providers.stripe.invoices.retrieve(id)).customer)
    if (event.event_type.startsWith('charge.dispute.')) {
      const dispute = await providers.stripe.disputes.retrieve(id)
      return objectId((await providers.stripe.charges.retrieve(objectId(dispute.charge)!)).customer)
    }
    if (event.event_type.startsWith('charge.')) return objectId((await providers.stripe.charges.retrieve(id)).customer)
    if (event.event_type.startsWith('refund.')) {
      const refund = await providers.stripe.refunds.retrieve(id)
      return objectId((await providers.stripe.charges.retrieve(objectId(refund.charge)!)).customer)
    }
    if (event.event_type.startsWith('subscription_schedule.')) return objectId((await providers.stripe.subscriptionSchedules.retrieve(id)).customer)
    return null
  }
  return async request => {
    const origin = request.headers.get('origin')
    const cors = origin === config.webOrigin ? origin : undefined
    try {
      validateConfig(config)
      if (origin && !cors) return reply({ error: 'origin_denied' }, 403)
      if (request.method === 'OPTIONS' && cors) return new Response(null, { status: 204, headers: {
        'access-control-allow-origin': cors, 'access-control-allow-methods': 'GET, POST, OPTIONS',
        'access-control-allow-headers': 'Authorization, Content-Type', 'vary': 'Origin' } })
      const route = new URL(request.url).pathname.split('/').filter(Boolean).at(-1)
      if (['stripe','revenuecat'].includes(route ?? '')) {
        if (request.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405)
        const raw = await rawBody(request)
        if (!await verifyHmac(raw, request.headers.get(route === 'stripe' ? 'stripe-signature' : 'x-revenuecat-webhook-signature'),
          route === 'stripe' ? config.stripeWebhookSecret : config.rcWebhookSecret)) return reply({ error: 'signature_invalid' }, 401)
        await service.configured()
        const body = parseJson<{ id: string; created: number; type: string; livemode: boolean; account?: string;
          data?: { object?: { id?: string } }; event?: { id: string; type: string; event_timestamp_ms: number;
            app_id: string; store: string; environment: string; app_user_id: string } }>(raw)
        if (route === 'stripe') {
          if (!/^evt_[A-Za-z0-9]+$/.test(body.id ?? '') || !Number.isFinite(body.created) || typeof body.type !== 'string') throw Error('invalid_request')
          const reason = body.livemode !== (config.environment === 'production') || body.account && body.account !== config.account ? 'source_disabled'
            : !stripeTypes.has(body.type) ? 'event_unused' : null
          await receive('stripe', body.id, body.type, null, typeof body.data?.object?.id === 'string' ? body.data.object.id : null, body.created, reason)
        } else {
          const event = body.event
          if (!event || typeof event.id !== 'string' || event.id.length > 200 || typeof event.type !== 'string' || !Number.isFinite(event.event_timestamp_ms)) throw Error('invalid_request')
          const reason = event.app_id !== config.rcApp || event.store !== 'STRIPE'
            || event.environment !== (config.environment === 'development' ? 'SANDBOX' : 'PRODUCTION') ? 'source_disabled'
            : !uuid.test(event.app_user_id ?? '') ? 'identity_unbound' : null
          // product_id may remain prod_ even when the catalog uses price_; refresh the bound source instead.
          await receive('revenuecat', event.id, event.type, uuid.test(event.app_user_id ?? '') ? event.app_user_id : null,
            null, event.event_timestamp_ms / 1000, reason)
        }
        return reply({ received: true })
      }
      if (route === 'worker') {
        if (request.method !== 'POST' || !await secretMatches(request.headers.get('authorization'), `Bearer ${config.workerSecret}`)) return reply({ error: 'authentication_failed' }, 401)
        const started = Date.now()
        await service.configured(); await providers.verifyConfiguration()
        const work = await rpc<{ events: Inbox[]; accounts: string[] }>('billing_take_work', { p_environment: config.environment, p_limit: 2 })
        let complete = 0, retry = 0
        const reconciled = new Map<string, boolean>()
        const reconcile = async (user: string, customerHint?: string): Promise<boolean> => {
          if (reconciled.has(user)) return reconciled.get(user)!
          let ok = false
          try { await service.reconcile(user, undefined, undefined, customerHint); ok = true } catch { /* Durable work retries the same account. */ }
          reconciled.set(user, ok)
          return ok
        }
        for (const event of work.events) {
          let ok = false
          try {
            const customer = event.provider === 'stripe' ? await customerFor(event) : null
            let user = event.provider === 'stripe' && customer ? await rpc<string | null>('billing_owner', { p_environment: config.environment, p_customer: customer }) : event.subject_id
            if (!user && event.provider === 'stripe' && customer) {
              const original = await providers.stripe.customers.retrieve(customer)
              if (!original.deleted && original.livemode === (config.environment === 'production') && original.metadata.environment === config.environment
                && uuid.test(original.metadata.app_user_id ?? '')) user = (await service.identity(original.metadata.app_user_id))?.subjectId ?? null
            }
            if (!user) throw Error('billing_pending')
            ok = await reconcile(user, customer ?? undefined)
            if (ok) complete++; else retry++
          } catch { retry++ }
          await rpc('billing_finish_work', { p_environment: config.environment, p_provider: event.provider, p_event: event.event_id,
            p_lease: event.lease, p_ok: ok, p_reason: ok ? null : 'reconciliation_pending' })
        }
        for (const user of work.accounts) { if (await reconcile(user)) complete++; else retry++ }
        return reply({ complete, retry, elapsedMs: Date.now() - started })
      }
      if (!['GET','POST'].includes(request.method)) return reply({ error: 'method_not_allowed' }, 405, cors)
      const identity = await authenticate(request), user = identity.id
      await service.configured()
      const statusReply = (value: Record<string, unknown>) => reply(presentStatus(value,config),200,cors)
      if (request.method === 'GET') return statusReply(await service.status(user))
      const body = parseJson<Record<string, unknown>>(await rawBody(request, 4096))
      const navigation = ['checkout','portal'].includes(String(body.action))
      if (Object.keys(body).some(key => !(body.action === 'reconcile' ? ['action','operation'] : navigation ? ['action','requestId','cycle','continuation'] : ['action','requestId','cycle']).includes(key))) throw Error('invalid_request')
      if (body.action === 'reconcile') {
        let intent: OperationIntent | undefined
        if ('operation' in body) {
          if (!body.operation || typeof body.operation !== 'object' || Array.isArray(body.operation)) throw Error('invalid_request')
          const operation = body.operation as Record<string, unknown>
          if (Object.keys(operation).length !== 4 || Object.keys(operation).some(key=>!['requestId','action','cycle','continuation'].includes(key))
            || typeof operation.requestId !== 'string' || !uuid.test(operation.requestId) || operation.action !== 'checkout'
            || !['monthly','annual'].includes(String(operation.cycle))) throw Error('invalid_request')
          if (!identity.sessionId) throw Error('authentication_failed')
          intent = { requestId: operation.requestId, action: 'checkout', cycle: operation.cycle as 'monthly'|'annual',
            continuation: parseContinuation(operation.continuation,config.environment) }
        }
        return statusReply(await service.reconcile(user,intent,identity.sessionId))
      }
      if (typeof body.requestId !== 'string' || !uuid.test(body.requestId)) throw Error('invalid_request')
      if (body.action === 'claim_trial' && body.cycle === undefined) return statusReply(await service.claimTrial(user, body.requestId))
      if (!['checkout','portal','switch','cancel','resume','remove_switch'].includes(String(body.action))) throw Error('invalid_request')
      const needsCycle = ['checkout','switch'].includes(String(body.action))
      if (needsCycle ? !['monthly','annual'].includes(String(body.cycle)) : body.cycle !== undefined) throw Error('invalid_request')
      const continuation = navigation ? parseContinuation(body.continuation,config.environment) : undefined
      if (navigation && !identity.sessionId) throw Error('authentication_failed')
      return statusReply(await service.action(user, body.requestId, body.action as BillingAction, needsCycle ? body.cycle as 'monthly' | 'annual' : null, continuation, identity.sessionId))
    } catch (error) {
      if (error instanceof ClosedOperation) return reply({error:error.message,environment:error.environment,operation:error.operation},409,cors)
      const known = ['authentication_failed','billing_configuration','billing_pending','too_large','invalid_request','billing_request_conflict',
        'billing_review_required','billing_source_mismatch','subscription_exists','subscription_missing','checkout_expired',
        'renewal_confirmation_required','billing_invalid_cycle','continuation_expired','service_revoked']
      const code = error instanceof Error && known.includes(error.message) ? error.message : 'billing_unavailable'
      const status = code === 'authentication_failed' ? 401 : code === 'billing_pending' ? 202 : code === 'too_large' ? 413
        : code === 'service_revoked' ? 403 : code === 'invalid_request' ? 400 : ['billing_configuration','billing_unavailable'].includes(code) ? 503 : 409
      return reply({ error: code }, status, cors)
    }
  }
}
