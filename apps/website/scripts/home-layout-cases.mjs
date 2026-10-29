/**
 * [INPUT]: Static export, locale/route lists and browser assertion/artifact helpers.
 * [OUTPUT]: Repeatable wide/settled Hero, reading frame, download, theme and accessibility evidence.
 * [POS]: Homepage presentation acceptance shared by the full runner and home-layout selector.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'playwright/test'

export async function runHomeLayoutCases({ browser, base, LOCALES, ROUTES, check, assert, shot, artifact }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
  const page = await context.newPage()
  const evidence = [], errors = []
  page.on('pageerror', error => errors.push(String(error)))
  const geometry = () => page.locator('.hero-shell').evaluate(node => {
    const r = node.getBoundingClientRect()
    return { left: r.left, width: r.width, top: r.top, height: r.height }
  })
  try {
    await check('home layout: wide first paint, progressive scroll contraction, return and resize', async () => {
      for (const width of [1024, 1440, 2560]) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(`${base}/zh-CN/`)
        const before = await geometry()
        assert(before.width === width - 32 && before.left === 16 && before.top === 72, JSON.stringify(before))
        await shot(page, `home-hero-${width}-rest`)
        await page.evaluate(() => scrollTo({ top: 180, behavior: 'instant' }))
        const target = await page.locator('main').evaluate(node => node.getBoundingClientRect().width)
        await expect.poll(async () => (await geometry()).width).toBeLessThan(before.width)
        const midway = await geometry()
        assert(midway.width > target, 'Hero jumps to its settled width')
        await page.evaluate(() => scrollTo({ top: 360, behavior: 'instant' }))
        await expect.poll(async () => (await geometry()).width).toBe(target)
        const after = await geometry()
        const content = await page.locator('main').boundingBox()
        assert(after.left === content.x && after.width === content.width, 'Hero does not settle on the content edges')
        assert(after.height <= before.height && before.top - after.top === 360, 'Hero moved unexpectedly instead of proportionally shrinking')
        assert(await page.locator('.site-header').evaluate(node => node.getBoundingClientRect().top) === 0, 'header no longer sticky')
        await shot(page, `home-hero-${width}-scrolled`)
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
        await expect.poll(async () => (await geometry()).width).toBe(before.width)
        evidence.push({ width, before, midway, after })
      }
    })
    await check('header glass: light/dark desktop and phone blur retains a clickable download menu', async () => {
      for (const theme of ['light', 'dark']) for (const width of [390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme: theme })
        await page.goto(`${base}/zh-CN/`)
        await page.evaluate(() => scrollTo({ top: 620, behavior: 'instant' }))
        const header = page.locator('.site-header')
        assert(await header.evaluate(node => node.getBoundingClientRect().top) === 0, 'frosted header lost sticky positioning')
        const toggle = header.locator('.download-toggle')
        await toggle.click()
        assert(await header.locator('.download-panel').isVisible(), 'glass blocks the download menu')
        await toggle.press('Escape')
        assert(await toggle.evaluate(node => node === document.activeElement), 'Escape lost header focus')
        await page.locator('.hero-intro h1').click()
        await page.evaluate(() => scrollTo({ top: 620, behavior: 'instant' }))
        await shot(page, `header-glass-${theme}-${width}`)
      }
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.emulateMedia({ colorScheme: 'light' })
    })
    await check('hero scaling: products shrink proportionally, remain clickable and keep connectors attached', async () => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(`${base}/zh-CN/`)
      const devices = page.locator('.hero-devices')
      const before = await devices.boundingBox()
      const samples = []
      for (const top of [180, 360]) {
        await page.evaluate(top => scrollTo({ top, behavior: 'instant' }), top)
        await expect.poll(() => devices.evaluate(node => node.getBoundingClientRect().width / node.offsetWidth)).toBeLessThan(1)
        const box = await devices.boundingBox()
        const scale = box.width / before.width
        assert(scale < 1 && Math.abs(box.height / before.height - scale) < .002, 'preview was cropped or distorted instead of uniformly scaled')
        await expect.poll(() => page.locator('.window .edge').evaluateAll(paths => Math.max(...paths.map(path => {
          const dot = document.querySelector(`.window .trow[data-item="${path.dataset.to}"] .fdot > span`).getBoundingClientRect()
          const end = path.getPointAtLength(path.getTotalLength())
          const point = new DOMPoint(end.x, end.y).matrixTransform(path.getScreenCTM())
          return Math.hypot(point.x - dot.left, point.y - dot.top - dot.height / 2)
        })))).toBeLessThan(1)
        samples.push({ top, scale, box })
      }
      const child = page.locator('.window .trow[data-item="d8"]')
      await child.getByRole('button').click()
      assert(await child.getAttribute('data-done') === 'true' && await page.locator('.window .trow[data-item="d1"]').getAttribute('data-done') === 'false', 'scaled preview lost independent task interaction')
      await expect.poll(() => page.locator('.window .edge[data-to="d8"]').evaluate(path => {
        const dot = document.querySelector('.window .trow[data-item="d8"] .fdot > span').getBoundingClientRect()
        const end = path.getPointAtLength(path.getTotalLength())
        const point = new DOMPoint(end.x, end.y).matrixTransform(path.getScreenCTM())
        return Math.hypot(point.x - dot.left, point.y - dot.top - dot.height / 2)
      })).toBeLessThan(1)
      evidence.push({ productScaling: samples })
      await shot(page, 'hero-scaled-interaction')
    })
    await check('hero alignment: content size changes refresh both edges without a window resize', async () => {
      await page.evaluate(() => scrollTo({ top: 360, behavior: 'instant' }))
      await page.locator('#home-content').evaluate(node => { node.style.maxWidth = '1000px' })
      await expect.poll(async () => (await geometry()).width).toBe(1000)
      const content = await page.locator('#home-content').boundingBox(), hero = await geometry()
      assert(Math.abs(hero.left - content.x) < 1 && Math.abs(hero.left + hero.width - content.x - content.width) < 1, 'Hero kept stale content edges')
      await page.locator('#home-content').evaluate(node => node.style.removeProperty('max-width'))
      await expect.poll(async () => (await geometry()).width).toBe(1120)
      await page.locator('.hero-shell').evaluate(node => scrollTo({ top: node.getBoundingClientRect().bottom + scrollY - 450, behavior: 'instant' }))
      await expect.poll(() => page.locator('#intro').evaluate(node => Number(getComputedStyle(node).opacity))).toBe(1)
      await shot(page, 'hero-body-edge-alignment')
    })
    await check('closing artwork: both generated landscapes load from local static assets', async () => {
      for (const theme of ['light', 'dark']) {
        const response = await page.request.get(`${base}/closing-${theme}.jpg`)
        assert(response.ok() && response.headers()['content-type'].includes('image/jpeg') && (await response.body()).length > 10000, 'closing artwork missing or invalid')
      }
    })
    await check('home layout: thirty localized routes keep the 1120px reading frame and GitHub icon in both themes', async () => {
      await page.setViewportSize({ width: 2560, height: 1080 })
      for (const theme of ['light', 'dark']) {
        await page.emulateMedia({ colorScheme: theme })
        for (const [, prefix] of LOCALES) for (const route of ROUTES) {
          const path = route.path === '/' ? prefix : `${prefix}${route.path.slice(1)}`
          await page.goto(base + path)
          const facts = await page.evaluate(() => ({
            frames: ['.site-header', 'main', '.site-footer'].map(selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { width: r.width, left: r.left } }),
            overflow: document.documentElement.scrollWidth - innerWidth,
            grain: getComputedStyle(document.body, '::before').backgroundImage,
            paper: (() => { const style = getComputedStyle(document.body, '::before'); return { size: style.backgroundSize, blend: style.mixBlendMode, pointer: style.pointerEvents } })(),
            glass: (() => { const style = getComputedStyle(document.querySelector('.site-header'), '::before'); return { filter: style.backdropFilter || style.webkitBackdropFilter, background: style.backgroundColor, position: style.position, left: style.left, right: style.right, height: style.height, pointer: style.pointerEvents, supported: CSS.supports('backdrop-filter', 'blur(18px)') || CSS.supports('-webkit-backdrop-filter', 'blur(18px)') } })(),
          }))
          assert(facts.frames.every(r => r.width === 1120 && r.left === 720) && facts.overflow <= 0 && facts.grain.includes('paper-fibers.jpg'), JSON.stringify({ path, theme, facts }))
          assert(facts.paper.size === '420px 420px' && facts.paper.pointer === 'none' && facts.paper.blend === (theme === 'dark' ? 'screen' : 'multiply'), 'page paper uses the wrong theme blend')
          assert(facts.glass.position === 'fixed' && facts.glass.left === '0px' && facts.glass.right === '0px' && facts.glass.height === '72px' && facts.glass.pointer === 'none', 'glass does not cover the full header')
          assert(!facts.glass.supported || facts.glass.filter.includes('blur(18px)') && facts.glass.filter.includes('saturate(1.15)'), 'supported header blur is missing')
          assert(await page.locator('.site-header a[href="https://github.com/thinkingjimmy/goalloom"] svg').count() === 1, 'GitHub icon missing')
        }
      }
    })
    await check('home layout: five-language Hero and closing invitation fit desktop and phones in both themes', async () => {
      for (const theme of ['light', 'dark']) for (const width of [320, 390, 900, 1440]) {
        await page.emulateMedia({ colorScheme: theme })
        await page.setViewportSize({ width, height: 900 })
        for (const [locale, prefix] of LOCALES) {
          await page.goto(base + prefix)
          const title = page.locator('.hero-intro h1')
          assert(await title.isVisible() && (await title.innerText()).length > 8 && await page.locator('h1').count() === 1, `${locale}: title missing`)
          assert(await page.locator('main > .closing-download:last-child').count() === 1, 'closing invitation missing after FAQ')
          const closingBackground = await page.locator('.closing-download').evaluate(node => { const style = getComputedStyle(node, '::before'); return { image: style.backgroundImage, size: style.backgroundSize, pointer: style.pointerEvents } })
          assert(closingBackground.image.includes(`closing-${theme}.jpg`) && closingBackground.size === 'cover' && closingBackground.pointer === 'none', 'closing invitation lost its theme-matched generated background')
          assert(await page.locator('.hero-shell .menubar, .hero-shell .menu-pop, .hero-shell .footer-theme').count() === 0, 'OS chrome or site preferences remain in Hero')
          const gap = await page.evaluate(() => document.querySelector('.window').getBoundingClientRect().top - document.querySelector('.hero-intro .home-download-detail').getBoundingClientRect().bottom)
          assert(gap >= 24 && gap <= 29, `download/preview gap is too large: ${gap}`)
          assert(await page.locator('.hero-app-icon > svg').count() === 2 && await page.locator('.hero-app-icon img').count() === 0, 'logo still has raster transparent padding')
          assert(await page.locator('.site-footer').evaluate(node => getComputedStyle(node).borderTopWidth) === '0px', 'footer divider remains')
          assert(await page.locator('.site-header').evaluate(node => getComputedStyle(node, '::before').height === getComputedStyle(node).height), 'glass height differs from the navigation bar')
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${width}: overflow`)
          for (const selector of ['.hero-intro', '.closing-download']) {
            const action = page.locator(`${selector} .download-split`)
            await action.locator('summary').click()
            const panel = action.locator('.download-panel')
            const box = await panel.boundingBox()
            assert(box.x >= 0 && box.x + box.width <= width && await panel.isVisible(), `${locale}/${width}: download menu clipped`)
            await action.locator('summary').press('Escape')
            assert(!await panel.isVisible(), 'Escape did not dismiss download menu')
          }
          if (locale === 'zh-CN' && [390,1440].includes(width)) {
            await page.locator('#intro').scrollIntoViewIfNeeded()
            await expect.poll(() => page.locator('#intro').evaluate(node => Number(getComputedStyle(node).opacity))).toBe(1)
            await shot(page, `paper-body-${theme}-${width}`)
            await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
            await shot(page, `home-${theme}-${width}`)
            await page.locator('.closing-download').scrollIntoViewIfNeeded()
            await shot(page, `home-closing-${theme}-${width}`)
          }
        }
      }
    })
    await check('home layout: reduced motion and narrow screens hold a stable frame', async () => {
      for (const width of [390,1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.goto(`${base}/ja/`)
        const before = await geometry()
        await page.evaluate(() => scrollTo({ top: 360, behavior: 'instant' }))
        await expect.poll(async () => (await geometry()).width).toBe(before.width)
        assert(await page.locator('.hero-shell').evaluate(node => !node.style.getPropertyValue('--hero-product-scale')), 'reduced-motion preview still scales')
        if (width > 900) assert(before.width === await page.locator('#home-content').evaluate(node => node.getBoundingClientRect().width), 'static Hero does not align with content')
      }
    })
    await check('hero wheel: scrolling over the preview continues down the page at its vertical boundary', async () => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto(`${base}/zh-CN/`)
      await page.locator('.window').scrollIntoViewIfNeeded()
      const board = page.locator('.window .board')
      await board.evaluate(node => { node.scrollTop = node.scrollHeight })
      const box = await board.boundingBox()
      await page.mouse.move(box.x + box.width / 2, Math.max(100, box.y + 120))
      const before = await page.evaluate(() => scrollY)
      await page.mouse.wheel(0, 280)
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(before + 100)
      await shot(page, 'hero-wheel-page-scroll')
    })
    await check('home layout: no browser errors', async () => assert(errors.length === 0, errors.join('\n')))
  } finally { await context.close() }
  await check('home layout: localized introduction and both download menus work without JavaScript', async () => {
    const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1440, height: 900 } })
    try {
      const page = await plain.newPage()
      for (const [, prefix] of LOCALES) {
        await page.goto(base + prefix)
        assert(await page.locator('.hero-intro h1').isVisible(), 'no-JS headline hidden')
        assert(await page.locator('.hero-shell').evaluate(node => node.getBoundingClientRect().width) === 1408, 'no-JS frame not wide')
        await page.locator('.site-footer summary').click()
        assert(await page.locator('.site-footer .menu-panel a').count() === 5, 'no-JS footer languages missing')
        await page.locator('.site-footer summary').click()
        for (const selector of ['.hero-intro', '.closing-download']) {
          await page.locator(`${selector} summary`).click()
          const link = page.locator(`${selector} [data-download-option="windows"]`)
          assert(await link.isVisible() && (await link.getAttribute('href')).endsWith('-win-x64.exe'), 'no-JS download unavailable')
          await page.locator(`${selector} summary`).click()
        }
      }
      await shot(page, 'home-no-js')
    } finally { await plain.close() }
  })
  await check('footer preferences: all five languages fit phones with touch, Escape and native locale links', async () => {
    const phone = await browser.newContext({ isMobile: true, hasTouch: true })
    const menuPage = await phone.newPage()
    for (const width of [320, 390]) {
      await menuPage.setViewportSize({ width, height: 844 })
      for (const [, path] of LOCALES) {
        await menuPage.goto(base + path)
        assert(await menuPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `status bar overflow ${width}/${path}`)
        for (const control of await menuPage.locator('.footer-preferences summary, .footer-preferences button').all()) {
          const box = await control.boundingBox()
          assert(box.width >= 44 && box.height >= 44, 'status control touch target below 44px')
        }
        await menuPage.locator('.site-footer summary').tap()
        assert(await menuPage.locator('.site-footer .menu-panel').isVisible(), 'touch language menu inaccessible')
        const panel = await menuPage.locator('.site-footer .menu-panel').boundingBox()
        assert(panel.x >= 0 && panel.x + panel.width <= width, 'touch menu clipped')
        await menuPage.locator('.site-footer .menu-panel a').first().focus()
        await menuPage.keyboard.press('Escape')
        assert(await menuPage.locator('.site-footer summary').evaluate(node => node === document.activeElement), 'Escape lost footer focus')
        await menuPage.locator('.site-footer .menu-panel').waitFor({ state: 'hidden' })
      }
    }
    await menuPage.goto(`${base}/zh-CN/`)
    await menuPage.locator('.site-footer summary').press('Enter')
    await menuPage.locator('.site-footer a[lang="es"]').click()
    await menuPage.waitForURL('**/es/')
    assert(await menuPage.locator('html').getAttribute('lang') === 'es', 'footer language navigation failed')
    await shot(menuPage, 'footer-preferences-mobile')
    await phone.close()
  })
  writeFileSync(join(artifact, 'home-layout.json'), JSON.stringify({ readingWidth: 1120, settledHeroWidth: 1120, evidence, errors }, null, 2) + '\n')
}
