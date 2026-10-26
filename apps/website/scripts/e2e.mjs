/**
 * [INPUT]: Static export in out/, Chromium and optional hero-demo/hero-sync/video-intro/services/billing/faq/download/legal selectors.
 * [OUTPUT]: Exit code 0/1 and repeatable reports/screenshots in output/tests/, optionally isolated by a fresh output prefix.
 * [POS]: website's end-to-end acceptance: serves the export exactly as a static host would and drives it like a
 *        visitor — capped layout, static hero, sticky navigation, playable demos with a mirrored mobile sync concept, relation-line carousel, Jev film, theme, platform-aware
 *        split local-video introduction, download, dismissible language menus, five locales with SEO tags, legal documents, planned pricing, finalized billing policy, sealed billing states, narrow layout, reduced motion
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { runLegalCases } from './legal-cases.mjs'
import { runServiceCases } from './service-cases.mjs'
import { runBillingCases } from './billing-cases.mjs'
import { runPolicyCases } from './policy-cases.mjs'
import { runThemeCases } from './theme-cases.mjs'
import { runDownloadCases } from './download-cases.mjs'
import { runFaqCases } from './faq-cases.mjs'
import { runHeroDemoCases } from './hero-demo-cases.mjs'
import { runHeroSyncCases } from './hero-sync-cases.mjs'
import { runVideoIntroCases } from './video-intro-cases.mjs'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'out')
const heroDemoOnly = process.argv.includes('--only=hero-demo')
const heroSyncOnly = process.argv.includes('--only=hero-sync')
const videoIntroOnly = process.argv.includes('--only=video-intro')
const servicesOnly = process.argv.includes('--only=services')
const billingOnly = process.argv.includes('--only=billing')
const faqOnly = process.argv.includes('--only=faq')
const downloadOnly = process.argv.includes('--only=download')
const legalOnly = process.argv.includes('--only=legal')
const outputPrefixes = process.argv.filter(value => value.startsWith('--output-prefix='))
const outputPrefix = outputPrefixes[0]?.slice('--output-prefix='.length)
if (outputPrefixes.length > 1 || outputPrefix !== undefined && !/^[a-z0-9][a-z0-9-]{0,79}$/u.test(outputPrefix)) throw new Error('Use one finite output prefix')
const artifact = join(root, 'output', 'tests', ...(outputPrefix ? [outputPrefix] : []), heroDemoOnly ? 'hero-demo' : heroSyncOnly ? 'hero-sync' : videoIntroOnly ? 'video-intro' : servicesOnly ? 'services' : billingOnly ? 'billing' : faqOnly ? 'faq' : downloadOnly ? 'download' : legalOnly ? 'legal' : 'e2e')
if (outputPrefix && existsSync(artifact)) throw new Error('Prefixed feature evidence must use a fresh directory')
const SITE = 'https://www.goalloom.com'
const SITE_MAX_WIDTH = 1296
const HERO_MAX_WIDTH = SITE_MAX_WIDTH
const ROUTES = JSON.parse(readFileSync(join(root, 'lib/seo/routes.json'), 'utf8'))
const LOCALES = [['en', '/'], ['zh-CN', '/zh-CN/'], ['ja', '/ja/'], ['es', '/es/'], ['fr', '/fr/']]
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

if (!process.argv.includes('--no-build') || !existsSync(out)) execFileSync('pnpm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
if (!outputPrefix) rmSync(artifact, { recursive: true, force: true })
mkdirSync(artifact, { recursive: true })

// --- a static host: directory URLs resolve to index.html, like Vercel serving the export ---
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2', '.mp4': 'video/mp4' }
const server = createServer((req, res) => {
  let path = join(out, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (existsSync(path) && statSync(path).isDirectory()) path = join(path, 'index.html')
  if (!existsSync(path)) { res.writeHead(404); res.end('not found'); return }
  res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' })
  createReadStream(path).pipe(res)
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
const base = `http://127.0.0.1:${server.address().port}`

const results = []
let failed = 0
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log(`✓ ${name}`) }
  catch (error) { failed++; results.push({ name, ok: false, error: String(error?.message ?? error) }); console.log(`✗ ${name}\n  ${error?.message ?? error}`) }
}
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const shot = (page, name, fullPage = false) => page.screenshot({ path: join(artifact, `${name}.png`), fullPage })

const browser = await chromium.launch()
const browserVersion = browser.version()
try {
  if (heroDemoOnly) {
    await runHeroDemoCases({ browser, base, check, assert, shot, artifact })
    await runHeroSyncCases({ browser, base, LOCALES, check, assert, shot, artifact })
  } else if (legalOnly) {
    await runLegalCases({ browser, base, SITE, LOCALES, check, assert, shot, artifact })
    await runPolicyCases({ browser, base, LOCALES, check, assert, shot, artifact })
  } else if (heroSyncOnly) {
    await runHeroSyncCases({ browser, base, LOCALES, check, assert, shot, artifact })
  } else if (videoIntroOnly) {
    await runVideoIntroCases({ browser, base, LOCALES, check, assert, shot, artifact })
  } else if (billingOnly) {
    await runBillingCases({ browser, base, LOCALES, check, assert, shot, artifact })
  } else if (servicesOnly) {
    await runServiceCases({ browser, base, SITE, LOCALES, check, assert, shot, out, artifact })
    await runBillingCases({ browser, base, LOCALES, check, assert, shot, artifact })
    await runPolicyCases({ browser, base, LOCALES, check, assert, shot, artifact })
  } else if (downloadOnly) {
    await runDownloadCases({ browser, base, LOCALES, check, assert, shot, artifact })
  } else if (faqOnly) {
    await runFaqCases({ browser, base, LOCALES, check, assert, artifact })
  } else {
  // --- SEO: every locale is a complete, self-canonical page with reciprocal alternates ---
  const seo = await browser.newPage()
  for (const [locale, path] of LOCALES) {
    await check(`seo ${locale}: lang, title, description, canonical, hreflang, JSON-LD, one h1`, async () => {
      const response = await seo.goto(base + path)
      assert(response.status() === 200, `status ${response.status()}`)
      const facts = await seo.evaluate(() => ({
        lang: document.documentElement.lang,
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content,
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        alternates: [...document.querySelectorAll('link[rel="alternate"][hreflang]')].map(link => [link.hreflang, link.href]),
        ogImage: document.querySelector('meta[property="og:image"]')?.content,
        jsonLd: [...document.querySelectorAll('script[type="application/ld+json"]')].map(node => JSON.parse(node.textContent)),
        h1: document.querySelectorAll('h1').length,
      }))
      assert(facts.lang === locale, `lang ${facts.lang}`)
      assert(facts.title && facts.description, 'missing title/description')
      assert(facts.canonical === SITE + path, `canonical ${facts.canonical}`)
      const hreflangs = Object.fromEntries(facts.alternates)
      for (const [other, otherPath] of LOCALES) assert(hreflangs[other] === SITE + otherPath, `hreflang ${other} = ${hreflangs[other]}`)
      assert(hreflangs['x-default'] === SITE + '/', 'x-default')
      assert(facts.ogImage === SITE + '/og.png', `og:image ${facts.ogImage}`)
      assert(facts.jsonLd[0]?.['@graph']?.some(node => node['@type'] === 'SoftwareApplication'), 'SoftwareApplication JSON-LD')
      assert(facts.h1 === 1, `h1 count ${facts.h1}`)
      assert(await seo.getByRole('tab').count() === 3, 'expected relation-line, smart-input and encrypted-sync tabs')
      assert(await seo.getByRole('tab').first().getAttribute('aria-selected') === 'true', 'relation-line scene is not the default')
      assert(await seo.locator('.window .trow[data-nested="true"]').count() === 1, 'localized outline missing')
      assert(await seo.locator('.window .demo-link-preview').count() === 1, 'localized URL previews missing')
    })
  }
  await check('seo: robots.txt and sitemap.xml list all five locales', async () => {
    const robots = await (await fetch(`${base}/robots.txt`)).text()
    assert(robots.includes(`Sitemap: ${SITE}/sitemap.xml`), 'robots sitemap line')
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text()
    for (const [, path] of LOCALES) assert(sitemap.includes(`<loc>${SITE}${path}</loc>`), `sitemap ${path}`)
  })
  await seo.close()
  await runHeroSyncCases({ browser, base, LOCALES, check, assert, shot, artifact })
  await runVideoIntroCases({ browser, base, LOCALES, check, assert, shot, artifact })
  await runLegalCases({ browser, base, SITE, LOCALES, check, assert, shot, artifact })

  await runServiceCases({ browser, base, SITE, LOCALES, check, assert, shot, out, artifact })
  await runBillingCases({ browser, base, LOCALES, check, assert, shot, artifact })

  await runPolicyCases({ browser, base, LOCALES, check, assert, shot, artifact })

  await runThemeCases({ browser, base, check, assert, shot, artifact })

  await runDownloadCases({ browser, base, LOCALES, check, assert, shot, artifact })

  await runFaqCases({ browser, base, LOCALES, check, assert, artifact })

  // --- Desktop, Chinese, light theme ---
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
  const page = await desk.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`${base}/zh-CN/`)
  await page.waitForLoadState('networkidle')

  await check('product intro replaces the maker quote directly after Hero', async () => {
    assert(await page.locator('main > .video-intro:first-child').count() === 1 && await page.locator('.note').count() === 0, 'approved product intro missing')
  })
  await check('hero at rest: one visible header followed by a full-width desktop', async () => {
    const state = await page.evaluate(() => {
      const header = document.querySelector('.site-header'), hero = document.querySelector('.stage-frame')
      const head = header.getBoundingClientRect(), frame = hero.getBoundingClientRect()
      return { headers: document.querySelectorAll('.site-header').length, opacity: getComputedStyle(header).opacity,
        inert: header.inert, top: head.top, headerBottom: head.bottom, heroTop: frame.top, width: frame.width, siteWidth: document.querySelector('main').clientWidth, viewport: innerWidth,
        radius: getComputedStyle(hero).borderRadius, windowRadius: getComputedStyle(document.querySelector('.window')).borderRadius,
        border: getComputedStyle(hero).borderTopWidth, clip: getComputedStyle(hero).overflow,
        headerBorder: getComputedStyle(header).borderBottomWidth }
    })
    assert(state.headers === 1 && state.opacity === '1' && !state.inert && state.top === 0, JSON.stringify(state))
    assert(state.headerBorder === '0px', JSON.stringify(state))
    assert(state.heroTop === state.headerBottom && state.width === Math.min(state.viewport, HERO_MAX_WIDTH) && state.siteWidth === Math.min(state.viewport, SITE_MAX_WIDTH), JSON.stringify(state))
    assert(state.radius === '12px' && state.radius === state.windowRadius && state.border === '1px' && state.clip === 'hidden', JSON.stringify(state))
    await shot(page, 'desktop-hero-rest')
  })
  await check('hero scroll: geometry stays fixed while the desktop scrolls and the same header stays visible', async () => {
    const geometry = () => page.locator('.stage-frame').evaluate(node => {
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
      return { top: rect.top, width: rect.width, height: rect.height, radius: style.borderTopLeftRadius }
    })
    const before = await geometry()
    await page.evaluate(() => scrollTo({ top: 360, behavior: 'instant' }))
    const after = await geometry()
    assert(before.top - after.top === 360, JSON.stringify({ before, after }))
    assert(before.width === after.width && before.height === after.height && before.radius === after.radius, JSON.stringify({ before, after }))
    assert(await page.locator('.site-header').evaluate(node => node.getBoundingClientRect().top) === 0, 'header did not stay at the top')
    await shot(page, 'desktop-hero-scrolled')
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }))
  })
  await check('layout: desktop and ultrawide screens share a centered 1296px maximum width', async () => {
    for (const width of [1024, 1296, 1440, 2560]) {
      await page.setViewportSize({ width, height: 900 })
      const state = await page.evaluate(() => {
        const rect = document.querySelector('main').getBoundingClientRect()
        const hero = document.querySelector('.stage-frame').getBoundingClientRect()
        const brand = document.querySelector('.site-header .brand').getBoundingClientRect()
        const download = document.querySelector('.site-header .download-split').getBoundingClientRect()
        return { width: rect.width, left: rect.left, overflow: document.documentElement.scrollWidth - innerWidth,
          brandLeft: brand.left, downloadRight: download.right, heroLeft: hero.left, heroRight: hero.right,
          contentEdges: [...document.querySelectorAll('main .section, .site-footer')].map(node => {
            const bounds = node.getBoundingClientRect(), style = getComputedStyle(node)
            return { left: bounds.left + parseFloat(style.paddingLeft), right: bounds.right - parseFloat(style.paddingRight) }
          }),
          widths: ['.site-header', 'main', '.site-footer'].map(selector => document.querySelector(selector).getBoundingClientRect().width), heroWidth: hero.width }
      })
      const expected = Math.min(width, SITE_MAX_WIDTH)
      assert(state.width === expected && state.left === (width - expected) / 2 && state.overflow <= 0, JSON.stringify(state))
      assert(state.widths.every(value => value === expected), JSON.stringify(state))
      assert(state.brandLeft === state.left && state.downloadRight === state.left + expected, JSON.stringify(state))
      assert(state.contentEdges.every(edge => edge.left === state.left && edge.right === state.left + expected), JSON.stringify(state))
      const heroExpected = Math.min(width, HERO_MAX_WIDTH)
      assert(state.heroWidth === heroExpected && state.heroLeft === (width - heroExpected) / 2, JSON.stringify(state))
      if (width === 2560) await shot(page, 'ultrawide-hero')
    }
    await page.setViewportSize({ width: 1440, height: 900 })
  })
  await check('layout: all thirty localized routes share the site cap in light/dark themes', async () => {
    const layouts = []
    await page.setViewportSize({ width: 2560, height: 1080 })
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme })
      for (const [locale, prefix] of LOCALES) for (const route of ROUTES) {
        const path = route.path === '/' ? prefix : `${prefix}${route.path.slice(1)}`
        await page.goto(base + path)
        const state = await page.evaluate(() => {
          const bounds = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width } }
          return { body: bounds('body'), header: bounds('.site-header'), main: bounds('main'), footer: bounds('.site-footer'), overflow: document.documentElement.scrollWidth - innerWidth }
        })
        assert(state.body.width === 2560 && state.body.left === 0 && state.overflow <= 0, JSON.stringify({ path, theme, state }))
        for (const key of ['header', 'main', 'footer']) assert(state[key].width === SITE_MAX_WIDTH && state[key].left === (2560 - SITE_MAX_WIDTH) / 2, `${path}/${theme}: ${key} differs from the shared site frame`)
        layouts.push({ path, locale, theme, ...state })
      }
    }
    writeFileSync(join(artifact, 'site-width.json'), JSON.stringify({ maximumWidth: SITE_MAX_WIDTH, heroMaximumWidth: HERO_MAX_WIDTH, reduction: .1, layouts }, null, 2) + '\n')
    await page.emulateMedia({ colorScheme: 'light' })
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(`${base}/zh-CN/`)
  })
  await check('hero menu: preferences use the macOS status area, keyboard and language navigation', async () => {
    const menuPage = await desk.newPage()
    await menuPage.goto(`${base}/zh-CN/`)
    assert(await menuPage.locator('.site-header .menu-pop, .site-header .nav-icon').count() === 0, 'homepage preferences duplicated in header')
    assert(await menuPage.locator('.menubar').getByRole('button', { name: '切换到深色主题' }).count() === 1, 'theme control hidden from accessibility tree')
    const summary = menuPage.locator('.menubar summary')
    await summary.focus()
    await summary.press('Enter')
    assert(await menuPage.locator('.menubar .menu-panel').isVisible(), 'keyboard did not open language menu')
    const bounds = await menuPage.locator('.menubar .menu-panel').boundingBox()
    const hero = await menuPage.locator('.stage-frame').boundingBox()
    assert(bounds.y > hero.y && bounds.y + bounds.height < hero.y + hero.height && bounds.x + bounds.width <= hero.x + hero.width, 'language popover clipped by hero')
    await shot(menuPage, 'hero-menubar-language')
    await summary.press('Enter')
    await summary.press('Tab')
    assert(await menuPage.locator('.menubar button').evaluate(node => node === document.activeElement), 'keyboard did not reach theme control')
    await summary.click()
    await menuPage.locator('.menubar .menu-panel a[lang="es"]').click()
    await menuPage.waitForLoadState('domcontentloaded')
    assert(new URL(menuPage.url()).pathname === '/es/' && await menuPage.locator('html').getAttribute('lang') === 'es', 'language selection failed from hero')
    await menuPage.close()
  })
  for (const [name, path, selector, outside] of [
    ['hero', '/zh-CN/', '.menubar .menu-pop', '.menubar .clock'],
    ['header', '/zh-CN/pricing/', '.site-header .menu-pop', 'main h1'],
    ['footer', '/zh-CN/', '.site-footer .menu-pop', '.site-footer > span'],
  ]) {
    await check(`language menu ${name}: outside click dismisses, inside click stays open and Escape restores focus`, async () => {
      const menuPage = await desk.newPage()
      try {
        await menuPage.goto(base + path)
        const menu = menuPage.locator(selector)
        const trigger = menu.locator('summary')
        const panel = menu.locator('.menu-panel')
        await trigger.click()
        await panel.waitFor({ state: 'visible' })
        await panel.click({ position: { x: 3, y: 3 } })
        assert(await panel.isVisible(), 'inside padding closed the language menu')
        await menuPage.locator(outside).click()
        await panel.waitFor({ state: 'hidden' })
        await trigger.click()
        await panel.locator('a').first().focus()
        await menuPage.keyboard.press('Escape')
        await panel.waitFor({ state: 'hidden' })
        assert(await trigger.evaluate(node => node === document.activeElement), 'Escape did not restore trigger focus')
        if (name === 'hero') {
          await trigger.click()
          const filter = menuPage.locator('.window .chip').first()
          await filter.click()
          await panel.waitFor({ state: 'hidden' })
          assert(await filter.getAttribute('aria-pressed') === 'true', 'outside dismissal blocked the clicked control')
          assert(await filter.evaluate(node => node === document.activeElement), 'outside dismissal stole focus')
        }
        await shot(menuPage, `language-menu-${name}-dismissed`)
      } finally {
        await menuPage.close()
      }
    })
  }
  await runHeroDemoCases({ browser, base, check, assert, shot, artifact })
  await check('navigation: direct section URLs leave headings visible below the sticky header', async () => {
    await page.goto(`${base}/zh-CN/#intro`)
    await page.waitForFunction(() => Math.abs(document.querySelector('#intro').getBoundingClientRect().top - document.querySelector('.site-header').getBoundingClientRect().bottom) < 1)
    assert(await page.locator('.site-header').count() === 1, 'duplicate navigation')
    await shot(page, 'desktop-sticky-navigation')
  })
  await check('sections enter once and stay in', async () => {
    for (const id of ['intro', 'faq']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded()
      await page.waitForTimeout(800)
      assert(await page.locator(`#${id}`).getAttribute('data-reveal') === 'in', `${id} not revealed`)
    }
  })
  await check('download: macOS visitor sees the macOS installer first', async () => {
    await page.locator('#download').scrollIntoViewIfNeeded()
    await page.waitForTimeout(900)
    assert(await page.locator('#download .download-primary[data-for="mac"]').isVisible(), 'mac hidden')
    assert(!(await page.locator('#download .download-primary[data-for="windows"]').isVisible()), 'windows shown')
    assert(!(await page.locator('#download .dl-copy').isVisible()), 'phone button on desktop')
    await shot(page, 'desktop-download')
  })
  await check('theme: the toggle turns the whole page dark and swaps wallpapers', async () => {
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForTimeout(300)
    await page.locator('.menubar').getByRole('button', { name: '切换到深色主题' }).click()
    await page.waitForTimeout(450)
    const state = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.body).backgroundColor,
      intro: getComputedStyle(document.querySelector('.video-intro')).color,
      heroBorder: getComputedStyle(document.querySelector('.stage-frame')).borderTopColor,
    }))
    assert(state.theme === 'dark' && state.bg === 'rgb(28, 25, 22)', JSON.stringify(state))
    assert(state.heroBorder === 'rgba(255, 240, 220, 0.13)', JSON.stringify(state))
    await page.waitForTimeout(500)
    await shot(page, 'desktop-dark-hero')
    await page.locator('.video-intro').scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    await shot(page, 'desktop-dark-lines')
    await page.reload()
    assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'theme not persisted')
  })
  await check('no runtime errors on the desktop page', async () => assert(errors.length === 0, errors.join('\n')))
  await page.goto(`${base}/`)
  await shot(page, 'desktop-en-hero')
  await check('English product intro renders the localized cover and bundled brand asset', async () => {
    assert((await page.locator('.intro-copy h2').textContent()).includes('Why Goalloom'), 'English maker heading missing')
    assert(await page.locator('.intro-brand img').evaluate(img => img.complete && img.naturalWidth > 0), 'brand asset not loaded')
  })
  await check('language menu links every locale', async () => {
    const hrefs = await page.locator('.menubar .menu-panel a').evaluateAll(links => links.map(link => link.getAttribute('href')))
    for (const [, path] of LOCALES) assert(hrefs.includes(path), `missing ${path}`)
  })
  await desk.close()

  // --- Windows visitor ---
  const win = await browser.newContext({ viewport: { width: 1440, height: 900 }, userAgent: WINDOWS_UA })
  const winPage = await win.newPage()
  await winPage.goto(`${base}/fr/`)
  await check('download: Windows visitor sees the Windows installer first (before any script effect)', async () => {
    assert(await winPage.evaluate(() => document.documentElement.dataset.platform) === 'windows', 'platform')
    await winPage.locator('#download').scrollIntoViewIfNeeded()
    await winPage.waitForTimeout(900)
    assert(await winPage.locator('.site-header').evaluate(node => node.getBoundingClientRect().top) === 0, 'sticky header missing')
    assert(await winPage.locator('#download .download-primary[data-for="windows"]').isVisible(), 'windows hidden')
    assert(!(await winPage.locator('#download .download-primary[data-for="mac"]').isVisible()), 'mac shown')
    await shot(winPage, 'desktop-fr-windows-download')
  })
  await win.close()

  // --- Phone ---
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const mobile = await phone.newPage()
  await mobile.goto(`${base}/zh-CN/`)
  await mobile.waitForLoadState('networkidle')
  await check('phone: no horizontal overflow, plain header bar, single-column window', async () => {
    const state = await mobile.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      headOpacity: getComputedStyle(document.querySelector('.site-header')).opacity,
      heroWidth: document.querySelector('.stage-frame').getBoundingClientRect().width,
      heroRadius: getComputedStyle(document.querySelector('.stage-frame')).borderRadius,
      windowRadius: getComputedStyle(document.querySelector('.window')).borderRadius,
      brandLeft: document.querySelector('.site-header .brand').getBoundingClientRect().left,
      downloadRight: document.querySelector('.site-header .download-split').getBoundingClientRect().right,
      contentAligned: [...document.querySelectorAll('main .section, .site-footer')].every(node => {
        const bounds = node.getBoundingClientRect(), style = getComputedStyle(node)
        return bounds.left + parseFloat(style.paddingLeft) === 0 && bounds.right - parseFloat(style.paddingRight) === innerWidth
      }),
      columns: [...document.querySelectorAll('.window .bcol')].filter(node => getComputedStyle(node).display !== 'none').length,
    }))
    assert(state.overflow <= 0 && state.headOpacity === '1' && state.columns === 1 && state.heroWidth === 390, JSON.stringify(state))
    assert(state.heroRadius === '12px' && state.heroRadius === state.windowRadius, JSON.stringify(state))
    assert(state.brandLeft === 0 && state.downloadRight === state.heroWidth, JSON.stringify(state))
    assert(state.contentAligned, JSON.stringify(state))
    await shot(mobile, 'phone-hero')
  })
  await check('hero menu: all five languages fit narrow screens with touch-sized controls', async () => {
    const menuPage = await phone.newPage()
    for (const width of [320, 390]) {
      await menuPage.setViewportSize({ width, height: 844 })
      for (const [, path] of LOCALES) {
        await menuPage.goto(base + path)
        assert(await menuPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `status bar overflow ${width}/${path}`)
        for (const control of await menuPage.locator('.menubar summary, .menubar button').all()) {
          const box = await control.boundingBox()
          assert(box.width >= 44 && box.height >= 44, 'status control touch target below 44px')
        }
        const clock = await menuPage.locator('.menubar .clock').boundingBox()
        assert(clock.x + clock.width <= width, 'localized clock extends outside hero')
        await menuPage.locator('.menubar summary').tap()
        assert(await menuPage.locator('.menubar .menu-panel').isVisible(), 'touch language menu inaccessible')
        const panel = await menuPage.locator('.menubar .menu-panel').boundingBox()
        assert(panel.x >= 0 && panel.x + panel.width <= width, 'touch menu clipped')
        await menuPage.locator('.menubar .clock').tap()
        await menuPage.locator('.menubar .menu-panel').waitFor({ state: 'hidden' })
      }
    }
    await menuPage.goto(`${base}/zh-CN/`)
    await shot(menuPage, 'hero-menubar-mobile')
    await menuPage.close()
  })
  await check('phone: original maker note, avatar and video fit the shared intro', async () => {
    await mobile.locator('.video-intro').scrollIntoViewIfNeeded()
    assert(await mobile.locator('.intro-quote').isVisible() && await mobile.locator('.intro-author img').isVisible(), 'maker note or avatar missing')
    assert(await mobile.locator('.intro-options').count() === 0, 'scene buttons remain')
    await shot(mobile, 'phone-maker-video')
  })
  await mobile.evaluate(() => scrollTo(0, 0))
  await shot(mobile, 'phone-full', true)
  await phone.close()

  // --- First paint must not depend on hydration or scroll handlers ---
  const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 2560, height: 1080 } })
  const staticPage = await plain.newPage()
  await check('no JavaScript: all five homepages show the header and capped hero immediately', async () => {
    for (const [, path] of LOCALES) {
      await staticPage.goto(base + path)
      const state = await staticPage.evaluate(() => {
        const header = document.querySelector('.site-header').getBoundingClientRect(), hero = document.querySelector('.stage-frame').getBoundingClientRect()
        return { top: header.top, headerBottom: header.bottom, heroTop: hero.top, left: hero.left, width: hero.width,
          opacity: getComputedStyle(document.querySelector('.site-header')).opacity }
      })
      assert(state.top === 0 && state.headerBottom === state.heroTop && state.width === HERO_MAX_WIDTH && state.left === (2560 - HERO_MAX_WIDTH) / 2 && state.opacity === '1', JSON.stringify(state))
      await staticPage.locator('.menubar .menu-pop summary').click()
      assert(await staticPage.locator('.menubar .menu-panel').isVisible(), 'language menu inaccessible')
    }
    await shot(staticPage, 'ultrawide-no-js-hero')
  })
  await plain.close()

  // --- Reduced motion ---
  const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const still = await calm.newPage()
  await still.goto(`${base}/ja/`)
  await check('reduced motion: video waits for a click and sections remain visible', async () => {
    await still.locator('.video-intro').scrollIntoViewIfNeeded()
    assert(await still.locator('video').evaluate(node => node.paused && !node.autoplay), 'video starts without user input')
    assert(await still.locator('#faq').evaluate(node => getComputedStyle(node).opacity) === '1', 'FAQ hidden')
  })
  await calm.close()
  }
} finally {
  await browser.close()
  server.close()
}

writeFileSync(join(artifact, 'report.json'), JSON.stringify({ at: new Date().toISOString(), runtime: { node: process.version, platform: process.platform, arch: process.arch, chromium: browserVersion, scope: 'static website; no desktop or payment-provider lifecycle acceptance' }, passed: results.length - failed, failed, results }, null, 2))
console.log(`\n${results.length - failed}/${results.length} passed · artifact: ${artifact}`)
process.exit(failed ? 1 : 0)
