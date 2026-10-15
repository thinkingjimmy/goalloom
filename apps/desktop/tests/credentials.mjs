/**
 * [INPUT]: Built production app, isolated synthetic profiles and a counted OS cipher fixture.
 * [OUTPUT]: Repeatable credential startup/sign-in/sign-out/restart reports and native window screenshots.
 * [POS]: Real Electron/preload/storage acceptance of lazy sync access and independent AI restoration.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'

const out = resolve('output/tests/credentials')
const temporary = await mkdtemp(join(tmpdir(), 'goalloom-credentials-'))
await mkdir(out, { recursive: true })
const environment = { ...process.env, GOALLOOM_SUPABASE_URL: 'https://credential-fixture.invalid', GOALLOOM_SUPABASE_ANON_KEY: 'synthetic-anon' }
delete environment.ELECTRON_RUN_AS_NODE
delete environment.ELECTRON_RENDERER_URL
let hypervisor = 'unknown'
try { hypervisor = execFileSync('sysctl', ['-n', 'kern.hv_vmm_present'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch {}
const report = { ok: false, checks: [], scenarios: [], runtime: null,
  host: { os: `${platform()} ${release()}`, arch: arch(), cpu: cpus()[0]?.model,
    machine: hypervisor === '0' ? 'Physical host (no hypervisor reported)' : hypervisor === '1' ? 'VM' : 'Physical/VM status not detected' },
  scope: 'Source Electron with real renderer, preload, IPC and SQLite; synthetic OS cipher and cloud responses. No native keychain dialog, packaged upgrade, live provider or Windows acceptance.',
}
let application, page
const metrics = () => application.evaluate(() => ({ ...globalThis.credentialFixture }))
const status = () => page.evaluate(async () => (await window.goalloom.sync({ type: 'status' })).status)
const check = label => { report.checks.push(label); console.log(`✓ ${label}`) }
const noCipher = async () => {
  const { available, encrypt, decrypt } = await metrics()
  assert.deepEqual({ available, encrypt, decrypt }, { available: 0, encrypt: 0, decrypt: 0 })
}
const waitForBrowser = () => application.evaluate(async () => {
  const deadline = Date.now() + 5000
  while (!globalThis.credentialFixture.browser) {
    if (Date.now() > deadline) throw Error('OAuth did not open after explicit sign-in')
    await new Promise(resolve => setTimeout(resolve, 20))
  }
})
async function close() { await application?.close(); application = null; page = null }
async function launch(profile, mode = 'available') {
  application = await electron.launch({ args: [resolve('tests/fixtures/credential-entry.mjs'), `--user-data-dir=${profile}`], env: { ...environment, GOALLOOM_CREDENTIAL_MODE: mode }, timeout: 30_000 })
  page = await application.firstWindow()
  page.on('pageerror', error => { report.rendererErrors ??= []; report.rendererErrors.push(error.message) })
  await page.locator('.start-cards, .board').first().waitFor()
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase !== 'unconfigured')
}
async function record(name) {
  const row = { name, metrics: await metrics(), status: await status() }
  assert.deepEqual(row.metrics.unexpected, [])
  report.scenarios.push(row)
  await page.screenshot({ path: join(out, `${name}.png`) })
}
async function clone(name, template) {
  const profile = join(temporary, name)
  await cp(template, profile, { recursive: true })
  return profile
}
const seal = text => Buffer.from(text).map(byte => byte ^ 0x5a)
async function legacyVault(profile, refreshToken = 'synthetic-refresh') {
  const body = { v: 1, deviceId: null, signSk: '11'.repeat(32), boxSk: '22'.repeat(32), workspaceKey: null,
    workspaceId: null, generation: null, epoch: null, roster: null, recoveryBoxSk: null, recoverySignSk: null,
    refreshToken, userId: '11111111-1111-4111-8111-111111111111', accounts: {} }
  await writeFile(join(profile, 'sync-vault.bin'), seal(JSON.stringify(body)))
}
async function googleFromSettings() {
  await page.locator('.settings-toggle').click()
  const settings = page.locator('dialog.settings-modal')
  await settings.getByRole('button', { name: /^同步/, exact: false }).click()
  return settings
}

try {
  const local = join(temporary, 'local')
  await mkdir(local)
  await writeFile(join(local, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  await launch(local)
  assert.equal((await metrics()).available, 0, 'Unused sync must not check the keychain at startup')
  await finishSetup(page)
  await page.locator('.board').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const generation = (await page.evaluate(() => window.goalloom.getSnapshot())).workspace.generation
  let settings = await googleFromSettings()
  await noCipher()
  await record('unused-settings')
  check('unused sync, local setup and viewing Settings do not access the cipher')
  await settings.getByRole('button', { name: /Google/ }).click()
  await waitForBrowser()
  assert((await metrics()).available > 0)
  await page.evaluate(() => window.goalloom.sync({ type: 'cancel' }))
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'signed-out')
  assert.equal((await status()).error, null)
  await record('explicit-sign-in')
  check('explicit Google sign-in requests cipher access and remains cancellable')
  await close()
  const template = await clone('template', local)

  const active = await clone('active', template)
  await legacyVault(active)
  await launch(active)
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'setup')
  assert((await metrics()).decrypt > 0)
  assert.equal((await metrics()).refreshed, 1)
  assert.equal((await status()).email, 'credentials@example.invalid')
  await record('legacy-session-restored')
  check('a legacy signed-in vault still decrypts and refreshes the saved session')
  await close()
  await launch(active)
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'setup')
  assert.equal((await metrics()).refreshed, 1)
  await record('current-session-restored')
  check('the current vault format restores a saved session after restart')
  await page.evaluate(() => window.goalloom.sync({ type: 'sign-out' }))
  const signedOutVault = await readFile(join(active, 'sync-vault.bin'))
  await close()
  await launch(active)
  assert.equal((await status()).phase, 'signed-out')
  assert.equal((await metrics()).available, 0)
  assert.equal((await metrics()).decrypt, 0)
  await record('signed-out-restart')
  check('sign-out preserves encrypted keys and skips cipher access on restart')
  settings = await googleFromSettings()
  await settings.getByRole('button', { name: /Google/ }).click()
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'signing-in')
  await waitForBrowser()
  assert((await metrics()).decrypt > 0)
  await page.evaluate(() => window.goalloom.sync({ type: 'cancel' }))
  assert.deepEqual(await readFile(join(active, 'sync-vault.bin')), signedOutVault)
  await record('signed-out-reconnect')
  check('reconnecting opens the preserved vault without replacing its keys')
  await close()

  const unavailableFirstUse = await clone('unavailable-first-use', template)
  await launch(unavailableFirstUse, 'unavailable')
  await noCipher()
  settings = await googleFromSettings()
  await settings.getByRole('button', { name: /Google/ }).click()
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'locked')
  assert.equal((await metrics()).browser, 0)
  assert.equal((await metrics()).encrypt, 0)
  await record('unavailable-first-use')
  check('a missing keychain is checked only after the first explicit sign-in')
  await close()

  for (const mode of ['unavailable', 'denied']) {
    const blocked = await clone(mode, template)
    await legacyVault(blocked)
    const original = await readFile(join(blocked, 'sync-vault.bin'))
    await launch(blocked, mode)
    assert.equal((await status()).phase, 'locked')
    assert.equal((await metrics()).browser, 0)
    assert.equal((await metrics()).encrypt, 0)
    assert.deepEqual(await readFile(join(blocked, 'sync-vault.bin')), original)
    await record(mode)
    check(`${mode} keychain access keeps the encrypted vault and local board intact`)
    await close()
  }

  const corrupt = await clone('corrupt', template)
  const corruptBytes = seal('Synthetic damaged vault')
  await writeFile(join(corrupt, 'sync-vault.bin'), corruptBytes)
  await launch(corrupt)
  assert.equal((await status()).phase, 'locked')
  assert.equal((await status()).error, 'storage')
  assert.equal((await metrics()).encrypt, 0)
  assert.deepEqual(await readFile(join(corrupt, 'sync-vault.bin')), corruptBytes)
  await record('corrupt-vault')
  check('a damaged vault stays recoverable and is never replaced with fresh keys')
  await close()

  const ai = await clone('ai', template)
  const aiDirectory = join(ai, 'smart-input')
  await mkdir(aiDirectory, { recursive: true })
  const provider = { consentedAt: '2026-10-15T00:00:00.000Z', verifiedAt: '2026-10-15T00:00:00.000Z', keyHint: '••••only', capabilities: { jev: '2026-10-15T00:00:00.000Z', chat: null }, lastFailure: null, assistanceConsent: null }
  const blankProvider = { consentedAt: null, verifiedAt: null, keyHint: null, capabilities: { jev: null, chat: null }, lastFailure: null, assistanceConsent: null }
  await writeFile(join(aiDirectory, 'config.json'), JSON.stringify({ version: 3, providers: { openrouter: provider, 'vercel-gateway': blankProvider },
    features: { smart: { provider: 'openrouter', revision: 1, enabledForGeneration: generation }, insight: { provider: null, revision: 0, enabledForGeneration: null } }, dismissed: [] }))
  await writeFile(join(aiDirectory, 'openrouter.key'), seal('synthetic-key-only'))
  await launch(ai)
  const aiStatus = await page.evaluate(async () => window.goalloom.smart({ type: 'status', generation: (await window.goalloom.getSnapshot()).workspace.generation }))
  assert.equal(aiStatus.type, 'status')
  assert.equal(aiStatus.status.providers.openrouter.credential, 'saved')
  assert.equal(aiStatus.status.features.smart.enabled, true)
  assert((await metrics()).decrypt > 0)
  assert.equal((await metrics()).refreshed, 0)
  await record('ai-restored-without-sync')
  check('saved AI credentials remain readable while sync stays signed out')
  assert.deepEqual(report.rendererErrors ?? [], [])
  report.ok = true
} catch (error) {
  report.error = error.stack ?? String(error)
  if (page && !page.isClosed()) {
    report.nativeWindow = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible() }))).catch(() => null)
    report.document = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML })).catch(() => null)
    await page.screenshot({ path: join(out, 'failure.png') }).catch(() => undefined)
  }
  throw error
} finally {
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
  await close()
  await rm(temporary, { recursive: true, force: true })
}
