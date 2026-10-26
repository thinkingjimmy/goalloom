// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Verified Auth-to-subject mapping, finite billing action, atomic RPCs and verified provider adapter.
 * [OUTPUT]: Fenced post-transition status, original operation receipts and settlement-only deletion work.
 * [POS]: Account coordinator. Stable request IDs survive unknown provider and response outcomes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { BillingConfig, Cycle } from './config.ts'
import { BillingProviders, objectId, type PriorFact } from './providers.ts'
import { continuationUrls, type Continuation } from './presentation.ts'
import { ClosedOperation } from './operation.ts'
export type Rpc = <T = Record<string, unknown>>(name: string, args: Record<string, unknown>) => Promise<T>
export type BillingAction = 'checkout' | 'portal' | 'switch' | 'cancel' | 'resume' | 'remove_switch'
export type OperationIntent = { requestId: string; action: 'checkout'; cycle: Cycle; continuation: Continuation }
type Operation = { request_id: string; action: BillingAction; cycle: Cycle | null; provider_id: string | null; status: string; result: Record<string, unknown> | null; created_at: string }
type Lock = { error?: string; lease: string; customer: string | null; operations: Operation[]; mode: 'active' | 'settlement'; providerUserId: string | null }
export type BillingIdentity = { subjectId: string; mode: 'active' | 'settlement'; providerUserId: string | null; revision: number }
export class BillingService {
  constructor(readonly config: BillingConfig, readonly rpc: Rpc, readonly providers = new BillingProviders(config)) {}
  args(user: string): Record<string, unknown> { return { p_environment: this.config.environment, p_user: user } }
  async configured(): Promise<void> {
    const source = await this.rpc('billing_source', { p_environment: this.config.environment })
    if (!source || source.account_id !== this.config.account || source.rc_project !== this.config.rcProject || source.rc_app !== this.config.rcApp
      || source.monthly_price !== this.config.prices.monthly || source.annual_price !== this.config.prices.annual) throw Error('billing_configuration')
  }
  identity(user: string, create = false): Promise<BillingIdentity | null> {
    return this.rpc('lifecycle_identity', { p_environment: this.config.environment, p_owner: user, p_create: create })
  }
  private subjectStatus(subject: string | null): Promise<Record<string, unknown>> {
    return this.rpc('billing_status', { p_environment: this.config.environment, p_user: subject })
  }
  async status(user: string): Promise<Record<string, unknown>> {
    return this.subjectStatus((await this.identity(user))?.subjectId ?? null)
  }
  async claimTrial(user: string, request: string): Promise<Record<string, unknown>> {
    const identity = await this.identity(user, true)
    if (!identity || identity.mode !== 'active') throw Error('service_revoked')
    return this.rpc('billing_claim_trial', { ...this.args(identity.subjectId), p_request: request })
  }
  async locked<T>(user: string, run: (lock: Lock) => Promise<T>): Promise<T> {
    const lock = await this.rpc<Lock>('billing_lock', this.args(user))
    if (lock.error) throw Error(lock.error)
    try { return await run(lock) }
    finally { await this.rpc('billing_unlock', { ...this.args(user), p_lease: lock.lease }).catch(() => undefined) }
  }
  async sync(user: string, lock: Lock): Promise<Record<string, unknown>> {
    if (lock.mode === 'settlement') {
      try { return await this.settle(user, lock) }
      catch (error) {
        if (error instanceof Error && error.message === 'billing_review_required') await this.rpc('lifecycle_renewal_result', {
          p_environment: this.config.environment, p_subject: user, p_state: 'attention_required', p_lease: lock.lease }).catch(() => undefined)
        throw error
      }
    }
    if (!lock.customer) return this.subjectStatus(user)
    const status = await this.subjectStatus(user)
    const prior = await this.rpc<PriorFact[]>('billing_prior_facts', this.args(user))
    const closeouts = await this.rpc<string[]>('billing_closeouts', this.args(user))
    const snapshot = await this.providers.snapshot(lock.providerUserId ?? '', lock.customer, Date.parse(String(status.serverNow)), prior, async (invoice, disposition, run) => {
      const receipt = await this.rpc<{ status: string; created_at: string }>('billing_compensation', { ...this.args(user),
        p_lease: lock.lease, p_invoice: invoice, p_reason: disposition, p_complete: false })
      if (receipt.status === 'complete') return
      if (Date.now() - Date.parse(receipt.created_at) > 23 * 3600_000) throw Error('billing_review_required')
      await run(`goalloom-${this.config.environment}-${invoice}-${disposition}`)
      await this.rpc('billing_compensation', { ...this.args(user), p_lease: lock.lease, p_invoice: invoice, p_reason: disposition, p_complete: true })
    }, closeouts)
    const result = await this.rpc('billing_commit', { ...this.args(user), p_lease: lock.lease,
      p_subscriptions: snapshot.subscriptions, p_transactions: snapshot.transactions, p_grace: snapshot.grace })
    for (const operation of lock.operations.filter(value => value.action === 'checkout' && value.status === 'pending')) {
      let sessionId = operation.provider_id
      if (!sessionId) {
        const sessions = await this.providers.stripe.checkout.sessions.list({ customer: lock.customer, limit: 100 })
        if (sessions.has_more) throw Error('billing_review_required')
        sessionId = sessions.data.find(session => session.metadata?.request_id === operation.request_id)?.id ?? null
      }
      if (!sessionId) continue
      const session = await this.providers.stripe.checkout.sessions.retrieve(sessionId)
      if (objectId(session.customer) !== lock.customer) throw Error('billing_source_mismatch')
      if (session.status === 'open') continue
      await this.rpc('billing_operation', { ...this.args(user), p_lease: lock.lease, p_request: operation.request_id,
        p_action: 'checkout', p_cycle: operation.cycle, p_provider: session.id, p_result: session.status === 'complete' ? result : { error: 'checkout_expired' },
        p_status: session.status === 'complete' ? 'complete' : 'closed' })
    }
    return this.subjectStatus(user)
  }
  private async settle(subject: string, lock: Lock): Promise<Record<string, unknown>> {
    if (!lock.customer && lock.operations.some(value => value.status === 'pending') && lock.providerUserId) {
      const customer = await this.providers.findOriginalCustomer(lock.providerUserId)
      if (customer) {
        await this.rpc('billing_bind_customer', { ...this.args(subject), p_lease: lock.lease, p_customer: customer })
        lock.customer = customer
      }
    }
    if (!lock.customer) {
      const pending = lock.operations.filter(value => value.status === 'pending')
      if (pending.length) throw Error(pending.some(value => Date.now() - Date.parse(value.created_at) > 23 * 3600_000) ? 'billing_review_required' : 'billing_pending')
      await this.rpc('lifecycle_renewal_result', { p_environment: this.config.environment, p_subject: subject, p_state: 'stopped', p_lease: lock.lease })
      return this.subjectStatus(subject)
    }
    const run = async (action: 'delete_renewal_stop' | 'delete_checkout_close', provider: string, terminal: boolean, mutate: (key: string) => Promise<void>) => {
      const operation = await this.rpc<{ request_id: string; created_at: string; status: string }>('lifecycle_settlement_operation', {
        ...this.args(subject), p_lease: lock.lease, p_action: action, p_provider: provider })
      if (operation.status === 'complete') {
        if (!terminal) throw Error('billing_review_required')
        await mutate(`goalloom-${this.config.environment}-${operation.request_id}`)
        return
      }
      if (!terminal && Date.now() - Date.parse(operation.created_at) > 23 * 3600_000) throw Error('billing_review_required')
      await mutate(`goalloom-${this.config.environment}-${operation.request_id}`)
      await this.rpc('billing_operation', { ...this.args(subject), p_lease: lock.lease, p_request: operation.request_id,
        p_action: action, p_cycle: null, p_provider: provider, p_result: null, p_status: 'complete' })
    }
    for (const subscription of await this.providers.listSubscriptions(lock.customer)) {
      const terminal = ['canceled','incomplete_expired'].includes(subscription.status) && !subscription.schedule
      await run('delete_renewal_stop', subscription.id, terminal, key => this.providers.stopForDeletion(subscription, key))
    }
    const sessions = await this.providers.stripe.checkout.sessions.list({ customer: lock.customer, limit: 100 })
    if (sessions.has_more) throw Error('billing_review_required')
    for (const session of sessions.data) {
      if (objectId(session.customer) !== lock.customer) throw Error('billing_source_mismatch')
      if (session.status !== 'open') continue
      await run('delete_checkout_close', session.id, false, async key => {
        await this.providers.stripe.checkout.sessions.expire(session.id, {}, { idempotencyKey: `${key}-expire` })
      })
    }
    const prior = await this.rpc<PriorFact[]>('billing_prior_facts', this.args(subject))
    const snapshot = await this.providers.snapshot('', lock.customer, Date.now(), prior, async (invoice, reason, mutate) => {
      const receipt = await this.rpc<{ status: string; created_at: string }>('billing_compensation', { ...this.args(subject), p_lease: lock.lease, p_invoice: invoice, p_reason: reason, p_complete: false })
      if (receipt.status !== 'complete') {
        if (Date.now() - Date.parse(receipt.created_at) > 23 * 3600_000) throw Error('billing_review_required')
        await mutate(`goalloom-${this.config.environment}-${invoice}-${reason}`)
        await this.rpc('billing_compensation', { ...this.args(subject), p_lease: lock.lease, p_invoice: invoice, p_reason: reason, p_complete: true })
      }
    }, [], true)
    await this.rpc('billing_commit', { ...this.args(subject), p_lease: lock.lease, p_subscriptions: snapshot.subscriptions, p_transactions: snapshot.transactions, p_grace: [] })
    // A Checkout may complete after the first subscription scan. Persist its facts and retry cancellation.
    if (snapshot.subscriptions.some(value => !['canceled','incomplete_expired'].includes(String(value.status)) || value.schedule_id != null)) throw Error('billing_pending')
    for (const operation of lock.operations.filter(value => value.action === 'checkout' && value.status === 'pending')) {
      const original = operation.provider_id ? sessions.data.find(value => value.id === operation.provider_id)
        : sessions.data.find(value => value.metadata?.request_id === operation.request_id)
      if (!original || original.status === 'open') throw Error('billing_review_required')
      await this.rpc('billing_operation', { ...this.args(subject), p_lease: lock.lease, p_request: operation.request_id,
        p_action: operation.action, p_cycle: operation.cycle, p_provider: original.id, p_result: null,
        p_status: original.status === 'complete' ? 'complete' : 'closed' })
    }
    for (const operation of lock.operations.filter(value => value.action !== 'checkout' && value.status === 'pending')) {
      await this.rpc('billing_operation', { ...this.args(subject), p_lease: lock.lease, p_request: operation.request_id,
        p_action: operation.action, p_cycle: operation.cycle, p_provider: operation.provider_id, p_result: null, p_status: 'closed' })
    }
    await this.rpc('lifecycle_renewal_result', { p_environment: this.config.environment, p_subject: subject, p_state: 'stopped', p_lease: lock.lease })
    return this.subjectStatus(subject)
  }
  private completed(status: Record<string, unknown>, requestId: string, requested: string, action: BillingAction, cycle: Cycle | null): Record<string, unknown> {
    return { ...status, operation: { requestId, ...(requestId !== requested ? { requestedId: requested } : {}), action, cycle, status: 'complete' } }
  }
  private closed(row: Operation, expectedRequest: string, requested: string, action: BillingAction, cycle: Cycle | null): never {
    if (row.status !== 'closed' || row.request_id !== expectedRequest || row.action !== action || row.cycle !== cycle) throw Error('billing_unavailable')
    const reasons = ['subscription_exists','subscription_missing','checkout_expired','billing_invalid_cycle','renewal_confirmation_required','billing_request_conflict','billing_review_required']
    const candidate = row.result?.error ?? (row.result?.status === 'checkout_expired' ? 'checkout_expired' : 'billing_request_conflict')
    const reason = typeof candidate === 'string' && reasons.includes(candidate) ? candidate : 'billing_request_conflict'
    throw new ClosedOperation(this.config.environment,{requestId:expectedRequest,...(expectedRequest !== requested ? { requestedId: requested } : {}),action,cycle,status:'closed',reason})
  }
  async reconcile(user: string, intent?: OperationIntent, sessionId?: string | null, customerHint?: string): Promise<Record<string, unknown>> {
    await this.configured()
    const identity = await this.identity(user)
    if (!identity) return this.subjectStatus(null)
    user = identity.subjectId
    await this.providers.verifyConfiguration()
    return this.locked(user, async lock => {
      if (!lock.customer && customerHint && lock.providerUserId) {
        await this.providers.assertOriginalCustomer(customerHint, lock.providerUserId)
        await this.rpc('billing_bind_customer', { ...this.args(user), p_lease: lock.lease, p_customer: customerHint })
        lock.customer = customerHint
      }
      const status = await this.sync(user, lock)
      if (!intent) return status
      if (!sessionId) throw Error('authentication_failed')
      const resolved = await this.rpc<{ operation: Operation } | null>('service_resolve_operation', {
        ...this.args(user), p_lease: lock.lease, p_requested: intent.requestId, p_action: intent.action,
        p_cycle: intent.cycle, p_continuation: intent.continuation, p_session: sessionId })
      const operation = resolved?.operation
      const current = await this.subjectStatus(user)
      if (!operation) return current
      if (operation.action !== intent.action || operation.cycle !== intent.cycle) throw Error('billing_request_conflict')
      if (operation.status === 'closed') this.closed(operation,operation.request_id,intent.requestId,intent.action,intent.cycle)
      return operation.status === 'complete' ? this.completed(current,operation.request_id,intent.requestId,intent.action,intent.cycle) : current
    })
  }
  async action(user: string, id: string, action: BillingAction, cycle: Cycle | null, continuation?: Continuation, sessionId?: string | null): Promise<Record<string, unknown>> {
    await this.configured()
    const identity = await this.identity(user, true)
    if (!identity || identity.mode !== 'active') throw Error('service_revoked')
    user = identity.subjectId
    await this.providers.verifyConfiguration()
    return this.locked(user, async lock => {
      if (lock.mode !== 'active') throw Error('service_revoked')
      const aliasArgs = { ...this.args(user), p_lease: lock.lease, p_requested: id, p_action: action,
        p_cycle: cycle, p_continuation: continuation ?? null }
      const alias = await this.rpc<{ operation: Operation } | null>('service_operation_alias', { ...aliasArgs, p_candidate: null })
      const previous = alias?.operation ?? lock.operations.find(op => op.request_id === id)
      if (previous && (previous.action !== action || previous.cycle !== cycle)) throw Error('billing_request_conflict')
      const navigation = ['checkout','portal'].includes(action)
      const completed = async (requestId: string, status?: Record<string, unknown>) => this.completed(status ?? await this.subjectStatus(user),requestId,id,action,cycle)
      const failClosed = (row: Operation, expectedRequest: string): never => this.closed(row,expectedRequest,id,action,cycle)
      if (previous?.status === 'complete' && !navigation) return completed(id)
      const pending = lock.operations.find(op => op.status === 'pending')
      if (!previous && pending && !(pending.action === 'checkout' && action === 'checkout' && pending.cycle === cycle)) {
        const rejected = await this.rpc<Operation>('service_reject_operation', { ...aliasArgs, p_session: sessionId ?? null, p_blocking: pending.request_id })
        failClosed(rejected,id)
      }
      // Serial external actions retain their original intent until resolved. Never rebase an unknown write.
      const definitive = previous && ['complete','closed'].includes(previous.status)
      if (!definitive && pending && pending.request_id !== id && !(pending.action === 'checkout' && action === 'checkout')) throw Error('billing_pending')
      const op = alias ? previous : definitive ? previous : pending?.action === 'checkout' && action === 'checkout' ? pending : previous
      if (op && op.cycle !== cycle) throw Error('billing_pending')
      const request = op?.request_id ?? id
      if (!alias && request !== id) await this.rpc('service_operation_alias', { ...aliasArgs, p_candidate: request })
      const record = async (provider: string | null = null, result: Record<string, unknown> | null = null, status = 'pending') =>
        this.rpc<Operation>('billing_operation', { ...this.args(user), p_lease: lock.lease, p_request: request, p_action: action,
          p_cycle: cycle, p_provider: provider, p_result: result, p_status: status })
      const operation = await record()
      let bound: { continuation: Continuation; expiresAt: string; returnToThisDevice: boolean } | undefined
      if (navigation) {
        if (!continuation || !sessionId) throw Error('invalid_request')
        bound = await this.rpc('service_continuation', { ...this.args(user), p_session: sessionId, p_lease: lock.lease,
          p_request: request, p_requested: id, p_continuation: continuation })
      }
      const resultForCaller = (result: Record<string, unknown>) => bound ? { ...result, requestId: request,
        continuationExpiresAt: bound.expiresAt, returnToThisDevice: bound.returnToThisDevice } : result
      if (operation.status === 'complete') return action === 'portal' ? resultForCaller(operation.result ?? { status: 'complete' }) : completed(request)
      if (operation.status === 'closed') failClosed(operation,request)
      const urls = bound ? continuationUrls(this.config,bound.continuation) : null
      // Stripe idempotency retention is finite. An unresolved old create needs private operator reconciliation.
      if (!operation.provider_id && Date.now() - Date.parse(operation.created_at) > 23 * 3600_000) throw Error('billing_review_required')
      const providerUser = lock.providerUserId
      if (!providerUser) throw Error('billing_source_mismatch')
      const key = `goalloom-${this.config.environment}-${providerUser}-${request}`
      try {
      if (action === 'checkout') {
        if (!lock.customer) {
          const customer = await this.providers.stripe.customers.create({ metadata: { app_user_id: providerUser, environment: this.config.environment } }, { idempotencyKey: `goalloom-${this.config.environment}-${providerUser}-customer` })
          await this.rpc('billing_bind_customer', { ...this.args(user), p_lease: lock.lease, p_customer: customer.id })
          lock.customer = customer.id
        }
        const subscriptions = await this.providers.listSubscriptions(lock.customer)
        if (subscriptions.some(sub => !['canceled','incomplete_expired'].includes(sub.status))) {
          const status = await this.sync(user, lock)
          // A completed checkout is resolved by its original session, not by creating a second subscription.
          let sessionId = operation.provider_id
          if (!sessionId) {
            const sessions = await this.providers.stripe.checkout.sessions.list({ customer: lock.customer, limit: 100 })
            if (sessions.has_more) throw Error('billing_review_required')
            sessionId = sessions.data.find(session => session.metadata?.request_id === request)?.id ?? null
          }
          if (!sessionId) { await record(null, { error: 'subscription_exists' }, 'closed'); throw Error('subscription_exists') }
          const original = await this.providers.stripe.checkout.sessions.retrieve(sessionId)
          if (original.status === 'complete') { await record(original.id, { status: 'verification_pending' }, 'complete'); return completed(request,status) }
          throw Error('subscription_exists')
        }
        if (operation.provider_id) {
          const original = await this.providers.stripe.checkout.sessions.retrieve(operation.provider_id)
          if (objectId(original.customer) !== lock.customer) throw Error('billing_source_mismatch')
          if (original.status === 'open') return resultForCaller({ status: 'checkout', url: original.url, requestId: request })
          if (original.status === 'complete') { await record(original.id, { status: 'verification_pending' }, 'complete'); return completed(request,await this.sync(user, lock)) }
          await record(original.id, { error: 'checkout_expired' }, 'closed')
          throw Error('checkout_expired')
        }
        const session = await this.providers.stripe.checkout.sessions.create({ mode: 'subscription', customer: lock.customer,
          line_items: [{ price: this.config.prices[cycle!], quantity: 1 }], allow_promotion_codes: false,
          client_reference_id: providerUser, metadata: { app_user_id: providerUser, environment: this.config.environment, request_id: request },
          subscription_data: { metadata: { app_user_id: providerUser, environment: this.config.environment, request_id: request } },
          automatic_tax: { enabled: this.config.automaticTax }, billing_address_collection: 'required',
          customer_update: { address: 'auto' }, success_url: urls!.success, cancel_url: urls!.cancel,
          integration_identifier: `goalloom_${request.replaceAll('-', '').slice(-8).replace(/[0-9]/g, digit => String.fromCharCode(97 + Number(digit)))}`,
        }, { idempotencyKey: `${key}-checkout` })
        const result = { status: 'checkout', url: session.url, requestId: request }
        await record(session.id, result)
        return resultForCaller(result)
      }
      if (!lock.customer) { await record(null, { error: 'subscription_missing' }, 'closed'); throw Error('subscription_missing') }
      if (action === 'portal') {
        const session = await this.providers.stripe.billingPortal.sessions.create({ customer: lock.customer,
          configuration: this.config.portalConfiguration, return_url: urls!.success }, { idempotencyKey: `${key}-portal` })
        const result = { status: 'portal', url: session.url }
        await record(session.id, result, 'complete'); return resultForCaller(result)
      }
      // Finish any earlier compensation before accepting an explicit new renewal decision.
      await this.sync(user, lock)
      const subscriptions = (await this.providers.listSubscriptions(lock.customer)).filter(sub => !['canceled','incomplete_expired'].includes(sub.status))
      if (subscriptions.length !== 1) { await record(null, { error: 'billing_review_required' }, 'closed'); throw Error('billing_review_required') }
      const subscription = subscriptions[0]
      // Persist the target subscription before any provider mutation.
      if (operation.provider_id && operation.provider_id !== subscription.id) throw Error('billing_request_conflict')
      await record(subscription.id)
      if (action === 'switch') await this.providers.switchCycle(subscription, cycle!, key)
      else if (action === 'cancel') await this.providers.cancelRenewal(subscription, key)
      else if (action === 'remove_switch') {
        if (subscription.schedule) await this.providers.stripe.subscriptionSchedules.release(objectId(subscription.schedule)!, {}, { idempotencyKey: `${key}-release` })
      } else if (action === 'resume') {
        if (subscription.schedule) throw Error('billing_pending')
        await this.providers.stripe.subscriptions.update(subscription.id, { cancel_at_period_end: false, proration_behavior: 'none' }, { idempotencyKey: `${key}-resume` })
      }
      const status = await this.sync(user, lock)
      await record(subscription.id, status, 'complete')
      return completed(request,status)
      } catch (error) {
        const terminal = ['subscription_exists','subscription_missing','checkout_expired','billing_invalid_cycle',
          'renewal_confirmation_required','billing_request_conflict','billing_review_required']
        if (error instanceof Error && terminal.includes(error.message)) failClosed(await record(operation.provider_id, { error: error.message }, 'closed'),request)
        throw error
      }
    })
  }
}
