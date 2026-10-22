/**
 * [INPUT]: Current production renderer/build and isolated multi-account composition.
 * [OUTPUT]: Real native UI/IPC security journeys, five-language screenshots and a JSON report.
 * [POS]: Targeted macOS source acceptance. Hosted SQL/package/Windows are separate scopes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile, readdir, unlink, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { tmpdir, cpus, release, arch } from 'node:os'
import { execFileSync } from 'node:child_process'
import { build } from 'vite'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'
import { pollPage } from './fixtures/poll.mjs'

const packaged = process.argv.includes('--packaged')
const out = resolve('output/tests/sync-security', packaged ? 'packaged' : '.'); await mkdir(join(out, 'screenshots'), { recursive: true })
const root = await mkdtemp(join(tmpdir(), 'goalloom-sync-security-ui-'))
await build({ configFile: false, ssr: { noExternal: true }, define: { __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: '""', __GOALLOOM_BAKED_SUPABASE_URL__: '""' }, build: {
  ssr: true, target: 'node24', minify: false, outDir: 'out/main', emptyOutDir: false,
  lib: { entry: 'tests/sync-security/native-entry.ts', formats: ['es'], fileName: () => 'sync-security-native.js' },
  rollupOptions: { external: [/^node:/, 'electron', 'electron-updater'], output: { entryFileNames: 'sync-security-native.js', chunkFileNames: 'sync-security-[name]-[hash].js' } },
} })
let executablePath
if (packaged) {
  assert.equal(process.platform, 'darwin', 'Packaged fixture currently supports macOS acceptance')
  const { build: packageApp, Platform, Arch } = await import('electron-builder')
  const yaml = await import('js-yaml')
  const config = yaml.load(await readFile('electron-builder.yml', 'utf8'))
  config.appId = 'com.goalloom.sync-security-fixture'
  config.productName = 'Goalloom Sync Security Fixture'
  config.extraMetadata.main = 'out/main/sync-security-native.js'
  config.directories.output = join(root, 'package')
  config.mac.protocols = []; config.mac.identity = '-'; config.mac.hardenedRuntime = false
  config.afterSign = async () => {}; delete config.publish
  process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
  delete process.env.CSC_LINK; delete process.env.CSC_KEY_PASSWORD
  await packageApp({ projectDir: resolve('.'), targets: Platform.MAC.createTarget('dir', Arch.arm64), config, publish: 'never' })
  executablePath = join(config.directories.output, 'mac-arm64/Goalloom Sync Security Fixture.app/Contents/MacOS/Goalloom Sync Security Fixture')
}
const env = { ...process.env, GOALLOOM_SYNC_TEST_PROFILE: root }
for (const name of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL', 'GOALLOOM_SUPABASE_URL', 'GOALLOOM_SUPABASE_ANON_KEY']) delete env[name]
let hypervisor = 'unknown'
try { hypervisor = execFileSync('sysctl', ['-n', 'kern.hv_vmm_present'], { encoding: 'utf8' }).trim() } catch {}
const report = { ok: false, checks: [], runtime: null, host: { os: release(), arch: arch(), cpu: cpus()[0]?.model,
  machine: hypervisor === '0' ? 'Physical host (no hypervisor reported)' : hypervisor === '1' ? 'VM' : 'Unknown' },
  scope: 'Source Electron main/renderer/preload/IPC/SQLite and native window. Synthetic Google, encrypted HTTP cloud, OS cipher and OS connectivity. No real Wi-Fi toggle, live OAuth, packaged or Windows acceptance.' }
if (packaged) {
  report.scope = 'Local ad-hoc macOS ASAR app with production renderer/main/preload/SQLite, test-only boundary instrumentation and no protocol registration. Synthetic OAuth/HTTP/cipher/connectivity. No Developer ID, notarization, published installer, live hosted HTTP or Windows acceptance.'
  const asar = join(root, 'package/mac-arm64/Goalloom Sync Security Fixture.app/Contents/Resources/app.asar')
  report.packageSha256 = createHash('sha256').update(await readFile(asar)).digest('hex')
  await writeFile(join(out, 'instrumented-app.asar'), await readFile(asar))
}
let application, page
const check = label => { report.checks.push(label); console.log(`PASS ${label}`) }
const status = () => page.evaluate(async () => (await window.goalloom.sync({ type: 'status' })).status)
const ready = () => pollPage(page, async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'ready')
const shot = name => page.screenshot({ path: join(out, `screenshots/${name}.png`) })
async function signOut(settings, clear = false) {
  await settings.locator('.sync-account').getByRole('button').filter({ hasText: /^(退出登录|Sign out|ログアウト|Salir|Se déconnecter)$/ }).click()
  const modal = page.locator('.sync-signout-modal')
  if (clear) await modal.locator('input[value="clear"]').check()
  await modal.locator('button[type="submit"]').click()
}
try {
  application = await electron.launch({ ...(executablePath ? { executablePath, cwd: tmpdir() } : {}),
    args: [...(packaged ? [] : [resolve('out/main/sync-security-native.js')]), `--user-data-dir=${join(root, 'alpha')}`], env, timeout: 30_000 })
  page = await application.firstWindow(); await page.locator('.board').waitFor()
  page.on('pageerror', error => { report.rendererErrors ??= []; report.rendererErrors.push(error.message) })
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  report.packaged = await application.evaluate(({ app }) => app.isPackaged)
  assert.equal(report.packaged, packaged)
  await page.locator('.settings-toggle').click()
  let settings = page.locator('dialog.settings-modal')
  await settings.locator('.settings-nav-label').filter({ hasText: /^同步$/ }).click()
  await settings.getByRole('button', { name: /Google/ }).click()
  await settings.locator('input[type="password"]').nth(0).fill('synthetic-sync-password')
  await settings.locator('input[type="password"]').nth(1).fill('synthetic-sync-password')
  await settings.getByRole('button', { name: '开始同步', exact: true }).click(); await ready()
  await application.evaluate(async () => { const f = globalThis.syncSecurityFixture; await f.connectB(); await f.settle(); f.originalId = f.a.service.secrets.workspaceId })
  assert.equal(await page.locator('.sync-diagnostics').count(), 0, 'Production renderer hides diagnostic status')

  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 720))
  for (const [locale, language] of [['en', 'English'], ['ja', '日本語'], ['es', 'Español'], ['fr', 'Français'], ['zh', '简体中文']]) {
    await settings.locator('.settings-nav-label').filter({ hasText: /^(外观|Appearance|外観|Apariencia|Apparence)$/ }).click()
    await settings.locator('.settings-select').click(); await page.getByRole('option', { name: language, exact: true }).click()
    await settings.locator('.settings-nav-label').filter({ hasText: /^(同步|Sync|同期|Sincronizar|Synchro)$/ }).click()
    await settings.locator('.sync-account').getByRole('button').filter({ hasText: /^(退出登录|Sign out|ログアウト|Salir|Se déconnecter)$/ }).click()
    const modal = page.locator('.sync-signout-modal')
    assert.equal(await modal.locator('input[value="keep"]').isChecked(), true)
    await modal.locator('input[value="clear"]').check(); await modal.getByRole('alert').waitFor()
    assert.equal(await modal.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true)
    await shot(`signout-${locale}`)
    await page.keyboard.press('Escape'); assert.equal((await status()).phase, 'ready')
    assert.equal(await settings.locator('.sync-account button').evaluate(node => node === document.activeElement), true)
    assert.equal(await settings.locator('[aria-haspopup="dialog"]').filter({ hasText: /^(更改密码|Change password|パスワードを変更|Cambiar contraseña|Changer le mot de passe)$/ }).count(), 1)
    assert.equal(await settings.getByRole('button').filter({ hasText: /^(忘记密码|Forgot password|パスワードを忘れた|Olvidé la contraseña|Mot de passe oublié)/ }).count(), 0)
    const changeTrigger = settings.getByRole('button').filter({ hasText: /^(更改密码|Change password|パスワードを変更|Cambiar contraseña|Changer le mot de passe)$/ })
    await changeTrigger.click()
    const change = page.locator('dialog.sync-change-password-modal')
    await change.locator('input[type="password"]').nth(0).fill('new-sync-password')
    await change.locator('input[type="password"]').nth(1).fill('mismatched-password')
    assert.equal(await change.locator('button[type="submit"]').isEnabled(), false)
    assert.equal(await change.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true)
    await shot(`change-password-${locale}`)
    if (locale === 'en') {
      await application.evaluate(async () => {
        const service = globalThis.syncSecurityFixture.a.service
        service.schedule.stop(); await service.schedule.settle()
        service.deps.notify({ ...service.status(), syncing: true })
      })
      await pollPage(page, () => document.querySelector('.sync-pane button[aria-haspopup="dialog"]')?.disabled)
    }
    await page.keyboard.press('Escape'); await change.waitFor({ state: 'detached' })
    if (locale === 'en') await application.evaluate(() => {
      const service = globalThis.syncSecurityFixture.a.service
      service.deps.notify({ ...service.status(), syncing: false })
    })
    await pollPage(page, () => document.activeElement === document.querySelector('.sync-pane button[aria-haspopup="dialog"]'), undefined, { timeout: 2_000, label: 'Password focus returns after the entry is enabled' })
    assert.equal(await changeTrigger.evaluate(node => node === document.activeElement), true)
    if (locale === 'en') await application.evaluate(() => globalThis.syncSecurityFixture.a.service.schedule.start())
    await signOut(settings)
    await settings.getByRole('button', { name: /Google/ }).click()
    await pollPage(page, async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'enter-key')
    const forgot = settings.getByRole('button').filter({ hasText: /^(忘记密码？|Forgot password\?|パスワードを忘れた？|¿Olvidaste la contraseña\?|Mot de passe oublié \?)$/ })
    await forgot.click()
    const recoveryModal = page.locator('dialog.sync-recovery-modal')
    const form = recoveryModal.locator('.sync-recovery-form')
    assert.equal(await form.locator('input[type="radio"]').count(), 0)
    assert.equal(await form.locator('input[type="password"]').count(), 2)
    assert.equal(await recoveryModal.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true)
    await shot(`recovery-${locale}`)
    await form.locator('summary').click()
    await form.locator('.sync-recovery-alternative').click()
    assert.equal(await recoveryModal.locator('input[type="text"]').count(), 1)
    assert.equal(await recoveryModal.locator('button[type="submit"]').isEnabled(), false)
    await shot(`reset-${locale}`)
    await recoveryModal.locator('.sync-recovery-back').click()
    assert.equal(await recoveryModal.locator('input[type="text"]').count(), 0)
    await page.keyboard.press('Escape'); await recoveryModal.waitFor({ state: 'detached' })
    assert.equal(await forgot.evaluate(node => node === document.activeElement), true)
    assert.equal(await settings.isVisible(), true)
    await settings.locator('input[type="password"]').fill('synthetic-sync-password')
    await settings.locator('.sync-end button').last().click(); await ready()
  }
  check('Password dialogs fit five locales; ready hides recovery, mismatch is blocked, destructive navigation and scoped Escape return focus')

  const passwordBefore = (await page.evaluate(() => window.goalloom.getSnapshot())).items
  await settings.getByRole('button', { name: '更改密码', exact: true }).click()
  const passwordModal = page.locator('dialog.sync-change-password-modal')
  await passwordModal.locator('input[type="password"]').nth(0).fill('changed-ui-password')
  await passwordModal.locator('input[type="password"]').nth(1).fill('changed-ui-password')
  await application.evaluate(() => { globalThis.syncSecurityFixture.cloud.controls.fault = 'offline' })
  await passwordModal.locator('button[type="submit"]').click()
  await passwordModal.getByRole('alert').waitFor()
  assert.equal(await passwordModal.locator('input[type="password"]').nth(0).inputValue(), 'changed-ui-password')
  assert.equal(await passwordModal.locator('input[type="password"]').nth(1).inputValue(), 'changed-ui-password')
  await shot('change-password-failure-retains-draft')
  await application.evaluate(() => {
    const f = globalThis.syncSecurityFixture
    f.cloud.controls.fault = ''
    const handle = f.a.service.handle
    f.passwordCalls = 0
    f.a.service.handle = async function (action) {
      if (action.type === 'change-password') {
        f.passwordCalls++
        await new Promise(resolve => { f.releasePassword = () => { f.a.service.handle = handle; resolve() } })
      }
      return handle.call(this, action)
    }
  })
  await passwordModal.locator('button[type="submit"]').click()
  await pollPage(page, () => document.querySelector('.sync-password-form')?.getAttribute('aria-busy') === 'true')
  await page.keyboard.press('Escape'); await page.keyboard.press('Enter')
  assert.equal(await passwordModal.isVisible(), true)
  assert.equal(await application.evaluate(() => globalThis.syncSecurityFixture.passwordCalls), 1)
  await shot('change-password-pending')
  await application.evaluate(() => globalThis.syncSecurityFixture.releasePassword())
  await passwordModal.waitFor({ state: 'detached' })
  assert.deepEqual((await page.evaluate(() => window.goalloom.getSnapshot())).items, passwordBefore)
  check('Changing the password uses the existing action without an old-password field and keeps local tasks')

  const before = await page.evaluate(() => window.goalloom.getSnapshot())
  await signOut(settings)
  await settings.getByRole('button', { name: /Google/ }).waitFor()
  assert.deepEqual((await page.evaluate(() => window.goalloom.getSnapshot())).items, before.items)
  await application.evaluate(() => { globalThis.syncSecurityFixture.identity = 'other-alpha' })
  await settings.getByRole('button', { name: /Google/ }).click()
  await pollPage(page, async () => (await window.goalloom.sync({ type: 'status' })).status.error === 'mismatch')
  await shot('account-switch-rejected')
  await application.evaluate(() => { globalThis.syncSecurityFixture.identity = 'alpha' })
  await settings.getByRole('button', { name: /Google/ }).click()
  await settings.locator('input[type="password"]').fill('changed-ui-password')
  await settings.getByRole('button', { name: '继续', exact: true }).click(); await ready()
  check('Real keep-local IPC preserves tasks; a different account cannot upload the bound board')

  await signOut(settings)
  await settings.getByRole('button', { name: /Google/ }).click()
  await settings.getByRole('button', { name: '忘记密码？', exact: true }).click()
  let recovery = page.locator('dialog.sync-recovery-modal .sync-recovery-form')
  await recovery.locator('input[type="password"]').nth(0).fill('independent-password')
  await recovery.locator('input[type="password"]').nth(1).fill('independent-password')
  await recovery.locator('button[type="submit"]').click(); await recovery.waitFor({ state: 'detached' }); await ready()
  await application.evaluate(async () => {
    const f = globalThis.syncSecurityFixture; await f.settle()
    if (f.a.service.secrets.workspaceId === f.originalId) throw Error('New workspace was not selected')
    if (f.b.service.secrets.workspaceId !== f.originalId || !f.cloud.world.workspaces.has(f.originalId)) throw Error('Old device lost its workspace')
    f.newId = f.a.service.secrets.workspaceId
  })
  check('Recommended recovery creates a separate workspace and the second device keeps syncing the old one')

  await signOut(settings)
  await settings.getByRole('button', { name: /Google/ }).click()
  await settings.getByRole('button', { name: '忘记密码？', exact: true }).click()
  recovery = page.locator('dialog.sync-recovery-modal .sync-recovery-form')
  await recovery.locator('summary').click()
  await recovery.locator('.sync-recovery-alternative').click()
  await recovery.locator('input[type="password"]').nth(0).fill('reset-password')
  await recovery.locator('input[type="password"]').nth(1).fill('reset-password')
  const destructive = recovery.locator('button[type="submit"]')
  assert.equal(await destructive.isEnabled(), false)
  await recovery.locator('input:not([type="radio"]):not([type="password"])').fill('delete all cloud data')
  assert.equal(await destructive.isEnabled(), false)
  await recovery.locator('input:not([type="radio"]):not([type="password"])').fill('DELETE ALL CLOUD DATA')
  assert.equal(await destructive.isEnabled(), true); await shot('destructive-exact-confirmation')
  await destructive.click(); await recovery.waitFor({ state: 'detached' }); await ready()
  await application.evaluate(() => {
    const f = globalThis.syncSecurityFixture
    if (f.cloud.world.workspaces.has(f.newId) || !f.cloud.world.workspaces.has(f.originalId)) throw Error('Reset destroyed another workspace')
  })
  check('Destructive UI requires the exact phrase and its RPC preserves other workspaces')

  await application.evaluate(() => { const f = globalThis.syncSecurityFixture; f.online = false; f.cloud.world.online = false })
  await pollPage(page, async () => (await window.goalloom.sync({ type: 'status' })).status.offline)
  await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot()
    const result = await window.goalloom.execute({ type: 'create', generation: snapshot.workspace.generation, operationId: crypto.randomUUID(), title: 'Native offline edit', horizon: 'day' })
    if (!result.ok) throw Error('Offline editing failed')
    if (result.result.outcome !== 'committed') throw Error(`Offline creation outcome: ${result.result.outcome}`)
  })
  assert((await page.evaluate(() => window.goalloom.getSnapshot())).items.some(item => item.title === 'Native offline edit'))
  const restoredAt = Date.now()
  await application.evaluate(() => { const f = globalThis.syncSecurityFixture; f.online = true; f.cloud.world.online = true })
  await pollPage(page, async () => { const { status } = await window.goalloom.sync({ type: 'status' }); return !status.offline && !status.error && status.pending === 0 }, undefined, { timeout: 5_000 })
  report.networkRecoveryMs = Date.now() - restoredAt
  report.uploadedTaskTitles = await application.evaluate(() => globalThis.syncSecurityFixture.cloudTaskTitles())
  report.networkEvidence = await application.evaluate(async () => {
    const f = globalThis.syncSecurityFixture
    return { view: await f.a.storage.call('sync', { type: 'view' }), status: (await f.a.service.handle({ type: 'status' })).status,
      pending: await f.a.storage.call('sync', { type: 'peek' }), requests: f.cloud.requests.slice(-15),
      selected: f.a.service.secrets.workspaceId, cloud: f.cloud.world.workspace.id }
  })
  assert(report.uploadedTaskTitles.includes('Native offline edit'), `Upload not verified: ${JSON.stringify(report.uploadedTaskTitles)}`)
  await shot('network-restored')
  check('A native offline edit uploads automatically within five seconds of controlled network restoration')

  await signOut(settings, true)
  await page.locator('.start-cards').waitFor()
  await shot('cleared-onboarding')
  assert.deepEqual((await page.evaluate(() => window.goalloom.getSnapshot())).items, [])
  await application.evaluate(() => { globalThis.syncSecurityFixture.identity = 'other-alpha' })
  await page.getByRole('button', { name: /Google/ }).click()
  await page.locator('input[type="password"]').fill('synthetic-sync-password')
  await page.getByRole('button', { name: '继续', exact: true }).click()
  await page.locator('.board').waitFor()
  const switchedTasks = (await page.evaluate(() => window.goalloom.getSnapshot())).items
  assert.deepEqual(switchedTasks.map(item => item.title), ['Other account cloud task'])
  await shot('other-account-isolated')
  check('Shared-computer clear shows onboarding; the next account downloads only its own cloud tasks')

  await page.locator('.settings-toggle').click(); settings = page.locator('dialog.settings-modal')
  await settings.locator('.settings-nav-label').filter({ hasText: /^同步$/ }).click()
  await signOut(settings, true); await page.locator('.start-cards').waitFor()
  await application.evaluate(() => { globalThis.syncSecurityFixture.identity = 'alpha' })
  await page.getByRole('button', { name: /Google/ }).click()
  await page.locator('input[type="password"]').fill('reset-password')
  await page.getByRole('button', { name: '继续', exact: true }).click(); await page.locator('.board').waitFor()
  const restoredTasks = (await page.evaluate(() => window.goalloom.getSnapshot())).items
  report.restoredTaskTitles = restoredTasks.map(item => item.title)
  assert(restoredTasks.some(item => item.title === 'Native offline edit'))
  assert(!restoredTasks.some(item => item.title === 'Other account cloud task'))
  check('The original account can sign in again and recover its cloud tasks after another account used the computer')

  await page.locator('.settings-toggle').click(); settings = page.locator('dialog.settings-modal')
  await settings.locator('.settings-nav-label').filter({ hasText: /^同步$/ }).click()
  await signOut(settings, true); await page.locator('.start-cards').waitFor()
  await page.getByRole('button', { name: /Google/ }).click()
  await page.getByRole('button', { name: '忘记密码？', exact: true }).click()
  const onboardingRecovery = page.locator('dialog').filter({ has: page.locator('.sync-recovery-form') })
  await onboardingRecovery.locator('input[type="password"]').nth(0).fill('first-run-recovery-password')
  await onboardingRecovery.locator('input[type="password"]').nth(1).fill('first-run-recovery-password')
  const beforeSetupRecovery = await application.evaluate(() => globalThis.syncSecurityFixture.cloud.world.workspaces.size)
  await onboardingRecovery.locator('button[type="submit"]').click()
  await page.locator('.calendar-modes').waitFor()
  assert.equal(await application.evaluate(() => globalThis.syncSecurityFixture.cloud.world.workspaces.size), beforeSetupRecovery)
  await finishSetup(page); await ready()
  assert.equal(await application.evaluate(() => globalThis.syncSecurityFixture.cloud.world.workspaces.size), beforeSetupRecovery + 1)
  await shot('recovery-explicit-calendar-confirmation')
  check('First-run recovery waits for explicit calendar/setup confirmation before creating the new cloud workspace')
  assert.deepEqual(report.rendererErrors ?? [], [])
  report.ok = true
} catch (error) {
  report.error = error?.stack ?? String(error)
  if (application) report.appState = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible() }))).catch(() => null)
  if (page) { report.activeElement = await page.evaluate(() => ({ tag: document.activeElement?.tagName, className: document.activeElement?.className })).catch(() => null); await shot('failure').catch(() => {}) }
  throw error
} finally {
  await writeFile(join(out, 'native.json'), JSON.stringify(report, null, 2))
  await application?.close().catch(() => {})
  for (const file of await readdir('out/main')) if (file.startsWith('sync-security-')) await unlink(join('out/main', file))
  await rm(root, { recursive: true, force: true })
}
