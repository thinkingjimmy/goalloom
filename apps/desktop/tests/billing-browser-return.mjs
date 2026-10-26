/**
 * [INPUT]: Built source desktop and the hash-verified D1 website static archive.
 * [OUTPUT]: Chromium HTTPS page click through the actual development loopback into native reconciliation.
 * [POS]: Controlled browser/native return acceptance; no live website deployment, provider payment or model claim.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir, cpus, release } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { _electron as electron, chromium } from 'playwright'

const evidence = resolve('../../output/tests/billing/desktop'), out = join(evidence, 'd1-client/browser-return')
const root = await mkdtemp(join(tmpdir(), 'goalloom-billing-browser-')), profile = join(root, 'profile')
await mkdir(out, { recursive: true }); await mkdir(profile); await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const manifest = JSON.parse(await readFile(join(evidence, 'd1-website/static-export-manifest.json'), 'utf8'))
const archive = resolve('../..', manifest.archive)
assert.equal(createHash('sha256').update(await readFile(archive)).digest('hex'), manifest.sha256)
execFileSync('tar', ['-xzf', archive, '-C', root])
const files = new Map(manifest.files.map(row => [row.path, row]))
const env = { ...process.env, GOALLOOM_SUPABASE_URL: 'https://credential-fixture.invalid', GOALLOOM_SUPABASE_ANON_KEY: 'synthetic-anon', GOALLOOM_BILLING_FIXTURE: '1', GOALLOOM_HOSTED_FIXTURE: '1' }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
let app, page, browser
const report = { ok: false, checks: [], websiteArchiveSha256: manifest.sha256, host: { os: release(), arch: process.arch, cpu: cpus()[0]?.model, physicalMachineOrVm: 'not independently established' },
  scope: 'Hash-verified website export locally served by interception at its canonical HTTPS origin; actual Chromium navigation to actual 127.0.0.1 native callback. Desktop Auth/billing/Stripe session facts are controlled. No website deployment, real provider payment, packaged/Windows or model acceptance.' }
const check = name => { report.checks.push(name); console.log(`PASS ${name}`) }
try {
  app = await electron.launch({ args: [resolve('tests/fixtures/credential-entry.mjs'), `--user-data-dir=${profile}`], env, timeout: 30000 })
  page = await app.firstWindow(); await page.locator('.start-cards').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const signing = page.evaluate(() => window.goalloom.sync({ type: 'sign-in', provider: 'apple', purpose: 'ai' }))
  await app.evaluate(async () => { const deadline = Date.now() + 5000; while (!globalThis.credentialFixture.browser) { if (Date.now() > deadline) throw Error('No OAuth browser'); await new Promise(resolve => setTimeout(resolve, 10)) } })
  assert.equal((await fetch('http://127.0.0.1:53682/callback?code=synthetic-browser-return', { headers: { Connection: 'close' } })).status, 200)
  await signing; await page.locator('.billing-card').waitFor()
  await page.evaluate(async () => window.goalloom.billing({ type: 'checkout', cycle: 'monthly', expectedAccountId: (await window.goalloom.sync({ type: 'status' })).status.accountId }))
  const continuation = await app.evaluate(() => globalThis.credentialFixture.billingContinuation)
  assert.equal(continuation.transport, 'loopback')
  browser = await chromium.launch({ headless: true }); report.chromium = browser.version()
  const context = await browser.newContext()
  await context.route('https://www.goalloom.com/**', async route => {
    const path = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\//, '')
    const file = files.get(path.endsWith('/') ? `${path}index.html` : path)
    if (!file) { await route.fulfill({ status: 404, body: '' }); return }
    const bytes = await readFile(join(root, 'out', file.path))
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256)
    const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
    await route.fulfill({ status: 200, contentType: types[extname(file.path)] ?? 'application/octet-stream', body: bytes, headers: { 'cache-control': 'no-store' } })
  })
  const web = await context.newPage(), query = new URLSearchParams({ v: '1', environment: 'development', continue: continuation.id, transport: 'loopback', port: String(continuation.port) })
  const returnPage = `https://www.goalloom.com/billing/return/?${query}`
  await web.goto(returnPage); await web.locator('[data-billing-return]').waitFor()
  assert.equal(await web.evaluate(() => window.isSecureContext), true)
  assert.equal(new URL(web.url()).search, '')
  const count = () => app.evaluate(() => globalThis.credentialFixture.billingActions.filter(value => value.action === 'reconcile').length)
  const before = await count()
  await web.screenshot({ path: join(out, 'canonical-website-before-click.png') })
  assert.equal(await count(), before)
  const navigated = web.waitForURL(url => url.protocol === 'http:' && url.hostname === '127.0.0.1' && url.pathname === '/billing-return')
  await web.locator('[data-billing-return]').click(); await navigated
  await web.getByRole('heading', { name: 'Return to Goalloom', exact: true }).waitFor()
  await app.evaluate(async before => { const deadline = Date.now() + 5000; while (globalThis.credentialFixture.billingActions.filter(value => value.action === 'reconcile').length <= before) { if (Date.now() > deadline) throw Error('Native reconcile not reached'); await new Promise(resolve => setTimeout(resolve, 10)) } }, before)
  assert.equal(await count(), before + 1)
  const state = await page.evaluate(() => window.goalloom.billing({ type: 'status' }))
  assert.equal(state.access.status, 'none'); assert.equal(state.pending.action, 'checkout')
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.setupConfirmedAt, null)
  await web.screenshot({ path: join(out, 'actual-loopback-after-click.png') })
  await page.screenshot({ path: join(out, 'native-after-browser-return.png') })
  check('An explicit click in real secure Chromium navigates from the canonical-origin local website export to the running native loopback listener')
  check('Native callback performs one authenticated reconciliation and does not infer payment, activate trial, configure sync or confirm the calendar')
  await web.goto(returnPage); await web.locator('[data-billing-return]').click()
  await web.waitForURL(url => url.hostname === '127.0.0.1')
  assert.equal(await count(), before + 1)
  assert.equal(await app.evaluate(() => globalThis.credentialFixture.modelCalls ?? 0), 0)
  check('A second real browser click cannot replay the consumed native callback or call a model')
  report.ok = true
} catch (error) { report.error = error.stack ?? String(error); await page?.screenshot({ path: join(out, 'failure.png') }).catch(() => undefined); throw error }
finally {
  await browser?.close(); await app?.close(); await rm(root, { recursive: true, force: true })
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
}
