/**
 * [INPUT]: Built production app, isolated synthetic profiles and a counted OS cipher fixture.
 * [OUTPUT]: Repeatable credential startup/sign-in/sign-out/recovery/restart reports and native window screenshots.
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
async function launch(profile, mode = 'available', appData = null) {
  application = await electron.launch({ args: [resolve('tests/fixtures/credential-entry.mjs'), ...(profile ? [`--user-data-dir=${profile}`] : [])], env: { ...environment, GOALLOOM_CREDENTIAL_MODE: mode, ...(appData ? { GOALLOOM_CREDENTIAL_APP_DATA: appData } : {}) }, timeout: 30_000 })
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
const vaultHeader = Buffer.from('Goalloom sync vault 1\n')
const ciphertext = bytes => bytes.subarray(0, vaultHeader.length).equals(vaultHeader) ? bytes.subarray(vaultHeader.length + 1) : bytes
async function currentVault(profile) {
  const path = join(profile, 'sync-session.bin')
  try { await readFile(path); return path }
  catch (error) { if (error.code !== 'ENOENT') throw error; return join(profile, 'sync-vault.bin') }
}
async function signOutFromSettings(settings, profile) {
  const path = await currentVault(profile)
  const saved = await readFile(path).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  const { requests: beforeRequests, ...before } = await metrics()
  const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
  await settings.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.locator('.sync-signout-modal button[type="submit"]').click()
  await settings.getByRole('button', { name: /Google/ }).waitFor()
  assert.equal((await status()).phase, 'signed-out')
  assert.equal((await status()).email, null)
  assert.equal((await status()).error, null)
  const { requests, ...afterMetrics } = await metrics()
  assert.deepEqual(afterMetrics, before, 'Sign-out must not request OS credentials')
  assert(requests.slice(beforeRequests.length).every(path => path === '/auth/v1/logout'), 'Sign-out may only revoke this local session')
  const after = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.deepEqual(after.items, snapshot.items)
  assert.equal(after.workspace.generation, snapshot.workspace.generation)
  if (saved) {
    const bytes = await readFile(path)
    assert.equal(bytes[vaultHeader.length], 0)
    assert.deepEqual(ciphertext(bytes), ciphertext(saved))
  }
}
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
async function recoveryLocale(settings, locale) {
  const names = { zh: '简体中文', en: 'English', ja: '日本語', es: 'Español', fr: 'Français' }
  const syncNames = { zh: '同步', en: 'Sync', ja: '同期', es: 'Sincronizar', fr: 'Synchro' }
  await settings.locator('.settings-nav-label').filter({ hasText: /^(外观|Appearance|外観|Apariencia|Apparence)$/ }).click()
  await settings.locator('.settings-select').click()
  await page.getByRole('option', { name: names[locale], exact: true }).click()
  // Locale catalogs load asynchronously; the previous language is not a completion signal.
  await settings.locator('.settings-nav-label').filter({ hasText: new RegExp(`^${syncNames[locale]}$`) }).click()
  if (await settings.locator('.sync-recovery summary').count()) await settings.locator('.sync-recovery summary').click()
}

try {
  const appData = join(temporary, 'default-app-data')
  const productionData = join(appData, 'Goalloom')
  await mkdir(productionData, { recursive: true })
  await writeFile(join(productionData, 'production-marker'), 'Synthetic production data stays untouched')
  await launch(null, 'available', appData)
  const identity = await application.evaluate(({ app }) => ({ name: app.name, userData: app.getPath('userData') }))
  assert.equal(identity.name, 'Goalloom Development')
  assert.equal(identity.userData, join(appData, 'Goalloom Development'))
  assert.equal(await readFile(join(productionData, 'production-marker'), 'utf8'), 'Synthetic production data stays untouched')
  await noCipher()
  await record('development-identity')
  report.identity = identity
  check('source launches use a separate application/keychain name and default data directory')
  await close()

  const local = join(temporary, 'local')
  await mkdir(local)
  await writeFile(join(local, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  await launch(local)
  assert.equal(await application.evaluate(({ app }) => app.getPath('userData')), local)
  check('explicit isolated profile paths remain unchanged')
  assert.equal((await metrics()).available, 0, 'Unused sync must not check the keychain at startup')
  await finishSetup(page)
  await page.locator('.board').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const created = await page.evaluate(async () => window.goalloom.execute({
    type: 'create', operationId: crypto.randomUUID(), generation: (await window.goalloom.getSnapshot()).workspace.generation,
    title: 'Keep this local task after sign-out', horizon: 'day',
  }))
  assert(created.ok)
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
  settings = await googleFromSettings()
  await application.evaluate(() => { globalThis.credentialFixture.mode = 'unavailable'; globalThis.credentialFixture.holdLogout = true })
  await signOutFromSettings(settings, active)
  const signedOutVault = await readFile(await currentVault(active))
  await close()
  await launch(active, 'unavailable')
  assert.equal((await status()).phase, 'signed-out')
  assert.equal((await metrics()).available, 0)
  assert.equal((await metrics()).decrypt, 0)
  await record('signed-out-restart')
  check('an active session can sign out despite failed OS access and a stalled logout request; keys and tasks survive restart')
  await close()
  await launch(active)
  await noCipher()
  settings = await googleFromSettings()
  await settings.getByRole('button', { name: /Google/ }).click()
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'signing-in')
  await waitForBrowser()
  assert((await metrics()).decrypt > 0)
  await page.evaluate(() => window.goalloom.sync({ type: 'cancel' }))
  assert.deepEqual(await readFile(await currentVault(active)), signedOutVault)
  await record('signed-out-reconnect')
  check('reconnecting opens the preserved vault without replacing its keys')
  await close()
  await launch(active)
  assert.equal((await status()).phase, 'signed-out')
  await noCipher()
  settings = await googleFromSettings()
  await settings.getByRole('button', { name: /Google/ }).click()
  await waitForBrowser()
  assert.equal((await metrics()).refreshed, 0)
  const callback = await fetch('http://127.0.0.1:53682/callback?code=synthetic-reconnect')
  assert.equal(callback.status, 200)
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'setup')
  const reconnected = await readFile(await currentVault(active))
  const reconnectedSecrets = JSON.parse(seal(ciphertext(await readFile(join(active, 'sync-vault.bin')))).toString())
  assert.equal(reconnected[vaultHeader.length], 0, 'Google alone must not enable restoration before password setup')
  assert.equal(reconnectedSecrets.signSk, '11'.repeat(32))
  assert.equal(reconnectedSecrets.boxSk, '22'.repeat(32))
  assert((await page.evaluate(() => window.goalloom.getSnapshot())).items.some(item => item.title === 'Keep this local task after sign-out'))
  await record('signed-out-authenticated-again')
  check('cancelled reconnect stays signed out after restart; a later completed OAuth reuses the original keys and board')
  await close()

  const unavailableFirstUse = await clone('unavailable-first-use', template)
  await launch(unavailableFirstUse, 'unavailable')
  await noCipher()
  settings = await googleFromSettings()
  await settings.getByRole('button', { name: /Google/ }).click()
  await waitForBrowser()
  assert.equal((await status()).phase, 'signing-in')
  assert.equal((await metrics()).encrypt, 0)
  await fetch('http://127.0.0.1:53682/callback?code=synthetic-first-use')
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'setup')
  assert.equal((await status()).credentialStorage, 'password')
  await record('unavailable-first-use')
  check('first-use Google authorization succeeds with unavailable Keychain access and no cipher writes')
  await signOutFromSettings(settings, unavailableFirstUse)
  await record('unused-password-sign-out')
  check('password-mode sign-out works without a saved email or vault')
  await close()

  for (const mode of ['unavailable', 'denied']) {
    const blocked = await clone(mode, template)
    await legacyVault(blocked)
    const original = await readFile(join(blocked, 'sync-vault.bin'))
    await launch(blocked, mode)
    assert.equal((await status()).phase, 'signed-out')
    assert.equal((await status()).credentialStorage, 'password')
    assert.equal((await metrics()).browser, 0)
    assert.equal((await metrics()).encrypt, 0)
    assert.deepEqual(await readFile(join(blocked, 'sync-vault.bin')), original)
    settings = await googleFromSettings()
    const recovery = settings.locator('.sync-password-storage')
    await recovery.waitFor()
    const beforeGuide = await metrics()
    if (mode === 'unavailable') {
      for (const locale of ['zh', 'en', 'ja', 'es', 'fr']) {
        await recoveryLocale(settings, locale)
        assert((await recovery.innerText()).length > 20)
        assert.equal(await settings.locator('.sync-recovery details').count(), 0)
        if (['en', 'es', 'fr'].includes(locale)) assert.doesNotMatch(await recovery.innerText(), /[一-鿿]/)
        await record(`password-recovery-${locale}`)
      }
      await recoveryLocale(settings, 'zh')
      check('five-language password recovery explains sign-in after reopening without prescribing system authorization')
    }
    assert.deepEqual(await metrics(), beforeGuide)
    assert.deepEqual(await readFile(join(blocked, 'sync-vault.bin')), original)
    await record(mode)
    check(`${mode} access preserves the old ciphertext and shows a usable Google sign-in`)
    await close()
    const disconnected = await clone(`${mode}-sign-out`, blocked)
    const journal = join(disconnected, 'sync-send-preserve.bin')
    await writeFile(journal, 'Synthetic preserved send journal')
    await launch(disconnected, mode)
    settings = await googleFromSettings()
    await page.evaluate(() => window.goalloom.sync({ type: 'sign-out' }))
    await record(`${mode}-signed-out`)
    await close()
    await launch(disconnected, mode)
    assert.equal((await status()).phase, 'signed-out')
    await noCipher()
    assert.equal((await metrics()).refreshed, 0)
    settings = await googleFromSettings()
    await settings.getByRole('button', { name: /Google/ }).click()
    await waitForBrowser()
    assert.equal((await metrics()).browser, 1)
    assert.equal((await metrics()).refreshed, 0)
    await fetch('http://127.0.0.1:53682/callback?code=synthetic-denied-reconnect')
    await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'setup')
    assert.equal((await metrics()).encrypt, 0)
    assert.deepEqual(ciphertext(await readFile(join(disconnected, 'sync-vault.bin'))), original)
    assert.equal(await readFile(journal, 'utf8'), 'Synthetic preserved send journal')
    await record(`${mode}-reconnect-authorized`)
    await signOutFromSettings(settings, disconnected)
    check(`${mode} reconnect reaches fresh OAuth and password setup while retaining tasks, legacy keys and the send journal`)
    await close()
    await launch(blocked)
    await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'setup')
    const bytes = await readFile(join(blocked, 'sync-vault.bin'))
    const restored = JSON.parse(seal(ciphertext(bytes)).toString())
    assert.equal(restored.signSk, '11'.repeat(32))
    assert.equal(restored.boxSk, '22'.repeat(32))
    assert.equal((await metrics()).refreshed, 1)
    assert.equal((await metrics()).browser, 0)
    assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.generation, generation)
    await record(`${mode}-access-restored`)
    check(`${mode} credentials retain the original automatic-restoration path when OS access is available again`)
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
  settings = await googleFromSettings()
  await settings.locator('.sync-recovery').waitFor()
  assert.equal(await settings.locator('.sync-recovery details').count(), 0)
  assert.match(await settings.locator('.sync-recovery').innerText(), /凭据文件/)
  await record('corrupt-vault')
  check('a damaged vault stays recoverable and is never replaced with fresh keys')
  await signOutFromSettings(settings, corrupt)
  await close()
  await launch(corrupt)
  assert.equal((await status()).phase, 'signed-out')
  await noCipher()
  await record('corrupt-vault-signed-out')
  check('sign-out suppresses automatic access to an unreadable vault without deleting its ciphertext')
  await close()

  const writeFailure = await clone('sign-out-write-failure', template)
  await legacyVault(writeFailure)
  await mkdir(join(writeFailure, 'sync-vault.bin.tmp'))
  const writeFailureBytes = await readFile(join(writeFailure, 'sync-vault.bin'))
  await launch(writeFailure, 'unavailable')
  settings = await googleFromSettings()
  await page.evaluate(() => window.goalloom.sync({ type: 'sign-out' }))
  assert.equal((await status()).error, 'storage')
  assert.equal((await status()).phase, 'signed-out')
  assert.deepEqual(await readFile(join(writeFailure, 'sync-vault.bin')), writeFailureBytes)
  await record('sign-out-write-failure')
  check('a failed sign-out write reports storage failure and preserves the previous state and bytes')
  await close()

  if (process.platform === 'darwin') {
    const blocked = await clone('missing-native-policy', template)
    await legacyVault(blocked)
    const original = await readFile(join(blocked, 'sync-vault.bin'))
    await launch(blocked, 'missing-policy')
    assert.equal((await status()).phase, 'signed-out')
    assert.equal((await status()).credentialStorage, 'password')
    await noCipher()
    assert.deepEqual(await readFile(join(blocked, 'sync-vault.bin')), original)
    await page.locator('.board').waitFor()
    await record('missing-native-policy')
    check('a missing native policy offers password recovery without calling the cipher or replacing saved secrets')
    await close()
  }

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
  assert.deepEqual((await metrics()).cipherAppNames, ['Goalloom Development'])
  await close()
  for (const mode of ['denied', 'unavailable']) {
    const original = await readFile(join(aiDirectory, 'openrouter.key'))
    await launch(ai, mode)
    const reply = await page.evaluate(async () => window.goalloom.smart({ type: 'status', generation: (await window.goalloom.getSnapshot()).workspace.generation }))
    assert.equal(reply.type, 'status')
    assert.equal(reply.status.providers.openrouter.credential, mode === 'denied' ? 'unreadable' : 'unavailable')
    assert.equal(reply.status.features.smart.enabled, false)
    assert.deepEqual(await readFile(join(aiDirectory, 'openrouter.key')), original)
    assert.equal((await metrics()).encrypt, 0)
    await record(`ai-${mode}`)
    check(`${mode} AI credentials stay encrypted while the app remains usable`)
    await close()
  }
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
