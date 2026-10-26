// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Environment-bound Stripe SDK, RevenueCat credentials and a database-owned customer binding.
 * [OUTPUT]: Original financial facts matched to RC current/already-paid next periods, phase-start cycle switches and deletion-scoped renewal termination.
 * [POS]: Provider adapter; paid invoices bound through the object graph constrain RevenueCat eligibility.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import Stripe from 'stripe'
import { priceCatalog, type BillingConfig, type Cycle } from './config.ts'
export const iso = (seconds: number) => new Date(seconds * 1000).toISOString()
export const objectId = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id ?? null
export type Snapshot = { subscriptions: Record<string, unknown>[]; transactions: Record<string, unknown>[]; grace: Record<string, unknown>[] }
type RcPeriod = { product_id: string | null; store_subscription_identifier: string | null; gives_access: boolean | null;
  pending_payment: boolean | null; status: string | null; current_period_starts_at: number | null; current_period_ends_at: number | null }
type RcProduct = { id: string; app_id: string; store_identifier: string }
type RcSubscription = RcPeriod & { id: string; customer_id: string; original_customer_id: string; environment: string; store: string;
  auto_renewal_status: string; ends_at: number | null; pending_changes?: Partial<RcPeriod> & { product?: RcProduct | null } | null;
  entitlements: { items: { lookup_key: string }[] } }
type RcRecognition = RcPeriod & { price_id: string }
const activePeriod = (period: RcPeriod) => period.gives_access === true && period.pending_payment === false
  && ['active','in_grace_period'].includes(period.status ?? '') && Number.isSafeInteger(period.current_period_starts_at)
  && Number.isSafeInteger(period.current_period_ends_at) && typeof period.current_period_starts_at === 'number'
  && typeof period.current_period_ends_at === 'number' && period.current_period_ends_at > period.current_period_starts_at
