/**
 * [INPUT]: Exact Live Stripe and project-scoped RevenueCat read ports.
 * [OUTPUT]: Secret-free complete catalog and mapping snapshot, with validated account identity.
 * [POS]: Read-only observation shared by inspection, planning and execution preflight/readback.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { TARGET } from './policy.mjs'
import { requireThat } from './adapters.mjs'
export const pick = (value, names) => Object.fromEntries(names.filter(key => value[key] !== undefined).map(key => [key, value[key]]))
const sorted = values => values.sort((a, b) => a.id.localeCompare(b.id))
const metadata = value => pick(value ?? {}, ['application','environment','configuration','cycle'])
const product = v => ({ ...pick(v, ['id','name','active','livemode']), metadata: metadata(v.metadata) })
const price = v => ({ ...pick(v, ['id','active','livemode','currency','unit_amount','tax_behavior','billing_scheme','lookup_key','type']), metadata: metadata(v.metadata),
  product: typeof v.product === 'string' ? v.product : v.product?.id, recurring: v.recurring ? pick(v.recurring, ['interval','interval_count','usage_type','trial_period_days']) : null })
const rcProduct = v => pick(v, ['id','app_id','store_identifier','type','state'])
export async function inspect({ stripe, rc }, includeRc = true) {
  const account = await stripe.accounts.retrieve(TARGET.account)
  requireThat(account.id === TARGET.account, 'stripe_account')
  const list = async promise => { const r = await promise; requireThat(r.has_more === false && Array.isArray(r.data), 'stripe_pagination'); return r.data }
  const stripeProducts = await list(stripe.products.list({ limit: 100 }))
  const stripePrices = await list(stripe.prices.list({ limit: 100 }))
  const portals = await list(stripe.billingPortal.configurations.list({ limit: 100 }))
  const hooks = await list(stripe.webhookEndpoints.list({ limit: 100 }))
  requireThat([...stripeProducts,...stripePrices,...portals,...hooks].every(v => v.livemode === true), 'stripe_not_live')
  const observedStripe = { account: account.id, products: sorted(stripeProducts.map(product)), prices: sorted(stripePrices.map(price)),
    portals: sorted(portals.map(v => ({ ...pick(v, ['id','active','livemode','default_return_url']), metadata: metadata(v.metadata),
      business_profile: pick(v.business_profile ?? {}, ['privacy_policy_url','terms_of_service_url']), features: v.features }))),
    hooks: sorted(hooks.map(v => pick(v, ['id','livemode','status','url','enabled_events','api_version','description']))) }
  if (!includeRc) return { target: TARGET, stripe: observedStripe, rc: null }
  const prefix = `/projects/${TARGET.project}`
  const rcList = async path => { const r = await rc('GET', `${prefix}/${path}${path.includes('?') ? '&' : '?'}limit=100`);
    requireThat(!r.next_page && Array.isArray(r.items), 'rc_pagination'); return r.items }
  const apps = await rcList('apps')
  const app = apps.find(v => v.id === TARGET.app)
  requireThat(app?.type === 'stripe' && app.project_id === TARGET.project && app.stripe?.stripe_account_id === TARGET.account, 'rc_app_binding')
  const keys = await rc('GET', `${prefix}/apps/${TARGET.app}/public_api_keys`)
  requireThat(!keys.next_page && Array.isArray(keys.items), 'rc_key_pagination')
  const products = await rcList('products'), entitlements = await rcList('entitlements'), offerings = await rcList('offerings')
  const entitlementProducts = {}, packages = {}, packageProducts = {}
  for (const item of entitlements) entitlementProducts[item.id] = sorted((await rcList(`entitlements/${item.id}/products`)).map(rcProduct))
  for (const item of offerings) {
    packages[item.id] = sorted((await rcList(`offerings/${item.id}/packages`)).map(v => pick(v, ['id','lookup_key','display_name','position'])))
    for (const pkg of packages[item.id]) packageProducts[pkg.id] = sorted((await rcList(`packages/${pkg.id}/products`)).map(v => {
      const p = v.product ?? v; return { ...rcProduct(p), eligibility_criteria: v.eligibility_criteria ?? 'all' }
    }))
  }
  const integrations = await rcList('integrations/webhooks')
  return { target: TARGET, stripe: observedStripe,
    rc: { apps: sorted(apps.map(v => ({ ...pick(v, ['id','type','project_id','name']), ...(v.stripe ? { stripe: { stripe_account_id: v.stripe.stripe_account_id } } : {}) }))),
      publicKeyEnvironments: keys.items.map(v => ({ environment: v.environment, keyPresent: typeof v.key === 'string' && v.key.length > 0 })).sort((a,b) => a.environment.localeCompare(b.environment)),
      products: sorted(products.map(rcProduct)), entitlements: sorted(entitlements.map(v => pick(v, ['id','lookup_key','state']))),
      entitlementProducts, offerings: sorted(offerings.map(v => pick(v, ['id','lookup_key','is_current','state']))), packages, packageProducts,
      webhooks: sorted(integrations.map(v => pick(v, ['id','name','url','environment','app_id']))) } }
}
