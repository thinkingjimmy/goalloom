/**
 * [INPUT]: Built main entry, isolated profile and an optional synthetic cipher failure.
 * [OUTPUT]: Real Electron startup with counted cipher calls and synthetic cloud/browser transport.
 * [POS]: Credential timing instrumentation installed before the production composition root runs.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { app, safeStorage, shell } from 'electron'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const fixture = globalThis.credentialFixture = {
  mode: process.env.GOALLOOM_CREDENTIAL_MODE ?? 'available',
  available: 0, encrypt: 0, decrypt: 0, refreshed: 0, browser: 0, unexpected: [],
}
app.setAsDefaultProtocolClient = () => false
safeStorage.isEncryptionAvailable = () => { fixture.available++; return fixture.mode !== 'unavailable' }
safeStorage.encryptString = text => {
  fixture.encrypt++
  return Buffer.from(text).map(byte => byte ^ 0x5a)
}
safeStorage.decryptString = data => {
  fixture.decrypt++
  if (fixture.mode === 'denied') throw Error('Synthetic keychain denial')
  return Buffer.from(data).map(byte => byte ^ 0x5a).toString()
}
shell.openExternal = async () => { fixture.browser++ }

const userId = '11111111-1111-4111-8111-111111111111'
const jwt = [
  { alg: 'HS256', typ: 'JWT' },
  { sub: userId, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated' },
].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.synthetic'
globalThis.fetch = async input => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString())
  let body
  if (url.pathname === '/auth/v1/token') {
    fixture.refreshed++
    body = { access_token: jwt, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600,
      user: { id: userId, email: 'credentials@example.invalid', aud: 'authenticated', role: 'authenticated' } }
  } else if (url.pathname === '/rest/v1/rpc/list_account') body = null
  else if (url.pathname === '/rest/v1/rpc/register_device') body = '22222222-2222-4222-8222-222222222222'
  else if (['/auth/v1/logout', '/rest/v1/rpc/rebind_device'].includes(url.pathname)) body = null
  else { fixture.unexpected.push(url.pathname); throw Error('Unexpected synthetic cloud request') }
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } })
}

await import(pathToFileURL(resolve('out/main/index.js')).href)
