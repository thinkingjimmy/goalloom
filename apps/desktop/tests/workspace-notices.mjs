/**
 * [INPUT]: Production Electron/IPC, an isolated workspace and controlled query/transport failures.
 * [OUTPUT]: Native Sonner stack/hover states, content-sized geometry, modal recovery and locale/theme evidence.
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
const stackOnly = process.argv.includes('--stack')
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
  await page.locator('#root').waitFor({ state: 'attached' })
  await page.waitForLoadState('load')
  await page.addInitScript(() => {
    window.notificationStyleViolations = []
    document.addEventListener('securitypolicyviolation', event => {
      if (event.effectiveDirective.startsWith('style-src')) window.notificationStyleViolations.push(event.blockedURI)
    })
  })
  await page.reload()
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
        if (probe.flags.generation) value.workspace.generation = probe.flags.generation
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
  const live = '[data-sonner-toast]:not([data-removed="true"])'
  const notice = page.locator(`${live} .error-banner`), cards = page.locator(`${live} .workspace-notice`)
  const toggle = () => page.locator(`#item-${id} .check`).click()
  const refresh = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.send('goalloom:changed', null))
  const shot = async name => { const path = `${out}/${name}.png`; await page.screenshot({ path }); report.screenshots.push(path) }
  const measure = () => page.evaluate(() => {
    const box = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } }
    return { board: box('.board'), stack: box('.workspace-notices'), card: box('[data-sonner-toast]:not([data-removed="true"]) .workspace-notice'), fab: box('.fab'), width: innerWidth, height: innerHeight }
  })
  const expand = async () => {
    await page.locator('[data-sonner-toast][data-front="true"] .feedback-surface').hover()
    await page.waitForFunction(() => [...document.querySelectorAll('[data-sonner-toast]')].every(node => node.dataset.expanded === 'true' || node.dataset.removed === 'true'))
  }
  const assertReadable = async () => {
    await expand()
    const layout = await cards.evaluateAll(nodes => nodes.map(node => {
      const box = node.getBoundingClientRect(), copy = node.querySelector('.workspace-notice-copy'), action = node.querySelector('.workspace-notice-action'), close = node.querySelector('.workspace-notice-dismiss')
      const fits = child => !child || (child.getBoundingClientRect().left >= box.left - 1 && child.getBoundingClientRect().right <= box.right + 1 && (child === close || child.scrollWidth <= child.clientWidth + 1))
      return { width: box.width, fits: [node, copy, action, close].every(fits), wraps: getComputedStyle(copy).whiteSpace === 'pre-wrap', trailing: !action || Math.abs((close ?? node).getBoundingClientRect().right - action.getBoundingClientRect().right) < 52 }
    }))
    assert(layout.every(card => card.width <= 620 && card.fits && card.wraps && card.trailing), JSON.stringify(layout))
  }
  if (!stackOnly) {
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
    report.geometry.push(geometry)
    assert(geometry.card.width <= 620 && Math.abs(geometry.card.x + geometry.card.width / 2 - geometry.width / 2) < 1, JSON.stringify(geometry))
    assert.equal(geometry.height - geometry.card.bottom, 28, 'Notification uses the Undo Toast bottom anchor')
    assert(geometry.card.right < geometry.fab.x, 'Notification clears the new-item button')
    assert(await notice.locator('.workspace-notice-action').evaluate(button => {
      const card = button.closest('.workspace-notice'), edge = card.getBoundingClientRect().right - button.getBoundingClientRect().right
      const action = button.getBoundingClientRect(), copy = card.querySelector('.workspace-notice-copy').getBoundingClientRect()
      return edge > 0 && edge < 18 && action.left >= copy.right && getComputedStyle(button).backgroundColor !== getComputedStyle(card).color
    }), 'The tonal action stays inline at the trailing edge in a wide window')
    assert.equal(await notice.locator('.workspace-notice-action svg').count(), 0)
    report.geometry.push(geometry)
    await shot('pending-bottom-center-toast')
    await page.setViewportSize({ width: 360, height: 640 })
    await assertReadable()
    assert(await notice.locator('.workspace-notice-action').evaluate(button => button.getBoundingClientRect().top >= button.closest('.workspace-notice').querySelector('.workspace-notice-content').getBoundingClientRect().bottom), 'Narrow recovery action moves below the full-width copy')
    await shot('pending-narrow-action-below')
    await page.setViewportSize({ width: 1280, height: 840 })
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
    await pollPage(page, () => document.querySelectorAll('[data-sonner-toast]:not([data-removed="true"]) .workspace-notice').length === 4)
    assert.equal(await cards.locator('.workspace-notice-action').count(), 3)
    assert.equal(await cards.locator('.workspace-notice-dismiss').count(), 2)
    await shot('system-notices')
    await expand()
    await cards.filter({ hasText: 'Synthetic backup' }).locator('.workspace-notice-dismiss').click()
    await cards.filter({ hasText: 'Pacific/Honolulu' }).locator('.workspace-notice-dismiss').click()
    await refresh()
    await pollPage(page, () => document.querySelectorAll('[data-sonner-toast]:not([data-removed="true"]) .workspace-notice').length === 2)
    await page.reload(); await page.locator('.board').waitFor()
    assert.equal(await cards.count(), 2, 'Condition-token dismissals survive reload')
    await app.evaluate(() => { globalThis.noticeProbe.flags.backup = 'Automatic backup could not be completed. The backup folder is unavailable. Check its permissions and available storage before trying again. /Volumes/Workspace/Backups/' + 'long-folder-name/'.repeat(8); globalThis.noticeProbe.flags.zone = 'Europe/Paris' })
    await refresh(); await pollPage(page, () => document.querySelectorAll('[data-sonner-toast]:not([data-removed="true"]) .workspace-notice').length === 4)
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
        await assertReadable()
      }
      await page.setViewportSize({ width: 360, height: 640 })
      await assertReadable()
      assert(await cards.locator('.workspace-notice-action').evaluateAll(buttons => buttons.every(button => button.getBoundingClientRect().top >= button.closest('.workspace-notice').querySelector('.workspace-notice-content').getBoundingClientRect().bottom)))
      await shot(`${locale}-narrow`)
      await page.setViewportSize({ width: 1280, height: 840 })
    }
    for (const style of ['minimal', 'macos']) {
      await app.evaluate((_, style) => { globalThis.noticeProbe.flags.style = style }, style)
      await refresh(); await page.waitForFunction(style => document.documentElement.dataset.style === style, style)
      await shot(`${style}-dark`)
    }
    await page.setViewportSize({ width: 736, height: 320 })
    await expand()
    await shot('short-window-scroll')
    assert(await page.locator('.workspace-notices').evaluate(node => node.scrollHeight > node.clientHeight))
    await page.locator('.workspace-notices').evaluate(node => { node.scrollTop = node.scrollHeight })
    assert(await cards.last().isVisible())
    await page.setViewportSize({ width: 1280, height: 840 })
    await page.evaluate(() => window.goalloom.setLanguage('zh'))
    await page.reload(); await page.locator('.board').waitFor()
    await app.evaluate(() => { globalThis.noticeProbe.flags = {} })
    await refresh(); await pollPage(page, () => document.querySelectorAll('[data-sonner-toast]:not([data-removed="true"]) .workspace-notice').length === 0)
    await page.locator(`#item-${id} .task-title`).click()
    await page.locator('dialog:modal .detail-title-display').waitFor()
    await app.evaluate(() => { globalThis.noticeProbe.flags = { restore: true, zone: 'Pacific/Auckland' } })
    await refresh(); await pollPage(page, () => document.querySelectorAll('[data-sonner-toast]:not([data-removed="true"]) .workspace-notice').length === 2)
    await page.setViewportSize({ width: 736, height: 480 })
    await page.waitForFunction(() => {
      const modal = document.querySelector('dialog.detail:modal'), notices = document.querySelector('.workspace-notices')
      if (!modal || !notices) return false
      const style = getComputedStyle(modal)
      return parseFloat(style.minHeight) <= parseFloat(style.maxHeight) && modal.getBoundingClientRect().bottom + 8 <= notices.getBoundingClientRect().top
    })
    report.geometry.push(await page.locator('dialog.detail:modal').evaluate(node => ({ scenario: 'short-detail-with-persistent-notices', modal: node.getBoundingClientRect().toJSON(), notices: document.querySelector('.workspace-notices').getBoundingClientRect().toJSON(), minHeight: getComputedStyle(node).minHeight, maxHeight: getComputedStyle(node).maxHeight })))
    await shot('short-detail-with-persistent-notices')
    await page.locator('dialog:modal .detail-title-display').click()
    report.checks.push('Short-window detail min/max heights respect persistent feedback clearance and leave modal controls usable')
  }
  await page.setViewportSize({ width: 1280, height: 840 })
  await app.evaluate(() => { globalThis.noticeProbe.flags = {} })
  await refresh(); await pollPage(page, () => document.querySelectorAll('[data-sonner-toast]:not([data-removed="true"]) .workspace-notice').length === 0)
  await page.waitForFunction(() => !document.querySelector('[data-sonner-toast][data-removed="true"]'))
  if (stackOnly) {
    await page.locator(`#item-${id} .task-title`).click()
    await page.locator('dialog:modal .detail-title-display').waitFor()
  }
  await page.locator('dialog:modal .detail-management').getByRole('button', { name: '删除', exact: true }).click()
  await page.locator('.toast').waitFor()
  await app.evaluate(() => { globalThis.noticeProbe.flags.backup = 'Coexisting backup notice' })
  await refresh(); await cards.waitFor()
  await page.mouse.move(5, 5)
  await page.waitForFunction(() => document.querySelectorAll('[data-sonner-toast][data-expanded="false"]:not([data-removed="true"])').length === 2)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.locator('[data-sonner-toast]').evaluateAll(nodes => Promise.all(nodes.flatMap(node => node.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => undefined)))))
  const collapsed = await page.locator('[data-sonner-toast]:not([data-removed="true"])').evaluateAll(nodes => nodes.map(node => ({
    front: node.dataset.front === 'true', width: node.offsetWidth,
    inert: node.querySelector('.feedback-content').inert,
    bottom: node.getBoundingClientRect().bottom,
  })))
  assert.equal(collapsed.filter(card => card.front).length, 1)
  assert(collapsed.every(card => card.width === collapsed[0].width), 'Collapsed silhouettes follow the content-sized front capsule')
  assert(collapsed.filter(card => !card.front).every(card => card.inert), 'Collapsed controls are inert')
  report.geometry.push({ scenario: 'native-collapsed', cards: collapsed })
  await shot('native-stack-collapsed')
  await expand()
  report.motion = await page.locator('[data-sonner-toast]').evaluateAll(nodes => nodes.flatMap(node => node.getAnimations().map(animation => ({
    property: animation.transitionProperty, duration: animation.effect.getComputedTiming().duration,
    frames: animation.effect.getKeyframes().map(frame => ({ transform: frame.transform, opacity: frame.opacity })),
  }))))
  assert(report.motion.some(animation => animation.property === 'transform' && animation.duration > 0), 'Hover uses the native Sonner transform transition')
  await page.locator('[data-sonner-toast]').evaluateAll(nodes => {
    for (const node of nodes) for (const animation of node.getAnimations()) {
      if (animation.transitionProperty !== 'transform') continue
      animation.pause(); animation.currentTime = Number(animation.effect.getComputedTiming().duration) / 2
    }
  })
  await shot('native-stack-hover-midpoint')
  await page.locator('[data-sonner-toast]').evaluateAll(nodes => {
    for (const node of nodes) for (const animation of node.getAnimations({ subtree: true })) animation.finish()
  })
  const expanded = await page.locator('[data-sonner-toast]:not([data-removed="true"])').evaluateAll(nodes => nodes.map(node => ({
    wrapper: node.getBoundingClientRect().toJSON(), surface: node.querySelector('.feedback-surface').getBoundingClientRect().toJSON(),
    index: node.dataset.index, front: node.dataset.front, expanded: node.dataset.expanded,
    style: node.getAttribute('style'), transform: getComputedStyle(node).transform,
  })))
  report.geometry.push({ scenario: 'native-expanded', cards: expanded })
  const surfaces = expanded.map(card => card.surface).sort((a, b) => a.top - b.top)
  assert(surfaces[0].bottom + 8 <= surfaces[1].top && Math.abs(surfaces[0].x + surfaces[0].width / 2 - (surfaces[1].x + surfaces[1].width / 2)) < 1,
    JSON.stringify(expanded))
  assert(await page.locator('.toast').evaluate(node => {
    const notice = document.querySelector('[data-sonner-toast]:not([data-removed="true"]) .workspace-notice'), toast = getComputedStyle(node), card = getComputedStyle(notice)
    const action = getComputedStyle(node.querySelector('.toast-action')), other = getComputedStyle(notice.querySelector('.workspace-notice-action'))
    return ['backgroundColor', 'color', 'boxShadow', 'borderRadius'].every(key => toast[key] === card[key]) && ['backgroundColor', 'color', 'borderRadius'].every(key => action[key] === other[key])
  }), 'Notifications and Undo use the same surface and action treatment')
  assert((await cards.boundingBox()).width < 400, 'Short copy does not stretch to the maximum width')
  await shot('notice-and-toast')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 360, height: 640 })
  assert(await page.locator('.toast-action').evaluate(button => button.getBoundingClientRect().top >= button.closest('.toast').querySelector('.toast-copy').getBoundingClientRect().bottom))
  await shot('notice-and-toast-narrow')
  await app.evaluate(() => { globalThis.noticeProbe.flags.generation = crypto.randomUUID() })
  await refresh()
  await pollPage(page, () => !document.querySelector('[data-sonner-toast]:not([data-removed="true"]) .toast'))
  assert.equal(await page.locator('[data-sonner-toast]:not([data-removed="true"]) .toast-action').count(), 0)
  report.checks.push('A renderer generation transition clears the previous success Toast and its actions; the fixture does not claim storage-replacement acceptance')
  report.checks.push('Native Sonner collapse/hover expansion; rear controls are inert; each expanded capsule fits its content; existing Undo surfaces/actions, five locales, narrow wrapping and short-window scrolling are preserved')
  report.styleViolations = await page.evaluate(() => window.notificationStyleViolations)
  assert.deepEqual(report.styleViolations, [], 'Sonner uses the bundled stylesheet without inline-style CSP violations')
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
