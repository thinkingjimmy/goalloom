/**
 * [INPUT]: Billing Edge entry and pinned Stripe SDK installed in an explicit runtime directory.
 * [OUTPUT]: Bundled runtime for controlled HTTP acceptance or explicit development deployment.
 * [POS]: D0 build helper; no provider requests or credential loading.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { resolve, dirname } from 'node:path'
const runtime = process.env.BILLING_RUNTIME ?? '/private/tmp/goalloom-billing-runtime'
const require = createRequire(resolve(runtime, 'package.json'))
export const stripePath = require.resolve('stripe')
export async function bundle(entry = 'supabase/functions/billing/handler.ts') {
  return (await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
    alias: { stripe: resolve(dirname(stripePath), '../esm/stripe.esm.worker.js') }, external: ['node:*'], logLevel: 'silent' })).outputFiles[0].text
}
