/**
 * [INPUT]: Explicit development write window, test-only provider access and the reviewed static website archive.
 * [OUTPUT]: Real browser Checkout/Portal, real Auth/billing and native loopback evidence with exact fixture cleanup.
 * [POS]: D1 provider/D3 attach-only dispatch. Never runs by default; no live OAuth, model, production, packaged or Windows claim.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile, readdir, unlink } from 'node:fs/promises'
import { tmpdir, release, cpus } from 'node:os'
import { join, resolve, extname } from 'node:path'
import { build } from 'vite'
import { chromium, _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'

if (process.argv[2] === '--observe') {
  const { runObserverCli } = await import('./billing/observe.mjs')
  await runObserverCli(process.argv.slice(3))
} else {
const { client, developmentUrl } = await import('../../../scripts/hosted-ai/client.mjs')
const { testStripe } = await import('../../../scripts/billing/stripe-client.mjs')
const { cleanupD1ProviderFixture } = await import('../../../scripts/billing/d1-provider-cleanup.mjs')
assert.equal(process.argv[2], '--run', 'Explicit --run and coordinator development write window required')
const desktop = resolve('.'), repo = resolve('../..')
process.chdir(repo)
const account = randomUUID(), email = `billing-${account}@goalloom.test`, createdAt = new Date().toISOString()
const out = join(repo, 'output/tests/billing/desktop/d1-client/provider', account)
const root = await mkdtemp(join(tmpdir(), 'goalloom-d1-provider-')), profile = join(root, 'profile')
await mkdir(out, { recursive: true }); await mkdir(profile, { mode: 0o700 })
const manifestPath = join(out, 'manifest.json'), cleanupPath = join(out, 'cleanup-manifest.json')
const cleanupManifest = { version: 1, environment: 'development', project: 'asqyvcnxdltzzfutbbqy', account: 'acct_1QvwdlITpGuR8ZMB',
  user: account, email, createdAt, trialEndsAt: null, rcProject: 'projd720c733', rcApp: 'appc06dd78ed3', appUserId: account,
  customer: null, subscriptions: [], sessions: [], invoices: [], cleanup: {} }
const saveCleanup = value => writeFile(cleanupPath, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 })
await saveCleanup(cleanupManifest)
const report = { ok: false, account, email, createdAt, stage: 'prepared', checks: [], cleanup: { ok: false, errors: [] },
  host: { os: release(), arch: process.arch, cpu: cpus()[0]?.model, physicalMachineOrVm: 'not independently established' },
  scope: 'Real development password Auth/Edge/PostgreSQL, actual Stripe Test browser Checkout/Portal and source Electron. Reviewed website export intercepted only at canonical HTTPS origin; actual native loopback. OS cipher is controlled. No live Apple/Google OAuth, public website deployment, packaged client, Windows, production or model acceptance.' }
const save = () => writeFile(manifestPath, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
await save()
const mark = name => { report.checks.push(name); console.log(`PASS ${name}`) }
let app, page, browser, db, stripe, anon, serviceKey
const request = async (path, method = 'GET', body, key = serviceKey) => {
  const response = await fetch(developmentUrl + path, { method, headers: { apikey: anon ?? key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(45_000), redirect: 'error' })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) : null }
}
try {
  report.stage = 'identity'; await save()
  db = await client(); const keys = await db.request('/api-keys?reveal=true')
  serviceKey = keys.find(row => row.name === 'service_role')?.api_key; anon = keys.find(row => row.name === 'anon')?.api_key
  assert(serviceKey && anon); db.hide(serviceKey); db.hide(anon)
  ;({ stripe } = await testStripe())
  const password = `${randomUUID()}aA!`, identityPath = join(root, 'identity.json')
  await writeFile(identityPath, JSON.stringify({ id: account, email, password }), { mode: 0o600 })
  const created = await request('/auth/v1/admin/users', 'POST', { id: account, email, password, email_confirm: true })
  assert.equal(created.status, 200); assert.equal(created.body.id, account)
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
  const archiveManifest = JSON.parse(await readFile(join(repo, 'output/tests/billing/desktop/d1-website/static-export-manifest.json'), 'utf8'))
  const archive = resolve(repo, archiveManifest.archive)
  assert.equal(createHash('sha256').update(await readFile(archive)).digest('hex'), archiveManifest.sha256)
  execFileSync('tar', ['-xzf', archive, '-C', root]); report.websiteArchiveSha256 = archiveManifest.sha256
  const files = new Map(archiveManifest.files.map(row => [row.path, row]))
  await build({ configFile: false, ssr: { noExternal: true }, define: { __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: '""', __GOALLOOM_BAKED_SUPABASE_URL__: '""' }, build: {
    ssr: true, target: 'node24', minify: false, outDir: join(desktop, 'out/main'), emptyOutDir: false,
    lib: { entry: join(desktop, 'tests/billing/provider-entry.ts'), formats: ['es'], fileName: () => 'billing-provider-native.js' },
    rollupOptions: { external: [/^node:/, 'electron', 'electron-updater'], output: { entryFileNames: 'billing-provider-native.js', chunkFileNames: 'billing-provider-[name]-[hash].js' } },
  } })
  report.entrySha256 = createHash('sha256').update(await readFile(join(desktop, 'out/main/billing-provider-native.js'))).digest('hex')
  const env = { ...process.env, GOALLOOM_SUPABASE_URL: developmentUrl, GOALLOOM_SUPABASE_ANON_KEY: anon, GOALLOOM_BILLING_IDENTITY: identityPath }
  delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
  app = await electron.launch({ args: [join(desktop, 'out/main/billing-provider-native.js'), `--user-data-dir=${profile}`], env, timeout: 30_000 })
  page = await app.firstWindow(); await page.locator('.start-cards').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  await page.getByRole('button', { name: /Apple/ }).click()
  const plus = page.locator('.billing-card')
  await plus.getByRole('button', { name: 'Start 8-day free trial', exact: true }).waitFor()
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.setupConfirmedAt, null)
  const before = await app.evaluate(() => globalThis.billingProviderFixture.requests)
  assert(!before.some(row => row.action === 'claim_trial' || row.path.startsWith('/rest/')))
  mark('Actual password Auth reaches explicit Plus choice without trial, sync or calendar writes')
  await plus.getByRole('button', { name: 'Start 8-day free trial', exact: true }).click()
  await pollPage(page, async () => (await window.goalloom.billing({ type: 'status' })).access?.status === 'trialing')
  report.trialEndsAt = (await page.evaluate(() => window.goalloom.billing({ type: 'status' }))).access.effectiveEnd
  cleanupManifest.trialEndsAt = report.trialEndsAt; await saveCleanup(cleanupManifest)
  await plus.getByRole('radio', { name: /Monthly/ }).check()
  report.stage = 'checkout'; await save()
  await plus.getByRole('button', { name: /^Subscribe/ }).click()
  await pollPage(page, async () => (await window.goalloom.billing({ type: 'status' })).pending?.browserOpened === true)
  const checkoutUrl = await app.evaluate(() => globalThis.billingProviderFixture.browserUrls.at(-1))
  assert.equal(new URL(checkoutUrl).hostname, 'checkout.stripe.com')
  const rows = await db.query(`select customer_id from billing_customers where user_id='${account}' and environment='development'`)
  assert.equal(rows.length, 1); report.customer = rows[0].customer_id
  const sessions = await stripe.checkout.sessions.list({ customer: report.customer, limit: 100 })
  assert.equal(sessions.data.length, 1); const session = sessions.data[0]
  assert.equal(session.livemode, false); assert.equal(session.client_reference_id, account); report.checkout = session.id
  cleanupManifest.customer = report.customer; cleanupManifest.sessions = [report.checkout]; await saveCleanup(cleanupManifest)
  await save()
  browser = await chromium.launch({ headless: true }); report.chromium = browser.version()
  const context = await browser.newContext()
  await context.route('https://www.goalloom.com/**', async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '')
    const file = files.get(path.endsWith('/') ? `${path}index.html` : path)
    if (!file) { await route.fulfill({ status: 404, body: '' }); return }
    const bytes = await readFile(join(root, 'out', file.path))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256)
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' }
    await route.fulfill({ status: 200, contentType: types[extname(file.path)] ?? 'application/octet-stream', body: bytes })
  })
  const web = await context.newPage(); await web.goto(checkoutUrl)
  const fill = async (selector, value, required = true) => {
    for (const frame of web.frames()) { const input = frame.locator(selector).first(); if (await input.isVisible()) { await input.fill(value); return } }
    assert(!required, `Required test checkout field missing: ${selector}`)
  }
  await web.locator('#cardNumber,input[autocomplete="cc-number"]').first().waitFor()
  await fill('#email,input[type="email"]', email, false)
  await fill('#cardNumber,input[autocomplete="cc-number"]', '4242424242424242')
  await fill('#cardExpiry,input[autocomplete="cc-exp"]', '12/30')
  await fill('#cardCvc,input[autocomplete="cc-csc"]', '123')
  await fill('#billingName,input[autocomplete="cc-name"]', 'Goalloom Test Fixture')
  const country = web.locator('#billingCountry,select[autocomplete="billing country"]').first()
  if (await country.isVisible()) await country.selectOption('US')
  await fill('#billingAddressLine1,input[autocomplete="billing address-line1"]', '510 Townsend St', false)
  await fill('#billingLocality,input[autocomplete="billing address-level2"]', 'San Francisco', false)
  const state = web.locator('#billingAdministrativeArea').first()
  if (await state.isVisible()) { if (await state.evaluate(node => node.tagName) === 'SELECT') await state.selectOption('CA'); else await state.fill('CA') }
  await fill('#billingPostalCode,input[autocomplete="billing postal-code"]', '94103', false)
  await web.screenshot({ path: join(out, 'stripe-test-before-submit.png'), mask: [web.locator('input')] })
  await web.locator('button[type="submit"]').filter({ hasText: /Subscribe|Pay|Start/i }).last().click()
  await web.waitForURL(url => url.origin === 'https://www.goalloom.com' && url.pathname === '/billing/return/', { timeout: 60_000 })
  await web.locator('[data-billing-return]').waitFor(); await web.screenshot({ path: join(out, 'website-paid-return.png') })
  await web.locator('[data-billing-return]').click(); await web.waitForURL(url => url.hostname === '127.0.0.1' && url.pathname === '/billing-return')
  report.checkoutReturn = { websiteOrigin: 'https://www.goalloom.com', websitePath: '/billing/return/', nativeOrigin: new URL(web.url()).origin, nativePath: new URL(web.url()).pathname, nativeQueryKeys: [...new URL(web.url()).searchParams.keys()] }
  await pollPage(page, async () => { const state = await window.goalloom.billing({ type: 'status' }); return !state.busy && state.access?.status === 'active' && state.pending === null })
  const paid = await stripe.checkout.sessions.retrieve(report.checkout)
  assert.equal(paid.status, 'complete'); assert.equal(paid.payment_status, 'paid'); assert.equal(paid.livemode, false)
  report.subscription = typeof paid.subscription === 'string' ? paid.subscription : paid.subscription.id
  report.invoice = typeof paid.invoice === 'string' ? paid.invoice : paid.invoice.id
  cleanupManifest.subscriptions = [report.subscription]; cleanupManifest.invoices = [report.invoice]; await saveCleanup(cleanupManifest)
  const invoice = await stripe.invoices.retrieve(report.invoice)
  assert.equal(invoice.status, 'paid'); assert.equal(invoice.amount_paid, 899)
  const facts = await db.query(`select rc_verified,disposition,amount_cents from billing_transactions where user_id='${account}' and invoice_id='${report.invoice}'`)
  assert(facts.some(row => row.rc_verified && row.disposition === 'paid' && row.amount_cents === 899))
  report.paidEvidence = { sessionStatus: paid.status, paymentStatus: paid.payment_status, livemode: paid.livemode, invoiceStatus: invoice.status, amountPaid: invoice.amount_paid, currency: invoice.currency, backendFacts: facts, native: await page.evaluate(() => window.goalloom.billing({ type: 'status' })) }
  await page.screenshot({ path: join(out, 'native-paid.png') })
  mark('Actual Stripe Test browser payment returns through canonical local export and real loopback; exact receipt and RevenueCat-verified invoice resolve native paid status')
  report.stage = 'portal'; await save()
  await plus.getByRole('button', { name: 'Payment methods and invoices', exact: true }).click()
  await pollPage(page, async () => (await window.goalloom.billing({ type: 'status' })).pending?.action === 'portal' && (await window.goalloom.billing({ type: 'status' })).pending?.browserOpened === true)
  const portalUrl = await app.evaluate(() => globalThis.billingProviderFixture.browserUrls.at(-1))
  assert.equal(new URL(portalUrl).hostname, 'billing.stripe.com')
  report.portalUrlShape = { origin: new URL(portalUrl).origin, path: new URL(portalUrl).pathname.replace(/(\/session\/).+$/, '$1[redacted]'), queryKeys: [...new URL(portalUrl).searchParams.keys()] }; await save()
  await web.goto(portalUrl)
  await web.screenshot({ path: join(out, 'stripe-test-portal.png') })
  const portalReturn = web.locator('a[href^="https://www.goalloom.com/billing/return/"]')
  await portalReturn.first().click(); await web.locator('[data-billing-return]').waitFor()
  await web.locator('[data-billing-return]').click(); await web.waitForURL(url => url.hostname === '127.0.0.1')
  await pollPage(page, async () => { const state = await window.goalloom.billing({ type: 'status' }); return !state.busy && state.pending === null })
  report.portalReturn = { websiteOrigin: 'https://www.goalloom.com', websitePath: '/billing/return/', nativeOrigin: new URL(web.url()).origin, nativePath: new URL(web.url()).pathname, nativeQueryKeys: [...new URL(web.url()).searchParams.keys()] }
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.setupConfirmedAt, null)
  report.modelCalls = await app.evaluate(() => globalThis.billingProviderFixture.modelCalls); assert.equal(report.modelCalls, 0)
  const ai = await page.evaluate(async () => (await window.goalloom.smart({ type: 'status', generation: (await window.goalloom.getSnapshot()).workspace.generation })).status)
  assert.equal(ai.providers.hosted.consentedAt, null); assert.equal(ai.features.smart.enabled, false)
  mark('Actual Portal and native return preserve local setup and leave AI consent/features off with zero model calls')
  report.journeyOk = true; report.ok = true
} catch (error) {
  report.error = { name: error?.name ?? 'Error', stage: report.stage, message: 'Inspect app-local/browser evidence for the interrupted stage',
    location: error?.stack?.split('\n').find(line => line.includes('billing-provider.mjs'))?.trim() ?? null }
  report.billingState = await page?.evaluate(() => window.goalloom.billing({ type: 'status' })).catch(() => null)
  for (const [index, web] of (browser?.contexts().flatMap(context => context.pages()) ?? []).entries()) {
    report.browserFailure ??= []
    report.browserFailure.push(await web.evaluate(() => ({ origin: location.origin, path: location.pathname,
      inputs: [...document.querySelectorAll('input,select')].map(node => ({ tag: node.tagName, id: node.id, name: node.getAttribute('name'), type: node.getAttribute('type'), required: node.required, valid: node.validity?.valid })),
      buttons: [...document.querySelectorAll('button,a')].map(node => ({ tag: node.tagName, text: node.textContent?.slice(0,80), disabled: node.disabled ?? null })) })).catch(() => null))
    await web.screenshot({ path: join(out, `browser-failure-${index}.png`) }).catch(() => {})
  }
  await page?.screenshot({ path: join(out, 'native-failure.png') }).catch(() => {})
  process.exitCode = 1
} finally {
  report.modelCalls = await app?.evaluate(() => globalThis.billingProviderFixture.modelCalls).catch(() => null) ?? null
  await browser?.close().catch(() => {}); await app?.close().catch(() => {})
  report.stage = 'cleanup'; await save()
  if (db) try {
    const rows = await db.query(`select customer_id from billing_customers where user_id='${account}' and environment='development'`)
    assert(rows.length <= 1)
    if (rows.length) { assert(!report.customer || report.customer === rows[0].customer_id); report.customer = rows[0].customer_id; await save() }
  } catch { report.cleanup.errors.push('fixture_customer_discovery') }
  if (db && stripe) try {
    if (report.customer) {
      const customer = await stripe.customers.retrieve(report.customer)
      assert(!customer.deleted && !customer.livemode && customer.metadata.app_user_id === account && customer.metadata.environment === 'development')
      cleanupManifest.customer = report.customer
      const subs = await stripe.subscriptions.list({ customer: report.customer, status: 'all', limit: 100 })
      const sessions = await stripe.checkout.sessions.list({ customer: report.customer, limit: 100 })
      const invoices = await stripe.invoices.list({ customer: report.customer, limit: 100 })
      assert(!subs.has_more && !sessions.has_more && !invoices.has_more)
      assert(subs.data.every(row => !row.livemode && row.metadata.app_user_id === account && row.metadata.environment === 'development'))
      assert(sessions.data.every(row => !row.livemode && row.metadata.app_user_id === account && row.metadata.environment === 'development'))
      assert(invoices.data.every(row => !row.livemode && row.customer === report.customer))
      cleanupManifest.subscriptions = subs.data.map(row => row.id); cleanupManifest.sessions = sessions.data.map(row => row.id); cleanupManifest.invoices = invoices.data.map(row => row.id)
    }
    await saveCleanup(cleanupManifest)
    const result = await cleanupD1ProviderFixture({ db, stripe, manifest: cleanupManifest, persist: saveCleanup })
    report.cleanup = { ...result, manifest: cleanupPath }
  } catch { report.cleanup.errors.push('exact_provider_cleanup') }
  report.cleanup.ok = report.cleanup.ok === true && report.cleanup.errors.length === 0
  report.ok &&= report.cleanup.ok
  if (!report.ok) process.exitCode = 1
  await save()
  for (const file of await readdir(join(desktop, 'out/main'))) if (file.startsWith('billing-provider-')) await unlink(join(desktop, 'out/main', file))
  await rm(root, { recursive: true, force: true })
  console.log(JSON.stringify({ ok: report.ok, manifest: manifestPath, stage: report.stage, cleanup: report.cleanup }))
}

}
