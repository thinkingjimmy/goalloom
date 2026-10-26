/**
 * [INPUT]: Complete observed Live catalog, exact phase and fixed commercial constants.
 * [OUTPUT]: Additive create/attach requests or a finite drift refusal; no provider calls.
 * [POS]: Idempotent desired-state planner. Existing Apple/Test/default mappings are never replaced.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { isDeepStrictEqual } from 'node:util'
import { TARGET, OWNER, PRODUCT, PORTAL, CYCLES, OFFERING } from './policy.mjs'
import { requireThat } from './adapters.mjs'
const owned = value => Object.entries(OWNER).every(([key, v]) => value.metadata?.[key] === v)
const one = values => { requireThat(values.length <= 1, 'duplicate_owned_identity'); return values[0] }
const ref = name => ({ $ref: name })
const includesFields = (actual, expected) => Object.entries(expected).every(([key, value]) =>
  value && typeof value === 'object' ? includesFields(actual?.[key], value) : actual?.[key] === value)
export function priceValid(value, cycle, product) {
  const expected = CYCLES[cycle]
  return value.livemode === true && value.active === true && value.product === product && value.currency === 'usd'
    && value.unit_amount === expected.amount && value.tax_behavior === 'inclusive' && value.billing_scheme === 'per_unit'
    && value.type === 'recurring' && value.recurring?.interval === expected.interval && value.recurring.interval_count === 1
    && value.recurring.usage_type === 'licensed' && !value.recurring.trial_period_days
}
export function portalValid(value) {
  return value.livemode === true && value.active === true && value.default_return_url === PORTAL.default_return_url
    && isDeepStrictEqual(value.business_profile, PORTAL.business_profile)
    && includesFields(value.features, PORTAL.features)
    && !value.features?.subscription_cancel?.retention
}
export function plan(snapshot, phase) {
  requireThat(isDeepStrictEqual(snapshot.target, TARGET), 'snapshot_target')
  requireThat(['catalog','rc-catalog'].includes(phase), 'unknown_phase')
  const operations = [], bindings = {}, stripe = snapshot.stripe, rc = snapshot.rc
  const add = (name, provider, resource, body) => { operations.push({ name, provider, resource, body }); return ref(name) }
  const product = one(stripe.products.filter(owned))
  if (product) {
    requireThat(product.active && product.livemode && product.name === PRODUCT.name, 'owned_product_drift')
    bindings.product = product.id
  } else if (phase === 'catalog') bindings.product = add('product', 'stripe', 'products', PRODUCT)
  else requireThat(false, 'catalog_required')
  for (const [cycle, value] of Object.entries(CYCLES)) {
    const key = `goalloom_plus_${cycle}_live_v1`
    const price = one(stripe.prices.filter(v => v.lookup_key === key || owned(v) && v.metadata.cycle === cycle))
    if (price) {
      requireThat(owned(price) && price.lookup_key === key && priceValid(price, cycle, bindings.product), 'owned_price_drift')
      bindings[cycle] = price.id
    } else if (phase === 'catalog') bindings[cycle] = add(cycle, 'stripe', 'prices', { product: bindings.product, currency: 'usd', unit_amount: value.amount,
      tax_behavior: 'inclusive', recurring: { interval: value.interval, interval_count: 1, usage_type: 'licensed' },
      billing_scheme: 'per_unit', lookup_key: key, metadata: { ...OWNER, cycle } })
    else requireThat(false, 'catalog_required')
  }
  const portal = one(stripe.portals.filter(owned))
  if (portal) { requireThat(portalValid(portal), 'owned_portal_drift'); bindings.portal = portal.id }
  else if (phase === 'catalog') bindings.portal = add('portal', 'stripe', 'portal', PORTAL)
  else requireThat(false, 'catalog_required')
  if (phase === 'catalog') return { operations, bindings }
  requireThat(rc && typeof rc === 'object', 'rc_snapshot_required')
  const app = one(rc.apps.filter(v => v.id === TARGET.app))
  requireThat(app?.type === 'stripe' && app.project_id === TARGET.project && app.stripe?.stripe_account_id === TARGET.account, 'rc_app_binding')
  requireThat(rc.publicKeyEnvironments.some(v => v.environment === 'production' && v.keyPresent), 'rc_production_key_missing')
  const entitlement = one(rc.entitlements.filter(v => v.lookup_key === 'plus'))
  requireThat(entitlement?.state === 'active', 'plus_entitlement_required')
  const prefix = `/projects/${TARGET.project}`
  for (const cycle of Object.keys(CYCLES)) {
    const existing = one(rc.products.filter(v => v.app_id === TARGET.app && v.store_identifier === bindings[cycle]))
    if (existing) requireThat(existing.type === 'subscription' && existing.state === 'active', 'rc_product_drift')
    const productId = existing?.id ?? add(`rc-${cycle}`, 'rc', `${prefix}/products`, {
      app_id: TARGET.app, store_identifier: bindings[cycle], type: 'subscription', display_name: `Goalloom Plus ${cycle === 'monthly' ? 'Monthly' : 'Annual'}` })
    bindings[`rc-${cycle}`] = productId
    if (!existing || !rc.entitlementProducts[entitlement.id]?.some(v => v.id === productId)) {
      add(`entitlement-${cycle}`, 'rc', `${prefix}/entitlements/${entitlement.id}/actions/attach_products`, { product_ids: [productId] })
    }
  }
  const offering = one(rc.offerings.filter(v => v.lookup_key === OFFERING))
  if (offering) requireThat(offering.state === 'active' && offering.is_current === false, 'live_offering_drift')
  const offeringId = offering?.id ?? add('offering', 'rc', `${prefix}/offerings`, { lookup_key: OFFERING, display_name: 'Goalloom Desktop Live' })
  bindings.offering = offeringId
  for (const [cycle, value] of Object.entries(CYCLES)) {
    const pkg = offering ? one((rc.packages[offering.id] ?? []).filter(v => v.lookup_key === value.package)) : null
    const packageId = pkg?.id ?? add(`package-${cycle}`, 'rc', { path: `${prefix}/offerings/`, ref: offeringId, suffix: '/packages' }, {
      lookup_key: value.package, display_name: cycle === 'monthly' ? 'Monthly' : 'Annual' })
    const attached = pkg ? rc.packageProducts[pkg.id] ?? [] : []
    requireThat(attached.every(v => v.id === bindings[`rc-${cycle}`] && v.app_id === TARGET.app), 'live_package_foreign_product')
    if (!attached.some(v => v.id === bindings[`rc-${cycle}`])) add(`attach-${cycle}`, 'rc', { path: `${prefix}/packages/`, ref: packageId, suffix: '/actions/attach_products' }, {
      products: [{ product_id: bindings[`rc-${cycle}`], eligibility_criteria: 'all' }] })
    bindings[`package-${cycle}`] = packageId
  }
  return { operations, bindings }
}
export function resolveReferences(value, results) {
  if (Array.isArray(value)) return value.map(v => resolveReferences(v, results))
  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && typeof value.$ref === 'string') {
      requireThat(typeof results[value.$ref] === 'string', 'unresolved_reference'); return results[value.$ref]
    }
    return Object.fromEntries(Object.entries(value).map(([k,v]) => [k, resolveReferences(v, results)]))
  }
  return value
}
