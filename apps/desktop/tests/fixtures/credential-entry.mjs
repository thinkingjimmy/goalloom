/**
 * [INPUT]: Built main entry, isolated profile and an optional synthetic cipher failure.
 * [OUTPUT]: Real Electron startup with counted cipher calls and synthetic cloud/browser transport.
 * [POS]: Credential timing instrumentation installed before the production composition root runs.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, dialog, ipcMain, safeStorage, shell } from 'electron'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'

if (process.env.GOALLOOM_HOSTED_FIXTURE === '1') dialog.showMessageBoxSync = () => 1

const fixture = globalThis.credentialFixture = {
  mode: process.env.GOALLOOM_CREDENTIAL_MODE ?? 'available',
  available: 0, encrypt: 0, decrypt: 0, refreshed: 0, browser: 0, browserUrls: [], actions: [], holdLogout: false, requests: [], unexpected: [], cipherAppNames: [],
}
if (process.env.GOALLOOM_BILLING_FIXTURE === '1') {
  fixture.billingStatus = 'none'; fixture.billingNow = Date.now(); fixture.billingEnd = fixture.billingNow + 192 * 3600_000
  const schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout, minuteTimers = new Map()
  const started = performance.now.bind(performance); let advanced = 0
  Object.defineProperty(performance, 'now', { value: () => started() + advanced })
  globalThis.setTimeout = (work, ms, ...args) => {
    const timer = schedule(work, ms, ...args)
    if (ms === 60_000) minuteTimers.set(timer, () => work(...args))
    return timer
  }
  globalThis.clearTimeout = timer => { minuteTimers.delete(timer); return cancel(timer) }
  fixture.advanceBillingMinute = () => {
    advanced += 60_000; fixture.billingNow += 60_000
    const pending = [...minuteTimers]; minuteTimers.clear()
    for (const [timer, work] of pending) { cancel(timer); work() }
  }
}
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, listener) => handle(channel, (event, ...args) => {
  if (process.env.GOALLOOM_APPLE_FIXTURE === '1' && channel === 'goalloom:sync' && args[0]?.type !== 'status') fixture.actions.push({ type: args[0]?.type, provider: args[0]?.provider })
  const tracked = process.env.GOALLOOM_HOSTED_FIXTURE === '1' && channel === 'goalloom:smart' && args[0]?.type === 'analyze'
  if (tracked) { fixture.analyses ??= []; fixture.analyses.push({requestId:args[0].request.requestId,contextRevision:args[0].request.contextRevision,stage:'started'}) }
  const result = listener(event, ...args)
  return tracked ? Promise.resolve(result).then(reply => { fixture.analyses.push({requestId:args[0].request.requestId,status:reply.reply?.status,failure:reply.reply?.failure?.kind??null,stage:'settled'}); return reply }) : result
})
if (process.env.GOALLOOM_CREDENTIAL_APP_DATA) app.setPath('appData', process.env.GOALLOOM_CREDENTIAL_APP_DATA)
app.setAsDefaultProtocolClient = () => false
if (fixture.mode === 'missing-policy') {
  const dlopen = process.dlopen
  process.dlopen = function (module, filename, flags) {
    if (filename.endsWith('/keychain-policy.node')) throw Error('Synthetic native policy load failure')
    return dlopen.call(this, module, filename, flags)
  }
}
const recordCipherName = () => { if (!fixture.cipherAppNames.includes(app.name)) fixture.cipherAppNames.push(app.name) }
if (process.platform === 'darwin' && fixture.mode !== 'missing-policy') {
  const native = createRequire(import.meta.url)(resolve('out/main/keychain-policy.node'))
  native.sessionKey = (_scope, create) => {
    recordCipherName(); fixture.available++
    if (fixture.mode === 'unavailable' || fixture.mode === 'denied') throw Error('Synthetic session key denial')
    if (create) fixture.encrypt++; else fixture.decrypt++
    return Buffer.alloc(32, 0x6d)
  }
}
safeStorage.isEncryptionAvailable = () => { recordCipherName(); fixture.available++; return fixture.mode !== 'unavailable' }
safeStorage.encryptString = text => {
  recordCipherName()
  fixture.encrypt++
  return Buffer.from(text).map(byte => byte ^ 0x5a)
}
safeStorage.decryptString = data => {
  recordCipherName()
  fixture.decrypt++
  if (fixture.mode === 'denied') throw Error('Synthetic keychain denial')
  return Buffer.from(data).map(byte => byte ^ 0x5a).toString()
}
shell.openExternal = async url => { fixture.browser++; fixture.browserUrls.push(url) }

fixture.cloudSessionId = '77777777-7777-4777-8777-777777777777'
const userId = process.env.GOALLOOM_HOSTED_USER ?? '11111111-1111-4111-8111-111111111111'
const makeJwt = (id = userId) => [
  { alg: 'HS256', typ: 'JWT' },
  { sub: id, ...(process.env.GOALLOOM_CLOUD_FIXTURE ? { session_id: fixture.cloudSessionId } : {}), exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' },
].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic'
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString())
  fixture.requests.push(url.pathname)
  if (url.pathname === '/auth/v1/logout' && fixture.holdLogout) return new Promise(() => {})
  let body
  if (url.pathname === '/functions/v1/billing') {
    fixture.billingActions ??= []
    const action = init.body ? JSON.parse(init.body) : null
    if (action) fixture.billingActions.push(action)
    const now = fixture.billingNow ?? Date.now(), end = fixture.billingEnd ?? now + 192 * 3600_000
    if (action?.action === 'claim_trial') { fixture.billingStatus = 'trialing'; fixture.billingTrialId ??= action.requestId }
    const state = fixture.billingStatus ?? 'active', cycle = fixture.billingCycle ?? 'annual'
    body = { version: 1, environment: 'development', status: state, eligible: ['trialing', 'active'].includes(state),
      serverNow: new Date(now).toISOString(), effectiveEnd: ['trialing', 'active'].includes(state) ? new Date(end).toISOString() : null,
      trialEligible: state === 'none', grace: false,
      priceCatalog: { monthly: { amount: 899, currency: 'USD', taxBehavior: 'inclusive' }, annual: { amount: 7900, currency: 'USD', taxBehavior: 'inclusive' } },
      subscriptions: state === 'active' ? [{ id: 'sub_fixture', status: 'active', cycle, nextCycle: fixture.billingNextCycle ?? null, endsAt: new Date(end).toISOString(), cancelAtPeriodEnd: false }] : [] }
    if (action?.action === 'checkout' || action?.action === 'portal') {
      fixture.billingContinuation = action.continuation
      fixture.billingCanonicalRequests ??= {}
      const sameDevice = fixture.billingReturnToThisDevice ?? true
      body = { status: action.action, url: action.action === 'checkout' ? 'https://checkout.stripe.com/c/pay/cs_test_fixture' : 'https://billing.stripe.com/p/session/test_fixture',
        requestId: sameDevice ? action.requestId : fixture.billingCanonicalRequests[action.requestId] ??= randomUUID(), continuationExpiresAt: new Date(now + 24 * 3600_000).toISOString(), returnToThisDevice: sameDevice }
    }
  } else if (process.env.GOALLOOM_HOSTED_FIXTURE === '1' && url.pathname === '/functions/v1/hosted-ai' && init.method === 'POST') {
    fixture.modelCalls = (fixture.modelCalls ?? 0) + 1
    const action = JSON.parse(init.body), request = action.request, requestOwner = fixture.activeUserId ?? userId
    if (action.version !== 2) throw Error('Expected hosted protocol v2')
    if (action.consentScopeVersion !== 3) throw Error('Expected current hosted consent scope')
    fixture.hostedActions ??= []
    fixture.hostedActions.push(action.actionId)
    if (fixture.hostedFailure) return new Response(JSON.stringify({ error: 'platform_budget' }), { status: 402, headers: { 'content-type': 'application/json' } })
    const selectedHorizon=fixture.preferredHorizon ?? 'day', matchProbability=fixture.matchProbability ?? 0
    if (fixture.holdHosted) await new Promise(resolve => { globalThis.releaseHosted = resolve; fixture.pendingHosted = true })
    const delivered = value => { fixture.hostedCompleted ??= []; fixture.hostedCompleted.push(action.actionId); if (fixture.dropHosted) throw Error('Synthetic completed response dropped'); return value }
    if (request.capability !== 'evaluate') {
      const value = request.capability === 'draft' ? JSON.stringify({ items: request.input.tasks.map(task => ({ id: task.id, title: 'Write a synthetic outline', why: 'First step' })) })
        : request.capability === 'review' ? JSON.stringify({ headline: `Synthetic review ${requestOwner}`,  advice: 'Take one step', flags: [] })
          : JSON.stringify({ kind: 'rewrite', description: '- [ ] Draft one synthetic paragraph' })
      return new Response(JSON.stringify(delivered({ status: 'ready', result: value })), { headers: { 'content-type': 'application/json' } })
    }
    const answers = Object.fromEntries(Object.entries(request.input.questions).map(([id, q]) => [id, q.type === 'boolean' ? { type: 'boolean', probability: matchProbability } : { type: 'choice', choice: Object.keys(q.criteria).includes(selectedHorizon) ? selectedHorizon : Object.keys(q.criteria)[0], probabilities: null }]))
    body = delivered({ status: 'ready', result: { answers, precision: { decimals: 2, source: 'adapter' }, meta: { requestedModel: 'typesafe/jev-1.14', routingCanonicalSlug: null, modelVersion: null, inputTokens: 100, requestId: action.actionId } } })
  } else if (url.pathname === '/functions/v1/hosted-ai' && url.searchParams.get('status') === '1') body = { eligible: true }
  else if (url.pathname === '/functions/v1/hosted-ai' && url.searchParams.has('actionId')) return Response.json({ status: 'ready', confirmed: true, error: 'result_not_delivered' }, { status: 409 })
  else if (url.pathname === '/auth/v1/token') {
    fixture.refreshed++
    const activeUser = fixture.activeUserId ?? userId
    body = { access_token: makeJwt(activeUser), refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600,
      user: { id: activeUser, email: 'credentials@example.invalid', aud: 'authenticated', role: 'authenticated' } }
  } else if (url.pathname === '/rest/v1/rpc/list_account') body = null
  else if (url.pathname === '/rest/v1/rpc/register_device') body = '22222222-2222-4222-8222-222222222222'
  else if (['/auth/v1/logout', '/rest/v1/rpc/rebind_device'].includes(url.pathname)) body = null
  else { fixture.unexpected.push(url.pathname); throw Error('Unexpected synthetic cloud request') }
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}

await import(pathToFileURL(resolve('out/main/index.js')).href)
if (process.env.GOALLOOM_CLOUD_FIXTURE) await import(pathToFileURL(resolve(process.env.GOALLOOM_CLOUD_FIXTURE)).href)
