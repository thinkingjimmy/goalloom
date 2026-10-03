/**
 * [INPUT]: Real Electron (source build or a packaged app path), an isolated profile, the macOS app menu and main-process update events.
 * [OUTPUT]: About page identity/version, app-menu routing and re-targeting, update phases in Settings, top-bar dot and menu relabelling; output/tests/updates/.
 * [POS]: Desktop acceptance for Settings › About and the update UI. Update phases are pushed through the production event channel from main;
 *        the real download/install loop lives in update-install.mjs.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { finishSetup } from './fixtures/setup.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { arch, platform, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const out = 'output/tests/updates'
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2], profile = await mkdtemp(join(tmpdir(), 'goalloom-updates-'))
const { version } = JSON.parse(await readFile('package.json', 'utf8'))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
await mkdir(out, { recursive: true })
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
const checks = [], errors = [], screenshots = []
const check = label => checks.push(label)
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await finishSetup(page)
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  const shot = async name => { const path = `${out}/${name}.png`; await page.screenshot({ path }); screenshots.push(path) }
  const settings = () => page.getByRole('dialog', { name: '设置与数据', exact: true })
  const gear = page.locator('.settings-toggle')
  const push = state => application.evaluate(({ BrowserWindow }, info) => BrowserWindow.getAllWindows()[0].webContents.send('goalloom:update-state', info), { version, state })
  const menu = () => application.evaluate(({ Menu }) => Menu.getApplicationMenu().items[0].submenu.items.map(item => item.label))
  const clickMenu = index => application.evaluate(({ Menu }, index) => Menu.getApplicationMenu().items[0].submenu.items[index].click(), index)

  // --- Idle: no dot, plain label. ---
  assert.equal(await gear.getAttribute('aria-label'), '设置与数据')
  assert.equal(await page.locator('.update-dot').count(), 0)
  check('no update: gear has no dot and keeps its plain name')

  // --- App menu → Settings › About with the real version and bundled icon. ---
  if (process.platform === 'darwin') {
    assert.deepEqual((await menu()).slice(0, 2), ['关于 Goalloom', '检查更新…'])
    await clickMenu(0)
  } else await gear.click()
  const dialog = settings()
  await dialog.waitFor()
  await dialog.getByRole('heading', { name: '关于', exact: true }).waitFor()
  await dialog.getByRole('heading', { name: 'Goalloom', exact: true }).waitFor()
  assert.equal(await dialog.locator('.about-version').textContent(), version)
  assert.equal(await dialog.locator('.about-version').getAttribute('title'), `版本 ${version}`)
  const icon = await dialog.locator('.about-hero img').evaluate(image => ({ loaded: image.complete && image.naturalWidth > 0, width: image.naturalWidth }))
  assert(icon.loaded, 'About icon failed to load')
  const status = dialog.getByRole('status').filter({ hasText: packaged ? /./ : '开发版本不检查更新' })
  await status.waitFor()
  if (!packaged) assert.equal(await dialog.getByRole('button', { name: '检查更新', exact: true }).count(), 0)
  await shot('about')
  check(`${process.platform === 'darwin' ? 'app menu About' : 'gear'} opens Settings › About with version ${version} and a ${icon.width}px icon`)

  // --- Downloading: nav meta + gear dot, check disabled. ---
  await push({ phase: 'downloading', version: '9.9.9', percent: 42 })
  await dialog.getByText('正在下载 9.9.9 · 42%', { exact: true }).waitFor()
  await dialog.locator('.settings-nav-meta[data-dot="update"]', { hasText: '新版本' }).waitFor()
  assert(await dialog.getByRole('button', { name: '检查更新', exact: true }).isDisabled())
  check('downloading: progress text, nav “新版本” dot, check disabled')

  // --- Re-targeting: About from the menu while Settings shows another section. ---
  await dialog.getByRole('button', { name: '外观', exact: true }).click()
  await dialog.getByRole('heading', { name: '外观', exact: true }).waitFor()
  if (process.platform === 'darwin') {
    await clickMenu(0)
    await dialog.getByRole('heading', { name: '关于', exact: true }).waitFor()
    check('app menu About re-targets an open Settings dialog')
  }
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  await page.locator('.update-dot').waitFor()
  assert.equal(await gear.getAttribute('aria-label'), '设置与数据（有新版本）')
  await page.locator('.titlebar').screenshot({ path: `${out}/topbar-dot.png` }); screenshots.push(`${out}/topbar-dot.png`)
  check('gear shows the red dot and announces the update')

  // --- Ready: restart button; the gear alone does not jump sections. ---
  await push({ phase: 'ready', version: '9.9.9' })
  await gear.click()
  await dialog.getByRole('heading', { name: '外观', exact: true }).waitFor()
  await dialog.getByRole('button', { name: /^关于/ }).click()
  await dialog.getByText('9.9.9 已下载，重启即可完成更新', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: '重启并更新', exact: true }).waitFor()
  await shot('about-ready')
  check('ready: restart-to-update action')

  // --- Background failure is silent; latest shows the check time. ---
  await push({ phase: 'latest', checkedAt: new Date().toISOString() })
  await dialog.getByText(/^已是最新版本 · \d{2}:\d{2} 检查$/).waitFor()
  await dialog.getByRole('button', { name: '检查更新', exact: true }).waitFor()
  assert.equal(await page.locator('.update-dot').count(), 0)
  await push({ phase: 'failed' })
  await dialog.getByText('检查更新失败，请确认网络后重试', { exact: true }).waitFor()
  check('latest clears the dot; manual failure explains itself')
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()

  // --- The native menu follows an explicit language change. ---
  if (process.platform === 'darwin') {
    await page.evaluate(() => window.goalloom.setLanguage('en'))
    assert.deepEqual((await menu()).slice(0, 2), ['About Goalloom', 'Check for Updates…'])
    await page.evaluate(() => window.goalloom.setLanguage('zh'))
    check('app menu relabels after a language change')
  }
  assert.deepEqual(errors, [])
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  await writeFile(`${out}/report.json`, JSON.stringify({ ok: true, packaged: Boolean(packaged), version, runtime, environment: { platform: platform(), release: release(), arch: arch() }, checks, screenshots }, null, 2))
  console.log(JSON.stringify({ ok: true, checks: checks.length, report: `${out}/report.json` }))
} finally {
  await application.close()
}
