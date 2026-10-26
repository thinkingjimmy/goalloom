// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Server-only JSON configuration and environment-specific secrets.
 * [OUTPUT]: Validated single-source configuration or a closed configuration error.
 * [POS]: Billing composition contract. Client parameters cannot change account, price or redirects.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export type Cycle = 'monthly' | 'annual'
export const priceCatalog = {
  monthly: { amount: 899, currency: 'USD', taxBehavior: 'inclusive' },
  annual: { amount: 7900, currency: 'USD', taxBehavior: 'inclusive' },
} as const
export type BillingConfig = {
  environment: 'development' | 'production'; url: string; serviceKey: string;
  account: string; rcProject: 'projd720c733'; rcApp: string;
  prices: Record<Cycle, string>; portalConfiguration: string;
  returnUrl: string; cancelUrl: string; webOrigin: string;
  stripeKey: string; stripeWebhookSecret: string; rcPublicKey: string; rcSecretKey: string;
  rcWebhookSecret: string; workerSecret: string; automaticTax: boolean; taxRegistrationVerified: boolean;
}
export function runtimeConfig(get: (name: string) => string | undefined): BillingConfig {
  let source: Partial<BillingConfig> = {}
  try { source = JSON.parse(get('BILLING_CONFIG') ?? '{}') } catch { /* Configuration validation fails closed. */ }
  return { ...source, url: get('SUPABASE_URL') ?? '', serviceKey: get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    stripeKey: get('BILLING_STRIPE_KEY') ?? '', stripeWebhookSecret: get('BILLING_STRIPE_WEBHOOK_SECRET') ?? '',
    rcPublicKey: get('BILLING_RC_PUBLIC_KEY') ?? '', rcSecretKey: get('BILLING_RC_SECRET_KEY') ?? '',
    rcWebhookSecret: get('BILLING_RC_WEBHOOK_SECRET') ?? '', workerSecret: get('BILLING_WORKER_SECRET') ?? '',
  } as BillingConfig
}
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
export function validateConfig(config: BillingConfig): void {
  const refs = { development: 'asqyvcnxdltzzfutbbqy', production: 'keqprrgvcefqdwnxaafv' }
  if (!config || !['development','production'].includes(config.environment) || config.url !== `https://${refs[config.environment]}.supabase.co`
    || config.account !== 'acct_1QvwdlITpGuR8ZMB' || config.rcProject !== 'projd720c733'
    || !/^app[a-z0-9]+$/.test(config.rcApp) || ['app9e61967dec','app3b6d4a4bcf'].includes(config.rcApp)
    || !/^price_[A-Za-z0-9]+$/.test(config.prices?.monthly) || !/^price_[A-Za-z0-9]+$/.test(config.prices?.annual)
    || config.prices.monthly === config.prices.annual || !/^bpc_[A-Za-z0-9]+$/.test(config.portalConfiguration)
    || !config.serviceKey || !config.rcPublicKey || !config.rcSecretKey || !config.stripeWebhookSecret
    || config.rcWebhookSecret.length < 32 || config.workerSecret.length < 32
    || !new RegExp(`^[rs]k_${config.environment === 'development' ? 'test' : 'live'}_`).test(config.stripeKey)
    || config.automaticTax && !config.taxRegistrationVerified) throw Error('billing_configuration')
  for (const value of [config.returnUrl, config.cancelUrl]) {
    const url = new URL(value)
    if (url.origin !== 'https://www.goalloom.com' || url.search || url.hash || url.username || url.password
      || !/^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?billing\/(?:return|continue)\/$/.test(url.pathname)) throw Error('billing_configuration')
  }
  if (config.webOrigin !== 'https://www.goalloom.com') throw Error('billing_configuration')
}
