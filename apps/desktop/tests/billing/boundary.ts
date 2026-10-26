/**
 * [INPUT]: Production BillingService/journal/loopback/SDK and isolated actual HTTP/filesystem boundaries.
 * [OUTPUT]: Original-request, account/environment, return, transient-auth and closed-receipt evidence.
 * [POS]: Controlled billing journey. Synthetic provider facts do not establish Stripe/Auth connectivity.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createFetchRemote, SyncFailure, type SyncClock } from '@goalloom/sync'
import { BillingService, safeBillingBrowserUrl } from '../../src/main/billing/service'
import { parseBillingReturn } from '../../src/main/billing/return'
import type { BillingState } from '../../src/shared/contracts/billing'

async function main() {
  const out = resolve('../../output/tests/billing/desktop/d1-client'), root = await mkdtemp(join(tmpdir(), 'goalloom-billing-boundary-'))
  await mkdir(out, { recursive: true })
  const report: any = { ok: false, checks: [], runtime: { electron: process.versions.electron, node: process.versions.node },
    host: { os: release(), arch: arch(), cpu: cpus()[0]?.model, physicalMachineOrVm: 'not independently established' },
    scope: 'Source service and actual loopback HTTP/filesystem with controlled account/provider facts; no native UI, real Auth, Stripe, model, packaged or Windows acceptance.' }
  const check = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`) }
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222'
  let owner: string | null = null, transient = false, status: 'none' | 'trialing' | 'active' | 'expired' | 'revoked' | 'verification_pending' = 'none'
  let aliasReceipt: Record<string, unknown> | null = null, browserUrlOverride: string | null = null
  let fault = '', releaseHeld: (() => void) | null = null, rpcError = ''
  let monotonic = 0
  const timers = new Map<number, { at: number; run: () => void }>(); let timerId = 0
  const clock: SyncClock = { now: () => monotonic, after: (ms, run) => { const id = ++timerId; timers.set(id, { at: monotonic + ms, run }); return () => { timers.delete(id) } } }
  const advance = (ms: number) => { monotonic += ms; for (const [id, timer] of [...timers]) if (timer.at <= monotonic) { timers.delete(id); timer.run() } }
  const mutations: Record<string, unknown>[] = [], opened: string[] = [], states: BillingState[] = []
  const claimed = new Map<string, string>(), operations = new Map<string, Record<string, any>>()
  let httpCount = 0, reconcileCount = 0, service: BillingService | null = null
  const now = Date.now(), serverNow = () => new Date(now + monotonic).toISOString()
  const projection = () => ({ version: 1, environment: 'development', status, eligible: ['trialing', 'active'].includes(status), serverNow: serverNow(),
    effectiveEnd: ['trialing', 'active'].includes(status) ? new Date(now + 192 * 3600_000).toISOString() : null,
    trialEligible: !claimed.has(owner ?? '') && status === 'none', grace: false,
    priceCatalog: { monthly: { amount: 899, currency: 'USD', taxBehavior: 'inclusive' }, annual: { amount: 7900, currency: 'USD', taxBehavior: 'inclusive' } },
    subscriptions: status === 'active' ? [{ id: 'sub_synthetic', status: 'active', cycle: 'annual', nextCycle: null, endsAt: new Date(now + 192 * 3600_000).toISOString(), cancelAtPeriodEnd: false }] : [] })
  const server = createServer(async (request, response) => {
    httpCount++
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
    const send = (value: unknown, code = 200) => { response.writeHead(code, { 'content-type': 'application/json' }); response.end(JSON.stringify(value)) }
    if (request.url?.startsWith('/rest/')) {
      assert.equal(request.headers['x-goalloom-service-version'], '2')
      if (rpcError) { send({ message: rpcError, code: rpcError === 'billing_configuration' ? 'PT503' : 'PT403' }, rpcError === 'billing_configuration' ? 503 : 403); return }
      assert.equal(body.p_payload_hashes?.[0], 'a'.repeat(64)); send([]); return
    }
    assert.equal(request.url, '/functions/v1/billing')
    assert.equal(request.headers['x-goalloom-service-version'], '1')
    assert.equal(request.headers.authorization, `Bearer ${owner}`)
    if (body.action === 'reconcile') {
      reconcileCount++
      if (body.operation) {
        assert.deepEqual(Object.keys(body).sort(), ['action', 'operation'])
        assert.deepEqual(Object.keys(body.operation).sort(), ['action', 'continuation', 'cycle', 'requestId'])
        const original = operations.get(body.operation.requestId); assert(original)
        assert.deepEqual(body.operation, { requestId: original.requestId, action: original.action, cycle: original.cycle, continuation: original.continuation })
        if (fault === 'probe-complete') { send({ ...projection(), operation: { requestId: original.requestId, action: original.action, cycle: original.cycle, status: 'complete' } }); return }
        if (fault === 'alias-terminal') {
          assert(aliasReceipt)
          if (aliasReceipt.status === 'closed') send({ error: 'billing_request_conflict', environment: 'development', operation: aliasReceipt }, 409)
          else send({ ...projection(), operation: aliasReceipt })
          return
        }
      }
      if (fault === 'hold-reconcile') await new Promise<void>(resolve => { releaseHeld = resolve })
      send(projection()); return
    }
    if (request.method === 'GET') { if (fault === 'hold-get') await new Promise<void>(resolve => { releaseHeld = resolve }); send(projection()); return }
    mutations.push(body)
    if (body.action === 'claim_trial') {
      if (!claimed.has(owner!)) claimed.set(owner!, body.requestId)
      status = 'trialing'
      if (fault === 'lost-trial') { fault = ''; response.destroy(); return }
      send({ ...projection(), trialReceipt: claimed.get(owner!) }); return
    }
    if (['checkout', 'portal'].includes(body.action)) {
      assert.deepEqual(Object.keys(body).sort(), body.action === 'checkout' ? ['action', 'continuation', 'cycle', 'requestId'] : ['action', 'continuation', 'requestId'])
      assert.equal(body.continuation.transport, 'loopback')
      const previous = operations.get(body.requestId)
      if (previous) assert.deepEqual(previous.continuation, body.continuation)
      else operations.set(body.requestId, structuredClone(body))
      if (fault === 'alias-lost') { response.destroy(); return }
      if (fault === 'alias-terminal') {
        assert(aliasReceipt)
        if (aliasReceipt.status === 'closed') send({ error: 'billing_request_conflict', environment: 'development', operation: aliasReceipt }, 409)
        else send({ ...projection(), operation: aliasReceipt })
        return
      }
      if (fault === 'closed' || fault === 'foreign-closed') {
        send({ error: 'billing_request_conflict', environment: 'development', operation: {
          requestId: fault === 'foreign-closed' ? randomUUID() : body.requestId, action: body.action, cycle: body.cycle ?? null, status: 'closed', reason: 'billing_request_conflict',
        } }, 409); return
      }
      if (fault === 'lost-checkout') { fault = ''; response.destroy(); return }
      if (fault === 'completed-status') {
        send({ ...projection(), operation: { requestId: body.requestId, action: body.action, cycle: body.cycle ?? null, status: 'complete' } }); return
      }
      send({ status: body.action, requestId: fault === 'other-device' ? randomUUID() : body.requestId,
        url: browserUrlOverride ?? (fault === 'unsafe-url' ? 'https://checkout.stripe.com@evil.invalid/c/pay/cs_test_fake'
          : body.action === 'checkout' ? 'https://checkout.stripe.com/c/pay/cs_test_synthetic' : fault === 'duplicate-portal-secret' ? 'https://billing.stripe.com/p/session?secret=' + 'a'.repeat(89) + '&secret=' + 'b'.repeat(89) : 'https://billing.stripe.com/p/session?secret=' + 'a'.repeat(89)),
        continuationExpiresAt: new Date(now + 24 * 3600_000).toISOString(), returnToThisDevice: fault !== 'other-device' })
      return
    }
    send(projection())
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address(); assert(address && typeof address !== 'string')
  const url = `http://127.0.0.1:${address.port}`
  const profile = join(root, 'profile')
  const open = () => new BillingService({ userData: profile, packaged: false, clock, now: () => now + monotonic, locale: () => 'en',
    account: { id: () => owner, session: async () => { if (transient) throw new SyncFailure('network'); if (!owner) throw new SyncFailure('auth'); return { userId: owner, accessToken: owner } } },
    config: () => ({ url, anonKey: 'synthetic-anon' }), notify: state => states.push(state), openExternal: async value => { opened.push(value) },
  })
  const waitUntil = async (predicate: () => boolean) => { const deadline = Date.now() + 5000; while (!predicate()) { if (Date.now() > deadline) throw Error('Controlled boundary did not settle'); await new Promise(resolve => setTimeout(resolve, 10)) } }
  const pendingFile = async () => JSON.parse(await readFile(join(profile, 'billing/operations.json'), 'utf8')).operations[0]
  const billing = (action: Record<string, unknown>) => service!.handle(action.type === 'status' || action.type === 'refresh' ? action : { ...action, expectedAccountId: owner })
  try {
    service = open(); assert.equal((await billing({ type: 'status' })).accountId, null); assert.equal(httpCount, 0)
    owner = a; service.accountChanged(); let view = await billing({ type: 'status' }); assert.equal(view.access?.status, 'none'); assert.equal(mutations.length, 0)
    check('Signing in and viewing status do not claim a trial, create payment or access sync')
    const beforeStale = httpCount, beforeJournal = await readFile(join(profile, 'billing/operations.json')).catch(() => null)
    owner = b
    const stale = await service.handle({ type: 'checkout', cycle: 'monthly', expectedAccountId: a })
    assert.equal(stale.error, 'billing_request_conflict'); assert.equal(httpCount, beforeStale)
    assert.deepEqual(await readFile(join(profile, 'billing/operations.json')).catch(() => null), beforeJournal)
    owner = a
    check('A delayed renderer mutation from account A cannot dispatch, read/write the journal or start a request under account B')
    fault = 'lost-trial'; view = await billing({ type: 'claim_trial' }); assert.equal(view.error, 'network'); assert.equal(view.pending?.action, 'claim_trial')
    const trialId = mutations.at(-1)!.requestId
    service.stop(); service = open(); await billing({ type: 'status' }); view = await billing({ type: 'recover' })
    assert.equal(view.access?.status, 'trialing'); assert.equal(view.pending, null); assert.equal(mutations.at(-1)!.requestId, trialId); assert.equal(claimed.size, 1)
    check('Lost trial response and restart reuse the original receipt and 192-hour grant')
    const beforeRefresh = states.length; advance(60_000); await waitUntil(() => states.at(-1)?.busy === false)
    assert(states.slice(beforeRefresh).every(value => value.access?.eligible === true)); check('Periodic status refresh preserves an unexpired trusted projection')
    fault = 'lost-checkout'; view = await billing({ type: 'checkout', cycle: 'annual' }); assert.equal(view.error, 'network')
    const original = await pendingFile(); assert.equal(opened.length, 0)
    service.stop(); service = open(); await billing({ type: 'status' }); view = await billing({ type: 'recover' }); assert.equal(view.pending?.cycle, 'annual')
    assert.equal(mutations.at(-1)!.requestId, original.requestId); assert.deepEqual(mutations.at(-1)!.continuation, original.continuation); assert.equal(opened.length, 1)
    const beforeDifferent = mutations.length; view = await billing({ type: 'checkout', cycle: 'monthly' }); assert.equal(view.error, 'billing_pending'); assert.equal(mutations.length, beforeDifferent)
    check('Lost checkout and restart preserve the original intent, port and cycle; alternate-cycle clicks cannot replace it')
    const saved = await pendingFile(), callback = `http://127.0.0.1:${saved.continuation.port}/billing-return?v=1&environment=development&continue=${saved.continuation.id}`
    for (const bad of [callback + '&success=true', callback + '&v=1', callback + '#paid', callback.replace('development', 'production')]) assert.equal(await service.acceptReturn(bad, saved.continuation.port), false)
    owner = b; service.accountChanged(); assert.equal(await service.acceptReturn(callback, saved.continuation.port), false)
    owner = a; service.accountChanged(); await billing({ type: 'status' })
    fault = 'hold-reconcile'; const checking = billing({ type: 'refresh' }); await waitUntil(() => !!releaseHeld)
    assert.equal(await service.acceptReturn(callback, saved.continuation.port), true); assert.equal(await service.acceptReturn(callback, saved.continuation.port), false)
    const beforeReturn = reconcileCount; fault = ''; releaseHeld!(); releaseHeld = null; await checking
    await waitUntil(() => reconcileCount > beforeReturn && states.at(-1)?.busy === false)
    assert.equal(states.at(-1)?.access?.status, 'trialing'); assert.equal(states.at(-1)?.pending?.action, 'checkout')
    check('Malformed, foreign-account and replay callbacks fail; a valid busy callback queues reconciliation without granting paid access')
    status = 'active'; view = await billing({ type: 'refresh' }); assert(view.pending, 'Another checkout may own current paid access'); assert.equal(view.access?.subscriptions[0]?.nextAmount, 7900)
    fault = 'probe-complete'; const beforeProbeOpen = opened.length, beforeProbeMutations = mutations.length
    view = await billing({ type: 'refresh' }); assert.equal(view.pending, null); assert.equal(opened.length, beforeProbeOpen); assert.equal(mutations.length, beforeProbeMutations); fault = ''
    check('An active projection cannot resolve a pending checkout; only its complete receipt does, and annual price comes from the trusted catalogue')
    await billing({ type: 'portal' }); const cold = await pendingFile()
    service.stop(); service = open()
    assert.equal(await service.acceptReturn(`http://127.0.0.1:${cold.continuation.port}/billing-return?v=1&environment=development&continue=${cold.continuation.id}`, cold.continuation.port), true)
    assert.equal((await billing({ type: 'status' })).pending, null)
    check('A cold-start bound callback obtains a trusted server clock before expiry checks and reconciliation')
    await billing({ type: 'portal' }); const portal = await pendingFile()
    advance(60_000); await waitUntil(() => states.at(-1)?.busy === false); assert.equal((await pendingFile()).requestId, portal.requestId)
    const portalUrl = `http://127.0.0.1:${portal.continuation.port}/billing-return?v=1&environment=development&continue=${portal.continuation.id}`
    const response = await fetch(portalUrl); assert.equal(response.status, 200)
    await waitUntil(() => states.at(-1)?.pending === null); check('Portal intent survives background refresh; actual loopback return reconciles and resolves it')
    transient = true; view = await billing({ type: 'refresh' }); assert.equal(view.error, 'network'); assert.equal(view.accountId, a); transient = false
    check('Transient token failure keeps the account and uses network feedback')
    fault = 'foreign-closed'; view = await billing({ type: 'portal' }); assert(view.pending); fault = 'closed'; view = await billing({ type: 'recover' }); assert.equal(view.pending, null)
    check('Only an owner/environment/original-intent-matched closed receipt releases pending; an unrelated receipt cannot')
    fault = ''; browserUrlOverride = 'https://billing.stripe.com/p/session/test_synthetic-legacy'
    view = await billing({ type: 'portal' }); assert.equal(view.pending?.browserOpened, true); assert.equal(opened.at(-1), browserUrlOverride)
    fault = 'closed'; await billing({ type: 'recover' }); browserUrlOverride = null
    fault = ''
    for (const invalid of [
      'https://billing.stripe.com/p/session?secret=', 'https://billing.stripe.com/p/session?secret=abc&extra=1',
      'https://billing.stripe.com/p/session?secret=' + 'a'.repeat(89) + '#return',
      'https://user@billing.stripe.com/p/session?secret=' + 'a'.repeat(89),
      'https://billing.stripe.com:444/p/session?secret=' + 'a'.repeat(89),
      'https://billing.stripe.com/p/session?secret=' + 'a'.repeat(2049), 'https://billing.stripe.com/p/session?secret=a%2Fb',
    ]) {
      const before: number = opened.length; browserUrlOverride = invalid
      view = await billing({ type: 'portal' }); assert.equal(view.error, 'billing_configuration'); assert.equal(opened.length, before)
      browserUrlOverride = null; fault = 'closed'; await billing({ type: 'recover' }); fault = ''
    }
    fault = 'duplicate-portal-secret'; const beforeDuplicate = opened.length; view = await billing({ type: 'portal' }); assert.equal(view.error, 'billing_configuration'); assert.equal(opened.length, beforeDuplicate)
    fault = 'closed'; await billing({ type: 'recover' })
    fault = 'unsafe-url'; const browserCount = opened.length; view = await billing({ type: 'portal' }); assert.equal(view.error, 'billing_configuration'); assert.equal(opened.length, browserCount)
    fault = 'closed'; await billing({ type: 'recover' }); fault = 'other-device'; await billing({ type: 'checkout', cycle: 'monthly' })
    const other = await pendingFile(); assert.notEqual(other.canonicalRequestId, other.requestId); assert.equal(other.returnToThisDevice, false)
    assert.equal((await billing({ type: 'status' })).pending?.returnToThisDevice, false)
    assert.equal(await service.acceptReturn(`http://127.0.0.1:${other.continuation.port}/billing-return?v=1&environment=development&continue=${other.continuation.id}`, other.continuation.port), false)
    fault = ''; view = await billing({ type: 'refresh' }); assert(view.pending); fault = 'closed'; await billing({ type: 'recover' }); check('Browser URL allowlist and cross-device canonical operation never replace a local continuation')
    for (const ended of ['expired', 'revoked', 'verification_pending'] as const) {
      status = 'none'; fault = 'lost-checkout'; await billing({ type: 'checkout', cycle: 'monthly' })
      status = ended; fault = 'completed-status'; view = await billing({ type: 'recover' })
      assert.equal(view.error, null); assert.equal(view.access?.status, ended); assert.equal(view.pending, null)
    }
    fault = ''; check('Completed original checkout receipts resolve pending after a lost return even when current access expired, was revoked or remains pending')
    for (const [terminal, ended] of [['complete', 'expired'], ['complete', 'revoked'], ['complete', 'verification_pending'], ['closed', 'expired']] as const) {
      status = 'none'; fault = 'alias-lost'
      view = await billing({ type: 'checkout', cycle: 'monthly' }); assert.equal(view.error, 'network')
      const localB = await pendingFile(), canonicalA = randomUUID(), unrelatedC = randomUUID()
      assert.equal(localB.canonicalRequestId, null)
      operations.set(unrelatedC, { requestId: unrelatedC, action: 'checkout', cycle: 'annual', continuation: { id: randomUUID() } })
      const cBefore = structuredClone(operations.get(unrelatedC)), countBefore = operations.size
      service.stop(); advance(25 * 3600_000); status = ended; service = open(); await billing({ type: 'status' })
      fault = 'alias-terminal'
      const terminalReceipt = { requestId: canonicalA, action: 'checkout', cycle: 'monthly', status: terminal,
        ...(terminal === 'closed' ? { reason: 'billing_request_conflict' } : {}) }
      aliasReceipt = terminalReceipt
      view = await billing({ type: 'refresh' }); assert(view.pending, 'Unknown bare canonical A cannot resolve B')
      aliasReceipt = { ...terminalReceipt, requestedId: randomUUID() }
      view = await billing({ type: 'refresh' }); assert(view.pending, 'Foreign original request cannot resolve B')
      aliasReceipt = { ...terminalReceipt, requestedId: localB.requestId, cycle: 'annual' }
      view = await billing({ type: 'refresh' }); assert(view.pending, 'Alias receipt cannot change the cycle')
      aliasReceipt = { ...terminalReceipt, requestedId: localB.requestId }
      view = await billing({ type: 'refresh' }); assert.equal(view.pending, null); assert.equal(view.access?.status, ended)
      assert.equal(operations.size, countBefore); assert.deepEqual(operations.get(unrelatedC), cBefore)
      assert.equal(mutations.at(-1)!.requestId, localB.requestId)
    }
    check('Lost first alias responses recover only with original B proof after A completes or closes, beyond 24 hours and beside unrelated C; bare/foreign/changed-cycle receipts retain B')
    status = 'none'; fault = 'other-device'; await billing({ type: 'checkout', cycle: 'monthly' })
    const bound = await pendingFile(); fault = 'alias-terminal'
    aliasReceipt = { requestId: randomUUID(), requestedId: bound.requestId, action: 'checkout', cycle: 'monthly', status: 'complete' }
    view = await billing({ type: 'refresh' }); assert(view.pending)
    aliasReceipt = { ...aliasReceipt, requestId: bound.canonicalRequestId }
    view = await billing({ type: 'refresh' }); assert.equal(view.pending, null)
    check('An authenticated alias proof cannot replace a canonical operation already saved for the original request')
    fault = ''; aliasReceipt = null
    const remote = createFetchRemote({ url, anonKey: 'synthetic-anon', accessToken: async () => a })
    for (const code of ['service_not_started', 'service_expired', 'service_revoked', 'upgrade_required', 'billing_configuration']) {
      rpcError = code; await assert.rejects(remote.account(), (error: unknown) => error instanceof SyncFailure && error.code === code)
    }
    rpcError = ''; assert.deepEqual(await remote.receiptsFor(randomUUID(), randomUUID(), [{ opId: randomUUID(), payloadHash: 'a'.repeat(64) }]), [])
    check('Actual HTTP SDK preserves every typed service denial and sends the original receipt hash')
    assert.equal(parseBillingReturn('goalloom://billing-return?v=1&environment=production&continue=' + randomUUID(), false), null)
    assert.equal(safeBillingBrowserUrl('https://billing.stripe.com.evil.invalid/p/session/test', 'portal'), false)
    service.stop(); await writeFile(join(profile, 'billing/operations.json'), '{broken'); service = open()
    const beforeCorrupt = mutations.length; view = await billing({ type: 'claim_trial' }); assert.equal(view.error, 'storage'); assert.equal(mutations.length, beforeCorrupt)
    check('Corrupt journals fail before external mutation; development never accepts the installed app scheme')
    report.ok = true
  } catch (error) { report.error = error instanceof Error ? error.stack : String(error); throw error }
  finally {
    service?.stop(); (releaseHeld as (() => void) | null)?.(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()))
    await writeFile(join(out, 'boundary.json'), JSON.stringify(report, null, 2) + '\n'); await rm(root, { recursive: true, force: true })
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
