/**
 * [INPUT]: Source Electron, an isolated unconfirmed workspace and the production setup controls.
 * [OUTPUT]: Three-control sentence, automatic timezone, responsive camera, pointer/keyboard/reduced-motion, retained drafts and no-write evidence.
 * [POS]: Calendar-page acceptance owned by workspace.mjs; uses existing Select/Popover/Modal interactions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { chooseLocalStart, reloadDeviceLanguage, setDeviceTimezone, settleSetupStep } from './setup.mjs'

export async function verifyCalendarSentence(page, application) {
  const out = 'output/tests/onboarding-calendar'
  await mkdir(out, { recursive: true })
  const original = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, style: document.documentElement.dataset.style }))
  const size = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize())
  const names = { zh: '简体中文', en: 'English', ja: '日本語', es: 'Español', fr: 'Français' }
  const report = { scope: 'Source Electron with isolated data. No packaged, Windows or live provider acceptance.', runtime: await page.evaluate(() => window.goalloom.getRuntime()), views: [], checks: [] }
  const choose = async (id, index) => {
    await page.locator(id).click()
    await page.getByRole('option').nth(index).click()
    await page.getByRole('listbox').waitFor({ state: 'hidden' })
  }
  const language = async locale => {
    if (await page.evaluate(() => document.documentElement.lang.split('-')[0]) !== locale) {
      await reloadDeviceLanguage(page, locale)
      await chooseLocalStart(page)
    }
  }
  try {
    await chooseLocalStart(page)
    const views = [
      ...Object.keys(names).map(locale => ({ locale, theme: 'light', style: 'paper', width: 1280, height: 840, zoom: 1 })),
      { locale: 'zh', theme: 'dark', style: 'paper', width: 1280, height: 840, zoom: 1 },
      { locale: 'zh', theme: 'light', style: 'minimal', width: 720, height: 540, zoom: 1 },
      { locale: 'en', theme: 'dark', style: 'macos', width: 960, height: 720, zoom: 1 },
      { locale: 'zh', theme: 'light', style: 'paper', width: 720, height: 620, zoom: 1.25 },
    ]
    for (const view of views) {
      await application.evaluate(({ BrowserWindow }, view) => {
        const window = BrowserWindow.getAllWindows()[0]
        window.setContentSize(view.width, view.height); window.webContents.setZoomFactor(view.zoom)
      }, view)
      await language(view.locale)
      await page.evaluate(view => { document.documentElement.dataset.theme = view.theme; document.documentElement.dataset.style = view.style }, view)
      await page.locator('.calendar-entry').evaluate(node => Promise.all(node.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished)))
      const geometry = await page.locator('.calendar-entry').evaluate(node => {
        const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height } }
        const controls = [...node.querySelectorAll('.calendar-sentence .calendar-select')].map(trigger => {
          const icon = trigger.querySelector('.select-icon'), text = trigger.querySelector('.select-value'), box = rect(trigger), arrow = rect(icon), label = rect(text)
          return { ...box, label: trigger.textContent.trim(), arrow, text: label, centerDelta: Math.abs(arrow.y + arrow.height / 2 - box.y - box.height / 2), clipped: text.scrollWidth > text.clientWidth + 1 }
        })
        const viewport = rect(node.querySelector('.setup-scroll')), layout = rect(node.querySelector('.setup-form'))
        return { viewport, layout, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth, controls, sentence: node.querySelector('.calendar-sentence').innerText, form: rect(node.querySelector('.calendar-form')), canvas: rect((node.closest('.onboarding-stage') ?? node).querySelector('.setup-canvas')), world: rect((node.closest('.onboarding-stage') ?? node).querySelector('.setup-world')), cursor: [...node.querySelectorAll('button:not(:disabled)')].map(button => getComputedStyle(button).cursor) }
      })
      assert.equal(geometry.overflow, false)
      assert.equal(await page.locator('.calendar-header, .onboarding-header, .onboarding-steps').count(), 0)
      if (geometry.width > 700 && geometry.layout.height <= geometry.viewport.height) assert(Math.abs(geometry.layout.y + geometry.layout.height / 2 - geometry.viewport.y - geometry.viewport.height / 2) < 2, 'Calendar content is vertically centered')
      assert.equal(await page.locator('#setup-language, #start-language').count(), 0)
      assert.equal(geometry.controls.length, 3)
      for (const trigger of geometry.controls) {
        assert(trigger.centerDelta < 1, `Dropdown arrow is centered: ${trigger.label}`)
        assert.equal(trigger.clipped, false, `Selected value fits: ${trigger.label}`)
        assert(trigger.x >= 0 && trigger.right <= geometry.width)
        assert(trigger.arrow.x > trigger.text.right, 'Chevron follows the selected value')
      }
      if (view.locale === 'zh') assert(!geometry.sentence.trim().startsWith('我'))
      assert(geometry.canvas.x >= geometry.form.right || geometry.canvas.y >= geometry.form.bottom, 'Canvas has a separate clipping surface')
      assert(geometry.cursor.every(cursor => cursor === 'pointer'), 'Every enabled button has a pointer')
      assert.equal(await page.locator('.timezone-menu, .calendar-lock-note, .calendar-illustration').count(), 0)
      assert.equal(await page.locator('.setup-canvas [data-horizon="later"], .setup-canvas button').count(), 0)
      assert.equal(await page.locator('.setup-product-column').count(), 6)
      const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
      assert.equal(snapshot.workspace.setupConfirmedAt, null); assert.equal(snapshot.items.length, 0)
      const screenshot = `${out}/${view.locale}-${view.style}-${view.theme}-${view.width}-${view.zoom}.png`
      await page.screenshot({ path: screenshot }); report.views.push({ ...view, geometry, screenshot })
    }
    await application.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.webContents.setZoomFactor(1); window.setContentSize(1280, 840) })
    await language('zh')
    await page.locator('#setup-calendar-mode').click()
    const menu = page.getByRole('listbox')
    await menu.waitFor(); assert.equal(await menu.locator('[data-slot="select-item"]').count(), 2)
    const menuBox = await menu.boundingBox(); assert(menuBox.x >= 0 && menuBox.x + menuBox.width <= 1280)
    await menu.evaluate(node => Promise.all(node.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished)))
    await page.screenshot({ path: `${out}/mode-component-menu.png` })
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option')
    await page.keyboard.press('End')
    await page.waitForFunction(() => document.activeElement === [...document.querySelectorAll('[role="listbox"] [role="option"]')].at(-1))
    await page.keyboard.press('Enter')
    await page.locator('.calendar-fixed-anchor').waitFor()
    assert.equal(await page.locator('#setup-calendar-anchor').count(), 0)
    report.checks.push('Shared Select supports keyboard selection and natural-year fixed start')
    await choose('#setup-calendar-mode', 0)
    await page.locator('#setup-calendar-anchor').click(); await page.getByRole('option').last().click()
    const dialog = page.locator('dialog.calendar-anchor-dialog'), input = dialog.locator('input[type="date"]')
    await dialog.waitFor()
    const today = await input.getAttribute('max'), tomorrow = new Date(`${today}T12:00:00Z`); tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    await input.fill(tomorrow.toISOString().slice(0, 10)); await dialog.locator('button[type="submit"]').click()
    await dialog.getByRole('alert').waitFor(); assert.equal(await dialog.isVisible(), true)
    await input.fill(`${today.slice(0, 4)}-01-31` > today ? `${Number(today.slice(0, 4)) - 1}-01-31` : `${today.slice(0, 4)}-01-31`)
    await dialog.locator('button[type="submit"]').click(); await dialog.waitFor({ state: 'detached' })
    await page.waitForFunction(() => document.activeElement?.id === 'setup-calendar-anchor')
    const retained = await page.locator('#setup-calendar-anchor').innerText()
    await page.locator('#setup-calendar-anchor').click(); await page.getByRole('option').last().click()
    await dialog.waitFor(); await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'detached' })
    assert.equal(await page.locator('#setup-calendar-anchor').innerText(), retained)
    report.checks.push('Custom-date modal rejects future dates, preserves cancelled drafts and returns focus')
    await setDeviceTimezone(page, 'Pacific/Auckland')
    assert.equal(await page.locator('.calendar-sentence .calendar-select').count(), 3)
    await setDeviceTimezone(page, 'Asia/Singapore')
    await choose('#setup-week-start', 6)
    report.checks.push('Computer timezone follows device emulation on focus; no timezone setting; week-start selection remains available')
    const before = await page.evaluate(() => window.goalloom.getSnapshot())
    assert.equal(before.workspace.setupConfirmedAt, null); assert.equal(before.items.length, 0)
    await page.locator('.onboarding-actions button').last().click(); await page.locator('.direction-input').waitFor()
    const camera = await page.locator('.setup-world').evaluate(node => {
      const animations = node.getAnimations()
      for (const animation of animations) { animation.pause(); animation.currentTime = 220 }
      return { count: animations.length, transform: getComputedStyle(node).transform, clip: getComputedStyle(node.parentElement).overflow }
    })
    assert.equal(camera.count, 1, 'Pointer navigation moves the persistent product camera')
    assert.equal(camera.clip, 'clip')
    await page.screenshot({ path: `${out}/camera-midpoint.png` })
    await page.locator('.setup-world').evaluate(node => node.getAnimations().forEach(animation => animation.finish()))
    report.camera = camera
    await page.locator('.direction-input').fill('Retained calendar sentence draft')
    await settleSetupStep(page)
    const world = await page.locator('.setup-world').elementHandle()
    const geometry = await page.locator('.setup-entry').evaluate(node => {
      const form = node.querySelector('.setup-form').getBoundingClientRect(), viewport = node.querySelector('.setup-scroll').getBoundingClientRect()
      const buttons = [...node.querySelectorAll('.setup-navigation button')].map(button => ({ height: button.getBoundingClientRect().height, border: getComputedStyle(button).borderTopWidth, cursor: getComputedStyle(button).cursor }))
      return { centered: Math.abs(form.y + form.height / 2 - viewport.y - viewport.height / 2) < 2, buttons }
    })
    assert(geometry.centered, 'Direction content and actions are centered together')
    assert(geometry.buttons.every(button => button.height === 44 && button.cursor === 'pointer'))
    assert.equal(geometry.buttons[0].border, '1px')
    assert.equal(await page.locator('.onboarding-header, .onboarding-steps, .onboarding-note').count(), 0)
    assert.equal(await page.locator('.setup-product-task-title').innerText(), 'Retained calendar sentence draft')
    const afterDraft = await page.evaluate(() => window.goalloom.getSnapshot())
    assert.equal(afterDraft.items.length, 0); assert.equal(afterDraft.workspace.setupConfirmedAt, null)
    await page.screenshot({ path: `${out}/direction-centered.png` })
    await page.locator('.onboarding-actions button').first().click(); assert.match(await page.locator('#setup-calendar-anchor').innerText(), /31/)
    assert(await world.evaluate(node => node === document.querySelector('.setup-world')), 'Camera world survives step changes')
    await page.locator('.onboarding-actions button').last().click(); assert.equal(await page.locator('.direction-input').inputValue(), 'Retained calendar sentence draft')
    await settleSetupStep(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.locator('.onboarding-actions button').first().click()
    await page.locator('#setup-calendar-mode').waitFor()
    assert.equal(await page.locator('.setup-entry').evaluate(node => node.getAnimations({ subtree: true }).length), 0)
    await page.locator('.onboarding-actions button').last().focus(); await page.keyboard.press('Enter')
    await page.locator('.direction-input').waitFor()
    assert.equal(await page.locator('.setup-entry').evaluate(node => node.getAnimations({ subtree: true }).length), 0)
    await page.locator('.direction-input').press('Enter')
    assert.equal(await page.locator('.setup-next').evaluate(node => node === document.activeElement), true)
    assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.setupConfirmedAt, null)
    await page.locator('.setup-back').click(); await page.locator('#setup-calendar-mode').waitFor()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    report.checks.push('Persistent camera, live non-writing draft row, equal 44px buttons, outlined Back, device timezone, reduced motion and Enter-to-focus')
    report.checks.push('Next never locks setup; calendar and direction drafts survive back navigation')
    report.ok = true
  } catch (error) {
    report.error = error.stack; await page.screenshot({ path: `${out}/failure.png` }).catch(() => {})
    report.diagnostics = await page.evaluate(() => ({ text: document.body.innerText, active: document.activeElement?.outerHTML, focus: document.hasFocus(), visibility: document.visibilityState })).catch(() => null)
    throw error
  } finally {
    await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
    await application.evaluate(({ BrowserWindow }, size) => { const window = BrowserWindow.getAllWindows()[0]; window.webContents.setZoomFactor(1); window.setContentSize(...size) }, size)
    await page.evaluate(original => { for (const [key, value] of Object.entries(original)) { if (value === undefined) delete document.documentElement.dataset[key]; else document.documentElement.dataset[key] = value } }, original)
  }
  await page.locator('.calendar-back').click()
  await page.locator('.start-local').waitFor()
  await page.locator('.start-local').click()
  assert.match(await page.locator('#setup-calendar-anchor').innerText(), /31/)
  await page.locator('.setup-next').click()
  assert.equal(await page.locator('.direction-input').inputValue(), 'Retained calendar sentence draft')
  await page.locator('.setup-back').click(); await page.locator('.calendar-back').click()
}