export type PriorFact = { invoice_id: string; rc_verified: boolean }
export type Compensation = (invoice: string, disposition: string, run: (key: string) => Promise<void>) => Promise<void>
export class BillingProviders {
  readonly stripe: Stripe
  constructor(readonly config: BillingConfig, readonly http: typeof fetch = fetch, stripe?: Stripe) {
    this.stripe = stripe ?? new Stripe(config.stripeKey, { apiVersion: '2026-08-26.dahlia', maxNetworkRetries: 0, timeout: 10_000 })
  }
  async verifyConfiguration(): Promise<void> {
    const account = await this.stripe.accounts.retrieve(this.config.account)
    if (account.id !== this.config.account) throw Error('billing_configuration')
    for (const cycle of ['monthly','annual'] as const) {
      const price = await this.stripe.prices.retrieve(this.config.prices[cycle])
      if (price.livemode !== (this.config.environment === 'production') || !price.active || price.currency !== 'usd'
        || price.unit_amount !== priceCatalog[cycle].amount || price.tax_behavior !== priceCatalog[cycle].taxBehavior
        || price.recurring?.interval !== (cycle === 'monthly' ? 'month' : 'year') || price.recurring.interval_count !== 1
        || price.recurring.usage_type !== 'licensed' || price.billing_scheme !== 'per_unit') throw Error('billing_configuration')
    }
    const portal = await this.stripe.billingPortal.configurations.retrieve(this.config.portalConfiguration)
    if (!portal.active || portal.features.subscription_update.enabled
      || portal.features.subscription_cancel.enabled && portal.features.subscription_cancel.mode !== 'at_period_end'
      || !portal.features.payment_method_update.enabled || !portal.features.invoice_history.enabled) throw Error('billing_configuration')
    if (this.config.automaticTax) {
      const registrations = await this.stripe.tax.registrations.list({ status: 'active', limit: 1 })
      if (!registrations.data.length) throw Error('billing_configuration')
    }
  }
  async rc(path: string, method = 'GET', body?: unknown, publicKey = false): Promise<Record<string, unknown>> {
    const response = await this.http(`https://api.revenuecat.com${path}`, { method,
      headers: { authorization: `Bearer ${publicKey ? this.config.rcPublicKey : this.config.rcSecretKey}`,
        'content-type': 'application/json', ...(publicKey ? { 'X-Platform': 'stripe' } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000), redirect: 'error' })
    if (!response.ok) throw Error('billing_provider_unavailable')
    const text = await response.text(); if (text.length > 2 * 1024 * 1024) throw Error('billing_provider_unavailable')
    return JSON.parse(text)
  }
  async recognize(user: string, subscription: Stripe.Subscription): Promise<RcRecognition[]> {
    await this.rc('/v1/receipts', 'POST', { app_user_id: user, fetch_token: subscription.id }, true)
    // Refresh the unified subscriber after every trigger; do not grant from its aggregate plus alone.
    await this.rc(`/v1/subscribers/${encodeURIComponent(user)}`, 'GET', undefined, true)
    const item = subscription.items.data[0]
    const data = await this.rc(`/v2/projects/${this.config.rcProject}/subscriptions?store_subscription_identifier=${encodeURIComponent(item.id)}&include_scheduled=true`)
    if (!Array.isArray(data.items) || data.next_page) throw Error('billing_pending')
    const matches = (data.items as RcSubscription[]).filter(value => value.customer_id === user && value.original_customer_id === user
      && value.store === 'stripe' && value.environment === (this.config.environment === 'development' ? 'sandbox' : 'production')
      && value.store_subscription_identifier === item.id && value.entitlements?.items?.some(e => e.lookup_key === 'plus'))
    const recognized: RcRecognition[] = [], products = new Map<string, RcProduct>()
    for (const match of matches) {
      const candidates: RcPeriod[] = [match], change = match.pending_changes
      if (match.auto_renewal_status === 'has_already_renewed' && change && typeof change === 'object' && !Array.isArray(change)) {
        // RC omits unchanged next-period fields. Explicit null is not an inherited value.
        const inherit = <K extends keyof RcPeriod>(key: K): RcPeriod[K] => Object.hasOwn(change,key) ? change[key] as RcPeriod[K] : match[key]
        const next: RcPeriod = {
          product_id: Object.hasOwn(change,'product') ? change.product?.id ?? null : match.product_id,
          store_subscription_identifier: inherit('store_subscription_identifier'), gives_access: inherit('gives_access'),
          pending_payment: inherit('pending_payment'), status: inherit('status'),
          current_period_starts_at: inherit('current_period_starts_at'), current_period_ends_at: inherit('current_period_ends_at'),
        }
        if (activePeriod(next) && next.status === 'active' && next.store_subscription_identifier === item.id
          && typeof next.current_period_starts_at === 'number' && typeof match.current_period_ends_at === 'number'
          && Number.isSafeInteger(match.current_period_ends_at) && next.current_period_starts_at >= match.current_period_ends_at
          && next.current_period_ends_at === match.ends_at) candidates.push(next)
      }
      for (const candidate of candidates) {
        if (!activePeriod(candidate) || typeof candidate.product_id !== 'string' || !/^prod[A-Za-z0-9_]{1,250}$/.test(candidate.product_id)) continue
        let product = products.get(candidate.product_id)
        if (!product) {
          product = await this.rc(`/v2/projects/${this.config.rcProject}/products/${encodeURIComponent(candidate.product_id)}`) as unknown as RcProduct
          products.set(candidate.product_id,product)
        }
        if (product.app_id === this.config.rcApp && [item.price.id, objectId(item.price.product)].includes(product.store_identifier)) {
          recognized.push({ ...candidate, price_id: item.price.id })
        }
      }
    }
    return recognized
  }
  async listSubscriptions(customer: string): Promise<Stripe.Subscription[]> {
    const result: Stripe.Subscription[] = []
    for await (const subscription of this.stripe.subscriptions.list({ customer, status: 'all', limit: 100 })) {
      if (result.length >= 100) throw Error('billing_review_required')
      this.assertSubscription(subscription, customer)
      result.push(subscription)
    }
    return result
  }
  async findOriginalCustomer(user: string): Promise<string | null> {
    if (!/^[0-9a-f-]{36}$/.test(user)) throw Error('billing_source_mismatch')
    const result = await this.stripe.customers.search({ query: `metadata['app_user_id']:'${user}' AND metadata['environment']:'${this.config.environment}'`, limit: 100 })
    if (result.has_more || result.data.length > 1) throw Error('billing_review_required')
    const customer = result.data[0]
    if (!customer) return null
    if (customer.livemode !== (this.config.environment === 'production') || customer.metadata.app_user_id !== user
      || customer.metadata.environment !== this.config.environment) throw Error('billing_source_mismatch')
    return customer.id
  }
  async assertOriginalCustomer(id: string, user: string): Promise<void> {
    const customer = await this.stripe.customers.retrieve(id)
    if (customer.deleted || customer.livemode !== (this.config.environment === 'production') || customer.metadata.app_user_id !== user
      || customer.metadata.environment !== this.config.environment) throw Error('billing_source_mismatch')
  }
  assertSubscription(sub: Stripe.Subscription, customer: string): void {
    const item = sub.items.data[0]
    if (objectId(sub.customer) !== customer || sub.livemode !== (this.config.environment === 'production')
      || sub.items.has_more || sub.items.data.length !== 1 || item.quantity !== 1 || !Object.values(this.config.prices).includes(item.price.id)
      || sub.discounts.length || sub.trial_start || sub.trial_end) throw Error('billing_source_mismatch')
  }
  async snapshot(user: string, customer: string, now: number, priorFacts: PriorFact[], compensate: Compensation, closeouts: string[] = [], settlementOnly = false): Promise<Snapshot> {
    const result: Snapshot = { subscriptions: [], transactions: [], grace: [] }
    const subscriptions = await this.listSubscriptions(customer)
    for (let sub of subscriptions) {
      const item = sub.items.data[0], invoices: Stripe.Invoice[] = []
      for await (const invoice of this.stripe.invoices.list({ subscription: sub.id, limit: 100 })) {
        if (invoices.length >= 240) throw Error('billing_review_required')
        if (invoice.livemode !== (this.config.environment === 'production') || objectId(invoice.customer) !== customer
          || objectId(invoice.parent?.subscription_details?.subscription) !== sub.id) throw Error('billing_source_mismatch')
        invoices.push(invoice)
      }
      const recognized = !settlementOnly && invoices.some(invoice => invoice.status === 'paid') ? await this.recognize(user, sub) : []
      for (const invoice of invoices.filter(value => closeouts.includes(value.id))) {
        await compensate(invoice.id, 'grace', key => this.closeGrace(sub, invoice, key))
        sub = await this.stripe.subscriptions.retrieve(sub.id)
        invoices[invoices.findIndex(value => value.id === invoice.id)] = await this.stripe.invoices.retrieve(invoice.id)
      }
      for (const invoice of invoices.filter(invoice => invoice.status === 'paid')) {
        const line = await this.invoiceLine(invoice)
        const financial = await this.financial(invoice)
        const rcVerified = priorFacts.some(value => value.invoice_id === invoice.id && value.rc_verified)
          || recognized.some(period => period.price_id === line.price
            && period.current_period_starts_at === line.start * 1000 && period.current_period_ends_at === line.end * 1000)
        const currentRefund = financial.disposition === 'refunded' && line.start * 1000 <= now && line.end * 1000 > now
        const disputed = ['disputed','lost'].includes(financial.disposition)
        if ((currentRefund || disputed) && !['canceled','incomplete_expired'].includes(sub.status)) {
          await compensate(invoice.id, disputed ? 'dispute' : 'refund', async key => {
            await this.cancelRenewal(sub, key)
          })
          sub = await this.stripe.subscriptions.retrieve(sub.id)
        }
        result.transactions.push({ invoice_id: invoice.id, subscription_id: sub.id, price_id: line.price,
          starts_at: iso(line.start), ends_at: iso(line.end), paid_at: iso(invoice.status_transitions.paid_at!),
          amount_cents: invoice.amount_paid, refunded_cents: financial.refunded, disposition: financial.disposition,
          rc_verified: rcVerified, financial_at: iso(financial.at), currency: invoice.currency,
          tax_cents: invoice.total_taxes?.reduce((sum, tax) => sum + tax.amount, 0) ?? null })
      }
      const failed = invoices.find(invoice => objectId(sub.latest_invoice) === invoice.id && invoice.billing_reason === 'subscription_cycle'
        && invoice.status === 'open' && invoice.attempted && invoice.amount_remaining > 0)
      if (!settlementOnly && failed && ['past_due','unpaid','canceled'].includes(sub.status)) {
        const line = await this.invoiceLine(failed)
        const prior = result.transactions.some(value => value.subscription_id === sub.id && value.ends_at === iso(line.start)
          && value.disposition === 'paid' && value.rc_verified)
        if (prior && now < (line.start + 72 * 3600) * 1000) {
          result.grace.push({ invoice_id: failed.id, subscription_id: sub.id, starts_at: iso(line.start) })
        } else if (prior) {
          // Close an actually unpaid invoice before cancelling, so a raced success aborts closeout.
          await compensate(failed.id, 'grace', key => this.closeGrace(sub, failed, key))
          sub = await this.stripe.subscriptions.retrieve(sub.id)
          if ((await this.stripe.invoices.retrieve(failed.id)).status === 'paid') return this.snapshot(user, customer, now, priorFacts, compensate, closeouts, settlementOnly)
        }
      }
      let next: string | null = null
      if (sub.schedule) {
        const schedule = await this.stripe.subscriptionSchedules.retrieve(objectId(sub.schedule)!)
        const future = schedule.phases.find(phase => phase.start_date >= item.current_period_end)
        next = future ? objectId(future.items[0]?.price) : null
      }
      result.subscriptions.push({ subscription_id: sub.id, customer_id: customer, status: sub.status, price_id: item.price.id,
        period_start: iso(item.current_period_start), period_end: iso(item.current_period_end),
        cancel_at_period_end: sub.cancel_at_period_end || sub.cancel_at !== null, schedule_id: objectId(sub.schedule), next_price: next })
    }
    return result
  }
  async invoiceLine(invoice: Stripe.Invoice): Promise<{ price: string; start: number; end: number }> {
    const lines = invoice.lines.has_more ? (await this.stripe.invoices.listLineItems(invoice.id, { limit: 100 })).data : invoice.lines.data
    const eligible = lines.filter(line => line.parent?.type === 'subscription_item_details'
      && !line.parent.subscription_item_details?.proration && Object.values(this.config.prices).includes(objectId(line.pricing?.price_details?.price) ?? ''))
    if (lines.length >= 100 || eligible.length !== 1 || invoice.currency !== 'usd' || invoice.discounts.length
      || !invoice.status_transitions.paid_at && invoice.status === 'paid') throw Error('billing_source_mismatch')
    const line = eligible[0]
    return { price: objectId(line.pricing!.price_details!.price)!, start: line.period.start, end: line.period.end }
  }
  async financial(invoice: Stripe.Invoice): Promise<{ refunded: number; disposition: string; at: number }> {
    let refunded = 0, disposition = 'paid', at = invoice.status_transitions.paid_at!
    const payments = await this.stripe.invoicePayments.list({ invoice: invoice.id, limit: 100 })
    if (payments.has_more) throw Error('billing_review_required')
    for (const payment of payments.data) {
      let chargeId = objectId(payment.payment.charge)
      if (payment.payment.payment_intent) {
        const intent = await this.stripe.paymentIntents.retrieve(objectId(payment.payment.payment_intent)!)
        chargeId = objectId(intent.latest_charge)
      }
      if (!chargeId) {
        if (payment.status === 'paid' && payment.amount_paid) throw Error('billing_review_required')
        continue
      }
      const charge = await this.stripe.charges.retrieve(chargeId)
      if (!charge.paid || charge.livemode !== (this.config.environment === 'production') || objectId(charge.customer) !== objectId(invoice.customer)) throw Error('billing_source_mismatch')
      refunded += charge.amount_refunded
      const refunds = await this.stripe.refunds.list({ charge: charge.id, limit: 100 })
      if (refunds.has_more) throw Error('billing_review_required')
      for (const refund of refunds.data.filter(value => value.status === 'succeeded')) at = Math.max(at, refund.created)
      const disputes = await this.stripe.disputes.list({ charge: charge.id, limit: 100 })
      if (disputes.has_more) throw Error('billing_review_required')
      for (const dispute of disputes.data) {
        at = Math.max(at, dispute.created)
        if (dispute.status === 'lost') disposition = 'lost'
        else if (!['won','warning_closed'].includes(dispute.status) && disposition !== 'lost') disposition = 'disputed'
      }
    }
    if (invoice.amount_paid > 0 && refunded >= invoice.amount_paid) disposition = 'refunded'
    return { refunded, disposition, at }
  }
  async cancelRenewal(sub: Stripe.Subscription, key: string): Promise<Stripe.Subscription> {
    if (sub.schedule) await this.stripe.subscriptionSchedules.release(objectId(sub.schedule)!, {}, { idempotencyKey: `${key}-release` })
    return this.stripe.subscriptions.update(sub.id, { cancel_at_period_end: true, proration_behavior: 'none' }, { idempotencyKey: `${key}-cancel` })
  }
  async closeGrace(sub: Stripe.Subscription, invoice: Stripe.Invoice, key: string): Promise<void> {
    const current = await this.stripe.invoices.retrieve(invoice.id)
    if (current.status === 'paid') return
    const payments = await this.stripe.invoicePayments.list({ invoice: current.id, limit: 100 })
    if (payments.has_more) throw Error('billing_review_required')
    for (const payment of payments.data) if (payment.payment.payment_intent) {
      const intent = await this.stripe.paymentIntents.retrieve(objectId(payment.payment.payment_intent)!)
      if (['processing','succeeded','requires_capture'].includes(intent.status)) throw Error('billing_pending')
    }
    if (current.status === 'open') {
      try { await this.stripe.invoices.voidInvoice(current.id, {}, { idempotencyKey: `${key}-void` }) }
      catch (error) { if ((await this.stripe.invoices.retrieve(current.id)).status === 'paid') return; throw error }
    }
    else if (current.status !== 'void') throw Error('billing_pending')
    const latest = await this.stripe.subscriptions.retrieve(sub.id)
    if (objectId(latest.latest_invoice) !== current.id) throw Error('billing_review_required')
    if (latest.schedule) await this.stripe.subscriptionSchedules.release(objectId(latest.schedule)!, {}, { idempotencyKey: `${key}-release` })
    if (latest.status !== 'canceled') await this.stripe.subscriptions.cancel(latest.id, { invoice_now: false, prorate: false }, { idempotencyKey: `${key}-cancel` })
  }
  async stopForDeletion(original: Stripe.Subscription, key: string): Promise<void> {
    let subscription = await this.stripe.subscriptions.retrieve(original.id)
    this.assertSubscription(subscription, objectId(original.customer)!)
    if (subscription.schedule) {
      await this.stripe.subscriptionSchedules.release(objectId(subscription.schedule)!, {}, { idempotencyKey: `${key}-release` })
      subscription = await this.stripe.subscriptions.retrieve(subscription.id)
    }
    if (!['canceled','incomplete_expired'].includes(subscription.status)) {
      await this.stripe.subscriptions.cancel(subscription.id, { invoice_now: false, prorate: false }, { idempotencyKey: `${key}-cancel` })
    }
    let count = 0
    for await (const invoice of this.stripe.invoices.list({ subscription: subscription.id, limit: 100 })) {
      if (++count > 240) throw Error('billing_review_required')
      if (!['open','draft'].includes(invoice.status ?? '')) continue
      const current = await this.stripe.invoices.retrieve(invoice.id)
      if (objectId(current.customer) !== objectId(original.customer) || current.livemode !== (this.config.environment === 'production')) throw Error('billing_source_mismatch')
      if (current.status === 'paid' || current.status === 'void') continue
      const payments = await this.stripe.invoicePayments.list({ invoice: current.id, limit: 100 })
      if (payments.has_more) throw Error('billing_review_required')
      for (const payment of payments.data) if (payment.payment.payment_intent) {
        const intent = await this.stripe.paymentIntents.retrieve(objectId(payment.payment.payment_intent)!)
        if (['processing','succeeded','requires_capture'].includes(intent.status)) throw Error('billing_pending')
      }
      if (current.status === 'open') {
        try { await this.stripe.invoices.voidInvoice(current.id, {}, { idempotencyKey: `${key}-${current.id}-void` }) }
        catch (error) { if ((await this.stripe.invoices.retrieve(current.id)).status !== 'paid') throw error }
      } else if (current.status === 'draft') await this.stripe.invoices.del(current.id, { idempotencyKey: `${key}-${current.id}-draft` })
      else throw Error('billing_pending')
    }
    const verified = await this.stripe.subscriptions.retrieve(subscription.id)
    if (!['canceled','incomplete_expired'].includes(verified.status) || verified.schedule) throw Error('billing_pending')
  }
  async switchCycle(sub: Stripe.Subscription, cycle: Cycle, key: string): Promise<void> {
    const item = sub.items.data[0], price = this.config.prices[cycle]
    if (sub.status !== 'active' || sub.cancel_at_period_end || sub.cancel_at) throw Error('renewal_confirmation_required')
    if (item.price.id === price) throw Error('billing_invalid_cycle')
    let schedule = sub.schedule ? await this.stripe.subscriptionSchedules.retrieve(objectId(sub.schedule)!)
      : await this.stripe.subscriptionSchedules.create({ from_subscription: sub.id }, { idempotencyKey: `${key}-schedule` })
    if (!['active','not_started'].includes(schedule.status)) throw Error('billing_pending')
    await this.stripe.subscriptionSchedules.update(schedule.id, { end_behavior: 'release', proration_behavior: 'none', phases: [
      { start_date: schedule.current_phase?.start_date ?? item.current_period_start, end_date: item.current_period_end,
        items: [{ price: item.price.id, quantity: 1 }], proration_behavior: 'none' },
      { start_date: item.current_period_end, items: [{ price, quantity: 1 }], proration_behavior: 'none', billing_cycle_anchor: 'phase_start',
        duration: { interval: cycle === 'monthly' ? 'month' : 'year', interval_count: 1 } },
    ] }, { idempotencyKey: `${key}-phases` })
  }
}
