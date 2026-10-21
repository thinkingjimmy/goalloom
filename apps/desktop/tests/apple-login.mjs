/**
 * [INPUT]: Built Electron app, isolated profiles and synthetic Auth/cipher transport.
 * [OUTPUT]: Repeatable provider routing, cancellation, failure, retry and native UI evidence.
 * [POS]: Apple/Google login E2E through production renderer, preload, IPC and loopback exchange.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir, platform, arch, release } from 'node:os'
import { resolve, join } from 'node:path'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'
const out = resolve('output/tests/apple-login')
await mkdir(out, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'goalloom-apple-'))
const env = { ...process.env, GOALLOOM_APPLE_FIXTURE: '1', GOALLOOM_SUPABASE_URL: 'https://credential-fixture.invalid', GOALLOOM_SUPABASE_ANON_KEY: 'synthetic-anon' }
delete env.ELECTRON_RUN_AS_NODE
delete env.ELECTRON_RENDERER_URL
const report = { ok: false, checks: [], host: { platform: platform(), arch: arch(), release: release() }, scope: 'Native source Electron, production OAuth and synthetic provider/token/cipher. No live provider, signed package or Windows acceptance.' }
let app, page
async function waitPhase(phase) {
  await page.evaluate(phase => new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(Error(`Sync did not reach ${phase}`)) }, 10000)
    const accept = status => { if (status.phase === phase) { clearTimeout(timer); unsubscribe(); resolve() } }
    const unsubscribe = window.goalloom.onSync(accept)
    void window.goalloom.sync({ type: 'status' }).then(reply => accept(reply.status), reject)
  }), phase)
}
async function begin(provider, root = page) {
  const before = await app.evaluate(() => globalThis.credentialFixture.browser)
  await root.getByRole('button', { name: new RegExp(provider, 'i') }).click()
  await waitPhase('signing-in')
  await app.evaluate(async before => {
    const until = Date.now() + 5000
    while (globalThis.credentialFixture.browser === before) {
      if (Date.now() > until) throw Error('Browser was not opened')
      await new Promise(resolve => setTimeout(resolve, 10))
    }
  }, before)
  const url = new URL(await app.evaluate(() => globalThis.credentialFixture.browserUrls.at(-1)))
  assert.equal(url.searchParams.get('provider'), provider)
  assert.equal(url.searchParams.get('prompt'), provider === 'google' ? 'select_account' : null)
  assert(url.searchParams.get('code_challenge'))
  return before
}
const check = name => { report.checks.push(name); console.log(`✓ ${name}`) }
try {
  app = await electron.launch({ args: [resolve('tests/fixtures/credential-entry.mjs'), `--user-data-dir=${profile}`], env })
  page = await app.firstWindow()
  report.rendererErrors = []
  page.on('pageerror', error => report.rendererErrors.push(error.message))
  await page.locator('.start-cards').waitFor()
  report.runtime = await app.evaluate(() => process.versions)
  await begin('apple')
  assert.equal(await page.locator('.start-cards button:disabled').count(), 3)
  await page.screenshot({ path: join(out, 'onboarding-apple-wait.png') })
  await page.locator('[data-waiting] button:not(:disabled)').click()
  await waitPhase('signed-out')
  check('Apple onboarding routes PKCE without Google parameters and cancellation releases the shared lock')
  await begin('google')
  await page.locator('[data-waiting] button:not(:disabled)').click()
  await waitPhase('signed-out')
  check('Google retains account selection after Apple cancellation')
  await begin('apple')
  await fetch('http://127.0.0.1:53682/callback?error=access_denied', { headers: { Connection: 'close' } })
  await waitPhase('signed-out')
  await page.getByRole('alert').waitFor()
  check('Failed authorization stays visible and permits retry')
  await page.locator('.start-alert button').click()
  await begin('apple')
  await fetch('http://127.0.0.1:53682/callback?error=access_denied', { headers: { Connection: 'close' } })
  await waitPhase('signed-out')
  await page.getByRole('alert').waitFor()
  check('A new failure is visible after the previous error was dismissed')
  const invalid = await page.evaluate(async () => {
    try { await window.goalloom.sync({ type: 'sign-in', provider: 'unknown' }); return false } catch { return true }
  })
  assert.equal(invalid, true)
  check('Unknown providers are rejected at the IPC boundary')
  await finishSetup(page)
  await page.locator('.settings-toggle').click()
  const settings = page.locator('dialog.settings-modal')
  await settings.getByRole('button', { name: /^(同步|Sync)/ }).click()
  await begin('apple', settings)
  await fetch('http://127.0.0.1:53682/callback?error=access_denied', { headers: { Connection: 'close' } })
  await waitPhase('signed-out')
  await settings.getByRole('alert').waitFor()
  await settings.locator('.settings-alert button').click()
  await begin('google', settings)
  await fetch('http://127.0.0.1:53682/callback?error=access_denied', { headers: { Connection: 'close' } })
  await waitPhase('signed-out')
  await settings.getByRole('alert').waitFor()
  check('Settings retry also restores the dismissed error for a new failed authorization')
  await begin('apple', settings)
  await settings.locator('.sync-status').filter({ hasText: /Apple/ }).waitFor()
  const callback = await fetch('http://127.0.0.1:53682/callback?code=synthetic-code', { headers: { Connection: 'close' } })
  assert.equal(callback.status, 200)
  await waitPhase('setup')
  await settings.locator('.sync-password').first().waitFor()
  assert.equal(await settings.locator('.sync-password').count(), 2)
  await page.screenshot({ path: join(out, 'settings-apple-password.png') })
  check('Settings Apple exchange reaches the existing sync-password setup without requiring a name')
  report.ok = true
} catch (error) {
  report.error = error.stack
  if (app) report.metrics = await app.evaluate(() => ({ ...globalThis.credentialFixture })).catch(() => null)
  if (page) report.diagnostics = await page.evaluate(async () => ({ status: (await window.goalloom.sync({ type: 'status' })).status, text: document.body.innerText, focus: document.hasFocus(), visibility: document.visibilityState })).catch(() => null)
  if (page) await page.screenshot({ path: join(out, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await app?.close()
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
}
