/**
 * [INPUT]: The static export in out/ (built first unless --no-build), Playwright's Chromium
 * [OUTPUT]: Exit code 0/1, and a repeatable artifact in output/e2e/: report.json plus screenshots of every checked state
 * [POS]: website's end-to-end acceptance: serves the export exactly as a static host would and drives it like a
 *        visitor — scroll choreography, the playable hero, relation-line carousel, Jev film, theme, platform-aware
 *        download, five locales with SEO tags, narrow layout, reduced motion
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { extname, join, resolve } from 'node:path'
import { chromium } from 'playwright'

const root = resolve(import.meta.dirname, '..')
const out = join(root, 'out')
const artifact = join(root, 'output', 'e2e')
const SITE = 'https://www.goalloom.com'
const LOCALES = [['en', '/'], ['zh-CN', '/zh-CN/'], ['ja', '/ja/'], ['es', '/es/'], ['fr', '/fr/']]
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

if (!process.argv.includes('--no-build') || !existsSync(out)) execFileSync('pnpm', ['run', 'build'], { cwd: root, stdio: 'inherit' })
rmSync(artifact, { recursive: true, force: true })
mkdirSync(artifact, { recursive: true })

// --- a static host: directory URLs resolve to index.html, like Vercel serving the export ---
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2' }
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
try {
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
    })
  }
  await check('seo: robots.txt and sitemap.xml list all five locales', async () => {
    const robots = await (await fetch(`${base}/robots.txt`)).text()
    assert(robots.includes(`Sitemap: ${SITE}/sitemap.xml`), 'robots sitemap line')
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text()
    for (const [, path] of LOCALES) assert(sitemap.includes(`<loc>${SITE}${path}</loc>`), `sitemap ${path}`)
  })
  await seo.close()

  // --- Desktop, Chinese, light theme ---
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })
  const page = await desk.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  await page.goto(`${base}/zh-CN/`)
  await page.waitForLoadState('networkidle')

  await check('maker note links the author on X (Chinese account)', async () => {
    assert(await page.locator('.note-author').getAttribute('href') === 'https://x.com/thinkingjimmy', 'zh author link')
  })
  await check('hero at rest: full-bleed desktop, header band hidden and inert', async () => {
    const state = await page.evaluate(() => {
      const stage = document.querySelector('.stage'), band = document.querySelector('.stage-band')
      return { padding: getComputedStyle(stage).paddingTop, opacity: getComputedStyle(document.querySelector('.stage-head')).opacity, inert: band.inert }
    })
    assert(state.padding === '0px' && state.opacity === '0' && state.inert, JSON.stringify(state))
    await shot(page, 'desktop-hero-rest')
  })
  await check('hero scroll: desktop shrinks into a framed stage and the header band appears', async () => {
    await page.evaluate(() => scrollTo(0, 360))
    await page.waitForTimeout(400)
    const state = await page.evaluate(() => {
      const stage = document.querySelector('.stage')
      return { top: parseFloat(getComputedStyle(stage).paddingTop), side: parseFloat(getComputedStyle(stage).paddingLeft), opacity: Number(getComputedStyle(document.querySelector('.stage-head')).opacity), radius: getComputedStyle(document.querySelector('.stage-frame')).borderTopLeftRadius }
    })
    assert(state.top > 70 && state.side > 20 && state.opacity === 1 && state.radius === '20px', JSON.stringify(state))
    await shot(page, 'desktop-hero-shrunk')
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForTimeout(300)
  })
  await check('hero demo: filter one goal lights its rows and draws relation lines', async () => {
    await page.getByRole('button', { name: '只看上线 Goalloom 1.0' }).click()
    const lit = await page.locator('.window .trow[data-state="lit"]').count()
    const dim = await page.locator('.window .trow[data-state="dim"]').count()
    const edges = await page.locator('.window .edge').count()
    assert(lit >= 8 && dim >= 4 && edges >= 6, `lit ${lit} dim ${dim} edges ${edges}`)
    await shot(page, 'desktop-hero-filter')
  })
  await check('hero demo: hovering a row keeps only its chain hot', async () => {
    await page.locator('.window .trow', { hasText: '录演示视频' }).hover()
    const hot = await page.locator('.window .edge[data-state="hot"]').count()
    const faded = await page.locator('.window .edge[data-state="faded"]').count()
    const out = await page.locator('.window .trow[data-state="out"]').count()
    assert(hot >= 3 && faded >= 1 && out >= 1, `hot ${hot} faded ${faded} out ${out}`)
    await shot(page, 'desktop-hero-hover-chain')
    await page.mouse.move(5, 5)
  })
  await check('hero demo: create through the composer, then undo from the toast', async () => {
    await page.getByRole('button', { name: '全部' }).first().click()
    await page.getByRole('button', { name: '新建 ⌘N' }).click()
    const dialog = page.getByRole('dialog', { name: '创建到今天' })
    await dialog.waitFor()
    await page.waitForTimeout(300)
    assert(await dialog.getByText('放到今天，归到「完成官网与下载页」下').isVisible(), 'Jev sentence')
    await shot(page, 'desktop-hero-composer')
    await dialog.getByRole('button', { name: /创建到今天/ }).click()
    await page.locator('.window .trow', { hasText: '给官网配一张首屏插画' }).waitFor()
    assert(await page.getByRole('status').filter({ hasText: '已创建事项' }).isVisible(), 'created toast')
    await shot(page, 'desktop-hero-created')
    await page.locator('.window .toast').getByRole('button', { name: /撤销/ }).click()
    await page.locator('.window .trow', { hasText: '给官网配一张首屏插画' }).waitFor({ state: 'detached' })
  })
  await check('hero demo: composer closes with Escape; checkboxes complete items', async () => {
    await page.getByRole('button', { name: '新建 ⌘N' }).click()
    await page.keyboard.press('Escape')
    assert(await page.getByRole('dialog').count() === 0, 'dialog still open')
    const box = page.getByRole('button', { name: '完成：回复房东邮件' })
    await box.click()
    assert(await page.getByRole('button', { name: '标为未完成：回复房东邮件' }).getAttribute('aria-pressed') === 'true', 'not completed')
  })
  await check('hero demo: scene switcher reaches the composer and relation lines', async () => {
    await page.getByRole('tab', { name: '关系线' }).click()
    assert(await page.locator('.window .edge').count() > 0, 'lines scene')
    await page.getByRole('tab', { name: '智能输入' }).click()
    assert(await page.getByRole('dialog').count() === 1, 'composer scene')
    await page.getByRole('tab', { name: '目标看板' }).click()
    assert(await page.getByRole('dialog').count() === 0 && await page.locator('.window .edge').count() === 0, 'board scene')
  })
  await check('scroll past the hero: floating header takes over', async () => {
    await page.evaluate(() => scrollTo(0, document.getElementById('hero-pin').offsetHeight + 40))
    await page.waitForTimeout(500)
    assert(await page.locator('.float-head').getAttribute('data-shown') === 'true', 'float header hidden')
  })
  await check('sections enter once and stay in', async () => {
    for (const id of ['board', 'jev', 'download']) {
      await page.locator(`#${id}`).scrollIntoViewIfNeeded()
      await page.waitForTimeout(800)
      assert(await page.locator(`#${id}`).getAttribute('data-reveal') === 'in', `${id} not revealed`)
    }
  })
  await check('relation lines: carousel autoplays, a pick stops it and swaps the figure', async () => {
    await page.locator('.cases').scrollIntoViewIfNeeded()
    await page.locator('.story').first().evaluate(node => node.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(5600)
    assert(await page.locator('.cases').getAttribute('data-auto') === 'on', 'autoplay off')
    assert(await page.locator('.cases button[aria-pressed="true"]').innerText().then(text => !text.includes('一键筛选')), 'did not advance')
    await page.locator('.cases button', { hasText: '目标拆成多步' }).click()
    assert(await page.locator('.cases').getAttribute('data-auto') === 'off', 'pick did not stop autoplay')
    await page.waitForTimeout(400)
    assert(await page.locator('.fig-lines .edge[data-state="hot"]').count() >= 4, 'fan-out figure')
    await shot(page, 'desktop-lines-fanout')
    await page.locator('.cases button', { hasText: '键盘友好' }).focus()
    await page.keyboard.press('Enter')
    assert(await page.locator('.fig-lines .shortcut-card').isVisible(), 'keyboard figure')
  })
  await check('Jev film: plays when seen and lands the item in Today', async () => {
    await page.locator('.jev-stage').evaluate(node => node.scrollIntoView({ block: 'center' }))
    await page.locator('.jev-stage .cand-skeleton').first().waitFor({ timeout: 8000 })
    await page.locator('.jev-stage .cand-primary[data-pressed="true"]').waitFor({ timeout: 8000 })
    await page.locator('.jev-stage .board .trow[data-new="true"]', { hasText: '把首页标题定下来' }).waitFor({ timeout: 4000 })
    await shot(page, 'desktop-jev-landed')
  })
  await check('download: macOS visitor sees the macOS installer first', async () => {
    await page.locator('#download').scrollIntoViewIfNeeded()
    await page.waitForTimeout(900)
    assert(await page.locator('#download [data-for="mac"] .dl-main').isVisible(), 'mac hidden')
    assert(!(await page.locator('#download [data-for="windows"] .dl-main').isVisible()), 'windows shown')
    assert(!(await page.locator('.dl-copy').isVisible()), 'phone button on desktop')
    await shot(page, 'desktop-download')
  })
  await check('theme: the toggle turns the whole page dark and swaps wallpapers', async () => {
    await page.evaluate(() => scrollTo(0, 0))
    await page.waitForTimeout(300)
    await page.evaluate(() => scrollTo(0, 360))
    await page.waitForTimeout(400)
    await page.locator('.stage-head').getByRole('button', { name: '切换到深色主题' }).click()
    await page.waitForTimeout(450)
    const state = await page.evaluate(() => ({
      theme: document.documentElement.dataset.theme,
      bg: getComputedStyle(document.body).backgroundColor,
      note: getComputedStyle(document.querySelector('.note')).color,
    }))
    assert(state.theme === 'dark' && state.bg === 'rgb(28, 25, 22)', JSON.stringify(state))
    await page.waitForTimeout(500)
    await shot(page, 'desktop-dark-hero')
    await page.locator('.story').first().evaluate(node => node.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(400)
    await shot(page, 'desktop-dark-lines')
    await page.reload()
    assert(await page.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'theme not persisted')
  })
  await check('no runtime errors on the desktop page', async () => assert(errors.length === 0, errors.join('\n')))
  await page.goto(`${base}/`)
  await shot(page, 'desktop-en-hero')
  await check('maker note links the author on X (English account) with the avatar', async () => {
    const author = page.locator('.note-author')
    assert(await author.getAttribute('href') === 'https://x.com/hellojimmywong', 'author link')
    assert(await author.locator('img.avatar').evaluate(img => img.complete && img.naturalWidth > 0), 'avatar not loaded')
  })
  await check('language menu links every locale', async () => {
    const hrefs = await page.locator('.stage-head .menu-panel a').evaluateAll(links => links.map(link => link.getAttribute('href')))
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
    assert(await winPage.locator('#download').getAttribute('data-reveal') === 'in', 'download never entered')
    assert(await winPage.locator('.float-head').getAttribute('data-shown') === 'true', 'floating header missing')
    assert(await winPage.locator('#download [data-for="windows"] .dl-main').isVisible(), 'windows hidden')
    assert(!(await winPage.locator('#download [data-for="mac"] .dl-main').isVisible()), 'mac shown')
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
      headOpacity: getComputedStyle(document.querySelector('.stage-head')).opacity,
      columns: [...document.querySelectorAll('.window .bcol')].filter(node => getComputedStyle(node).display !== 'none').length,
    }))
    assert(state.overflow <= 0 && state.headOpacity === '1' && state.columns === 1, JSON.stringify(state))
    await shot(mobile, 'phone-hero')
  })
  await check('phone: relation lines use the chain list, download offers the copy link', async () => {
    await mobile.locator('.chain-wrap').scrollIntoViewIfNeeded()
    assert(await mobile.locator('.chain-wrap').isVisible() && !(await mobile.locator('.fig-lines .card').isVisible()), 'chain list')
    await shot(mobile, 'phone-lines')
    await mobile.locator('.jev-stage').scrollIntoViewIfNeeded()
    await mobile.waitForTimeout(1500)
    assert(await mobile.locator('.jev-stage .composer').isVisible(), 'composer on phone')
    await shot(mobile, 'phone-jev')
    await mobile.locator('#download').scrollIntoViewIfNeeded()
    assert(await mobile.locator('.dl-copy').isVisible(), 'copy link')
    await shot(mobile, 'phone-download')
  })
  await mobile.evaluate(() => scrollTo(0, 0))
  await shot(mobile, 'phone-full', true)
  await phone.close()

  // --- Reduced motion ---
  const calm = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const still = await calm.newPage()
  await still.goto(`${base}/ja/`)
  await check('reduced motion: no carousel autoplay, Jev film rests on the suggestion, sections visible', async () => {
    await still.locator('.jev-stage').scrollIntoViewIfNeeded()
    await still.waitForTimeout(1200)
    assert(await still.locator('.cases').getAttribute('data-auto') === 'off', 'carousel autoplay')
    assert(await still.locator('.jev-stage .cand-primary').isVisible(), 'suggestion not shown')
    assert(await still.locator('#download').evaluate(node => getComputedStyle(node).opacity) === '1', 'download hidden')
  })
  await calm.close()
} finally {
  await browser.close()
  server.close()
}

writeFileSync(join(artifact, 'report.json'), JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed, failed, results }, null, 2))
console.log(`\n${results.length - failed}/${results.length} passed · artifact: ${artifact}`)
process.exit(failed ? 1 : 0)
