/**
 * [INPUT]: Production build and isolated two-device composition.
 * [OUTPUT]: Real UI/IPC first-join, sign-out/relogin and safe merge controls with screenshots.
 * [POS]: Sync-owned native acceptance; no live credentials or user workspace.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { configureSync } from './fixtures/billing.mjs'
import { mkdir, mkdtemp, writeFile, readdir, unlink, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir, cpus, release, arch } from 'node:os'
import { execFileSync } from 'node:child_process'
import { build } from 'vite'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'

const out = resolve('output/tests/sync-join'); await mkdir(join(out, 'screenshots'), { recursive: true })
const root = await mkdtemp(join(tmpdir(), 'goalloom-sync-join-ui-'))
await build({ configFile: false, ssr: { noExternal: true }, define: { __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: '""', __GOALLOOM_BAKED_SUPABASE_URL__: '""' }, build: {
  ssr: true, target: 'node24', minify: false, outDir: 'out/main', emptyOutDir: false,
  lib: { entry: 'tests/sync-join/native-entry.ts', formats: ['es'], fileName: () => 'sync-join-native.js' },
  rollupOptions: { external: [/^node:/, 'electron', 'electron-updater'], output: { entryFileNames: 'sync-join-native.js', chunkFileNames: 'sync-join-[name]-[hash].js' } },
} })
const env = { ...process.env, GOALLOOM_SYNC_TEST_PROFILE: root }
delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL; delete env.GOALLOOM_SUPABASE_URL; delete env.GOALLOOM_SUPABASE_ANON_KEY
const report = { ok: false, checks: [], runtime: null, host: { os: release(), arch: arch(), cpu: cpus()[0]?.model,
  machine: execFileSync('sysctl', ['-n', 'kern.hv_vmm_present'], { encoding: 'utf8' }).trim() === '0' ? 'Physical host (no hypervisor reported)' : 'VM' },
  scope: 'Source Electron main/renderer/preload/IPC/storage and real window. Synthetic encrypted HTTP cloud and OS cipher. No live Google, hosted SQL, packaged or Windows acceptance.' }
let application, page
try {
  application = await electron.launch({ args: [resolve('out/main/sync-join-native.js'), `--user-data-dir=${join(root, 'alpha')}`], env, timeout: 30_000 })
  page = await application.firstWindow(); await page.locator('.board').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  await page.locator('.settings-toggle').click()
  const settings = page.locator('dialog.settings-modal')
  const syncTab = settings.getByRole('button', { name: /^同步/ }).first()
  const syncIndex = await syncTab.evaluate(node => [...node.closest('.settings-nav').querySelectorAll('button')].indexOf(node))
  await syncTab.click()
  await settings.getByRole('button', { name: /Google/ }).click()
  await configureSync(settings)
  await settings.locator('input[type="password"]').fill('synthetic-sync-password')
  await settings.getByRole('button', { name: '继续', exact: true }).click()
  await pollPage(page, async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'ready')
  await settings.locator('.sync-status').waitFor()
  assert.equal(await settings.getByText('本机已有条目', { exact: true }).count(), 0)
  await application.evaluate(async () => {
    const f = globalThis.syncJoinFixture
    await f.a.service.operation
    for (let turn = 0; turn < 5; turn++) {
      await f.a.service.handle({ type: 'retry' }); await f.a.service.schedule.settle()
      await f.b.service.handle({ type: 'retry' }); await f.b.clock.advance(0); await f.b.service.schedule.settle()
    }
    const a = await f.a.storage.call('sync', { type: 'capture' }), b = await f.b.storage.call('sync', { type: 'capture' })
    if (JSON.stringify(a.items.map(i => i.id).sort()) !== JSON.stringify(b.items.map(i => i.id).sort())) throw Error(`Native Case 1 did not converge: ${JSON.stringify({a: f.a.service.status(), b: f.b.service.status(), aItems: a.items.length, bItems: b.items.length})}`)
    f.headBeforeRelogin = f.cloud.world.workspace.headSeq
  })
  await page.screenshot({ path: join(out, 'screenshots/case-1-ready.png') })
  report.checks.push('Real Google sign-in UI and sync password automatically join Case 1; all task IDs reach B')
  await settings.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.locator('.sync-signout-modal button[type="submit"]').click()
  await settings.getByRole('button', { name: /Google/ }).click()
  await configureSync(settings)
  await settings.locator('input[type="password"]').fill('synthetic-sync-password')
  await settings.getByRole('button', { name: '继续', exact: true }).click()
  await pollPage(page, async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'ready')
  await application.evaluate(async () => {
    const f = globalThis.syncJoinFixture
    await f.a.service.handle({ type: 'retry' })
    if (f.cloud.world.workspace.headSeq !== f.headBeforeRelogin) throw Error('Relogin appended duplicate operations')
  })
  report.checks.push('Real sign-out/relogin controls resume without new operations or a repeated merge decision')
  // A restored workspace must explicitly choose, even when its current task IDs are already known.
  await settings.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.locator('.sync-signout-modal button[type="submit"]').click()
  await application.evaluate(async () => {
    const storage = globalThis.syncJoinFixture.a.storage, expectedBinding = await storage.call('sync', { type: 'active-binding' })
    await storage.call('sync', { type: 'pause', expectedBinding, reason: 'restore', at: new Date().toISOString() })
  })
  await settings.getByRole('button', { name: /Google/ }).click()
  await configureSync(settings)
  await settings.locator('input[type="password"]').fill('synthetic-sync-password')
  await settings.getByRole('button', { name: '继续', exact: true }).click()
  await settings.getByRole('button', { name: '合并并开始同步', exact: true }).waitFor()
  assert.equal(await settings.getByRole('button', { name: '合并并开始同步', exact: true }).isEnabled(), true)
  assert.equal(await settings.locator('.sync-pane input[type="radio"]:not(.billing-card input)').count(), 0)
  assert.equal(await settings.getByRole('checkbox').count(), 0)
  await page.screenshot({ path: join(out, 'screenshots/merge-default.png') })
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 700))
  for (const [locale, language, label] of [
    ['en', 'English', 'Merge and start sync'], ['ja', '日本語', '統合して同期を開始'],
    ['es', 'Español', 'Unir e iniciar la sincronización'], ['fr', 'Français', 'Fusionner et lancer la synchronisation'],
    ['zh', '简体中文', '合并并开始同步'],
  ]) {
    await settings.locator('.settings-nav button').first().click()
    await settings.locator('.settings-select').click()
    await page.getByRole('option', { name: language, exact: true }).click()
    await settings.locator('.settings-nav button').nth(syncIndex).click()
    await settings.getByRole('button', { name: label, exact: true }).waitFor()
    const size = await settings.locator('.sync-pane').evaluate(node => ({ width: node.clientWidth, content: node.scrollWidth }))
    assert(size.content <= size.width + 1, `Merge copy overflows in ${locale}`)
    await page.screenshot({ path: join(out, `screenshots/merge-${locale}.png`) })
  }
  report.checks.push('Merge action and guidance fit the minimum window in all five languages')
  await settings.getByText('其他选项', { exact: true }).click()
  const replace = settings.getByRole('button', { name: '使用另一台电脑的看板', exact: true })
  assert.equal(await replace.isEnabled(), false)
  await settings.getByRole('checkbox').check(); assert.equal(await replace.isEnabled(), true)
  await settings.getByText('其他选项', { exact: true }).click()
  await settings.getByText('其他选项', { exact: true }).click()
  assert.equal(await replace.isEnabled(), false)
  await page.screenshot({ path: join(out, 'screenshots/replace-acknowledgement.png') })
  report.checks.push('Paused/restored join requires a decision; merge needs no checkbox; replacement is secondary and acknowledgement resets')
  await settings.getByRole('button', { name: '合并并开始同步', exact: true }).click()
  await pollPage(page, async () => (await window.goalloom.sync({ type: 'status' })).status.phase === 'ready')
  report.ok = true
} catch (error) {
  report.error = error?.stack ?? String(error)
  if (page) await page.screenshot({ path: join(out, 'screenshots/failure.png') }).catch(() => {})
  throw error
} finally {
  await writeFile(join(out, 'native.json'), JSON.stringify(report, null, 2))
  await application?.close().catch(() => {})
  for (const file of await readdir('out/main')) if (file.startsWith('sync-join-')) await unlink(join('out/main', file))
  await rm(root, { recursive: true, force: true })
}
