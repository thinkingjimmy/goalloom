/**
 * [INPUT]: Built Electron, isolated profiles, real workspace dates and production IPC/storage.
 * [OUTPUT]: Deadline-calendar interaction reports and localized/theme screenshots under output/tests/due-calendar/.
 * [POS]: Native desktop acceptance of immediate detail date persistence, keyboard navigation, focus, clipping and persistence.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { waitForDetailSave } from './fixtures/detail-save.mjs'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release, tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'

const out = resolve('output/tests/due-calendar')
await mkdir(out, { recursive: true })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2]
const report = { ok: false, packaged: Boolean(packaged), host: { os: release(), platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model }, checks: [], locales: {}, themes: [] }
const check = label => { report.checks.push(label); console.log(`✓ ${label}`) }
const shift = (value, count) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + count); return date.toISOString().slice(0, 10) }

for (const weekStart of [1, 7]) {
  const profile = await mkdtemp(join(tmpdir(), 'goalloom-deadline-'))
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
  const application = await electron.launch({ ...options, env, timeout: 30_000 })
  let page
  try {
    page = await application.firstWindow()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.getByRole('button', { name: '先跳过', exact: true }).click()
    await page.getByRole('combobox', { name: '一周从哪天开始', exact: true }).click()
    await page.getByRole('option').nth(weekStart - 1).click()
    await page.getByRole('button', { name: '确认并开始', exact: true }).click()
    await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
    await page.getByRole('main', { name: '时间看板' }).waitFor()
    report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
    const itemId = await page.evaluate(async () => {
      const snapshot = await window.goalloom.getSnapshot()
      const reply = await window.goalloom.execute({ type: 'create', title: 'Deadline sample', horizon: 'later', dueDate: '2028-01-31', generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw Error(reply.message)
      return reply.result.itemId
    })
    const stored = () => page.evaluate(async id => (await window.goalloom.getItem(id)).item, itemId)
    await page.reload()
    await page.getByRole('button', { name: 'Deadline sample', exact: true }).click()
    const detail = page.locator('dialog.detail'), trigger = detail.locator('.field-button[aria-haspopup="dialog"]')
    const panel = detail.locator('.due-panel'), selected = panel.locator('[data-date="2028-01-31"]')
    const focusedDate = () => page.evaluate(() => document.activeElement?.getAttribute('data-date'))
    const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
    const today = snapshot.periods.find(period => period.horizon === 'day').startDate
    const placement = (await stored()).placement
    await trigger.click()
    await selected.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-date') === '2028-01-31')
    assert.equal(await panel.locator('input[type="date"]').count(), 0)
    assert.equal(await panel.locator('.due-day[tabindex="0"]').count(), 1)
    assert.equal(await panel.getByRole('columnheader').first().getAttribute('aria-label'), weekStart === 1 ? '星期一' : '星期日')
    assert.equal(await selected.getAttribute('data-selected'), 'true')
    await selected.press('Home')
    assert.equal(await focusedDate(), weekStart === 1 ? '2028-01-31' : '2028-01-30')
    await page.keyboard.press('End')
    assert.equal(await focusedDate(), weekStart === 1 ? '2028-02-06' : '2028-02-05')
    await panel.screenshot({ path: `${out}/week-start-${weekStart}.png` })
    check(`weekStart ${weekStart}: selected-date focus, one tab stop and Home/End follow the workspace week`)
    await page.keyboard.press('Escape')
    assert.equal(await detail.count(), 1)
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true)
    if (weekStart === 7) { assert.deepEqual(errors, []); continue }

    await trigger.click()
    await selected.press('PageDown')
    assert.equal(await focusedDate(), '2028-02-29')
    await page.keyboard.press('Shift+PageDown')
    assert.equal(await focusedDate(), '2029-02-28')
    await page.keyboard.press('Shift+PageUp')
    assert.equal(await focusedDate(), '2028-02-28')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Enter')
    await panel.waitFor({ state: 'detached' })
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true)
    await waitForDetailSave(page)
    await pollPage(page, async id => (await window.goalloom.getItem(id)).item.dueDate === '2028-02-29', itemId)
    assert.deepEqual((await stored()).placement, placement)
    check('month/year keys clamp at leap boundaries; Enter autosaves the selected date and preserves placement')

    await trigger.click()
    await panel.evaluate(element => {
      const events = window.dueHintTrace = []
      const record = (kind, event) => events.push({ kind, key: event?.key, focused: document.hasFocus(), tooltip: !!element.querySelector('[role=tooltip]'), active: document.activeElement?.className, at: performance.now() })
      const info = element.querySelector('.due-info')
      for (const kind of ['pointerenter', 'pointerleave']) info.addEventListener(kind, event => record(kind, event))
      element.addEventListener('keydown', event => record('keydown', event), true)
      new MutationObserver(() => record('mutation')).observe(info, { childList: true, subtree: true })
    })
    await panel.getByRole('button', { name: '关于截止日期' }).hover()
    await panel.getByRole('tooltip').waitFor()
    assert.match(await panel.getByRole('tooltip').innerText(), /不会移动任务/)
    // Element screenshots may scroll the floating panel and end hover before Escape; capture without moving its viewport.
    await page.screenshot({ path: `${out}/info-hover.png` })
    await page.keyboard.press('Escape')
    assert.equal(await panel.getByRole('tooltip').count(), 0)
    assert.equal(await panel.count(), 1)
    await panel.getByRole('button', { name: '关于截止日期' }).focus()
    await panel.getByRole('tooltip').waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await panel.getByRole('tooltip').count(), 0)
    assert.equal(await panel.count(), 1)
    await page.keyboard.press('Escape')
    await panel.waitFor({ state: 'detached' })
    assert.equal(await detail.count(), 1)
    check('info supports pointer hover and keyboard focus; Escape dismisses the hint before the calendar')

    await trigger.click()
    await panel.getByRole('button', { name: '选择月份' }).click()
    await panel.getByRole('button', { name: '下一年' }).click()
    await panel.locator('[data-month="4"]').click()
    assert.equal(await focusedDate(), '2029-04-01')
    await panel.getByRole('button', { name: '选择月份' }).click()
    await page.keyboard.press('Escape')
    assert.equal(await panel.locator('.due-month-grid').count(), 0)
    await panel.getByRole('button', { name: '回到今天' }).click()
    assert.equal(await focusedDate(), today)
    assert.equal((await stored()).dueDate, '2028-02-29')
    await panel.getByRole('button', { name: '清除截止日期', exact: true }).click()
    await waitForDetailSave(page)
    await pollPage(page, async id => (await window.goalloom.getItem(id)).item.dueDate === null, itemId)
    await trigger.click()
    assert.equal(await panel.getByRole('button', { name: '清除截止日期', exact: true }).isDisabled(), true)
    await panel.getByRole('button', { name: /^明天 ·/ }).click()
    await waitForDetailSave(page)
    await pollPage(page, async ([id, date]) => (await window.goalloom.getItem(id)).item.dueDate === date, [itemId, shift(today, 1)])
    assert.deepEqual((await stored()).placement, placement)
    check('month chooser, return to today, clear and compact presets preserve immediate detail saving and placement')

    await trigger.click()
    const description = detail.getByRole('textbox', { name: '说明', exact: true })
    const descriptionBounds = await description.boundingBox()
    // The calendar overlays the field's left side; click its exposed right edge.
    await description.click({ position: { x: descriptionBounds.width - 8, y: 8 } })
    await panel.waitFor({ state: 'detached' })
    assert.equal(await detail.getByRole('textbox', { name: '说明', exact: true }).evaluate(node => node === document.activeElement), true)
    check('outside presses close only the calendar and keep focus at the clicked field')

    for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
      await page.evaluate(async ([style, theme]) => {
        const snapshot = await window.goalloom.getSnapshot()
        const reply = await window.goalloom.execute({ type: 'preferences', style, theme, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
        if (!reply.ok) throw Error(reply.message)
      }, [style, theme])
      await page.waitForFunction(([style, theme]) => document.documentElement.dataset.style === style && document.documentElement.dataset.theme === theme, [style, theme])
      await trigger.click()
      await panel.screenshot({ path: `${out}/${style}-${theme}.png` })
      report.themes.push({ style, theme, color: await panel.evaluate(node => getComputedStyle(node).backgroundColor) })
      await page.keyboard.press('Escape')
    }
    check('paper/minimal and light/dark reuse theme tokens')

    for (const locale of ['zh', 'en', 'ja', 'es', 'fr']) {
      await page.evaluate(async locale => { await window.goalloom.setLanguage(locale) }, locale)
      await page.reload()
      await page.getByRole('button', { name: 'Deadline sample', exact: true }).click()
      await trigger.click()
      await panel.getByRole('grid').waitFor()
      const text = await panel.innerText()
      if (['en', 'es', 'fr'].includes(locale)) assert(!/[一-鿿]/.test(text), `${locale} must not contain untranslated Chinese`)
      assert(await panel.locator('.due-info button').getAttribute('aria-label'))
      const bounds = await panel.evaluate(node => ({ width: node.clientWidth, content: node.scrollWidth }))
      assert(bounds.content <= bounds.width, `${locale} has horizontal overflow`)
      await panel.screenshot({ path: `${out}/locale-${locale}.png` })
      report.locales[locale] = { heading: await panel.getAttribute('aria-label'), bounds }
      await page.keyboard.press('Escape')
      await detail.locator('.modal-header .icon-button').last().click()
    }
    check('all five locales render complete labels without horizontal overflow; saved dates survive reload')

    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(720, 540))
    await page.getByRole('button', { name: 'Deadline sample', exact: true }).click()
    await trigger.click()
    const geometry = await panel.evaluate(node => {
      const rect = node.getBoundingClientRect()
      return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight }
    })
    assert(geometry.left >= 0 && geometry.top >= 0 && geometry.right <= geometry.width && geometry.bottom <= geometry.height, JSON.stringify(geometry))
    await panel.locator('.due-calendar-footer button').last().click()
    await panel.screenshot({ path: `${out}/narrow-720.png` })
    report.narrow = geometry
    check('the calendar stays on screen and receives pointer input at the minimum native window size')
    assert.deepEqual(errors, [])
  } catch (error) {
    if (page) {
      await page.screenshot({ path: `${out}/failure.png` }).catch(() => undefined)
      report.failure = { message: String(error), hintTrace: await page.evaluate(() => window.dueHintTrace ?? null).catch(() => null), focus: await page.evaluate(() => ({ active: document.activeElement?.outerHTML, focused: document.hasFocus(), visibility: document.visibilityState })).catch(() => null) }
      await writeFile(`${out}/failure.json`, JSON.stringify(report, null, 2))
    }
    throw error
  } finally { await application.close(); await rm(profile, { recursive: true, force: true }) }
}
report.ok = true
await writeFile(`${out}/calendar-report.json`, JSON.stringify(report, null, 2))
