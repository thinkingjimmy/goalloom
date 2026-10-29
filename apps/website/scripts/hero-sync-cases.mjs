/**
 * [INPUT]: Static website, Chromium and owning website E2E helpers.
 * [OUTPUT]: Hero device composition, native motion/interruption, mirrored state, five-locale layouts and no-JS evidence.
 * [POS]: Sync scene's visual-demo acceptance; does not validate a sync service or a shipped mobile app.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export async function runHeroSyncCases({ browser, base, LOCALES, check, assert, shot, artifact }) {
  const facts = [], errors = [], external = []
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce', colorScheme: 'light' })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(String(error)))
  page.on('request', request => { if (!request.url().startsWith(base)) external.push(request.url()) })
  try {
    await check('hero sync: third scene composes a lower-right phone without covering primary controls', async () => {
      await page.goto(`${base}/zh-CN/`)
      assert(await page.locator('.window .trow[data-item="d7"], .window .edge[data-to="d7"]').count() === 0, 'removed task or connector remains in the Hero')
      assert(!await page.locator('.hero-phone').isVisible(), 'phone appears in default relation scene')
      await page.getByRole('tab').first().focus()
      await page.keyboard.press('End')
      assert(await page.getByRole('tab', { name: '端到端同步' }).getAttribute('aria-selected') === 'true', 'End did not reach sync')
      assert(await page.locator('.hero-phone').isVisible(), 'phone missing')
      // The introduction now precedes the desktop; inspect occlusion with the full demo in view.
      await page.locator('.stage-frame').evaluate(node => scrollTo({ top: node.getBoundingClientRect().top + scrollY - document.querySelector('.site-header').getBoundingClientRect().height, behavior: 'instant' }))
      const layout = await page.evaluate(() => {
        const rect = selector => { const { x, y, width, height, right, bottom } = document.querySelector(selector).getBoundingClientRect(); return { x, y, width, height, right, bottom } }
        const clickable = selector => { const node = document.querySelector(selector), r = node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }
        const fab = document.querySelector('.window .fab').getBoundingClientRect(), window = rect('.window')
        return { hero: rect('.stage-frame'), window, phone: rect('.hero-phone'), tabs: rect('.tabs'), fab: clickable('.window .fab'), firstTask: clickable('.window .bcol[data-horizon="day"] .check'), addInset: window.right - fab.right }
      })
      assert(layout.phone.right <= layout.hero.right && layout.phone.bottom <= layout.hero.bottom && layout.phone.x > layout.window.x + layout.window.width / 2 && layout.phone.y > layout.window.y, JSON.stringify(layout))
      assert(layout.fab && layout.firstTask && layout.tabs.right < layout.phone.x, `controls obscured: ${JSON.stringify(layout)}`)
      assert(Math.abs(layout.addInset - 24) <= 1, `Add moved from its normal inset: ${layout.addInset}`)
      assert(await page.locator('.hero-phone-toolbar > span, .hero-phone-encryption, .hero-sync-status, .hero-sync-mobile-note').count() === 0, 'removed preview/sync labels remain')
      assert(await page.locator('.hero-phone-screen').getAttribute('inert') !== null, 'decorative phone is focusable')
      assert(await page.locator('.hero-phone').getAttribute('aria-label') === '移动端设计预览：端到端加密同步，与桌面演示显示同一组今天任务。', 'preview scope missing')
      await shot(page, 'hero-sync-zh-desktop')
      facts.push({ layout })
    })

    await check('hero sync: desktop completion, creation and undo mirror in the mobile preview', async () => {
      const desktopRows = page.locator('.window .bcol[data-horizon="day"] .trow')
      const phoneRows = page.locator('.hero-phone .trow')
      assert(await page.locator('.hero-phone .trow[data-item="d7"]').count() === 0, 'removed task remains in the mirrored phone')
      assert(JSON.stringify(await desktopRows.evaluateAll(rows => rows.map(row => row.dataset.item))) === JSON.stringify(await phoneRows.evaluateAll(rows => rows.map(row => row.dataset.item))), 'Today order differs')
      const desktop = page.locator('.window .trow[data-item="d1"]'), phone = page.locator('.hero-phone .trow[data-item="d1"]')
      await desktop.getByRole('button').click()
      assert(await phone.getAttribute('data-done') === 'true', 'completion did not mirror')
      await desktop.getByRole('button').click()
      assert(await phone.getAttribute('data-done') === 'false', 'reopening did not mirror')
      await page.locator('.window .fab').click()
      assert(!await page.locator('.hero-phone').isVisible(), 'phone covers composer scene')
      await page.getByRole('dialog').getByRole('button', { name: /创建到今天/ }).click()
      assert(await page.getByRole('tab', { name: '端到端同步' }).getAttribute('aria-selected') === 'true', 'creation did not return to sync')
      assert(await page.locator('.hero-phone .trow[data-item="n1"]').count() === 1, 'new task missing from phone')
      await page.locator('.window .toast-action').click()
      assert(await page.locator('.hero-phone .trow[data-item="n1"]').count() === 0, 'undo did not mirror')
      await page.getByRole('tab', { name: '端到端同步' }).focus()
      await page.keyboard.press('ArrowRight')
      assert(await page.getByRole('tab').first().getAttribute('aria-selected') === 'true' && !await page.locator('.hero-phone').isVisible(), 'keyboard wrap did not restore relation scene')
      await page.keyboard.press('ArrowLeft')
      assert(await page.locator('.hero-phone').isVisible(), 'keyboard wrap did not return to sync')
    })

    await check('hero sync: all five locales fit wide screens in both themes', async () => {
      for (const width of [1024, 1440]) for (const scheme of ['light', 'dark']) for (const [locale, prefix] of LOCALES) {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto(base + prefix)
        assert(await page.locator('.window .trow[data-item="d7"], .hero-phone .trow[data-item="d7"]').count() === 0, `${locale}/${width}/${scheme}: removed Hero task remains`)
        await page.getByRole('tab').last().click()
        const phone = await page.locator('.hero-phone').boundingBox(), hero = await page.locator('.stage-frame').boundingBox()
        assert(phone && phone.x >= hero.x && phone.x + phone.width <= hero.x + hero.width && phone.y >= hero.y && phone.y + phone.height <= hero.y + hero.height, `${locale}/${width}/${scheme}: clipped phone`)
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${width}/${scheme}: page overflow`)
        const today = await page.locator('.window .bcol[data-horizon="day"]').boundingBox(), window = await page.locator('.window').boundingBox()
        assert(today.x >= window.x && today.x + today.width <= window.x + window.width && today.width >= 320, `${locale}/${width}/${scheme}: Today clipped`)
        assert(await page.locator('.window .edge').count() === 0, 'sync scene draws relation paths to hidden columns')
        const add = await page.locator('.window .fab').evaluate(node => {
          const r = node.getBoundingClientRect(), parent = node.closest('.window').getBoundingClientRect()
          return { inset: parent.right - r.right, available: node.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }
        })
        assert(Math.abs(add.inset - 24) <= 1 && add.available, `${locale}/${width}/${scheme}: ${JSON.stringify(add)}`)
        if (width === 1440 && locale === 'zh-CN' && scheme === 'dark') await shot(page, 'hero-sync-zh-desktop-dark')
      }
    })
  } finally { await context.close() }

  await check('hero sync: 320/390px touch layouts keep one board and omit redundant status labels', async () => {
    const mobile = await browser.newContext({ isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    try {
      const page = await mobile.newPage()
      page.on('pageerror', error => errors.push(String(error)))
      for (const width of [320, 390]) for (const scheme of ['light', 'dark']) for (const [locale, prefix] of LOCALES) {
        await page.setViewportSize({ width, height: 844 })
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto(base + prefix)
        assert(await page.locator('.window .trow[data-item="d7"]').count() === 0, `${locale}/${width}/${scheme}: removed phone task remains`)
        await page.getByRole('tab').last().tap()
        assert(!await page.locator('.hero-phone').isVisible(), 'duplicate phone on narrow viewport')
        assert(await page.locator('.hero-sync-status, .hero-sync-mobile-note').count() === 0, 'removed labels remain on phones')
        const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth - innerWidth, tabs: [...document.querySelectorAll('.tab')].map(node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, height: r.height, fits: node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight } }), bar: document.querySelector('.window .bar').scrollWidth, window: document.querySelector('.window').clientWidth }))
        assert(layout.overflow <= 0 && layout.bar <= layout.window && layout.tabs.every(tab => tab.left >= 0 && tab.right <= width && tab.height >= 44 && tab.fits), JSON.stringify({ locale, width, scheme, layout }))
        if (locale === 'zh-CN' && width === 390 && scheme === 'dark') await shot(page, 'hero-sync-zh-phone-dark')
        facts.push({ locale, width, scheme, layout })
      }
    } finally { await mobile.close() }
  })

  await check('hero sync: pointer reveal/exit animate, reverse cleanly and stop for keyboard/reduced motion', async () => {
    const motion = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', recordVideo: { dir: join(artifact, 'hero-sync-motion'), size: { width: 1440, height: 900 } } })
    let recording
    try {
      const page = await motion.newPage()
      recording = page.video()
      page.on('pageerror', error => errors.push(String(error)))
      await page.goto(`${base}/zh-CN/`)
      const phone = page.locator('.hero-phone'), sync = page.getByRole('tab').last(), lines = page.getByRole('tab').first()
      const settle = () => phone.evaluate(async node => { await Promise.allSettled(node.getAnimations().map(animation => animation.finished)) })
      assert(await phone.evaluate(node => node.getAnimations().length === 0), 'initial page load animates')
      await sync.click()
      const enter = await phone.evaluate(node => {
        const animations = node.getAnimations().filter(animation => ['opacity', 'transform'].includes(animation.transitionProperty))
        const timings = animations.map(animation => ({ property: animation.transitionProperty, duration: animation.effect.getTiming().duration }))
        for (const animation of node.getAnimations()) { animation.pause(); animation.currentTime = 140 }
        return { timings, opacity: Number(getComputedStyle(node).opacity), transform: getComputedStyle(node).transform }
      })
      assert(enter.timings.length === 2 && enter.timings.every(timing => timing.duration === 280) && enter.opacity > 0 && enter.opacity < 1 && enter.transform !== 'none', JSON.stringify(enter))
      await shot(page, 'hero-sync-enter-midpoint')
      await phone.evaluate(node => node.getAnimations().forEach(animation => animation.play()))
      await settle()
      assert(await phone.evaluate(node => getComputedStyle(node).opacity === '1'), 'entry did not settle')
      await lines.click()
      const exit = await phone.evaluate(node => {
        const timings = node.getAnimations().filter(animation => ['opacity', 'transform'].includes(animation.transitionProperty)).map(animation => animation.effect.getTiming().duration)
        for (const animation of node.getAnimations()) { animation.pause(); animation.currentTime = 90 }
        return { timings, opacity: Number(getComputedStyle(node).opacity), hidden: node.getAttribute('aria-hidden') }
      })
      assert(exit.timings.length === 2 && exit.timings.every(duration => duration === 180) && exit.opacity > 0 && exit.opacity < 1 && exit.hidden === 'true', JSON.stringify(exit))
      await shot(page, 'hero-sync-exit-midpoint')
      await sync.click()
      await settle()
      assert(await phone.evaluate(node => getComputedStyle(node).opacity === '1' && getComputedStyle(node).visibility === 'visible'), 'interrupted exit lost the phone')
      await lines.click()
      await settle()
      await phone.waitFor({ state: 'hidden' })
      await sync.focus()
      await sync.press('Enter')
      assert(await phone.evaluate(node => getComputedStyle(node).opacity === '1' && node.getAnimations().length === 0), 'keyboard waits for animation')
      await lines.click()
      await settle()
      await sync.click()
      await page.emulateMedia({ reducedMotion: 'reduce' })
      assert(await phone.evaluate(node => getComputedStyle(node).opacity === '1' && node.getAnimations().length === 0), 'reduced motion did not cancel the reveal')
      await lines.click()
      assert(await phone.evaluate(node => getComputedStyle(node).visibility === 'hidden' && node.getAnimations().length === 0), 'reduced motion exit still animates')
      facts.push({ enter, exit, rapidReversal: true, keyboardImmediate: true, reducedMotionImmediate: true })
    } finally {
      await motion.close()
      await recording?.saveAs(join(artifact, 'hero-sync-transition.webm'))
    }
  })

  await check('hero sync: static default stays readable without JavaScript; scene adds no external traffic', async () => {
    const plain = await browser.newContext({ javaScriptEnabled: false })
    try {
      const page = await plain.newPage()
      for (const [, prefix] of LOCALES) {
        await page.goto(base + prefix)
        assert(await page.getByRole('tab').first().getAttribute('aria-selected') === 'true' && !await page.locator('.hero-phone').isVisible(), 'static relation scene changed')
        assert(await page.locator('.window .trow').count() > 0, 'static board missing')
        assert(await page.locator('.window .trow[data-item="d7"]').count() === 0, 'removed Hero task remains without JavaScript')
      }
    } finally { await plain.close() }
    assert(errors.length === 0 && external.length === 0, JSON.stringify({ errors, external }))
  })
  writeFileSync(join(artifact, 'hero-sync.json'), JSON.stringify({ facts, errors, external, scope: 'Static UI concept with local state; no sync service or mobile-release acceptance.' }, null, 2) + '\n')
}
