/**
 * [INPUT]: Existing Stripe SDK and production CLI workflow, with synthetic loopback provider state.
 * [OUTPUT]: Repeatable child-process HTTP E2E report and retained per-case artifacts.
 * [POS]: Live tooling acceptance only; no real credentials, payments, customer records or desktop focus.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { TARGET, OWNER, API_VERSION } from '../policy.mjs'
const root = resolve('output/tests/billing/desktop/bill29-execution'), runId = `acceptance-${randomUUID()}`
await mkdir(`${root}/${runId}`, { recursive: true })
const report = { ok: false, scope: 'Child-process CLI + real Stripe SDK + controlled loopback HTTP; no actual provider configuration, charge or desktop acceptance',
  runtime: { node: process.version, os: process.platform, arch: process.arch, stripe: '22.6.0', electron: 'not used', sqlite: 'not used', physicalOrVm: 'not independently verified' }, cases: [] }
let state, requests, dropNext
const originalRc = () => ({ apps: [{ id: TARGET.app, type: 'stripe', name: 'Existing development app', project_id: TARGET.project, stripe: { stripe_account_id: TARGET.account } },
  { id: 'appApple', type: 'app_store', project_id: TARGET.project, name: 'Apple' }], products: [{ id: 'prodTest', app_id: TARGET.app, store_identifier: 'price_test', type: 'subscription', state: 'active' },
  { id: 'prodApple', app_id: 'appApple', store_identifier: 'apple_monthly', type: 'subscription', state: 'active' }],
  entitlements: [{ id: 'entlPlus', lookup_key: 'plus', state: 'active' }], offerings: [{ id: 'ofrngDefault', lookup_key: 'default', state: 'active', is_current: true }],
  entitlementProducts: { entlPlus: ['prodTest','prodApple'] }, packages: { ofrngDefault: [{ id: 'pkgDefault', lookup_key: '$rc_monthly', display_name: 'Monthly', position: 0 }] }, packageProducts: { pkgDefault: ['prodTest','prodApple'] }, webhooks: [] })
function reset() { state = { account: TARGET.account, products: [], prices: [], portals: [], hooks: [], rc: originalRc(), productionKey: true }; requests = []; dropNext = false }
reset()
function decode(text) {
  const out = {}
  for (const [key, raw] of new URLSearchParams(text)) {
    const parts = key.replaceAll(']', '').split('['); let target = out
    while (parts.length > 1) { const part = parts.shift(); target = target[part] ??= {} }
    target[parts[0]] = raw === 'true' ? true : raw === 'false' ? false : /^\d+$/.test(raw) ? Number(raw) : raw
  }
  const materialize = value => {
    if (!value || typeof value !== 'object') return value
    const entries = Object.entries(value)
    return entries.length && entries.every(([key]) => /^\d+$/.test(key))
      ? entries.sort(([a],[b]) => Number(a)-Number(b)).map(([,v]) => materialize(v))
      : Object.fromEntries(entries.map(([k,v]) => [k, materialize(v)]))
  }
  return materialize(out)
}
const rcProduct = id => state.rc.products.find(v => v.id === id)
let sequence = 0
const server = createServer(async (req, res) => {
  try {
    let text = ''; for await (const chunk of req) text += chunk
    const url = new URL(req.url, 'http://127.0.0.1'), path = url.pathname, body = text ? (path.startsWith('/v1/') ? decode(text) : JSON.parse(text)) : null
    requests.push({ method: req.method, path, body })
    let value
    if (path.startsWith('/v1/accounts/')) value = { id: state.account }
    else if (path.startsWith('/v1/')) {
      const collection = { '/v1/products': 'products', '/v1/prices': 'prices', '/v1/billing_portal/configurations': 'portals', '/v1/webhook_endpoints': 'hooks' }[path]
      assert(collection, `Unexpected Stripe API ${path}`)
      if (req.method === 'GET') value = { object: 'list', data: state[collection], has_more: !!state.paginated, url: path }
      else {
        assert.equal(req.method, 'POST'); const prefix = { products: 'prod_', prices: 'price_', portals: 'bpc_' }[collection]; assert(prefix)
        value = { id: `${prefix}${++sequence}`, object: collection, livemode: true, active: true, ...body }
        if (collection === 'prices') value.type = 'recurring'
        if (collection === 'portals') {
          assert(value.features.subscription_cancel.cancellation_reason.options.length >= 2)
          value.features.subscription_cancel.cancellation_reason.feedback_options = []
        }
        state[collection].push(value)
        if (dropNext) { dropNext = false; req.socket.destroy(); return }
      }
    } else {
      const tail = path.replace(`/v2/projects/${TARGET.project}/`, ''), rc = state.rc
      if (req.method === 'GET') {
        let items
        if (['apps','products','entitlements','offerings'].includes(tail)) items = rc[tail]
        else if (tail === `apps/${TARGET.app}/public_api_keys`) items = [{ environment: 'sandbox', key: 'synthetic_secret_must_never_appear' }, ...(state.productionKey ? [{ environment: 'production', key: 'synthetic_secret_must_never_appear' }] : [])]
        else if (/^entitlements\/[^/]+\/products$/.test(tail)) items = (rc.entitlementProducts[tail.split('/')[1]] ?? []).map(rcProduct)
        else if (/^offerings\/[^/]+\/packages$/.test(tail)) items = rc.packages[tail.split('/')[1]] ?? []
        else if (/^packages\/[^/]+\/products$/.test(tail)) items = (rc.packageProducts[tail.split('/')[1]] ?? []).map(id => ({ product: rcProduct(id), eligibility_criteria: 'all' }))
        else if (tail === 'integrations/webhooks') items = rc.webhooks
        else throw Error(`Unknown RC GET ${tail}`)
        value = { items, next_page: null }
      } else {
        assert.equal(req.method, 'POST')
        if (tail === 'products') { value = { ...body, id: `prodRc${++sequence}`, state: 'active' }; rc.products.push(value) }
        else if (tail === 'offerings') { value = { ...body, id: `ofrng${++sequence}`, state: 'active', is_current: false }; rc.offerings.push(value) }
        else if (/^entitlements\/[^/]+\/actions\/attach_products$/.test(tail)) { rc.entitlementProducts[tail.split('/')[1]].push(...body.product_ids); value = {} }
        else if (/^offerings\/[^/]+\/packages$/.test(tail)) { const id = tail.split('/')[1]; value = { ...body, id: `pkg${++sequence}`, position: (rc.packages[id] ?? []).length }; (rc.packages[id] ??= []).push(value) }
        else if (/^packages\/[^/]+\/actions\/attach_products$/.test(tail)) { rc.packageProducts[tail.split('/')[1]] = body.products.map(v => v.product_id); value = {} }
        else throw Error(`Unknown RC POST ${tail}`)
      }
    }
    res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value))
  } catch { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'synthetic_secret_must_never_appear' })) }
})
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
const endpoint = `http://127.0.0.1:${server.address().port}`
const safe = value => !JSON.stringify(value).includes('synthetic_secret_must_never_appear')
const dir = suffix => `${root}/${runId}-${suffix}`
async function cli(args, window = '') {
  const child = spawn(process.execPath, ['scripts/billing/live/tests/driver.mjs', ...args], { env: { PATH: process.env.PATH, HOME: process.env.HOME, BILL29_ACCEPTANCE_URL: endpoint, BILL29_LIVE_WRITE_WINDOW: window }, stdio: ['ignore','pipe','pipe'] })
  let stdout = '', stderr = ''; child.stdout.on('data', v => stdout += v); child.stderr.on('data', v => stderr += v)
  const exit = await new Promise(resolve => child.on('close', resolve)); assert(safe(stdout) && safe(stderr), 'Secret in CLI output')
  const result = JSON.parse(stdout.trim()); return { ...result, exit }
}
async function check(name, fn) { await fn(); report.cases.push({ name, ok: true }) }
async function observed(suffix) { const r = await cli(['inspect-rc','--out',dir(suffix)]); assert(r.ok); return r.path }
async function planned(suffix, snapshot, phase = 'catalog') { const r = await cli(['plan','--snapshot',snapshot,'--phase',phase,'--out',dir(suffix)]); assert(r.ok, JSON.stringify(r)); return r }
const apply = (p, window = 'catalog', hash = p.reviewedSet) => cli(['apply','--plan',p.path,'--reviewed-set',hash], window)
try {
  let snapshot, catalogPlan
  await check('Catalog-only inspection does not require RevenueCat', async () => { const r=await cli(['inspect','--out',dir('stripe-only')]);assert(r.ok);assert.equal(JSON.parse(await readFile(r.path)).snapshot.rc,null);assert(requests.every(v=>v.path.startsWith('/v1/'))) })
  await check('Inspect uses GET only and removes SDK key values', async () => { snapshot = await observed('inspect'); assert(requests.every(v => v.method === 'GET')); assert(safe(await readFile(snapshot,'utf8'))) })
  await check('Offline plan creates exact inclusive catalog and Portal requests', async () => {
    const before = requests.length; catalogPlan = await planned('catalog', snapshot); assert.equal(requests.length, before); assert.equal(catalogPlan.mutations, 4)
    const p = JSON.parse(await readFile(catalogPlan.path,'utf8')); const prices = p.desired.operations.filter(v => v.resource === 'prices')
    assert.deepEqual(prices.map(v => v.body.unit_amount), [899,7900]); assert(prices.every(v => v.body.tax_behavior === 'inclusive' && !v.body.recurring.trial_period_days))
    assert.equal(p.desired.operations.at(-1).body.features.subscription_update.enabled, false)
    assert.equal(p.desired.operations.at(-1).body.features.subscription_cancel.cancellation_reason.enabled, false)
    assert.equal(p.desired.operations.at(-1).body.features.subscription_cancel.cancellation_reason.options.length, 2)
  })
  await check('Wrong reviewed hash refuses before writes', async () => { assert.equal((await apply(catalogPlan,'catalog','0'.repeat(64))).code,'review_hash') })
  await check('Missing write window refuses before writes', async () => { assert.equal((await apply(catalogPlan,'')).code,'write_window') })
  await check('Tampered plan refuses before writes', async () => { const p=JSON.parse(await readFile(catalogPlan.path,'utf8')); p.desired.operations[1].body.tax_behavior='exclusive'; const d=dir('tamper'); await mkdir(d); await writeFile(d+'/plan.json',JSON.stringify(p)); assert.equal((await apply({...catalogPlan,path:d+'/plan.json'})).code,'review_hash') })
  await check('Stale provider baseline refuses before writes', async () => { state.products.push({id:'prod_unmanaged',name:'Other',active:true,livemode:true}); assert.equal((await apply(catalogPlan)).code,'baseline_drift'); state.products.pop() })
  await check('Apply creates 1 product 2 inclusive prices and 1 Portal with SDK HTTP', async () => { const r = await apply(catalogPlan); assert(r.ok,JSON.stringify(r)); assert.equal(r.writes,4); assert.equal(state.products.length,1); assert.equal(state.prices.length,2); assert.equal(state.portals.length,1); assert(requests.filter(v=>v.method==='POST').every(v=>v.path.startsWith('/v1/'))); assert.equal(r.launchReady,false) })
  await check('Consumed plan cannot be dispatched twice', async () => { const before=requests.filter(v=>v.method==='POST').length; assert.equal((await apply(catalogPlan)).ok,false); assert.equal(requests.filter(v=>v.method==='POST').length,before) })
  await check('Fresh catalog plan converges to a verified zero-write no-op', async () => { const p=await planned('noop',await observed('after-catalog')); assert.equal(p.mutations,0); assert((await apply(p)).ok) })
  for (const [name, mutate] of [
    ['Explicit exclusive tax price is refused',()=>state.prices[0].tax_behavior='exclusive'],
    ['Unspecified tax price is refused',()=>state.prices[0].tax_behavior='unspecified'],
    ['Wrong price amount is refused',()=>state.prices[0].unit_amount=999],
    ['Wrong recurring interval is refused',()=>state.prices[0].recurring.interval='week'],
    ['Provider trial price is refused',()=>state.prices[0].recurring.trial_period_days=8],
    ['Duplicate owned product is refused',()=>state.products.push({...state.products[0],id:'prod_duplicate'})],
    ['Portal plan switching is refused',()=>state.portals[0].features.subscription_update.enabled=true],
  ]) await check(name,async()=>{const saved=structuredClone(state); mutate(); const s=await observed(`bad-${report.cases.length}`); const r=await cli(['plan','--snapshot',s,'--phase','catalog','--out',dir(`refuse-${report.cases.length}`)]);assert.equal(r.ok,false);state=saved})
  await check('Wrong Stripe account is refused',async()=>{state.account='acct_foreign';const r=await cli(['inspect','--out',dir('foreign')]);assert.equal(r.code,'stripe_account');state.account=TARGET.account})
  await check('Test object in Live response is refused',async()=>{state.prices[0].livemode=false;const r=await cli(['inspect','--out',dir('test')]);assert.equal(r.code,'stripe_not_live');state.prices[0].livemode=true})
  await check('Incomplete provider pagination is refused',async()=>{state.paginated=true;const r=await cli(['inspect','--out',dir('pagination')]);assert.equal(r.code,'stripe_pagination');state.paginated=false})
  await check('RC production SDK key is required before mapping',async()=>{state.productionKey=false;const s=await observed('sandbox-only');const r=await cli(['plan','--snapshot',s,'--phase','rc-catalog','--out',dir('rc-refusal')]);assert.equal(r.code,'rc_production_key_missing');state.productionKey=true})
  await check('RC catalog adds Live mapping while preserving Test Apple and current offering',async()=>{const before=structuredClone(state.rc);const p=await planned('rc-catalog',await observed('before-rc'),'rc-catalog');assert.equal(p.mutations,9);const r=await apply(p,'rc-catalog');assert(r.ok,JSON.stringify(r));assert(before.products.every(v=>state.rc.products.some(p=>p.id===v.id)));assert.deepEqual(state.rc.packageProducts.pkgDefault,before.packageProducts.pkgDefault);assert(state.rc.offerings.find(v=>v.id==='ofrngDefault').is_current);assert(!state.rc.offerings.find(v=>v.lookup_key==='goalloom_desktop_live').is_current)})
  await check('RC mapping converges to zero mutations',async()=>{const p=await planned('rc-noop',await observed('after-rc'),'rc-catalog');assert.equal(p.mutations,0)})
  await check('Notifications remain local preparation with no provider request',async()=>{const n=requests.length;const r=await cli(['notifications','--out',dir('notifications')]);assert(r.ok&&r.preparedOnly);assert.equal(requests.length,n);const p=JSON.parse(await readFile(r.path));assert.equal(p.canDispatch,false);assert(p.definitions[2].hmacRequired)})
  await check('Unknown Stripe create outcome stops and journals without replay',async()=>{reset();const p=await planned('lost-plan',await observed('lost-before'));dropNext=true;assert.equal((await apply(p)).ok,false);const posts=requests.filter(v=>v.method==='POST').length;assert.equal(posts,1);assert.equal((await apply(p)).ok,false);assert.equal(requests.filter(v=>v.method==='POST').length,posts);const j=await readFile(resolve(p.path,'../dispatch.jsonl'),'utf8');assert(j.includes('dispatched')&&j.includes('unresolved'))})
  await check('Unknown options refuse without network or filesystem side effects',async()=>{const n=requests.length;const r=await cli(['inspect','--out',dir('unknown'),'--yes','true']);assert.equal(r.code,'usage');assert.equal(requests.length,n)})
  await check('No charge customer purchase key or webhook mutation endpoint used',async()=>{assert(requests.every(v=>!/(customers|subscriptions|payment_intents|charges|webhook_endpoints)$/.test(v.path)||v.method==='GET'))})
  report.ok = true
} catch (error) { report.failure = { name: error.name, message: safe(error.message) ? error.message.slice(0,400) : 'redacted' }; process.exitCode = 1 }
finally { await new Promise(resolve=>server.close(resolve)); report.requestCount=requests.length; await writeFile(`${root}/${runId}/report.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify({ok:report.ok,cases:report.cases.length,report:`${root}/${runId}/report.json`,failure:report.failure})) }
