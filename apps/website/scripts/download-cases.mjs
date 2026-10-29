/**
 * [INPUT]: Static website, Chromium and owning E2E assertion/artifact helpers.
 * [OUTPUT]: Split-button platform, download, dismissal, touch and no-JavaScript acceptance evidence.
 * [POS]: Website download coverage; installer responses are local test fixtures, never external requests.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const platforms = ['mac', 'windows']
const windowsAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36'

export async function runDownloadCases({ browser, base, LOCALES, check, assert, shot, artifact }) {
  const evidence = []
  const errors = []
  const boundsFit = async (page, panel) => {
    const bounds = await panel.boundingBox()
    assert(bounds.x >= 0 && bounds.x + bounds.width <= page.viewportSize().width + 1, `download menu outside viewport: ${JSON.stringify(bounds)}`)
  }
  for (const platform of platforms) {
    await check(`download split ${platform}: separate direct/alternate downloads, outside click and keyboard dismissal`, async () => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ...(platform === 'windows' ? { userAgent: windowsAgent } : {}) })
      try {
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(String(error)))
        const requests = []
        await page.route('https://github.com/thinkingjimmy/goalloom/releases/download/**', route => {
          const url = route.request().url()
          requests.push(url)
          return route.fulfill({ contentType: 'application/octet-stream', headers: { 'content-disposition': 'attachment; filename="controlled-download.txt"' }, body: 'Controlled installer-download acceptance fixture.' })
        })
        const other = platform === 'mac' ? 'windows' : 'mac'
        for (const suffix of ['', 'pricing/']) for (const placement of (suffix ? ['.site-header', '.home-plan-free'] : ['.site-header', '.hero-intro', '.home-plan-free', '.closing-download'])) {
          await page.goto(`${base}/zh-CN/${suffix}`)
          const control = page.locator(`${placement} .download-split`)
          await control.scrollIntoViewIfNeeded()
          const primary = control.locator(`.download-primary[data-for="${platform}"]`)
          const toggle = control.locator('summary')
          const panel = control.locator('.download-panel')
          assert(await primary.isVisible(), 'wrong primary platform')
          const primaryUrl = await primary.getAttribute('href')
          const [directDownload] = await Promise.all([page.waitForEvent('download'), primary.click()])
          assert(directDownload.url() === primaryUrl, 'main segment did not download its linked asset')
          await directDownload.delete()
          assert(!await panel.isVisible(), 'main segment opened the menu')
          await toggle.click()
          await panel.waitFor({ state: 'visible' })
          await boundsFit(page, panel)
          assert(await panel.locator('a:visible').count() === 1 && await panel.locator(`[data-download-option="${other}"]`).isVisible(), 'other system missing or current platform duplicated')
          await panel.click({ position: { x: 12, y: 3 } })
          assert(await panel.isVisible(), 'inside padding closed the menu')
          await page.locator(suffix ? '.service-intro h1' : '.hero-intro h1').click()
          await panel.waitFor({ state: 'hidden' })
          await toggle.focus()
          await toggle.press('Enter')
          const alternate = panel.locator(`[data-download-option="${other}"]`)
          await alternate.focus()
          await page.keyboard.press('Escape')
          await panel.waitFor({ state: 'hidden' })
          assert(await toggle.evaluate(node => node === document.activeElement), 'Escape did not restore arrow focus')
          await toggle.click()
          await shot(page, `download-${platform}-${suffix ? 'pricing-' : ''}${placement.slice(1)}`)
          const alternateUrl = await alternate.getAttribute('href')
          const [alternateDownload] = await Promise.all([page.waitForEvent('download'), alternate.click()])
          assert(alternateDownload.url() === alternateUrl && alternateUrl !== primaryUrl, 'alternate segment downloaded the wrong asset')
          await alternateDownload.delete()
          await panel.waitFor({ state: 'hidden' })
          evidence.push({ platform, suffix, placement, primaryUrl, alternateUrl })
        }
        assert(requests.length === 12, `expected twelve controlled downloads, got ${requests.length}`)
      } finally { await context.close() }
    })
  }
  await check('download split: five-language touch menus fit home and information pages in both themes', async () => {
    for (const platform of platforms) {
      const context = await browser.newContext({ isMobile: true, hasTouch: true, ...(platform === 'windows' ? { userAgent: windowsAgent } : {}) })
      try {
        const page = await context.newPage()
        page.on('pageerror', error => errors.push(String(error)))
        for (const width of [320, 390]) {
          await page.setViewportSize({ width, height: 844 })
          await page.emulateMedia({ colorScheme: width === 320 ? 'light' : 'dark' })
          for (const [, prefix] of LOCALES) for (const suffix of ['', 'pricing/']) {
            await page.goto(base + prefix + suffix)
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `page overflow ${platform}/${width}/${prefix}${suffix}`)
            for (const placement of (suffix ? ['.site-header', '.home-plan-free'] : ['.site-header', '.hero-intro', '.home-plan-free', '.closing-download'])) {
              const control = page.locator(`${placement} .download-split`)
              const toggle = control.locator('summary')
              const box = await toggle.boundingBox()
              assert(box.width >= 44 && box.height >= 44, 'arrow touch target below 44px')
              await toggle.tap()
              const panel = control.locator('.download-panel')
              await panel.waitFor({ state: 'visible' })
              await boundsFit(page, panel)
              const header = await page.locator('.site-header').boundingBox()
              await page.touchscreen.tap(8, header.y + header.height + 12)
              await panel.waitFor({ state: 'hidden' })
            }
          }
        }
      } finally { await context.close() }
    }
  })
  await check('download split: native Header/Hero/closing/home/pricing Free-plan menus and asset links work without JavaScript in all five languages', async () => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 1000 } })
    try {
      const page = await context.newPage()
      for (const [, prefix] of LOCALES) for (const suffix of ['', 'pricing/']) {
        await page.goto(base + prefix + suffix)
        for (const placement of (suffix ? ['.site-header', '.home-plan-free'] : ['.site-header', '.hero-intro', '.home-plan-free', '.closing-download'])) {
          const control = page.locator(`${placement} .download-split`)
          await control.locator('summary').click()
          const other = control.locator('[data-download-option="windows"]')
          assert(await other.isVisible() && (await other.getAttribute('href')).endsWith('-win-x64.exe'), 'native alternate installer link unavailable')
          await control.locator('summary').click()
        }
      }
    } finally { await context.close() }
  })
  await check('download split: no browser runtime errors', async () => assert(errors.length === 0, errors.join('\n')))
  writeFileSync(join(artifact, 'download-split.json'), JSON.stringify({ controlledInstallerResponses: true, evidence, errors }, null, 2) + '\n')
}
