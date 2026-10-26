/**
 * [INPUT]: Existing fixed SDK runtime, account-bound CLI Live credential and RC operator OAuth.
 * [OUTPUT]: Bounded Stripe SDK/RC CLI ports and allowlisted connection-error codes; raw errors and credentials never escape.
 * [POS]: Provider transport boundary. Importing this module performs no I/O.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createRequire } from 'node:module'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { API_VERSION, TARGET } from './policy.mjs'
const exec = promisify(execFile)
export class Refusal extends Error { constructor(code) { super(code); this.code = code } }
export function requireThat(value, code) { if (!value) throw new Refusal(code) }
const networkCodes = new Set(['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH',
  'EACCES', 'EPERM', 'EPIPE', 'ECONNABORTED', 'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID', 'ERR_SSL_WRONG_VERSION_NUMBER', 'ERR_SSL_TLSV1_ALERT_PROTOCOL_VERSION', 'UND_ERR_CONNECT_TIMEOUT'])
export function transportErrorCodes(error) {
  const found = new Set(), pending = [error]
  for (let i = 0; pending.length && i < 12; i++) {
    const value = pending.shift(); if (!value || typeof value !== 'object') continue
    for (const code of [value.code, ...(Array.isArray(value.transportCodes) ? value.transportCodes : [])]) if (networkCodes.has(code)) found.add(code)
    pending.push(value.cause, value.raw?.detail, ...(Array.isArray(value.errors) ? value.errors.slice(0, 4) : []))
  }
  return [...found]
}
export function oneShotHttpClient(Stripe) {
  const client = Stripe.createNodeHttpClient()
  return { getClientName: () => client.getClientName(), makeRequest: async (...args) => {
    try { return await client.makeRequest(...args) }
    catch (cause) { const error = new Error('provider_transport_unknown'); error.code = 'BILL29_UNCERTAIN'; error.transportCodes = transportErrorCodes(cause); throw error }
  } }
}
export function connectRc() {
  const env = { ...process.env }; delete env.RC_API_KEY; delete env.RC_PROJECT_ID
  return async (method, path, body) => {
    requireThat(['GET','POST'].includes(method) && path.startsWith(`/projects/${TARGET.project}/`), 'rc_target')
    const args = ['api', method, path, '--project-id', TARGET.project, '--json', '--no-input', '--profile', 'default']
    if (body) args.push('--body', JSON.stringify(body))
    try {
      const { stdout } = await exec('rc', args, { env, encoding: 'utf8', timeout: 25_000, maxBuffer: 2 * 1024 * 1024 })
      const value = JSON.parse(stdout); return value.data ?? value
    } catch { throw new Refusal('rc_request_failed') }
  }
}
export async function connect() {
  const require = createRequire('/private/tmp/goalloom-billing-runtime/package.json')
  const Stripe = require('stripe')
  const metadata = JSON.parse(await readFile(resolve(dirname(require.resolve('stripe')), '../package.json'), 'utf8'))
  requireThat(metadata.version === '22.6.0', 'stripe_runtime_version')
  let key = process.env.BILL29_STRIPE_OPERATOR_KEY
  if (!key) {
    const text = await readFile(`${homedir()}/.config/stripe/config.toml`, 'utf8')
    const section = text.match(/\[default\]\s*([\s\S]*?)(?=\n\[|$)/)?.[1] ?? ''
    requireThat(section.match(/^account_id\s*=\s*['"]([^'"]+)['"]/m)?.[1] === TARGET.account, 'stripe_cli_account')
    key = section.match(/^live_mode_api_key\s*=\s*['"]([^'"]+)['"]/m)?.[1]
    const expires = section.match(/^live_mode_key_expires_at\s*=\s*['"]([^'"]+)['"]/m)?.[1]
    requireThat(expires && Date.parse(expires) > Date.now(), 'stripe_cli_key_expired')
  }
  requireThat(/^[rs]k_live_[A-Za-z0-9_]+$/.test(key ?? ''), 'live_operator_key_required')
  // Stripe otherwise retries closed connections once even with maxNetworkRetries=0.
  const stripe = new Stripe(key, { apiVersion: API_VERSION, maxNetworkRetries: 0, timeout: 15_000, httpClient: oneShotHttpClient(Stripe) })
  return { stripe, rc: connectRc() }
}
