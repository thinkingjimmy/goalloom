/**
 * [INPUT]: Production build and a test-only main composition wrapper.
 * [OUTPUT]: Native focus/hide/show acceptance, real IPC/SQLite and window screenshots.
 * [POS]: Sync-owned native E2E. No user profile, real sleep or live Supabase access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readdir, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir, cpus, release, arch } from 'node:os'
import { execFileSync } from 'node:child_process'
import { build } from 'vite'
import { _electron as electron } from 'playwright'

const out = resolve('output/tests/sync-cost'); await mkdir(join(out, 'screenshots'), { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'goalloom-sync-native-'))
await build({ configFile: false, ssr: { noExternal: true }, define: { __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: '""', __GOALLOOM_BAKED_SUPABASE_URL__: '""' }, build: {
  ssr: true, target: 'node24', minify: false, outDir: 'out/main', emptyOutDir: false,
  lib: { entry: 'tests/sync-cost/native-entry.ts', formats: ['es'], fileName: () => 'sync-cost-native.js' },
  rollupOptions: { external: [/^node:/, 'electron', 'electron-updater'], output: { entryFileNames: 'sync-cost-native.js', chunkFileNames: 'sync-cost-[name]-[hash].js' } },
} })
const env = { ...process.env, GOALLOOM_SYNC_TEST_PROFILE: profile }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL; delete env.GOALLOOM_SUPABASE_URL; delete env.GOALLOOM_SUPABASE_ANON_KEY
const report = { ok: false, checks: [], runtime: null, host: { os: release(), arch: arch(), cpu: cpus()[0]?.model,
  machine: execFileSync('sysctl', ['-n', 'kern.hv_vmm_present'], { encoding: 'utf8' }).trim() === '0' ? 'Physical host (no hypervisor reported)' : 'VM' },
  scope: 'Source Electron main/renderer/preload/IPC/storage, real BrowserWindow hide/show/focus. Synthetic cloud/cipher/monotonic clock; no packaged/Windows/real-sleep/cloud-SQL acceptance.' }
let application, page
try {
  application = await electron.launch({ args: [resolve('out/main/sync-cost-native.js'), `--user-data-dir=${profile}`], env, timeout: 30_000 })
  page = await application.firstWindow(); await page.locator('.board').waitFor()
  await page.waitForFunction(async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'ready')
  await application.evaluate(async () => { await globalThis.syncFixture.service.handle({ type: 'retry' }) })
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const count = () => application.evaluate(() => globalThis.syncFixture.cloud.requests.filter(row => row.rpc === 'get_sync_status').length)
  await page.waitForFunction(() => document.visibilityState === 'visible')
  await application.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    if (!window.isVisible()) throw new Error('Expected a visible native window before hiding')
    await new Promise(resolve => { window.once('hide', resolve); window.hide() })
  })
  assert.equal(await application.evaluate(() => globalThis.syncFixture.service.schedule.foreground), false)
  const before = await count()
  await application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus() })
  await page.waitForFunction(async () => !(await window.goalloom.sync({ type: 'status' })).status.offline)
  await application.evaluate(async () => { await globalThis.syncFixture.service.schedule.settle() })
  assert((await count()) > before)
  report.checks.push('Actual hide exits foreground; show/focus requests a fresh status without waiting for idle timer')
  const created = await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot()
    return window.goalloom.execute({ type: 'create', operationId: crypto.randomUUID(), generation: snapshot.workspace.generation, title: 'Synthetic sync acceptance', horizon: 'day' })
  })
  assert(created.ok)
  await application.evaluate(async () => { await globalThis.syncFixture.clock.advance(200); await globalThis.syncFixture.service.schedule.settle(); await globalThis.syncFixture.clock.advance(0); await globalThis.syncFixture.service.schedule.settle() })
  await page.getByText('Synthetic sync acceptance', { exact: true }).waitFor()
  await page.screenshot({ path: join(out, 'screenshots/native-board.png') })
  report.checks.push('Real renderer IPC persists a task and the production service uploads it')
  const state = await page.evaluate(async () => (await window.goalloom.sync({ type: 'status' })).status)
  assert.equal(state.error, null)
  assert.equal(state.pending, 0)
  await application.evaluate(async () => {
    const fixture = globalThis.syncFixture
    fixture.cloud.controls.blocked = 'push_ops'; fixture.cloud.controls.retryAt = Date.now() + 60_000
    const view = await fixture.service.deps.storage.call('sync', { type: 'view' })
    await fixture.service.deps.storage.call('command', { type: 'create', operationId: crypto.randomUUID(), generation: view.generation, title: 'Synthetic waiting upload', horizon: 'day' })
    await fixture.service.handle({ type: 'retry' })
  })
  await page.locator('.settings-toggle').click()
  const settings = page.locator('dialog.settings-modal')
  const syncButton = settings.getByRole('button', { name: /^Sync/ }).first()
  const syncIndex = await syncButton.evaluate(node => [...node.closest('.settings-nav').querySelectorAll('button')].indexOf(node))
  await syncButton.click()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 700))
  const localeNames = { en: 'English', zh: '简体中文', ja: '日本語', es: 'Español', fr: 'Français' }
  for (const [locale, label] of [['en','Waiting to upload'],['zh','等待上传'],['ja','アップロード待ち'],['es','Esperando para subir'],['fr','En attente d’envoi']]) {
    if (locale !== 'en') {
      await settings.locator('.settings-nav button').first().click()
      await settings.locator('.settings-select').click()
      await page.getByRole('option', { name: localeNames[locale], exact: true }).click()
      await settings.locator('.settings-nav button').nth(syncIndex).click()
    }
    await settings.locator('.sync-status').getByText(label, { exact: true }).waitFor()
    const size = await settings.locator('.sync-pane').evaluate(node => ({ width: node.clientWidth, content: node.scrollWidth }))
    assert(size.content <= size.width + 1, `Waiting copy overflows in ${locale}`)
    await page.screenshot({ path: join(out, `screenshots/upload-wait-${locale}.png`) })
  }
  const waiting = await page.evaluate(async () => (await window.goalloom.sync({ type: 'status' })).status)
  assert(waiting.uploadWait && waiting.pending > 0 && !waiting.offline)
  report.checks.push('Upload waiting and retry time render in all five languages while download remains available')
  report.ok = true
  console.log('Native sync acceptance passed')
} catch (error) {
  report.failure = String(error)
  report.native = await application?.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() }))).catch(() => null)
  await page?.screenshot({ path: join(out, 'screenshots/native-failure.png') }).catch(() => {})
  throw error
}
finally {
  await writeFile(join(out, 'native.json'), JSON.stringify(report, null, 2)); await application?.close()
  for (const file of await readdir('out/main')) if (file.startsWith('sync-cost-') || file === 'native-entry.js') await unlink(join('out/main', file))
}
