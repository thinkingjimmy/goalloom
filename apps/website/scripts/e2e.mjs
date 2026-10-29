/**
 * [INPUT]: Static export in out/, Chromium and optional theme/home-layout/hero-demo/hero-sync/video-intro/services/billing/faq/download/legal selectors.
 * [OUTPUT]: Exit code 0/1 and repeatable reports/screenshots in output/tests/, optionally isolated by a fresh output prefix.
 * [POS]: website's end-to-end acceptance: serves the export exactly as a static host would and drives it like a
 *        visitor — capped layout, scroll-responsive hero, sticky navigation, playable demos with a mirrored mobile sync concept, relation-line carousel, Jev film, theme, platform-aware
 *        split local-video introduction, download, dismissible language menus, five locales with SEO tags, legal documents, planned pricing, finalized billing policy, sealed billing states, narrow layout, reduced motion
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'
import { runHomeLayoutCases } from './home-layout-cases.mjs'
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
const themeOnly = process.argv.includes('--only=theme')
const homeLayoutOnly = process.argv.includes('--only=home-layout')
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
const artifact = join(root, 'output', 'tests', ...(outputPrefix ? [outputPrefix] : []), themeOnly ? 'theme' : homeLayoutOnly ? 'home-layout' : heroDemoOnly ? 'hero-demo' : heroSyncOnly ? 'hero-sync' : videoIntroOnly ? 'video-intro' : servicesOnly ? 'services' : billingOnly ? 'billing' : faqOnly ? 'faq' : downloadOnly ? 'download' : legalOnly ? 'legal' : 'e2e')
if (outputPrefix && existsSync(artifact)) throw new Error('Prefixed feature evidence must use a fresh directory')
const SITE = 'https://www.goalloom.com'
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
  if (themeOnly) {
    await runThemeCases({ browser, base, check, assert, shot, artifact })
  } else if (homeLayoutOnly) {
    await runHomeLayoutCases({ browser, base, LOCALES, ROUTES, check, assert, shot, artifact })
  } else if (heroDemoOnly) {
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
  await runHomeLayoutCases({ browser, base, LOCALES, ROUTES, check, assert, shot, artifact })
  for (const [name, path, selector, outside] of [
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
    await page.locator('.site-footer').getByRole('button', { name: '切换到深色主题' }).click()
    await page.waitForTimeout(450)
    const state = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.body).backgroundColor,
      intro: getComputedStyle(document.querySelector('.video-intro')).color,
      heroBorder: getComputedStyle(document.querySelector('.hero-shell')).borderTopColor,
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
    const hrefs = await page.locator('.site-footer .menu-panel a').evaluateAll(links => links.map(link => link.getAttribute('href')))
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
        return bounds.left + parseFloat(style.paddingLeft) === 16 && bounds.right - parseFloat(style.paddingRight) === innerWidth - 16
      }),
      columns: [...document.querySelectorAll('.window .bcol')].filter(node => getComputedStyle(node).display !== 'none').length,
    }))
    assert(state.overflow <= 0 && state.headOpacity === '1' && state.columns === 1 && state.heroWidth === 348, JSON.stringify(state))
    assert(state.heroRadius === '0px' && state.windowRadius === '12px', JSON.stringify(state))
    assert(state.brandLeft === 16 && state.downloadRight === 374, JSON.stringify(state))
    assert(state.contentAligned, JSON.stringify(state))
    await shot(mobile, 'phone-hero')
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
