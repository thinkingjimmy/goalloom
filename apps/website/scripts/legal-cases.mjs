/**
 * [INPUT]: The static host, Playwright driver polling and the owning E2E runner's browser/artifact helpers.
 * [OUTPUT]: Legal-route journeys, sticky header/contents and anchor geometry, metadata, mobile/dark/no-JS evidence.
 * [POS]: Website E2E coverage for privacy/terms; no desktop or external provider requests.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'playwright/test'

export async function runLegalCases({ browser, base, SITE, LOCALES, check, assert, shot, artifact }) {
  const layouts = []
  async function verifyStickyNavigation(page) {
    assert(await page.locator('.legal-policy-notice, [data-policy-status]').count() === 0, 'removed policy banner remains')
    await page.locator('.site-footer').scrollIntoViewIfNeeded()
    await expect.poll(() => page.locator('.legal-header').evaluate(node => node.getBoundingClientRect().top)).toBe(0)
    await page.locator('.legal-contents a[href="#contact"]').click()
    await expect.poll(() => page.locator('#contact').evaluate(node => Math.abs(node.getBoundingClientRect().top - parseFloat(getComputedStyle(node).scrollMarginTop)))).toBeLessThan(3)
    const geometry = await page.evaluate(() => {
      const header = document.querySelector('.legal-header'), contents = document.querySelector('.legal-contents')
      const h = header.getBoundingClientRect(), c = contents.getBoundingClientRect()
      return { path: location.pathname, width: innerWidth, height: innerHeight, theme: document.documentElement.dataset.theme,
        scroll: scrollY, headerTop: h.top, headerBottom: h.bottom, position: getComputedStyle(header).position,
        background: getComputedStyle(header).backgroundColor, targetTop: document.querySelector('#contact').getBoundingClientRect().top,
        contentsTop: c.top, contentsBottom: c.bottom, contentsPosition: getComputedStyle(contents).position }
    })
    assert(geometry.scroll > 0 && geometry.position === 'sticky' && geometry.headerTop === 0, JSON.stringify(geometry))
    assert(geometry.background !== 'rgba(0, 0, 0, 0)' && Math.abs(geometry.targetTop - geometry.headerBottom - 24) < 3, JSON.stringify(geometry))
    if (geometry.contentsPosition === 'sticky') assert(geometry.contentsTop >= geometry.headerBottom + 23 && geometry.contentsBottom <= geometry.height - 23, JSON.stringify(geometry))
    layouts.push(geometry)
  }
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const external = []
  const errors = []
  page.on('request', request => { if (new URL(request.url()).origin !== base) external.push(request.url()) })
  page.on('pageerror', error => errors.push(String(error)))
  for (const [locale, prefix] of LOCALES) for (const kind of ['privacy', 'terms']) {
    await check(`legal ${locale}/${kind}: footer journey, complete content and reciprocal metadata`, async () => {
      await page.goto(base + prefix)
      await page.locator(`.site-footer a[href="${prefix}${kind}/"]`).click()
      assert(new URL(page.url()).pathname === `${prefix}${kind}/`, 'footer opened the wrong document')
      await page.waitForLoadState('domcontentloaded')
      await page.locator('script[type="application/ld+json"]').first().waitFor({ state: 'attached' })
      const facts = await page.evaluate(() => ({
        lang: document.documentElement.lang,
        canonical: document.querySelector('link[rel="canonical"]')?.href,
        alternates: Object.fromEntries([...document.querySelectorAll('link[hreflang]')].map(link => [link.hreflang, link.href])),
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.content,
        h1: document.querySelectorAll('h1').length,
        paragraphs: document.querySelectorAll('article p').length,
        schema: JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent),
      }))
      assert(facts.lang === locale && facts.h1 === 1 && facts.paragraphs >= 12, JSON.stringify(facts))
      assert(facts.title.includes('Goalloom') && facts.description.length > 50, 'missing document metadata')
      assert(facts.canonical === `${SITE}${prefix}${kind}/`, 'wrong canonical')
      for (const [other, path] of LOCALES) assert(facts.alternates[other] === `${SITE}${path}${kind}/`, `alternate ${other}`)
      assert(facts.alternates['x-default'] === `${SITE}/${kind}/`, 'wrong x-default')
      assert(facts.schema['@type'] === 'WebPage' && facts.schema.url === facts.canonical, 'wrong document schema')
      assert(await page.locator('article a[href="mailto:hellojimmywong@gmail.com"]').count() === 1, 'missing contact')
      const required = kind === 'privacy' ? ['local', 'google', 'sync', 'ai', 'payments', 'retention', 'contact'] : ['license', 'account', 'optional', 'ai', 'paid-service', 'availability', 'contact']
      for (const id of required) assert(await page.locator(`article section#${id} p`).count() > 0, `missing semantic section ${id}`)
      assert((await page.locator('.legal-summary').innerText()).includes('Augmenting Human Intellect, LLC'), 'operator missing')
      assert(await page.locator('time').getAttribute('datetime') === '2026-10-23' && facts.schema.dateModified === '2026-10-23', 'policy dates disagree')
      if (kind === 'privacy') {
        const ai = await page.locator('article #ai').innerText()
        for (const provider of ['OpenRouter', 'TypeSafe', 'DeepInfra', 'DeepSeek', '1017', '1.9.10']) assert(ai.includes(provider), `AI scope missing ${provider}`)
        const policy={en:['model training','cannot be downloaded again'],'zh-CN':['模型训练','无法重新下载'],ja:['モデルの学習','再取得できません'],es:['entrenar modelos','no se pueden descargar de nuevo'],fr:['entraîner ses modèles','ne peuvent plus être téléchargés']}
        for(const text of policy[locale])assert(ai.includes(text),'Current hosted provider/delivery policy missing')
      } else {
        const paid = await page.locator('#paid-service').innerText()
        assert(paid.includes('USD 8.99') && paid.includes('USD 79') && paid.includes('192'), 'commercial facts missing')
        assert((await page.locator('#license').innerText()).includes('MIT'), 'license rights lost')
      }
      await page.locator('.legal-contents a[href="#contact"]').click()
      assert(new URL(page.url()).hash === '#contact', 'contents link failed')
      await verifyStickyNavigation(page)
      if (locale === 'zh-CN') await shot(page, `legal-${kind}-sticky`)
      if (locale === 'en') {
        await page.goto(`${base}${prefix}${kind}/`)
        await shot(page, `legal-${kind}-desktop`)
      }
    })
  }
  await check('legal: language switching preserves document and the brand returns to the localized homepage', async () => {
    await page.goto(`${base}/privacy/`)
    await page.locator('.legal-header .menu-pop summary').click()
    await page.locator('.legal-header .menu-panel a[lang="zh-CN"]').click()
    assert(new URL(page.url()).pathname === '/zh-CN/privacy/', 'language switch lost document')
    await page.locator('.legal-header .brand').click()
    assert(new URL(page.url()).pathname === '/zh-CN/' && new URL(page.url()).hash === '', 'home navigation failed')
  })
  await check('legal: sitemap includes all ten documents and content has no runtime errors or external requests', async () => {
    const sitemap = await (await fetch(`${base}/sitemap.xml`)).text()
    for (const [, prefix] of LOCALES) for (const kind of ['privacy', 'terms']) {
      assert(sitemap.includes(`<loc>${SITE}${prefix}${kind}/</loc>`), `sitemap missing ${prefix}${kind}`)
    }
    assert(external.length === 0, `external requests: ${external.join(', ')}`)
    assert(errors.length === 0, errors.join('\n'))
  })
  await context.close()

  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const mobile = await phone.newPage()
  await check('legal: mobile dark pages and homepage keep legal links visible without overflow', async () => {
    for (const [locale, prefix] of LOCALES) for (const kind of ['', 'privacy/', 'terms/']) {
      await mobile.goto(`${base}${prefix}${kind}`)
      await mobile.locator('.site-footer').scrollIntoViewIfNeeded()
      assert(await mobile.locator('.site-footer .legal-link').count() === 2, 'legal links missing')
      for (const link of await mobile.locator('.site-footer .legal-link').all()) assert(await link.isVisible(), 'mobile legal link hidden')
      assert(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${kind} overflows`)
      if (locale === 'zh-CN' && kind === 'privacy/') {
        await shot(mobile, 'legal-mobile-footer-dark')
        await mobile.evaluate(() => scrollTo(0, 0))
        await shot(mobile, 'legal-privacy-mobile-dark')
        assert(await mobile.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'dark theme missing')
      }
      if (kind) await verifyStickyNavigation(mobile)
    }
  })
  await phone.close()

  const plain = await browser.newContext({ javaScriptEnabled: false })
  const staticPage = await plain.newPage()
  await check('legal: both documents remain complete and navigable without JavaScript', async () => {
    for (const [, prefix] of LOCALES) for (const kind of ['privacy', 'terms']) {
      await staticPage.goto(`${base}${prefix}${kind}/`)
      assert(await staticPage.locator('article p').count() >= 12, 'content depends on JavaScript')
      assert(await staticPage.locator('.legal-contents').isVisible(), 'contents hidden')
      await verifyStickyNavigation(staticPage)
      const other = kind === 'privacy' ? 'terms' : 'privacy'
      await staticPage.locator('.site-footer').evaluate(node => node.scrollIntoView({ behavior: 'instant', block: 'end' }))
      await staticPage.locator(`.site-footer a[href="${prefix}${other}/"]`).click()
      assert(new URL(staticPage.url()).pathname === `${prefix}${other}/`, 'static cross-link failed')
    }
  })
  await plain.close()
  const responsive = await browser.newPage()
  await check('legal: sticky header and unobscured anchors fit 320px phones and 1024px tablets in both themes', async () => {
    for (const width of [320, 1024]) for (const theme of ['light', 'dark']) for (const kind of ['privacy', 'terms']) {
      await responsive.setViewportSize({ width, height: 844 })
      await responsive.emulateMedia({ colorScheme: theme })
      await responsive.goto(`${base}/zh-CN/${kind}/`)
      await verifyStickyNavigation(responsive)
      assert(await responsive.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'legal page overflows')
      if (width === 320 && theme === 'dark') await shot(responsive, `legal-${kind}-sticky-phone-dark`)
    }
  })
  await responsive.close()
  writeFileSync(join(artifact, 'sticky-navigation.json'), JSON.stringify({ scope: 'Static website; legal pages with desktop/mobile themes and no JavaScript', layouts }, null, 2) + '\n')
}
