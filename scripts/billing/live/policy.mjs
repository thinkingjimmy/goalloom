/**
 * [INPUT]: Fixed billing policy and the reviewed production configuration package.
 * [OUTPUT]: Exact provider identities, owned catalog requests and notification definitions.
 * [POS]: Live provider tooling policy; no runtime activation or legal/tax assertions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const TARGET = Object.freeze({ account: 'acct_1QvwdlITpGuR8ZMB', project: 'projd720c733', app: 'app31d218cbde',
  backend: 'https://keqprrgvcefqdwnxaafv.supabase.co/functions/v1/billing', environment: 'production' })
export const API_VERSION = '2026-08-26.dahlia'
export const OWNER = { application: 'goalloom', environment: 'production', configuration: 'desktop-live-v1' }
export const CYCLES = { monthly: { amount: 899, interval: 'month', package: '$rc_monthly' }, annual: { amount: 7900, interval: 'year', package: '$rc_annual' } }
export const OFFERING = 'goalloom_desktop_live'
export const PRODUCT = { name: 'Goalloom Plus', active: true, metadata: OWNER }
export const PORTAL = {
  business_profile: { privacy_policy_url: 'https://www.goalloom.com/privacy/', terms_of_service_url: 'https://www.goalloom.com/terms/' },
  default_return_url: 'https://www.goalloom.com/billing/continue/', metadata: OWNER,
  features: { payment_method_update: { enabled: true }, invoice_history: { enabled: true },
    subscription_cancel: { enabled: true, mode: 'at_period_end', proration_behavior: 'none', cancellation_reason: { enabled: false, options: ['too_expensive','other'] } },
    subscription_update: { enabled: false }, customer_update: { enabled: false } },
}
export const STRIPE_EVENTS = ['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired',
  'customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.paid','invoice.payment_failed',
  'invoice.payment_action_required','charge.refunded','refund.created','refund.updated','charge.dispute.created','charge.dispute.updated',
  'charge.dispute.closed','subscription_schedule.updated','subscription_schedule.released','subscription_schedule.canceled']
export const RC_EVENTS = ['customer.subscription.updated','customer.subscription.deleted','charge.refunded','invoice.updated','customer.subscription.created','checkout.session.completed']
export const NOTIFICATIONS = [
  { provider: 'stripe', name: 'Goalloom Live Stripe to RevenueCat', url: `https://api.revenuecat.com/v1/incoming-webhooks/stripe/${TARGET.app}`, events: RC_EVENTS,
    secretDestination: "RevenueCat Stripe app > Purchase tracking > Live webhook signing secret", backendSecret: null },
  { provider: 'stripe', name: 'Goalloom Live Stripe to backend', url: `${TARGET.backend}/stripe`, events: STRIPE_EVENTS,
    secretDestination: 'Supabase production BILLING_STRIPE_WEBHOOK_SECRET', backendSecret: 'BILLING_STRIPE_WEBHOOK_SECRET' },
  { provider: 'revenuecat', name: 'Goalloom Desktop Production', url: `${TARGET.backend}/revenuecat`, environment: 'production', app_id: TARGET.app,
    hmacRequired: true, secretDestination: 'Supabase production BILLING_RC_WEBHOOK_SECRET' },
]
