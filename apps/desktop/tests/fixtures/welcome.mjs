/**
 * [INPUT]: Source Electron window with an isolated, unconfirmed workspace and real device-language IPC.
 * [OUTPUT]: Welcome layout, offline-image, pointer/hover, keyboard and no-write assertions with repeatable screenshots and JSON evidence.
 * [POS]: First-screen acceptance owned by workspace.mjs; uses production UI without account or model requests.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { cpus, release } from 'node:os'
import { reloadDeviceLanguage } from './setup.mjs'

export async function verifyWelcome(page, application) {
  const out = 'output/tests/onboarding-welcome'
  await mkdir(out, { recursive: true })
  const original = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, style: document.documentElement.dataset.style }))
  const windowSize = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize())
  const report = { runtime: await page.evaluate(() => window.goalloom.getRuntime()), host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, machineScope: 'Host machine; physical/VM status not independently verified' }, scope: 'Source Electron, isolated local profile. No live provider, packaged or Windows acceptance.', views: [] }
  const locales = {
    zh: '欢迎使用 Goalloom', en: 'Welcome to Goalloom', ja: 'Goalloom へようこそ',
    es: 'Te damos la bienvenida a Goalloom', fr: 'Bienvenue dans Goalloom',
  }
  const views = [
    ...Object.keys(locales).map(locale => ({ locale, style: 'paper', theme: 'light', width: 1280, height: 840, zoom: 1 })),
    { locale: 'zh', style: 'paper', theme: 'dark', width: 1280, height: 840, zoom: 1 },
    { locale: 'zh', style: 'minimal', theme: 'light', width: 720, height: 540, zoom: 1 },
    { locale: 'en', style: 'minimal', theme: 'dark', width: 720, height: 540, zoom: 1 },
    { locale: 'zh', style: 'macos', theme: 'light', width: 960, height: 720, zoom: 1 },
    { locale: 'en', style: 'macos', theme: 'dark', width: 960, height: 720, zoom: 1 },
    { locale: 'zh', style: 'paper', theme: 'light', width: 720, height: 620, zoom: 1.25 },
  ]
  try {
    for (const view of views) {
      await application.evaluate(({ BrowserWindow }, view) => {
        const window = BrowserWindow.getAllWindows()[0]
        window.setContentSize(view.width, view.height)
        window.webContents.setZoomFactor(view.zoom)
      }, view)
      if (await page.evaluate(() => document.documentElement.lang.split('-')[0]) !== view.locale) {
        await reloadDeviceLanguage(page, view.locale)
      }
      await page.evaluate(view => {
        document.documentElement.dataset.style = view.style
        document.documentElement.dataset.theme = view.theme
      }, view)
      await page.getByRole('heading', { name: locales[view.locale], exact: true }).waitFor()
      await page.locator('.welcome-benefits img').evaluateAll(images => Promise.all(images.map(image => image.decode())))
      await page.locator('.welcome-entry').evaluate(node => Promise.all(node.getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished)))
      const geometry = await page.locator('.welcome-content').evaluate(node => {
        const rect = element => { const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom } }
        const form = node.querySelector('.welcome-form'), benefits = node.querySelector('.welcome-benefits')
        const controls = [...node.querySelectorAll('button')].map(button => ({ ...rect(button), label: button.textContent.trim(), scrollWidth: button.scrollWidth, clientWidth: button.clientWidth, background: getComputedStyle(button).backgroundColor, color: getComputedStyle(button).color }))
        return { width: innerWidth, horizontalOverflow: document.documentElement.scrollWidth > innerWidth, viewport: rect(node.parentElement), content: rect(node), form: rect(form), benefits: rect(benefits), controls, images: [...benefits.querySelectorAll('img')].map(image => ({ loaded: image.complete && image.naturalWidth > 0, ...rect(image) })) }
      })
      assert.equal(geometry.horizontalOverflow, false)
      assert.equal(await page.locator('.onboarding-header, .onboarding-steps').count(), 0)
      if (geometry.content.height <= geometry.viewport.height) assert(Math.abs(geometry.content.y + geometry.content.height / 2 - geometry.viewport.y - geometry.viewport.height / 2) < 2, 'Welcome content is vertically centered')
      assert.equal(geometry.controls.length, 3)
      assert.equal(await page.locator('#start-language').count(), 0)
      for (const button of geometry.controls) {
        assert(button.height >= 44, 'Welcome actions retain their hit area')
        assert(button.x >= 0 && button.right <= geometry.width, 'Welcome actions fit the window')
        assert(button.scrollWidth <= button.clientWidth + 1, 'Localized action text fits')
      }
      assert(geometry.images.every(image => image.loaded && image.width > 0 && image.height > 0))
      if (geometry.width > 700) {
        assert(geometry.benefits.x > geometry.form.right, 'Wide windows keep two columns')
        assert(Math.abs(geometry.form.height - geometry.benefits.height) < 1, 'Illustrations align with the functional area')
      } else assert(geometry.benefits.y >= geometry.form.bottom, 'Zoomed narrow windows stack illustrations after all actions')
      const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
      assert.equal(snapshot.workspace.setupConfirmedAt, null)
      assert.equal(snapshot.items.length, 0)
      const name = `${view.locale}-${view.style}-${view.theme}-${view.width}-${view.zoom}`
      await page.screenshot({ path: `${out}/${name}.png` })
      report.views.push({ ...view, geometry, screenshot: `${out}/${name}.png` })
    }
    assert(await page.locator('.welcome-entry button:not(:disabled)').evaluateAll(nodes => nodes.every(node => getComputedStyle(node).cursor === 'pointer')), 'Welcome actions have pointer cursors')
    const provider = page.locator('.welcome-provider').first()
    await page.mouse.move(0, 0)
    const resting = await provider.evaluate(node => getComputedStyle(node).backgroundColor)
    await provider.hover()
    await page.waitForFunction(resting => getComputedStyle(document.querySelector('.welcome-provider')).backgroundColor !== resting, resting)
    report.hover = 'Enabled welcome actions have pointer cursors; provider hover changes its surface'
    await page.locator('.start-local').focus()
    await page.keyboard.press('Tab')
    assert.match(await page.locator(':focus').innerText(), /Google/)
    await page.keyboard.press('Tab')
    assert.match(await page.locator(':focus').innerText(), /Apple/)
    report.keyboard = 'Local → Google → Apple'
    report.ok = true
  } catch (error) {
    report.error = error.stack
    await page.screenshot({ path: `${out}/failure.png` }).catch(() => {})
    throw error
  } finally {
    await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
    await application.evaluate(({ BrowserWindow }, size) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.webContents.setZoomFactor(1)
      window.setContentSize(...size)
    }, windowSize)
    await page.evaluate(async original => {
      for (const [key, value] of Object.entries(original)) {
        if (value === undefined) delete document.documentElement.dataset[key]
        else document.documentElement.dataset[key] = value
      }
      await window.goalloom.setLanguage('zh')
    }, original)
  }
}
