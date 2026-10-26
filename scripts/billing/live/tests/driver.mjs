/**
 * [INPUT]: Acceptance-owned loopback URL and CLI arguments from the local journey runner.
 * [OUTPUT]: Real workflow/Stripe SDK calls against controlled HTTP; no operator credential access.
 * [POS]: Child-process E2E adapter. Production cli.mjs never imports this file.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createRequire } from 'node:module'
import { main } from '../workflow.mjs'
import { API_VERSION } from '../policy.mjs'
import { oneShotHttpClient } from '../adapters.mjs'
const url = new URL(process.env.BILL29_ACCEPTANCE_URL)
if (url.hostname !== '127.0.0.1' || url.protocol !== 'http:' || !url.port) throw Error('loopback_required')
const require = createRequire('/private/tmp/goalloom-billing-runtime/package.json')
const Stripe = require('stripe')
const connect = async () => {
  const stripe = new Stripe('rk_live_synthetic_acceptance', { apiVersion: API_VERSION, host: '127.0.0.1', port: Number(url.port), protocol: 'http', maxNetworkRetries: 0, timeout: 2000, httpClient: oneShotHttpClient(Stripe) })
  const rc = async (method, path, body) => {
    const response = await fetch(new URL(`/v2${path}`, url), { method, headers: { 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(2000) })
    if (!response.ok) throw Error('synthetic_secret_must_never_appear')
    return response.json()
  }
  return { stripe, rc }
}
await main(process.argv.slice(2), { connect })
