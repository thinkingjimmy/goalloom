/**
 * [INPUT]: Owner-only disposable development identity or original Backend session and an isolated profile.
 * [OUTPUT]: Production desktop with real Auth/billing HTTP and captured finite Stripe browser targets.
 * [POS]: D1 provider/D3 observer composition. Real Auth/billing are preserved; OS cipher remains test-controlled.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, safeStorage, shell } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { SyncService } from '../../src/main/sync/service'
import { installSessionKey } from '../fixtures/session-key'
import type { Session, SupabaseClient } from '@supabase/supabase-js'

const identityPath = process.env['GOALLOOM_BILLING_IDENTITY']!
if (!identityPath || ((await stat(identityPath)).mode & 0o077) !== 0) throw Error('Owner-only fixture identity required')
const observe = process.env['GOALLOOM_BILLING_OBSERVE'] === '1'
const identity = JSON.parse(await readFile(identityPath, 'utf8')) as {
  id: string; email: string; password: string; sessionId?: string; session?: { access_token: string; refresh_token: string }
}
if (!/^[0-9a-f-]{36}$/.test(identity.id) || (!observe && identity.email !== `billing-${identity.id}@goalloom.test`)
  || process.env['GOALLOOM_SUPABASE_URL'] !== 'https://asqyvcnxdltzzfutbbqy.supabase.co'
  || observe && (!identity.sessionId || !identity.session?.access_token || !identity.session.refresh_token)) throw Error('Exact development fixture required')

app.setAsDefaultProtocolClient = () => false
installSessionKey(new URL('keychain-policy.node', import.meta.url))
safeStorage.isEncryptionAvailable = () => true
safeStorage.encryptString = text => Buffer.from(Buffer.from(text).map(byte => byte ^ 0x5a))
safeStorage.decryptString = bytes => Buffer.from(bytes).map(byte => byte ^ 0x5a).toString()

let currentClient: SupabaseClient | null = null, started!: () => void
async function verifiedSession(client: SupabaseClient): Promise<Session | null> {
  const session = (await client.auth.getSession()).data.session
  if (!session) return null
  const claims = JSON.parse(Buffer.from(session.access_token.split('.')[1]!, 'base64url').toString())
  const user = await client.auth.getUser(session.access_token)
  if (user.error || user.data.user?.id !== identity.id || claims.sub !== identity.id || claims.session_id !== identity.sessionId) throw Error('Original Auth session verification failed')
  return session
}
const fixture = { browserUrls: [] as string[], requests: [] as { path: string; method: string; action: string | null }[], denied: [] as string[], modelCalls: 0,
  started: new Promise<void>(resolve => { started = resolve }),
  readSession: async () => {
    if (!currentClient) return null
    await currentClient.auth.stopAutoRefresh()
    return verifiedSession(currentClient)
  } }
;(globalThis as any).billingProviderFixture = fixture
shell.openExternal = async value => {
  const url = new URL(value)
  if (observe) { fixture.denied.push('browser'); throw Error('Observer cannot open a browser') }
  if (url.protocol !== 'https:' || !['checkout.stripe.com', 'billing.stripe.com'].includes(url.hostname)) throw Error('Unexpected browser destination')
  fixture.browserUrls.push(value)
}
const originalFetch = globalThis.fetch
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input : input.url)
  const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
  if (url.pathname === '/functions/v1/hosted-ai' && method === 'POST') {
    fixture.modelCalls++
    throw Error('Provider acceptance cannot call a model')
  }
  const body = typeof init?.body === 'string' ? JSON.parse(init.body) : null
  const action = typeof body?.action === 'string' ? body.action : null
  fixture.requests.push({ path: url.pathname, method, action })
  if (observe) {
    const auth = method === 'GET' && url.pathname === '/auth/v1/user'
      || method === 'POST' && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token'
    const billing = url.pathname === '/functions/v1/billing' && (method === 'GET'
      || method === 'POST' && action === 'reconcile' && process.env['GOALLOOM_BILLING_RECONCILE'] === '1')
    const metadata = method === 'GET' && url.pathname === '/functions/v1/hosted-ai'
    const discovery = method === 'POST' && url.pathname === '/functions/v1/lifecycle/status' && body?.version === 1 && body?.query?.kind === 'discover'
    if (url.origin !== process.env['GOALLOOM_SUPABASE_URL'] || !(auth || billing || metadata || discovery)) {
      fixture.denied.push(`${method} ${url.pathname}`)
      throw Error('Observer request is outside the assigned checkpoint')
    }
  }
  return originalFetch(input, init)
}
const start = SyncService.prototype.start
SyncService.prototype.start = async function () {
  const service = this as any
  service.deps.beginSignIn = async (client: SupabaseClient) => {
    currentClient = client
    if (observe) {
      const result = await client.auth.setSession(identity.session!)
      const session = result.error ? null : await verifiedSession(client)
      if (!session) throw Error('Original Auth session attachment failed')
      return session
    }
    const result = await client.auth.signInWithPassword({ email: identity.email, password: identity.password })
    if (result.error || result.data.user?.id !== identity.id || !result.data.session) throw Error('Fixture real Auth sign-in failed')
    return result.data.session
  }
  try { await start.call(this); currentClient = service.client }
  finally { started() }
}
await import('../../src/main/index')
