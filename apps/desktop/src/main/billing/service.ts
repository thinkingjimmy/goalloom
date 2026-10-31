/**
 * [INPUT]: Verified account-only Auth, fixed project configuration and explicit finite billing actions.
 * [OUTPUT]: Trusted account/environment projections, stable mutation recovery and constrained Stripe browser sessions.
 * [POS]: Main billing coordinator. A purchase never configures sync, changes local data or grants AI consent.
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { boundedRequest, SyncFailure, syncClock, type SyncClock } from '@goalloom/sync'
import { billingAccessSchema, billingActionSchema, billingCycleSchema, billingErrors, billingStateSchema,
  type BillingAccess, type BillingAction, type BillingContinuation, type BillingError, type BillingState } from '../../shared/contracts/billing'
import type { Locale } from '../../shared/i18n/locale'
import { BillingJournal, type BillingOperation } from './journal'
import { BillingLoopback, parseBillingReturn } from './return'

const instant = z.iso.datetime({ offset: true })
const price = z.object({ amount: z.number().int().nonnegative(), currency: z.literal('USD'), taxBehavior: z.literal('inclusive') })
const statusSchema = z.object({
  version: z.literal(1), environment: z.enum(['development', 'production']),
  status: billingAccessSchema.shape.status, eligible: z.boolean(), serverNow: instant,
  effectiveEnd: instant.nullable(), trialEligible: z.boolean(), grace: z.boolean(),
  priceCatalog: z.object({ monthly: price, annual: price }),
  subscriptions: z.array(z.object({ status: z.string().max(64), cycle: billingCycleSchema.nullable(), nextCycle: billingCycleSchema.nullable(),
    endsAt: instant.nullable(), cancelAtPeriodEnd: z.boolean() })).max(20),
})
const browserSchema = z.object({ status: z.enum(['checkout', 'portal']), url: z.string().max(8192), requestId: z.uuid(),
  continuationExpiresAt: instant, returnToThisDevice: z.boolean() })
const closedSchema = z.object({ environment: z.enum(['development', 'production']), operation: z.strictObject({
  requestId: z.uuid(), requestedId: z.uuid().optional(), action: z.enum(['claim_trial', 'checkout', 'portal', 'switch', 'cancel', 'resume', 'remove_switch']),
  cycle: billingCycleSchema.nullable(), status: z.literal('closed'), reason: z.enum(billingErrors),
}) })
const completeSchema = z.object({ environment: z.enum(['development', 'production']), operation: z.strictObject({
  requestId: z.uuid(), requestedId: z.uuid().optional(), action: z.enum(['claim_trial', 'checkout', 'portal', 'switch', 'cancel', 'resume', 'remove_switch']),
  cycle: billingCycleSchema.nullable(), status: z.literal('complete'),
}) })

function matchesOperation(original: BillingOperation, receipt: { requestId: string; requestedId?: string | undefined; action: string; cycle: string | null }): boolean {
  const identity = receipt.requestedId === undefined
    ? [original.requestId, original.canonicalRequestId].includes(receipt.requestId)
    : receipt.requestedId === original.requestId && (!original.canonicalRequestId || original.canonicalRequestId === receipt.requestId)
  return identity && receipt.action === original.action && receipt.cycle === original.cycle
}

class BillingFailure extends Error {
  constructor(readonly code: BillingError, readonly receipt?: z.infer<typeof closedSchema>) { super(code) }
}

export function safeBillingBrowserUrl(value: string, action: 'checkout' | 'portal'): boolean {
  try {
    const url = new URL(value)
    if (value.length > 8192 || url.protocol !== 'https:' || url.username || url.password || url.port) return false
    if (action === 'checkout') return url.hostname === 'checkout.stripe.com' && /^\/c\/pay\/cs_(test_|live_)?[A-Za-z0-9]+$/.test(url.pathname)
    if (url.hostname !== 'billing.stripe.com' || url.hash) return false
    if (/^\/p\/session\/[A-Za-z0-9_-]+$/.test(url.pathname)) return !url.search
    return url.pathname === '/p/session' && [...url.searchParams.keys()].length === 1
      && /^[A-Za-z0-9_-]{1,2048}$/.test(url.searchParams.get('secret') ?? '')
  } catch { return false }
}

export class BillingService {
  private journal: BillingJournal
  private loopback: BillingLoopback
  private context = ''
  private revision = 0
  private abort = new AbortController()
  private access: BillingAccess | null = null
  private pending: BillingOperation | null = null
  private error: BillingError | null = null
  private working: Promise<void> | null = null
  private expiry: (() => void) | null = null
  private accessDeadline = Infinity
  private accessReceivedAt = 0
  private initialized = false
  private reconcileAfter: { revision: number; owner: string } | null = null

  constructor(private deps: {
    userData: string; packaged: boolean; account: { id(): string | null; session(): Promise<{ userId: string; accessToken: string }> }
    config(): { url: string; anonKey: string | null }; locale(): Locale
    openExternal(url: string): Promise<void>; notify(state: BillingState): void
    checked?(eligible: boolean): void; returned?(): void; now?(): number; fetch?: typeof fetch; clock?: SyncClock
  }) {
    this.journal = new BillingJournal(join(deps.userData, 'billing', 'operations.json'))
    this.loopback = new BillingLoopback((url, port) => this.acceptReturn(url, port), deps.locale)
  }
  private now() { return this.deps.now?.() ?? Date.now() }
  private get clock() { return this.deps.clock ?? syncClock }
  private get environment() { return this.deps.packaged ? 'production' as const : 'development' as const }
  private state(): BillingState {
    const owner = this.deps.account.id(), current = !!owner && this.context === `${this.deps.config().url}|${owner}`
    return billingStateSchema.parse({ accountId: owner, environment: this.environment,
      access: current ? this.access : null, busy: !!this.working, error: current ? this.error : null,
      pending: current && this.pending ? { action: this.pending.action, cycle: this.pending.cycle, browserOpened: this.pending.browserOpened, returnToThisDevice: this.pending.returnToThisDevice } : null })
  }
  private publish(): void { this.deps.notify(this.state()) }
  private check(revision: number, owner: string): void {
    if (revision !== this.revision || this.deps.account.id() !== owner || this.abort.signal.aborted) throw Error('cancelled')
  }
  accountChanged(): void {
    const owner = this.deps.account.id(), config = this.deps.config(), context = `${config.url}|${owner ?? ''}`
    if (context === this.context) return
    this.context = context; this.revision++; this.abort.abort(); this.abort = new AbortController()
    this.loopback.close(); this.expiry?.(); this.expiry = null; this.accessDeadline = Infinity
    this.access = null; this.pending = null; this.error = null; this.initialized = false
    this.reconcileAfter = null
    this.publish()
    if (owner) void Promise.resolve().then(() => this.handle({ type: 'status' }))
  }
  stop(): void { this.revision++; this.abort.abort(); this.loopback.close(); this.expiry?.() }

  async handle(input: unknown): Promise<BillingState> {
    const action = billingActionSchema.parse(input)
    if ('expectedAccountId' in action && action.expectedAccountId !== this.deps.account.id()) return { ...this.state(), error: 'billing_request_conflict' }
    this.accountChanged()
    if (this.working) {
      const owner = this.deps.account.id()
      if (action.type === 'refresh' && owner) this.reconcileAfter = { revision: this.revision, owner }
      await this.working; this.accountChanged()
      if (action.type === 'status' && !this.initialized) return this.handle(action)
      return this.state()
    }
    if (action.type === 'status' && this.initialized && this.access) return this.state()
    const owner = this.deps.account.id(), revision = this.revision
    if (!owner) return this.state()
    let work!: Promise<void>
    work = Promise.resolve().then(async () => {
      this.error = null
      this.pending = await this.journal.pending(this.deps.config().url, owner)
      this.check(revision, owner)
      if (this.pending?.continuation?.transport === 'loopback') {
        // A busy saved port cannot change an already-created provider session's return binding.
        await this.loopback.listen(this.pending.continuation.port).catch(() => undefined)
      }
      if (action.type === 'status' || action.type === 'refresh') await this.refresh(action.type === 'refresh', revision, owner)
      else await this.mutate(action, revision, owner)
      this.check(revision, owner); this.initialized = true
    }).catch(async error => {
      if (revision !== this.revision || this.deps.account.id() !== owner) return
      this.error = error instanceof BillingFailure ? error.code : 'storage'
      const receipt = error instanceof BillingFailure ? error.receipt : undefined
      if (action.type !== 'status' && receipt?.environment === this.environment && this.pending
        && matchesOperation(this.pending, receipt.operation)) {
        try { await this.journal.complete(this.pending); this.check(revision, owner); this.pending = null; this.loopback.close() }
        catch { this.error = 'storage' }
      }
    }).finally(() => {
      if (this.working === work) this.working = null
      this.publish()
      if (this.access) this.armAccessCheck()
      const queued = this.reconcileAfter
      this.reconcileAfter = null
      if (queued?.revision === this.revision && this.deps.account.id() === queued.owner) void this.handle({ type: 'refresh' })
    })
    this.working = work; this.publish(); await work
    return this.state()
  }

  private async request(body: Record<string, unknown> | null, revision: number, owner: string): Promise<unknown> {
    const config = this.deps.config()
    const anonKey = config.anonKey
    if (!anonKey) throw new BillingFailure('billing_configuration')
    return boundedRequest({ ms: 35_000, clock: syncClock, signals: [this.abort.signal] }, async signal => {
      let session
      try { session = await this.deps.account.session() }
      catch (error) { throw new BillingFailure(error instanceof SyncFailure && error.code === 'auth' ? 'authentication_failed' : 'network') }
      this.check(revision, owner); signal.throwIfAborted()
      if (session.userId !== owner) throw new BillingFailure('authentication_failed')
      let response: Response, data: unknown
      try {
        response = await (this.deps.fetch ?? fetch)(`${config.url}/functions/v1/billing`, {
          method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${session.accessToken}`, apikey: anonKey,
            'content-type': 'application/json', 'x-goalloom-service-version': '1' },
          ...(body ? { body: JSON.stringify(body) } : {}), signal, redirect: 'error',
        })
        const reader = response.body?.getReader(), chunks: Uint8Array[] = []
        let size = 0
        if (!reader) throw Error('empty response')
        try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > 128 * 1024) { await reader.cancel(); throw Error('large response') }; chunks.push(part.value) } }
        finally { reader.releaseLock() }
        data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      } catch { signal.throwIfAborted(); throw new BillingFailure('network') }
      this.check(revision, owner)
      const error = data && typeof data === 'object' ? (data as { error?: unknown }).error : null
      if (response.status === 401) throw new BillingFailure('authentication_failed')
      if (error || !response.ok) {
        const receipt = closedSchema.safeParse(data)
        throw new BillingFailure(billingErrors.some(value => value === error) ? error as BillingError : 'billing_unavailable', receipt.success ? receipt.data : undefined)
      }
      return data
    }).catch(error => { if (error instanceof BillingFailure) throw error; throw new BillingFailure('network') })
  }

  private project(data: unknown): BillingAccess {
    const wire = statusSchema.safeParse(data)
    if (!wire.success || wire.data.environment !== this.environment) throw new BillingFailure('billing_configuration')
    const value = wire.data
    const { priceCatalog } = value
    if (value.eligible !== ['active', 'trialing'].includes(value.status)
      || value.eligible && (!value.effectiveEnd || Date.parse(value.effectiveEnd) <= Date.parse(value.serverNow))) throw new BillingFailure('billing_configuration')
    return billingAccessSchema.parse({ status: value.status, eligible: value.eligible, serverNow: value.serverNow,
      effectiveEnd: value.effectiveEnd, trialEligible: value.trialEligible, grace: value.grace,
      prices: { monthly: { amount: priceCatalog.monthly.amount, currency: 'USD' }, annual: { amount: priceCatalog.annual.amount, currency: 'USD' } },
      subscriptions: value.subscriptions.map(row => {
        const next = row.nextCycle ?? row.cycle
        return { ...row, nextAmount: next ? priceCatalog[next].amount : null, nextCurrency: next ? 'USD' : null }
      }),
    })
  }
  private setAccess(data: unknown): void {
    this.access = this.project(data)
    this.accessReceivedAt = this.clock.now()
    this.accessDeadline = this.access.eligible && this.access.effectiveEnd
      ? this.clock.now() + Date.parse(this.access.effectiveEnd) - Date.parse(this.access.serverNow) : Infinity
    this.armAccessCheck()
    this.deps.checked?.(this.access.eligible)
  }
  private armAccessCheck(): void {
    this.expiry?.()
    this.expiry = this.clock.after(Math.max(1, Math.min(60_000, this.accessDeadline - this.clock.now())), () => {
      this.expiry = null
      if (this.clock.now() >= this.accessDeadline) { this.access = null; this.publish() }
      this.initialized = false
      void this.handle({ type: 'status' })
    })
  }
  private async refresh(reconcile: boolean, revision: number, owner: string): Promise<void> {
    const original = this.pending
    const operation = reconcile && original?.action === 'checkout'
      ? { requestId: original.requestId, action: original.action, cycle: original.cycle, continuation: original.continuation } : undefined
    const data = await this.request(reconcile ? { action: 'reconcile', ...(operation ? { operation } : {}) } : null, revision, owner)
    this.setAccess(data)
    this.check(revision, owner)
    const receipt = completeSchema.safeParse(data)
    const completed = reconcile && original?.action === 'checkout' && receipt.success && receipt.data.environment === this.environment
      && matchesOperation(original, receipt.data.operation)
    // A receipt-only probe never creates a session or reopens a browser.
    if (original && (reconcile && original.action === 'portal' || completed)) {
      await this.journal.complete(original); this.check(revision, owner); this.pending = null; this.loopback.close()
    }
  }
  private async mutate(action: BillingAction, revision: number, owner: string): Promise<void> {
    const recovering = action.type === 'recover'
    if (recovering && !this.pending) { await this.refresh(true, revision, owner); return }
    if (this.pending && !recovering && (this.pending.action !== action.type || this.pending.cycle !== ('cycle' in action ? action.cycle : null))) throw new BillingFailure('billing_pending')
    if (!this.pending) {
      if (action.type === 'status' || action.type === 'refresh' || action.type === 'recover') return
      let continuation: BillingContinuation | null = null
      if (action.type === 'checkout' || action.type === 'portal') {
        continuation = { version: 1, id: randomUUID(), locale: this.deps.locale() === 'zh' ? 'zh-CN' : this.deps.locale() as Exclude<Locale, 'zh'>,
          transport: this.deps.packaged ? 'app' : 'loopback', ...(!this.deps.packaged ? { port: await this.loopback.listen() } : {}) }
      }
      this.check(revision, owner)
      this.pending = await this.journal.begin(this.deps.config().url, owner, action.type, 'cycle' in action ? action.cycle : null, new Date(this.now()).toISOString(), continuation)
    }
    this.check(revision, owner)
    const original = this.pending!
    this.publish()
    const data = await this.request({ action: original.action, requestId: original.requestId,
      ...(original.cycle ? { cycle: original.cycle } : {}), ...(original.continuation ? { continuation: original.continuation } : {}) }, revision, owner)
    this.check(revision, owner)
    const browser = browserSchema.safeParse(data)
    if (browser.success) {
      const value = browser.data
      if (value.status !== original.action || !safeBillingBrowserUrl(value.url, value.status)) throw new BillingFailure('billing_configuration')
      if (value.returnToThisDevice && value.requestId !== original.requestId
        || original.canonicalRequestId && (original.canonicalRequestId !== value.requestId || original.continuationExpiresAt !== value.continuationExpiresAt || original.returnToThisDevice !== value.returnToThisDevice)) throw new BillingFailure('billing_request_conflict')
      const saved = await this.journal.received(original, { canonicalRequestId: value.requestId, continuationExpiresAt: value.continuationExpiresAt, returnToThisDevice: value.returnToThisDevice })
      this.check(revision, owner); this.pending = saved
      try { await this.deps.openExternal(value.url) }
      catch { throw new BillingFailure('billing_unavailable') }
      this.check(revision, owner); this.pending = await this.journal.opened(saved)
      return
    }
    // URL-free action results still require an authoritative projection.
    this.setAccess(data)
    const receipt = completeSchema.safeParse(data)
    const completed = receipt.success && receipt.data.environment === this.environment
      && matchesOperation(original, receipt.data.operation)
    if (original.action !== 'checkout' || completed) {
      await this.journal.complete(original); this.check(revision, owner); this.pending = null; this.loopback.close()
    }
  }

  async acceptReturn(url: string, port?: number): Promise<boolean> {
    this.accountChanged()
    const owner = this.deps.account.id(), revision = this.revision
    const id = parseBillingReturn(url, this.deps.packaged, port)
    if (!owner || !id) return false
    const pending = await this.journal.pending(this.deps.config().url, owner)
    this.check(revision, owner)
    if (!pending || pending.returnSeen || !pending.returnToThisDevice || pending.continuation?.id !== id
      || (pending.continuation.transport === 'loopback' ? pending.continuation.port !== port : port !== undefined)
      || !pending.continuationExpiresAt) return false
    // A restarted process first obtains a trusted clock; the saved browser nonce grants no access.
    if (!this.access) { await this.handle({ type: 'status' }); this.check(revision, owner) }
    if (!this.access || Date.parse(pending.continuationExpiresAt) <= Date.parse(this.access.serverNow) + this.clock.now() - this.accessReceivedAt) return false
    const current = await this.journal.pending(this.deps.config().url, owner)
    this.check(revision, owner)
    if (current && current.requestId !== pending.requestId) return false
    if (current) await this.journal.seen(current)
    this.check(revision, owner)
    this.deps.returned?.()
    void this.handle({ type: 'refresh' })
    return true
  }
}
