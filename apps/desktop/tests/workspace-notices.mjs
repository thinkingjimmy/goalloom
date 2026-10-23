/**
 * [INPUT]: Production Electron/IPC, an isolated workspace and controlled query/transport failures.
 * [OUTPUT]: Repeatable bottom-left/trailing-primary geometry, modal recovery, duplicate-write and locale/theme evidence.
 * [POS]: Shared notification E2E; SQLite writes and receipts remain authoritative, system notice conditions are synthetic.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'
import { pollPage } from './fixtures/poll.mjs'

const out = 'output/tests/workspace-notices'
const profile = await mkdtemp(join(tmpdir(), 'goalloom-notices-'))
await mkdir(out, { recursive: true })
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env, timeout: 30_000 })
const report = { passed: false, runtime: null, host: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machine: 'Physical/VM status not independently verified' }, checks: [], screenshots: [], geometry: [], errors: [], scope: 'Production source Electron, renderer, preload and SQLite; controlled IPC faults and system conditions. No user profile, live sync, packaged or Windows acceptance.' }
let page
try {
  page = await app.firstWindow()
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('dialog', dialog => dialog.accept())
  await page.setViewportSize({ width: 1280, height: 840 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await finishSetup(page)
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const id = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const reply = await window.goalloom.execute({ type: 'create', title: 'Notification acceptance', horizon: 'day', generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result.itemId
  })
  await page.locator(`#item-${id}`).waitFor()
  await app.evaluate(({ ipcMain }) => {
    const query = ipcMain._invokeHandlers.get('goalloom:query'), execute = ipcMain._invokeHandlers.get('goalloom:command')
    const probe = globalThis.noticeProbe = { mode: 'error', receiptBlocked: false, hold: false, calls: [], flags: {}, message: 'Synthetic write failure. Your changes have not been saved.' }
    ipcMain.removeHandler('goalloom:query')
    ipcMain.handle('goalloom:query', async (event, input) => {
      if (input.type === 'receipt') {
        if (probe.receiptBlocked) throw Error('Synthetic unavailable receipt')
        if (probe.hold) await new Promise(resolve => { probe.release = resolve })
      }
      const value = await query(event, input)
      if (input.type === 'snapshot') {
        if (probe.flags.clock) value.workspace.clockAnomaly = true
        if (probe.flags.restore) value.workspace.pausedAfterRestore = true
        if (probe.flags.backup) value.backupError = probe.flags.backup
        if (probe.flags.zone) value.workspace.calendar.timezone = probe.flags.zone
        if (probe.flags.theme) value.workspace.theme = probe.flags.theme
        if (probe.flags.style) value.workspace.style = probe.flags.style
      }
      return value
    })
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command', async (event, input) => {
      if (input.type !== 'status') return execute(event, input)
      probe.calls.push(input.operationId)
      if (probe.mode === 'error') return { ok: false, code: 'storage', message: probe.message }
      if (probe.mode === 'uncommitted') throw Error('Synthetic missing transport reply before commit')
      const reply = await execute(event, input)
      if (probe.mode === 'unknown') throw Error('Synthetic lost committed reply')
      return reply
    })
  })
  const notice = page.locator('.error-banner'), cards = page.locator('.workspace-notice')
  const toggle = () => page.locator(`#item-${id} .check`).click()
  const refresh = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('goalloom:changed', null))
  const shot = async name => { const path = `${out}/${name}.png`; await page.screenshot({ path }); report.screenshots.push(path) }
  const measure = () => page.evaluate(() => {
    const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } }
    return { board: box('.board'), stack: box('.workspace-notices'), card: box('.workspace-notice'), fab: box('.fab'), width: innerWidth, height: innerHeight }
  })
  const before = await page.locator('.board').boundingBox()
  await toggle(); await notice.waitFor()
  assert.deepEqual(await page.locator('.board').boundingBox(), before, 'Notices do not resize the board')
  assert.equal(await notice.locator('button').count(), 1, 'Definitive failure offers only dismissal')
  await notice.locator('button').click(); await notice.waitFor({ state: 'detached' })
  report.checks.push('Dismissible definitive error; no invented retry; unchanged board geometry')

  await app.evaluate(() => { const p = globalThis.noticeProbe; p.mode = 'unknown'; p.receiptBlocked = true; p.calls = [] })
  await toggle(); await notice.waitFor()
  assert.equal(await notice.locator('.workspace-notice-dismiss').count(), 0)
  assert.equal(await notice.locator('[aria-expanded]').count(), 0)
  const geometry = await measure()
  assert(geometry.card.width <= 360 && geometry.card.x < 40 && geometry.card.x >= 0)
  assert(geometry.height - geometry.card.bottom < 40, 'Notification sits at the bottom left')
  assert(geometry.card.right < geometry.fab.x, 'Notification clears the new-item button')
  assert(await notice.locator('.workspace-notice-action').evaluate(button => {
    const card = button.closest('.workspace-notice'), edge = card.getBoundingClientRect().right - button.getBoundingClientRect().right
    return edge > 0 && edge < 18 && getComputedStyle(button).backgroundColor === getComputedStyle(card).color
  }), 'The filled primary action aligns to the card trailing edge')
  assert.equal(await notice.locator('.workspace-notice-action svg').count(), 0)
  report.geometry.push(geometry)
  await shot('pending-bottom-left-primary')
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('dialog:modal .feedback-layer .error-banner'))
  await app.evaluate(() => { const p = globalThis.noticeProbe; p.receiptBlocked = false; p.hold = true })
  await notice.getByRole('button', { name: '重试核对', exact: true }).click()
  await notice.getByRole('button', { name: '核对中…', exact: true }).waitFor()
  assert(await notice.locator('button').isDisabled())
  assert.equal(await notice.locator('button').getAttribute('aria-busy'), 'true')
  await shot('checking-in-settings')
  await app.evaluate(() => { const p = globalThis.noticeProbe; p.hold = false; p.release() })
  await notice.waitFor({ state: 'detached' })
  assert.equal(await app.evaluate(() => globalThis.noticeProbe.calls.length), 1)
  assert.equal((await page.evaluate(id => window.goalloom.getItem(id), id)).item.status, 'done')
  await page.locator('dialog:modal').getByRole('button', { name: '关闭', exact: true }).click()
  report.checks.push('Persistent pending receipt has no close/fold; recovery stays interactive in a native modal; checking disables duplicates; one authoritative write')

  await app.evaluate(() => { const p = globalThis.noticeProbe; p.mode = 'uncommitted'; p.receiptBlocked = true })
  await toggle(); await notice.waitFor()
  await app.evaluate(() => { const p = globalThis.noticeProbe; p.mode = 'error'; p.receiptBlocked = false })
  await notice.getByRole('button', { name: '重试核对', exact: true }).click()
  await notice.locator('.workspace-notice-dismiss').waitFor()
  assert.equal(await notice.locator('.workspace-notice-action').count(), 0)
  await notice.locator('.workspace-notice-dismiss').click()
  report.checks.push('Definitive recovery failure replaces the pending lock with a dismissible error')

  await app.evaluate(() => { const p = globalThis.noticeProbe; p.flags = { clock: true, restore: true, backup: 'Synthetic backup failure: the backup folder is unavailable.', zone: 'Pacific/Honolulu' }; p.mode = 'error' })
  await refresh()
  await pollPage(page, () => document.querySelectorAll('.workspace-notice').length === 4)
  assert.equal(await cards.locator('.workspace-notice-action').count(), 3)
  assert.equal(await cards.locator('.workspace-notice-dismiss').count(), 2)
  await shot('system-notices')
  await cards.filter({ hasText: 'Synthetic backup' }).locator('.workspace-notice-dismiss').click()
  await cards.filter({ hasText: 'Pacific/Honolulu' }).locator('.workspace-notice-dismiss').click()
  await refresh()
  await pollPage(page, () => document.querySelectorAll('.workspace-notice').length === 2)
  await page.reload(); await page.locator('.board').waitFor()
  assert.equal(await cards.count(), 2, 'Condition-token dismissals survive reload')
  await app.evaluate(() => { globalThis.noticeProbe.flags.backup = 'Changed backup failure'; globalThis.noticeProbe.flags.zone = 'Europe/Paris' })
  await refresh(); await pollPage(page, () => document.querySelectorAll('.workspace-notice').length === 4)
  report.checks.push('Clock/restore retain confirmations; timezone/backup dismissal survives refresh/reload and changed conditions return')

  for (const locale of ['zh', 'en', 'ja', 'es', 'fr']) {
    await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
    await page.reload()
    await page.waitForFunction(locale => document.documentElement.lang.startsWith(locale), locale)
    for (const theme of ['light', 'dark']) {
      await app.evaluate((_, theme) => { globalThis.noticeProbe.flags.theme = theme }, theme)
      await refresh(); await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme)
      await shot(`${locale}-${theme}`)
      const bounds = await measure(); report.geometry.push({ locale, theme, ...bounds })
      assert(bounds.card.right <= bounds.width && bounds.stack.y >= 72)
    }
  }
  for (const style of ['minimal']) {
    await app.evaluate((_, style) => { globalThis.noticeProbe.flags.style = style }, style)
    await refresh(); await page.waitForFunction(style => document.documentElement.dataset.style === style, style)
    await shot(`${style}-dark`)
  }
  await page.setViewportSize({ width: 736, height: 480 })
  await shot('short-window-scroll')
  assert(await page.locator('.workspace-notices').evaluate(node => node.scrollHeight > node.clientHeight))
  await page.locator('.workspace-notices').evaluate(node => { node.scrollTop = node.scrollHeight })
  assert(await cards.last().isVisible())
  await page.setViewportSize({ width: 1280, height: 840 })
  await page.evaluate(() => window.goalloom.setLanguage('zh'))
  await page.reload(); await page.locator('.board').waitFor()
  await app.evaluate(() => { globalThis.noticeProbe.flags = {} })
  await refresh(); await pollPage(page, () => document.querySelectorAll('.workspace-notice').length === 0)
  await page.locator(`#item-${id} .task-title`).click()
  await page.locator('dialog:modal .detail-title-display').waitFor()
  await page.locator('dialog:modal .detail-management').getByRole('button', { name: '删除', exact: true }).click()
  await page.locator('.toast').waitFor()
  await app.evaluate(() => { globalThis.noticeProbe.flags.backup = 'Coexisting backup notice' })
  await refresh(); await cards.waitFor()
  assert(await page.locator('.toast').evaluate(node => {
    const toast = node.getBoundingClientRect(), card = document.querySelector('.workspace-notice').getBoundingClientRect()
    return card.bottom + 8 <= toast.top
  }))
  await shot('notice-and-toast')
  report.checks.push('Five locales and both themes wrap completely; short-window stack scrolls; Toast and notice remain separate')
  assert.deepEqual(report.errors, [])
  report.passed = true
} catch (error) {
  report.failure = String(error.stack ?? error)
  report.input = await page?.evaluate(() => ({ focus: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML.slice(0, 500) })).catch(() => null)
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => undefined)
  throw error
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
  await app.close()
  await rm(profile, { recursive: true, force: true })
}
