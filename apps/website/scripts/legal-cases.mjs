/**
 * [INPUT]: The static host and the owning website E2E runner's browser/assertion/artifact helpers.
 * [OUTPUT]: Legal-route journeys, metadata, language navigation, mobile/dark/no-JS evidence.
 * [POS]: Website E2E coverage for privacy/terms; no desktop or external provider requests.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export async function runLegalCases({ browser, base, SITE, LOCALES, check, assert, shot }) {
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
      const sections = await page.locator('.legal-article section[id]').count()
      assert(sections === (kind === 'privacy' ? 10 : 9), `incomplete sections: ${sections}`)
      await page.locator('.legal-contents a[href="#contact"]').click()
      assert(new URL(page.url()).hash === '#contact', 'contents link failed')
      if (locale === 'en') {
        await page.goto(`${base}${prefix}${kind}/`)
        await shot(page, `legal-${kind}-desktop`)
      }
    })
  }
  await check('legal: language switching preserves document and header returns to home sections', async () => {
    await page.goto(`${base}/privacy/`)
    await page.locator('.legal-header .menu-pop summary').click()
    await page.locator('.legal-header .menu-panel a[lang="zh-CN"]').click()
    assert(new URL(page.url()).pathname === '/zh-CN/privacy/', 'language switch lost document')
    await page.locator('.legal-header a[href="/zh-CN/#board"]').click()
    assert(new URL(page.url()).pathname === '/zh-CN/' && new URL(page.url()).hash === '#board', 'home navigation failed')
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
    }
  })
  await phone.close()

  const plain = await browser.newContext({ javaScriptEnabled: false })
  const staticPage = await plain.newPage()
  await check('legal: both documents remain complete and navigable without JavaScript', async () => {
    for (const kind of ['privacy', 'terms']) {
      await staticPage.goto(`${base}/${kind}/`)
      assert(await staticPage.locator('article p').count() >= 12, 'content depends on JavaScript')
      assert(await staticPage.locator('.legal-contents').isVisible(), 'contents hidden')
      const other = kind === 'privacy' ? 'terms' : 'privacy'
      await staticPage.locator(`.site-footer a[href="/${other}/"]`).click()
      assert(new URL(staticPage.url()).pathname === `/${other}/`, 'static cross-link failed')
    }
  })
  await plain.close()
}
