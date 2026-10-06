/**
 * [INPUT]: Built Electron, isolated annual direction with review hints disabled, and native column/locale controls.
 * [OUTPUT]: Five-locale single-row return icons, pointer/keyboard guidance and action geometry; --return-icons saves separate evidence and --baseline records existing failures.
 * [POS]: Native period-header/empty-card regression, including touch targets and keyboard return; included by flow-insight acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, release, tmpdir, version } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'
import { stepPeriod } from './fixtures/period-step.mjs'

const baseline = process.argv.includes('--baseline')
const packaged = process.argv.slice(2).find(argument => !argument.startsWith('--'))
const out = resolve(process.argv.includes('--return-icons') ? 'output/tests/period-return' : 'output/tests/empty-card-layout', baseline ? 'baseline' : 'native')
const profile = await mkdtemp(join(tmpdir(), 'goalloom-empty-layout-'))
await mkdir(out, { recursive: true })
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment })
const report = { baseline, packaged: Boolean(packaged), passed: false, measurements: [], hints: [], failures: [], screenshots: [],
  platform: { os: version(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: 'Host OS reported; physical/VM status not independently verified' },
  scope: 'Production IPC/SQLite and isolated synthetic data; packaged/Windows acceptance only when explicitly run there.' }
const record = (ok, label) => { if (!ok) report.failures.push(label) }
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => report.failures.push(error.message))
  await page.evaluate(() => {
    window.returnPointerInputs = []
    for (const type of ['pointermove', 'pointerover', 'pointerout']) document.addEventListener(type, event => {
      const target = event.target instanceof Element ? event.target.closest('[data-return-current]') : null
      window.returnPointerInputs.push({ type, x: event.clientX, y: event.clientY, pointerType: event.pointerType, label: target?.getAttribute('aria-label'), at: performance.now() })
      if (window.returnPointerInputs.length > 40) window.returnPointerInputs.shift()
    }, true)
  })
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 840))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const start = await page.evaluate(() => Temporal.Now.zonedDateTimeISO('UTC').toPlainDate().add({ days: 7 }).subtract({ months: 12 }).toString())
  await finishSetup(page, { timezone: 'UTC', anchor: start, direction: 'Layout annual direction' })
  // Period-end guides must not replace the empty cards when this fixture runs on another date.
  await page.locator('.settings-toggle').click()
  const settings = page.locator('dialog.settings-modal')
  await settings.getByRole('button', { name: 'Insight', exact: true }).click()
  await settings.getByRole('switch', { name: 'Weekly · monthly review', exact: true }).click()
  await page.keyboard.press('Escape'); await settings.waitFor({ state: 'detached' })
  const column = horizon => page.locator(`.board-column[data-horizon="${horizon}"]`)
  const half = column('half')
  await half.locator('.insight-empty').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const selectLocale = async locale => {
    await page.locator('.settings-toggle').click()
    const settings = page.locator('dialog.settings-modal')
    await settings.locator('.settings-select').click()
    const names = { en: 'English', ja: '日本語', es: 'Español', fr: 'Français', zh: '简体中文' }
    await page.getByRole('option', { name: names[locale], exact: true }).click()
    await page.waitForFunction(locale => document.documentElement.lang.startsWith(locale), locale)
    await page.keyboard.press('Escape'); await settings.waitFor({ state: 'detached' })
  }
  const measure = async (horizon, locale, label, { card = true } = {}) => {
    const target = column(horizon)
    await target.scrollIntoViewIfNeeded()
    await target.hover()
    const geometry = await target.evaluate((node, card) => {
      const box = element => { const rect = element.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, height: rect.height, width: rect.width } }
      const returnButton = node.querySelector('[data-return-current]')
      const luminance = color => {
        const rgb = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722
      }
      const foreground = returnButton && luminance(getComputedStyle(returnButton).color), background = luminance(getComputedStyle(document.body).backgroundColor)
      const title = node.querySelector('.period-title'), date = node.querySelector('.column-meta')
      const header = node.querySelector('.column-header')
      const buttons = card ? [...node.querySelectorAll('.insight-empty-actions button')].map(button => {
        const rect = box(button)
        return { ...rect, text: button.textContent, overflow: button.scrollWidth > button.clientWidth + 1,
          hit: button.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) }
      }) : []
      return { column: box(node), title: { ...box(title), text: title.textContent, clipped: title.scrollWidth > title.clientWidth + 1 },
        date: date && { ...box(date), text: date.textContent, fullDate: date.getAttribute('title'), clipped: date.scrollWidth > date.clientWidth + 1 },
        return: returnButton && { ...box(returnButton), label: returnButton.getAttribute('aria-label'), text: returnButton.textContent, icons: returnButton.querySelectorAll('svg').length, background: getComputedStyle(returnButton).backgroundColor,
          contrast: (Math.max(foreground, background) + .05) / (Math.min(foreground, background) + .05) },
        add: box(header.querySelector('.column-add-slot')), buttons }
    }, card)
    report.measurements.push({ horizon, locale, label, ...geometry })
    record(!geometry.return || geometry.return.label && geometry.return.icons === 1 && geometry.return.text === '', `${label}: named icon-only return`)
    record(!geometry.return || geometry.return.right <= geometry.add.left + 1, `${label}: return and add do not overlap`)
    record(!geometry.title.clipped, `${label}: complete period title`)
    record(!geometry.date?.clipped || Boolean(geometry.date.fullDate), `${label}: constrained dates retain the complete tooltip`)
    record(locale !== 'en' || !geometry.date?.clipped, `${label}: English dates remain complete`)
    record(!geometry.return || Math.abs(geometry.return.top + geometry.return.height / 2 - geometry.title.top - geometry.title.height / 2) < 3, `${label}: single-row header`)
    record(!geometry.return || geometry.return.background === 'rgba(0, 0, 0, 0)', `${label}: quiet return without a permanent fill`)
    record(!geometry.return || geometry.return.contrast >= 3, `${label}: readable return icon contrast`)
    if (card) {
      record(geometry.buttons.length === 2, `${label}: two actions`)
      record(geometry.buttons.every(button => !button.overflow && button.hit), `${label}: readable, clickable actions`)
      record(Math.abs(geometry.buttons[0].top - geometry.buttons[1].top) < 1, `${label}: same-row actions`)
      record(Math.abs(geometry.buttons[0].height - geometry.buttons[1].height) < 1, `${label}: equal-height actions`)
      record(geometry.buttons[1].right <= geometry.column.right - 14, `${label}: actions stay in their column`)
    }
    const path = join(out, `${label}.png`)
    await target.screenshot({ path })
    report.screenshots.push(path)
    if (label === 'future-half-en') {
      const compact = join(out, 'future-half-en-compact.png')
      await page.screenshot({ path: compact, clip: { ...await target.boundingBox(), height: 340 } })
      report.screenshots.push(compact)
    }
    if (geometry.return) {
      const action = target.locator('[data-return-current]'), tip = page.locator('.period-return-tooltip [role="tooltip"]')
      await action.hover(); await tip.waitFor({ state: 'visible' })
      assert.equal(await tip.innerText(), geometry.return.label)
      const hint = await tip.evaluate(node => {
        const rect = node.getBoundingClientRect()
        return { text: node.textContent, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewport: { width: innerWidth, height: innerHeight } }
      })
      record(hint.left >= 0 && hint.right <= hint.viewport.width && hint.top >= 0 && hint.bottom <= hint.viewport.height, `${label}: complete on-screen hint`)
      await target.locator('[data-period-switch]').focus()
      await page.keyboard.press('Tab')
      assert(await action.evaluate(node => node === document.activeElement), `${label}: keyboard can reach return`)
      await tip.waitFor({ state: 'visible' })
      assert.equal(await action.getAttribute('aria-describedby'), await tip.getAttribute('id'))
      assert.equal(await tip.innerText(), geometry.return.label)
      const periodId = await target.getAttribute('data-period-id')
      await page.keyboard.press('Escape'); await tip.waitFor({ state: 'detached' })
      assert.equal(await target.getAttribute('data-period-id'), periodId, `${label}: Escape dismisses only the hint`)
      report.hints.push({ label, keyboardReachable: true, escapePreservesPeriod: true, ...hint })
    }
  }
  for (const locale of ['en', 'ja', 'es', 'fr', 'zh']) {
    if (locale !== 'en') await selectLocale(locale)
    await measure('half', locale, `future-half-${locale}`)
    for (const horizon of ['year', 'cycle', 'month', 'week', 'day']) {
      const target = column(horizon), current = await target.getAttribute('data-period-mode') === 'current'
      if (current) await stepPeriod(target, 'next')
      await page.waitForFunction(horizon => document.querySelector(`[data-horizon="${horizon}"]`)?.getAttribute('aria-busy') === 'false', horizon)
      await measure(horizon, locale, `future-${horizon}-${locale}`, { card: false })
    }
  }
  await selectLocale('en')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, configuration: 'mobile' })
  assert(await page.evaluate(() => matchMedia('(pointer: coarse)').matches))
  await half.scrollIntoViewIfNeeded()
  const touch = await half.locator('.column-header').evaluate(node => [...node.querySelectorAll('[data-return-current], [data-add-item]')].map(button => {
    const rect = button.getBoundingClientRect()
    return { label: button.getAttribute('aria-label'), width: rect.width, height: rect.height, top: rect.top }
  }))
  assert(touch.every(button => button.width >= 44 && button.height >= 44), 'Touch return/add controls have full hit targets')
  assert.equal(touch[0].top, touch[1].top, 'Touch controls stay on one row')
  report.touch = { capabilityEmulated: true, buttons: touch }
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false })
  await cdp.detach()
  for (const horizon of ['year', 'half', 'cycle', 'month', 'week', 'day']) {
    if (await column(horizon).locator('[data-return-current]').count()) {
      if (horizon === 'half') { await column(horizon).locator('[data-return-current]').focus(); await page.keyboard.press('Enter') }
      else await column(horizon).locator('[data-return-current]').click()
    }
    assert.equal(await column(horizon).getAttribute('data-period-mode'), 'current', `${horizon} returns to its current period`)
    assert.equal(await column(horizon).locator('[data-return-current]').count(), 0, `${horizon} current periods have no return control`)
  }
  for (const horizon of ['year', 'half', 'cycle', 'month', 'week']) {
    const reply = await page.evaluate(async horizon => {
      const state = await window.goalloom.getSnapshot()
      return window.goalloom.execute({ type: 'create', horizon, title: `Layout ${horizon} source`, generation: state.workspace.generation, operationId: crypto.randomUUID() })
    }, horizon)
    assert(reply.ok, reply.message)
    const target = { year: 'half', half: 'cycle', cycle: 'month', month: 'week', week: 'day' }[horizon]
    await column(target).locator('.insight-empty').waitFor()
    await measure(target, 'en', `current-${target}-en`)
  }
  report.passed = report.failures.length === 0
  if (!baseline) assert.deepEqual(report.failures, [])
  console.log(`${baseline ? 'Baseline' : 'Verified'} empty-card layout: ${report.measurements.length} native measurements, ${report.failures.length} failures`)
} catch (error) {
  report.error = error.message
  const page = await application.firstWindow()
  report.nativeWindows = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() }))).catch(() => null)
  report.diagnostics = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML,
    hover: matchMedia('(hover: hover)').matches, coarse: matchMedia('(pointer: coarse)').matches, pointers: window.returnPointerInputs,
    controls: [...document.querySelectorAll('[data-return-current]')].map(button => ({ label: button.getAttribute('aria-label'), disabled: button.disabled, hovered: button.matches(':hover'),
      columnHovered: button.closest('[data-horizon]').matches(':hover'), focusVisible: button.matches(':focus-visible'), bounds: button.getBoundingClientRect().toJSON() })) })).catch(() => null)
  await page.screenshot({ path: join(out, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
  await application.close()
  await rm(profile, { recursive: true, force: true })
}
