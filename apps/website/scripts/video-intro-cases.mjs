/**
 * [INPUT]: Static export with bundled H.264 tour, Chromium and website E2E helpers.
 * [OUTPUT]: Top-aligned maker/video and shared section-width evidence, native playback, mobile and no-JS coverage.
 * [POS]: Product introduction acceptance; uses the real local clip, never a third-party player.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export async function runVideoIntroCases({ browser, base, LOCALES, check, assert, shot, artifact }) {
  const facts = [], errors = [], external = []
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const requests = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('request', request => {
    if (request.url().includes('/product-tour.mp4')) requests.push(request.url())
    if (!request.url().startsWith(base)) external.push(request.url())
  })
  try {
    for (const [locale, prefix] of LOCALES) await check(`video intro ${locale}: original maker note and retained video follow Hero, with no passive video download`, async () => {
      requests.length = 0
      await page.goto(base + prefix)
      await page.locator('.video-intro').scrollIntoViewIfNeeded()
      const layout = await page.locator('.video-intro').evaluate(node => {
        const rect = selector => { const r = node.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
        const hero = document.querySelector('.hero-shell').getBoundingClientRect()
        const content = document.querySelector('main').getBoundingClientRect()
        const quote = node.querySelector('.intro-quote'), type = getComputedStyle(quote), cover = getComputedStyle(node.querySelector('.intro-cover'))
        const frame = rect('.intro-player')
        const sectionDeltas = ['.home-plan-grid', '.home-faq-list'].map(selector => { const reference = document.querySelector(selector).getBoundingClientRect(); return { selector, left: Math.abs(frame.left - reference.left), right: Math.abs(frame.right - reference.right), width: Math.abs(frame.width - reference.width) } })
        return { copy: rect('.intro-copy'), frame, media: rect('.intro-media'), sectionDeltas, contentLeft: content.left, contentRight: content.right, gap: node.getBoundingClientRect().top - hero.bottom, quoteSize: type.fontSize, quoteWeight: type.fontWeight, leading: Number.parseFloat(type.lineHeight) / Number.parseFloat(type.fontSize), continuousText: quote.childElementCount === 0, coverRadius: cover.borderRadius, inverseCover: cover.backgroundColor === getComputedStyle(document.body).color && cover.color === getComputedStyle(document.body).backgroundColor, overflow: document.documentElement.scrollWidth - innerWidth }
      })
      assert(await page.locator('main > .video-intro:first-child').count() === 1 && await page.locator('.note').count() === 0, 'unexpected standalone maker section remains')
      assert(layout.copy.right < layout.frame.left && layout.copy.width >= 200 && layout.copy.width <= 340 && layout.frame.width > 680 && Math.abs(layout.frame.width / layout.frame.height - 16 / 9) < .01 && layout.quoteSize === '17px' && layout.quoteWeight === '400' && Math.abs(layout.leading - 1.7) < .01 && layout.continuousText && layout.inverseCover && layout.coverRadius === '12px' && layout.gap === 0 && layout.overflow <= 0, JSON.stringify(layout))
      assert(layout.copy.left === layout.contentLeft && layout.media.right === layout.contentRight, 'intro outer edges do not align with the shared content frame')
      assert(Math.abs(layout.copy.top - layout.frame.top) <= 1 && layout.sectionDeltas.every(delta => delta.left <= 1 && delta.right <= 1 && delta.width <= 1), `intro must align at the top and share pricing/FAQ content columns: ${JSON.stringify(layout)}`)
      assert(await page.locator('main > .product-tour').count() === 1 && await page.locator('main > #board, main > #jev, .cases, .subs').count() === 0, 'duplicate feature sections remain')
      assert(/ADHD|TDAH/u.test(await page.locator('.intro-quote').innerText()), 'original ADHD motivation missing')
      assert((await page.locator('.intro-author').innerText()).includes('Jimmy') && await page.locator('.intro-author img').evaluate(node => node.getAttribute('src') === '/avatar.jpg' && node.complete && node.naturalWidth > 0), 'original author/avatar missing')
      assert(await page.locator('.intro-options, .intro-option, .intro-panel-lines, .intro-panel-ai, .jev-stage, .fig-lines').count() === 0, 'removed scene controls or illustrations remain')
      assert(requests.length === 0 && await page.locator('video').evaluate(node => node.paused && node.preload === 'none' && !node.autoplay), 'video fetched or played before a click')
      assert(await page.locator('.intro-player').evaluate(node => !node.open), 'cover is not the default')
      assert(await page.locator('.intro-brand img').evaluate(node => node.complete && node.naturalWidth > 0), 'brand asset missing')
      assert(await page.locator('.intro-copy h2').innerText() && await page.locator('.intro-brand').innerText() && await page.locator('.intro-play').innerText(), 'localized copy missing')
      assert(await page.locator('.intro-caption, .intro-media figcaption, .intro-duration, .intro-quote em, .intro-quote strong').count() === 0, 'removed caption, duration or emphasis remains')
      if (locale === 'zh-CN') await page.locator('.video-intro').screenshot({ path: join(artifact, 'video-intro-zh-desktop.png') })
      facts.push({ locale, width: 1440, layout, passiveRequests: requests.length })
    })

    await check('video intro: real playback, offscreen pause, keyboard reset and replay preserve focus and layout', async () => {
      await page.goto(`${base}/zh-CN/`)
      const watch = page.locator('.intro-player > summary'), player = page.locator('.intro-player'), video = page.locator('.intro-player video')
      const closedHeight = await page.locator('.video-intro').evaluate(node => node.getBoundingClientRect().height)
      await watch.click()
      await page.waitForFunction(() => document.querySelector('.intro-player video').currentTime > .2)
      const duration = await video.evaluate(node => node.duration)
      assert(duration > 10 && duration < 11 && await player.evaluate(node => node.open), `real clip did not load: ${duration}`)
      assert(await video.evaluate(node => document.activeElement === node && node.controls && node.playsInline), 'native player or focus missing')
      const containedReset = await watch.evaluate(node => { const reset = node.getBoundingClientRect(), frame = node.parentElement.getBoundingClientRect(); return reset.top >= frame.top && reset.bottom <= frame.bottom && reset.right <= frame.right && reset.height >= 44 })
      assert(containedReset && Math.abs(await page.locator('.video-intro').evaluate(node => node.getBoundingClientRect().height) - closedHeight) < 1, 'playback added an exterior footer or moved the section')
      await video.evaluate(node => node.pause())
      await shot(page, 'video-intro-playing')
      const bounds = await video.boundingBox()
      await video.click({ position: { x: 24, y: bounds.height - 48 } })
      await page.waitForFunction(() => !document.querySelector('.intro-player video').paused)
      await page.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
      await page.waitForFunction(() => document.querySelector('.intro-player video').paused)
      await player.scrollIntoViewIfNeeded()
      assert(await video.evaluate(node => node.paused), 'video restarted after returning to viewport')
      const summary = player.locator('summary')
      assert((await summary.innerText()).includes('返回封面'), 'open summary does not describe reset')
      await summary.press('Enter')
      assert(await player.evaluate(node => !node.open) && await watch.evaluate(node => document.activeElement === node), 'reset lost cover or trigger focus')
      await summary.press('Enter')
      await page.waitForFunction(() => !document.querySelector('.intro-player video').paused)
      await video.evaluate(node => { node.currentTime = node.duration - .05; return node.play() })
      await page.waitForFunction(() => document.querySelector('.intro-player video').ended)
      await summary.click()
      await watch.click()
      await page.waitForFunction(() => !document.querySelector('.intro-player video').paused && document.querySelector('.intro-player video').currentTime < 2)
      await summary.click()
      facts.push({ realClipSeconds: duration, offscreenPaused: true, nativeKeyboard: true, replay: true })
    })

    await check('video intro: five-language desktop/tablet and touch layouts fit in both themes', async () => {
      const phone = await browser.newContext({ isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
      try {
        const page = await phone.newPage()
        page.on('pageerror', error => errors.push(String(error)))
        for (const width of [320, 390, 800, 1024, 1440, 2560]) for (const theme of ['light', 'dark']) for (const [locale, prefix] of LOCALES) {
          await page.setViewportSize({ width, height: 1000 })
          await page.emulateMedia({ colorScheme: theme })
          await page.goto(base + prefix)
          const section = page.locator('.video-intro')
          await section.scrollIntoViewIfNeeded()
          const layout = await section.evaluate(node => {
            const copy = node.querySelector('.intro-copy').getBoundingClientRect(), frame = node.querySelector('.intro-player').getBoundingClientRect(), title = node.querySelector('.intro-cover-title').getBoundingClientRect(), brand = node.querySelector('.intro-brand').getBoundingClientRect(), footer = node.querySelector('.intro-cover-footer').getBoundingClientRect(), watch = node.querySelector('.intro-author').getBoundingClientRect(), play = node.querySelector('.intro-play').getBoundingClientRect()
            const sectionDeltas = ['.home-plan-grid', '.home-faq-list'].map(selector => { const reference = document.querySelector(selector).getBoundingClientRect(); return Math.max(Math.abs(frame.left - reference.left), Math.abs(frame.right - reference.right), Math.abs(frame.width - reference.width)) })
            return { stacked: copy.bottom < frame.top, topDelta: Math.abs(copy.top - frame.top), sectionDeltas, overflow: document.documentElement.scrollWidth - innerWidth, coverFits: title.top >= brand.bottom && title.bottom <= footer.top && title.right <= frame.right, watchHeight: watch.height, playHeight: play.height }
          })
          assert(layout.overflow <= 0 && layout.stacked === (width <= 900) && layout.coverFits && layout.watchHeight >= 44 && layout.playHeight >= 44, JSON.stringify({ locale, width, theme, layout }))
          assert((width <= 900 || layout.topDelta <= 1) && layout.sectionDeltas.every(delta => delta <= 1), `shared section alignment drift: ${JSON.stringify({ locale, width, theme, layout })}`)
          if (width === 390 && locale === 'zh-CN' && theme === 'dark') {
            await section.screenshot({ path: join(artifact, 'video-intro-zh-phone-dark.png') })
            await page.locator('.intro-player summary').tap()
            await page.waitForFunction(() => document.querySelector('.intro-player video').currentTime > .1)
            await page.locator('.intro-player summary').tap()
            assert(await page.locator('.intro-player').evaluate(node => !node.open), 'touch reset failed')
          }
          facts.push({ locale, width, theme, layout })
        }
      } finally { await phone.close() }
    })

    await check('video intro: failed media returns to the cover and an actual retry plays successfully', async () => {
      const failure = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
      try {
        const page = await failure.newPage()
        await failure.route('**/product-tour.mp4', route => route.abort('failed'))
        await page.goto(`${base}/zh-CN/`)
        await page.locator('.intro-player > summary').click()
        await page.locator('.intro-status').waitFor({ state: 'visible' })
        assert(await page.locator('.intro-player').evaluate(node => !node.open), 'failed video left a blank player')
        await page.locator('.video-intro').screenshot({ path: join(artifact, 'video-intro-error.png') })
        await failure.unroute('**/product-tour.mp4')
        await page.locator('.intro-player > summary').click()
        await page.waitForFunction(() => document.querySelector('.intro-player video').currentTime > .1)
        assert(!await page.locator('.intro-status').isVisible(), 'old error stayed after retry')
      } finally { await failure.close() }
    })

    await check('video intro: native cover, reset and local playback work without JavaScript in five locales', async () => {
      const plain = await browser.newContext({ javaScriptEnabled: false, reducedMotion: 'reduce' })
      try {
        const page = await plain.newPage()
        for (const width of [1440, 390]) for (const [locale, prefix] of LOCALES) {
          await page.setViewportSize({ width, height: 1000 })
          await page.goto(base + prefix)
          const summary = page.locator('.intro-player > summary'), video = page.locator('.intro-player video')
          await summary.click()
          assert(await video.isVisible(), `${locale}: static video unavailable`)
          if (locale === 'zh-CN' && width === 390) {
            const finished = page.waitForEvent('requestfinished', { predicate: request => request.url().includes('/product-tour.mp4') })
            const bounds = await video.boundingBox()
            await video.click({ position: { x: 24, y: bounds.height - 48 } })
            await finished
            assert(await video.evaluate(node => !node.paused && node.duration > 10), 'native no-JS control did not start the real clip')
          }
          await summary.click()
          assert(!await video.isVisible(), `${locale}: native reset failed`)
          assert(await page.locator('.intro-quote').isVisible() && await page.locator('.intro-author img').isVisible(), 'static maker note/avatar missing')
        }
      } finally { await plain.close() }
      assert(errors.length === 0 && external.length === 0, JSON.stringify({ errors, external }))
    })
  } finally { await context.close() }
  writeFileSync(join(artifact, 'video-intro.json'), JSON.stringify({ facts, errors, external, scope: 'Static website with the approved local silent 10.4-second UI tour; no desktop-release acceptance.' }, null, 2) + '\n')
}
