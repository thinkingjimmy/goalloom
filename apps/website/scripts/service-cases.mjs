/**
 * [INPUT]: Fresh static export and the website E2E browser/assertion/artifact helpers.
 * [OUTPUT]: Shared pricing, exact common-FAQ reuse, independent billing-only questions, policy journeys, BYOK/AI disclosures and no-JS evidence.
 * [POS]: Website commercial-information acceptance; not provider lifecycle or packaged-client acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'playwright/test'

export async function runServiceCases({ browser, base, SITE, LOCALES, check, assert, shot, out, artifact }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce', colorScheme: 'light' })
  const page = await context.newPage()
  const external = [], errors = [], states = []
  context.on('request', request => {
    const url = new URL(request.url())
    if (url.origin !== base) external.push({ origin: url.origin, path: url.pathname, method: request.method() })
  })
  page.on('pageerror', error => errors.push(String(error)))
  for (const [locale, prefix] of LOCALES) {
    await check(`home pricing ${locale}: native billing switch, stable cards, exact monthly/annual totals and Free download`, async () => {
      for (const width of [1440, 1024, 768]) {
        await page.setViewportSize({ width, height: 1000 })
        await page.goto(base + prefix)
        const section = page.locator('.home-pricing')
        const free = section.locator('.home-plan-free'), plus = section.locator('.home-plan-plus')
        assert(await section.locator('.home-plan').count() === 2, 'expected two homepage plans')
        assert(await plus.locator('.billing-cycle').count() === 1 && await section.locator('.home-pricing-heading .billing-cycle').count() === 0, 'billing selector must stay inside Plus')
        assert(await plus.locator('.home-plan-description').count() === 0, 'redundant Plus description remains')
        assert(await free.locator('.home-plan-billing').count() === 0, 'homepage Free account/subscription note remains')
        const spacing = await section.evaluate(node => { const style = getComputedStyle(node); return { top: style.paddingTop, bottom: style.paddingBottom } })
        assert(spacing.top === (width > 900 ? '50px' : '28px') && spacing.bottom === (width > 900 ? '40px' : '28px'), `homepage pricing spacing was not halved: ${JSON.stringify(spacing)}`)
        assert(await section.locator('.home-plan-note').count() === 0, 'removed plan notes remain')
        assert(await free.locator('li > svg').count() === 4 && await plus.locator('li > svg').count() === 2, 'benefit checkmarks missing')
        assert(await plus.locator('.home-price-month').isVisible() && (await plus.locator('.home-price-month').innerText()).includes('$8.99') && !await plus.locator('.home-price-year').isVisible(), 'homepage monthly default drift')
        assert(!await plus.locator('.home-annual-saving').isVisible(), 'annual savings should appear only for annual billing')
        const cardPosition = node => { const rect = node.getBoundingClientRect(); return { height: rect.height, top: rect.top + scrollY } }
        const before = await plus.evaluate(cardPosition)
        await section.locator('label[for="home-cycle-year"]').click()
        assert(await section.locator('#home-cycle-year').isChecked() && await plus.locator('.home-price-year').isVisible() && (await plus.locator('.home-price-year').innerText()).includes('$79') && !await plus.locator('.home-price-month').isVisible(), 'homepage annual switch failed')
        assert((await section.locator('.home-plan-price:visible').allTextContents()).length === 2 && (await free.locator('.home-plan-price').innerText()).startsWith('$0'), 'cycle changed Free or exposed both Plus prices')
        const savings = plus.locator('.home-annual-saving')
        assert(await savings.isVisible() && (await savings.innerText()).includes('$28.88') && (await savings.innerText()).includes('27'), 'annual savings must compare $79 with twelve $8.99 payments')
        const annualAlignment = await section.evaluate(node => {
          const free = node.querySelector('.home-plan-free .home-plan-price').getBoundingClientRect()
          const plus = node.querySelector('.home-price-year').getBoundingClientRect()
          return Math.abs(free.top - plus.top)
        })
        assert(annualAlignment <= 1, `annual price alignment drift: ${annualAlignment}`)
        const after = await plus.evaluate(cardPosition)
        assert(Math.abs(before.height - after.height) <= 1 && Math.abs(before.top - after.top) <= 1, `billing switch moves the plan card: ${JSON.stringify({ before, after })}`)
        if (locale === 'zh-CN' && width === 1440) await section.screenshot({ path: join(artifact, 'home-pricing-zh-yearly.png'), style: '.site-header { visibility: hidden !important; }' })
        await section.locator('#home-cycle-year').focus()
        await page.keyboard.press('ArrowLeft')
        assert(await section.locator('#home-cycle-month').isChecked() && await plus.locator('.home-price-month').isVisible() && !await plus.locator('.home-price-year').isVisible(), 'native keyboard switch failed')
        await section.locator('#home-cycle-year').focus()
        await page.keyboard.press('Space')
        assert(await section.locator('#home-cycle-year').isChecked() && await plus.locator('.home-price-year').isVisible(), 'Space did not select annual billing')
        await section.locator('label[for="home-cycle-month"]').click()
        assert(await plus.locator('.home-plan-badge').count() === 0, 'coming-soon badge remains')
        assert(await free.locator('li').count() === 4 && await plus.locator('li').count() === 2, 'homepage benefits missing')
        assert((await free.locator('.download-primary[data-for="mac"]').getAttribute('href')).endsWith('-mac-arm64.dmg'), 'Free is missing the direct installer')
        assert(await plus.locator('.service-action').getAttribute('href') === `${prefix}pricing/#service-trial`, 'trial CTA must lead to the localized trial explanation')
        const trialLabels = { en: 'How to start your trial', 'zh-CN': '如何开始试用', ja: '無料体験の始め方', es: 'Cómo iniciar la prueba', fr: 'Comment démarrer l’essai' }
        assert(await plus.locator('.service-action').innerText() === trialLabels[locale], 'localized trial label drift')
        const geometry = await section.evaluate(node => {
          const plans = [...node.querySelectorAll('.home-plan')]
          const rows = ['.home-plan-price', '.download-split, .service-action', '.home-plan-benefits']
          const heading = node.querySelector('.home-pricing-heading').getBoundingClientRect()
          const cards = node.querySelector('.home-plan-grid').getBoundingClientRect()
          const faqHeading = document.querySelector('.home-faq-heading').getBoundingClientRect()
          const faqList = document.querySelector('.home-faq-list').getBoundingClientRect()
          const selector = plans[1].querySelector('.billing-cycle').getBoundingClientRect()
          const plus = plans[1].getBoundingClientRect()
          return { headingRight: heading.right, headingBottom: heading.bottom, cardsLeft: cards.left, cardsTop: cards.top, topDelta: Math.abs(heading.top - cards.top), leftDelta: Math.abs(cards.left - faqList.left), headingWidthDelta: Math.abs(heading.width - faqHeading.width), border: getComputedStyle(plans[1]).borderTopColor, selectorInside: selector.left > plus.left && selector.right < plus.right && selector.top > plus.top, selectorGap: selector.top - plans[1].querySelector('.home-plan-top').getBoundingClientRect().bottom, actionGaps: plans.map(plan => plan.querySelector('.download-split, .service-action').getBoundingClientRect().top - plan.querySelector('.home-plan-price').getBoundingClientRect().bottom), deltas: rows.map(selector => Math.abs(plans[0].querySelector(selector).getBoundingClientRect().top - plans[1].querySelector(selector).getBoundingClientRect().top)) }
        })
        assert(geometry.selectorInside && geometry.border === 'rgb(0, 0, 0)' && geometry.deltas.every(value => value <= 1), JSON.stringify({ locale, width, geometry }))
        assert(geometry.actionGaps.every(gap => gap >= 28 && gap <= 56), `excessive price-to-action spacing: ${JSON.stringify(geometry.actionGaps)}`)
        assert(geometry.selectorGap >= 12 && geometry.selectorGap <= 16, `billing selector is too far from the Plus title: ${geometry.selectorGap}`)
        assert(width > 900 ? geometry.headingRight < geometry.cardsLeft && geometry.topDelta <= 1 && geometry.leftDelta <= 1 && geometry.headingWidthDelta <= 1 : geometry.headingBottom < geometry.cardsTop, JSON.stringify({ locale, width, geometry }))
        assert(await section.locator('.home-pricing-footnote').count() === 0, 'encryption notice remains below the cards')
        assert(await free.locator('li small').count() === 0, 'BYOK fees remain below the feature instead of in the information panel')
        for (const plan of [free, plus]) {
          const info = plan.locator('.info-disclosure'), trigger = info.locator('summary'), panel = info.locator('.info-panel')
          assert(!(await panel.isVisible()) && (await trigger.getAttribute('aria-label')).length > 0, 'information should start closed with a localized accessible label')
          const before = await plan.evaluate(cardPosition)
          await trigger.focus()
          await trigger.press('Enter')
          assert(await panel.isVisible() && (await panel.innerText()).length > 8, 'plan information did not open')
          const after = await plan.evaluate(cardPosition)
          assert(Math.abs(before.height - after.height) <= 1, 'information panel moved the plan content')
          await trigger.press('Escape')
          assert(!(await panel.isVisible()) && await trigger.evaluate(node => node === document.activeElement), 'Escape did not close information and retain trigger focus')
          await trigger.click()
          if (locale === 'zh-CN' && width === 1440 && plan === free) await section.screenshot({ path: join(artifact, 'home-pricing-byok-info-zh.png'), style: '.site-header { visibility: hidden !important; }' })
          await section.locator('h2').click()
          assert(!(await panel.isVisible()), 'outside click left plan information open')
        }
        if (locale === 'zh-CN') {
          assert(await section.locator('h2').innerText() === '提供付费同步', 'owner-approved heading drift')
          await section.screenshot({ path: join(artifact, `home-pricing-zh-${width}.png`), style: '.site-header { visibility: hidden !important; }' })
        }
        if (width === 768) {
          await plus.locator('.service-action').click()
          assert(new URL(page.url()).pathname === `${prefix}pricing/` && new URL(page.url()).hash === '#service-trial', 'trial CTA lost its localized explanation anchor')
          assert(await page.locator('#service-trial').isVisible() && await page.locator('main[data-stage="live"]').count() === 1, 'trial CTA must explain the trial without granting access')
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 })
    })
    await check(`services ${locale}: shared price cards, trial FAQ and policy navigation`, async () => {
      await page.goto(`${base}${prefix}`)
      const readQuestions = node => [...node.querySelectorAll('details')].map(item => ({ question: item.querySelector('summary').textContent, answer: item.querySelector('p').textContent, links: [...item.querySelectorAll('a')].map(link => link.getAttribute('href')) }))
      const homepageQuestions = await page.locator('#faq').evaluate(readQuestions)
      await page.locator('.site-header .pricing-link').click()
      assert(new URL(page.url()).pathname === `${prefix}pricing/`, 'header pricing link')
      assert(await page.locator('main[data-stage="live"]').count() === 1, 'published Plus guidance is missing')
      const plans = page.locator('.home-plan-grid'), plus = plans.locator('.home-plan-plus')
      assert(await plans.locator('.home-plan').count() === 2, 'expected shared Free and Plus cards')
      assert((await plans.locator('.home-plan-free .home-plan-price').innerText()).startsWith('$0'), 'local software is free')
      assert(await plans.locator('.home-plan-free .home-plan-billing').count() === 1, 'independent pricing page lost its Free billing note')
      assert(await plus.locator('.home-price-month').isVisible() && (await plus.locator('.home-price-month').innerText()).includes('$8.99'), 'monthly default drift')
      assert(await page.locator('#service-availability, .plan-card, .annual-charge').count() === 0, 'removed availability or legacy pricing remains')
      assert(await plus.locator('.billing-cycle').count() === 1 && await page.locator('.billing-cycle').count() === 1, 'billing control must be inside Plus')
      assert(await plans.locator('li > svg').count() === 6, 'shared benefit checkmarks missing')
      assert((await plans.locator('.home-plan-free .download-primary[data-for="mac"]').getAttribute('href')).endsWith('-mac-arm64.dmg'), 'pricing Free is missing the shared direct download')
      for (const width of [1440, 1024, 768]) {
        await page.setViewportSize({ width, height: 1000 })
        const geometry = await plans.evaluate(node => {
          const cards = [...node.querySelectorAll('.home-plan')]
          return { priceSize: getComputedStyle(cards[0].querySelector('.home-plan-price')).fontSize, titleSize: getComputedStyle(cards[0].querySelector('h2')).fontSize, border: getComputedStyle(cards[1]).borderTopColor, deltas: ['.home-plan-price', '.download-split, .service-action', '.home-plan-benefits'].map(selector => Math.abs(cards[0].querySelector(selector).getBoundingClientRect().top - cards[1].querySelector(selector).getBoundingClientRect().top)), top: cards[1].getBoundingClientRect().top, height: cards[1].getBoundingClientRect().height }
        })
        assert(geometry.priceSize === '52px' && geometry.titleSize === '24px' && geometry.border === 'rgb(0, 0, 0)' && geometry.deltas.every(value => value <= 1), JSON.stringify({ locale, width, geometry }))
        await plans.locator('label[for="pricing-cycle-year"]').click()
        assert(await plus.locator('.home-price-year').isVisible() && !await plus.locator('.home-price-month').isVisible() && (await plus.locator('.home-price-year').innerText()).includes('$79'), 'pricing annual total missing')
        assert((await plus.locator('.home-annual-saving').innerText()).includes('$28.88'), 'pricing annual savings missing')
        const height = await plus.evaluate(node => node.getBoundingClientRect().height)
        assert(Math.abs(geometry.height - height) <= 1, 'pricing billing switch moves the card')
        if (locale === 'zh-CN') await plans.screenshot({ path: join(artifact, `pricing-cards-zh-${width}.png`), style: '.site-header { visibility: hidden !important; }' })
        await plans.locator('#pricing-cycle-year').focus()
        await page.keyboard.press('ArrowLeft')
        assert(await plans.locator('#pricing-cycle-month').isChecked() && await plus.locator('.home-price-month').isVisible(), 'pricing keyboard cycle selection failed')
      }
      await page.setViewportSize({ width: 1440, height: 1000 })
      assert(await plus.locator('.service-action').getAttribute('href') === `${prefix}pricing/#service-trial`, 'pricing trial CTA must lead to its FAQ')
      const byokInfo = plans.locator('.home-plan-free .info-disclosure')
      assert(!await byokInfo.locator('.info-panel').isVisible() && await plans.locator('.home-plan-free li small').count() === 0, 'pricing BYOK fee note must start in the closed information panel')
      await byokInfo.locator('summary').click()
      assert(await byokInfo.locator('.info-panel').isVisible(), 'shared pricing BYOK information did not open')
      await byokInfo.locator('summary').press('Escape')
      assert(!await byokInfo.locator('.info-panel').isVisible(), 'pricing BYOK information did not close')
      assert(await page.locator('a[href*="checkout.stripe.com"], a[href*="buy.stripe.com"], iframe').count() === 0, 'payment destination or SDK leaked')
      const common = page.locator('.common-faq'), faq = page.locator('.billing-faq'), details = faq.locator('details')
      assert(await page.locator('.service-faq').count() === 2, 'pricing must have common and billing FAQ sections')
      assert(JSON.stringify(await common.evaluate(readQuestions)) === JSON.stringify(homepageQuestions), 'common FAQ must reuse every homepage question, answer and support link')
      assert(await details.count() === 6 && await details.first().getAttribute('open') !== null, 'billing FAQ must contain five additional payment answers and channel management')
      const billingIds = await details.evaluateAll(nodes => nodes.map(node => node.querySelector('p[id]')?.id ?? node.id))
      assert(JSON.stringify(billingIds) === JSON.stringify(['service-purchase','service-renewal','service-expiry','service-changes','service-grace','manage']), `non-billing or duplicate question remains: ${billingIds}`)
      assert(await faq.locator('a[href^="mailto:"], a[href$="/issues"], #service-policies').count() === 0 && await page.locator('#service-ai, #service-account').count() === 0, 'generic product/support/legal content remains in billing FAQ')
      assert(await page.locator('main > .service-support, main > .service-policies, .service-details').count() === 0, 'standalone explanations remain outside FAQ')
      for (const section of [common, faq]) {
        const layout = await section.evaluate(node => {
          const heading = node.querySelector('.home-faq-heading').getBoundingClientRect(), list = node.querySelector('.home-faq-list').getBoundingClientRect()
          return { headingRight: heading.right, listLeft: list.left, topDelta: Math.abs(heading.top - list.top), titleSize: getComputedStyle(node.querySelector('h2')).fontSize, lastBorder: getComputedStyle(node.querySelector('details:last-child')).borderBottomWidth }
        })
        assert(layout.headingRight < layout.listLeft && layout.topDelta <= 1 && layout.titleSize === '36px' && layout.lastBorder === '0px', JSON.stringify(layout))
      }
      await common.locator('#support summary').press('Enter')
      assert(await common.locator('#support p').isVisible() && !await common.locator('details').first().locator('p').isVisible(), 'common support disclosure must close the previous common answer')
      assert(await common.locator('#support a[href="mailto:hellojimmywong.ai@gmail.com"]').isVisible() && await common.locator('#support a[href$="/issues"]').isVisible(), 'shared private and technical support links missing')
      assert(await details.first().locator('p').isVisible(), 'common questions must not close the billing disclosure')
      if (locale === 'zh-CN') await common.screenshot({ path: join(artifact, 'pricing-common-faq-zh-support.png'), style: '.site-header { visibility: hidden !important; }' })
      await faq.locator('#manage summary').press('Space')
      assert(await faq.locator('#manage li').count() === 2 && await faq.locator('#manage ul').isVisible() && (await faq.locator('#manage').innerText()).includes('Stripe') && (await faq.locator('#manage').innerText()).includes('Apple'), 'original purchase-channel guidance missing')
      assert(await common.locator('#support p').isVisible() && await faq.locator('details[open]').count() === 1, 'FAQ groups must expand independently')
      for (const path of ['terms', 'privacy']) assert(await page.locator(`.site-footer a[href="${prefix}${path}/"]`).count() === 1, 'localized footer policy link missing')
      for (const id of ['trial','purchase','expiry','renewal','grace','refunds']) {
        const answer = page.locator(`#service-${id}`)
        await answer.locator('..').locator('summary').click()
        assert(await answer.isVisible() && (await answer.innerText()).length > 60, `missing ${id} FAQ explanation`)
      }
      await plus.locator('.service-action').click()
      await page.waitForURL(`${base}${prefix}pricing/#service-trial`)
      assert(await common.locator('#service-trial').isVisible() && await common.locator('details[open]').count() === 1 && await faq.locator('details[open]').count() === 1, 'trial fragment must reveal its common answer without changing billing expansion')
      const schema = await page.locator('script[type="application/ld+json"]').first().textContent()
      assert(!schema.includes('Offer') && schema.includes('Augmenting Human Intellect, LLC'), 'unlaunched Plus has purchasable offer')
      const canonical = await page.locator('link[rel="canonical"]').getAttribute('href')
      assert(canonical === `${SITE}${prefix}pricing/`, 'pricing canonical')
      for (const [other, path] of LOCALES) assert(await page.locator(`link[hreflang="${other}"]`).getAttribute('href') === `${SITE}${path}pricing/`, 'pricing hreflang')
      assert(await page.locator('link[hreflang="x-default"]').getAttribute('href') === `${SITE}/pricing/`, 'pricing x-default')
      assert((await page.locator('meta[name="robots"]').getAttribute('content')).includes('index'), 'pricing not indexable')
      await page.locator('.site-header .menu-pop summary').click()
      const other = locale === 'en' ? 'zh-CN' : 'en'
      await page.locator(`.site-header .menu-panel a[lang="${other}"]`).click()
      assert(new URL(page.url()).pathname.endsWith('/pricing/'), 'language lost current information page')
      await page.goto(`${base}${prefix}pricing/`)
      if (locale === 'zh-CN') await shot(page, 'pricing-zh-desktop', true)
      if (locale === 'en') await shot(page, 'pricing-en-desktop')
    })
    for (const kind of ['continue','return']) await check(`billing ${locale}/${kind}: closed state, noindex and forged success rejection`, async () => {
      await page.goto(`${base}${prefix}billing/${kind}/`)
      assert((await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'), 'billing indexed')
      assert(await page.locator('[data-billing-state="unavailable"]').count() === 1, 'closed billing unavailable')
      await page.goto(`${base}${prefix}billing/${kind}/?success=true&state=unverified-test&returnUrl=https%3A%2F%2Fexample.invalid%2F#untrusted`)
      await page.waitForFunction(() => document.querySelector('[data-billing-state="invalid"]'))
      assert(!new URL(page.url()).search && !new URL(page.url()).hash, 'untrusted parameters remain in address')
      assert(await page.locator('[data-billing-state="confirmed"]').count() === 0, 'query granted service')
      assert(await page.evaluate(() => sessionStorage.length) === 0, 'untrusted continuation persisted')
      await page.locator('.site-header .menu-pop summary').click()
      const other = locale === 'en' ? 'zh-CN' : 'en'
      const target = page.locator(`.site-header .menu-panel a[lang="${other}"]`)
      assert(!(await target.getAttribute('href')).includes('?'), 'language link leaks query')
      await target.click()
      assert(new URL(page.url()).pathname.endsWith(`/billing/${kind}/`), 'language lost billing route')
      assert(await page.locator('[data-billing-state="confirmed"]').count() === 0, 'language switch granted service')
      states.push({ locale, kind, entry: 'unavailable', forgedReturn: 'invalid', purchaseRequests: 0 })
    })
  }
  await check('billing: manual offline checks never create payment or retry a purchase', async () => {
    await page.goto(`${base}/zh-CN/billing/return/`)
    await context.setOffline(true)
    await page.locator('.billing-state button').click()
    assert(await page.locator('[data-billing-state="offline"]').count() === 1, 'offline feedback missing')
    await shot(page, 'billing-offline')
    await context.setOffline(false)
    await page.locator('.billing-state button').click()
    assert(await page.locator('[data-billing-state="unavailable"]').count() === 1, 'recheck must remain fail-closed')
    await shot(page, 'billing-unavailable')
    assert(external.length === 0 && errors.length === 0, JSON.stringify({ external, errors }))
  })
  await context.close()

  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' })
  const phone = await mobile.newPage()
  await check('services: five-language mobile dark layout, visible pricing/support and touch targets', async () => {
    for (const [, prefix] of LOCALES) for (const path of ['', 'pricing/','billing/return/']) {
      await phone.goto(`${base}${prefix}${path}`)
      assert(await phone.locator('.site-header .pricing-link').isVisible(), 'mobile pricing navigation hidden')
      assert(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `horizontal overflow ${prefix}${path}`)
      if (path === '') {
        assert(await phone.locator('.home-price-month').isVisible() && await phone.locator('.home-plan-badge').count() === 0, 'phone homepage price or badge drift')
        const cycle = phone.locator('label[for="home-cycle-year"]')
        assert((await cycle.boundingBox()).height >= 44, 'phone billing touch target too small')
        await cycle.tap()
        assert(await phone.locator('.home-price-year').isVisible() && (await phone.locator('.home-price-year').innerText()).includes('$79') && !await phone.locator('.home-price-month').isVisible(), 'phone annual toggle failed')
        const geometry = await phone.locator('.home-pricing').evaluate(node => {
          const free = node.querySelector('.home-plan-free').getBoundingClientRect()
          const plus = node.querySelector('.home-plan-plus')
          return { freeBottom: free.bottom, plusTop: plus.getBoundingClientRect().top, border: getComputedStyle(plus).borderTopColor, foreground: getComputedStyle(plus).color }
        })
        assert(geometry.plusTop > geometry.freeBottom && geometry.border === geometry.foreground, JSON.stringify(geometry))
        for (const plan of ['free', 'plus']) {
          const info = phone.locator(`.home-plan-${plan} .info-disclosure`)
          const target = await info.locator('summary').boundingBox()
          const pointer = await info.locator('summary').evaluate(node => ({ coarse: matchMedia('(pointer: coarse)').matches, minWidth: getComputedStyle(node).minWidth, minHeight: getComputedStyle(node).minHeight }))
          assert(target.width >= 44 && target.height >= 44, `plan information touch target too small: ${JSON.stringify({ prefix, plan, target, pointer })}`)
          await info.locator('summary').tap()
          const panel = await info.locator('.info-panel').boundingBox()
          assert(panel && panel.x >= 0 && panel.x + panel.width <= 390, 'plan information overflows the phone')
          await phone.locator('.home-pricing h2').tap()
          assert(!(await info.locator('.info-panel').isVisible()), 'outside touch left plan information open')
        }
        if (prefix === '/zh-CN/') {
          const info = phone.locator('.home-plan-free .info-disclosure')
          await info.locator('summary').tap()
          await phone.screenshot({ path: join(artifact, 'home-pricing-free-info-zh-phone-dark.png'), style: '.site-header { visibility: hidden !important; }' })
          await phone.locator('.home-pricing h2').tap()
        }
      }
      await phone.locator('.site-footer').scrollIntoViewIfNeeded()
      for (const link of await phone.locator('.site-footer .service-link').all()) assert(await link.isVisible(), 'mobile service link hidden')
      assert(await phone.locator('.site-footer a[href="mailto:hellojimmywong.ai@gmail.com"]').count() === 1, 'private support missing')
      if (path === 'pricing/') {
        await phone.locator('label[for="pricing-cycle-year"]').click()
        const box = await phone.locator('label[for="pricing-cycle-year"]').boundingBox()
        assert(box.height >= 44, 'billing-cycle touch target too small')
        assert(await phone.locator('.home-price-year').isVisible(), 'mobile annual price hidden')
        for (const plan of ['free', 'plus']) {
          const info = phone.locator(`.home-plan-${plan} .info-disclosure`)
          await info.locator('summary').tap()
          const panel = await info.locator('.info-panel').boundingBox()
          assert(panel && panel.x >= 0 && panel.x + panel.width <= 390, 'pricing information overflows the phone')
          await phone.locator('.service-intro h1').tap()
          assert(!await info.locator('.info-panel').isVisible(), 'pricing information did not close on outside touch')
        }
        if (prefix === '/zh-CN/') await phone.locator('.home-plan-grid').screenshot({ path: join(artifact, 'pricing-cards-zh-phone-dark.png'), style: '.site-header { visibility: hidden !important; }' })
      }
    }
    await phone.goto(`${base}/fr/pricing/`)
    await shot(phone, 'pricing-fr-mobile-dark', true)
  })
  await mobile.close()

  await check('home billing switch: 320/390px touch targets and selected prices fit all five languages in both themes', async () => {
    const touch = await browser.newContext({ isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    try {
      const page = await touch.newPage()
      for (const width of [320, 390]) for (const theme of ['light', 'dark']) for (const [locale, prefix] of LOCALES) {
        await page.setViewportSize({ width, height: 900 })
        await page.emulateMedia({ colorScheme: theme })
        await page.goto(base + prefix)
        const section = page.locator('.home-pricing')
        const year = section.locator('label[for="home-cycle-year"]')
        await year.tap()
        assert(await section.locator('#home-cycle-year').isChecked() && await section.locator('.home-price-year').isVisible() && !await section.locator('.home-price-month').isVisible(), `${locale}/${width}/${theme}: selected price mismatch`)
        const layout = await section.evaluate(node => {
          const box = node.querySelector('.billing-cycle').getBoundingClientRect()
          const plus = node.querySelector('.home-plan-plus').getBoundingClientRect()
          return { overflow: document.documentElement.scrollWidth - innerWidth, left: box.left, right: box.right, inside: box.left > plus.left && box.right < plus.right, gap: box.top - node.querySelector('.home-plan-plus .home-plan-top').getBoundingClientRect().bottom, height: Math.min(...[...node.querySelectorAll('.billing-cycle label')].map(label => label.getBoundingClientRect().height)) }
        })
        assert(layout.inside && layout.overflow <= 0 && layout.left >= 0 && layout.right <= width && layout.height >= 44, JSON.stringify({ locale, width, theme, layout }))
        assert(layout.gap >= 12 && layout.gap <= 16 && await section.locator('.home-plan-plus .home-plan-description').count() === 0, 'phone Plus header has redundant space or description')
        assert(await section.locator('.home-annual-saving').isVisible() && (await section.locator('.home-annual-saving').innerText()).includes('$28.88'), 'annual savings missing on touch')
        if (locale === 'zh-CN' && width === 390) await section.screenshot({ path: join(artifact, `home-pricing-cycle-phone-${theme}.png`), style: '.site-header { visibility: hidden !important; }' })
        await section.locator('label[for="home-cycle-month"]').tap()
        assert(await section.locator('.home-price-month').isVisible() && !await section.locator('.home-price-year').isVisible(), 'touch did not switch back to monthly')
      }
    } finally { await touch.close() }
  })

  await check('services: pricing FAQ stacks at 320/390px in both themes with touch support and policy links', async () => {
    const touch = await browser.newContext({ isMobile: true, hasTouch: true, reducedMotion: 'reduce' })
    try {
      const page = await touch.newPage()
      for (const width of [320, 390]) for (const theme of ['light', 'dark']) for (const [locale, prefix] of LOCALES) {
        await page.setViewportSize({ width, height: 844 })
        await page.emulateMedia({ colorScheme: theme })
        await page.goto(`${base}${prefix}pricing/`)
        const common = page.locator('.common-faq'), billing = page.locator('.billing-faq')
        for (const section of [common, billing]) {
          const layout = await section.evaluate(node => ({
            headingBottom: node.querySelector('.home-faq-heading').getBoundingClientRect().bottom,
            listTop: node.querySelector('.home-faq-list').getBoundingClientRect().top,
            targetHeight: Math.min(...[...node.querySelectorAll('summary')].map(item => item.getBoundingClientRect().height)),
          }))
          assert(layout.headingBottom < layout.listTop && layout.targetHeight >= 44, JSON.stringify({ locale, width, theme, layout }))
        }
        await common.locator('#support summary').tap()
        assert(await common.locator('#support a[href^="mailto:"]').isVisible(), 'shared inline support unavailable')
        await billing.locator('#manage summary').tap()
        assert(await billing.locator('#manage ul').isVisible() && await common.locator('#support p').isVisible(), 'touch FAQ groups do not expand independently')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `pricing FAQ overflow: ${locale}/${width}/${theme}`)
        if (locale === 'zh-CN' && width === 390) await page.screenshot({ path: join(artifact, `pricing-faq-zh-phone-${theme}.png`), style: '.site-header { visibility: hidden !important; }' })
        await page.locator(`.site-footer a[href="${prefix}terms/"]`).tap()
        await page.waitForURL(`${base}${prefix}terms/`)
        assert(new URL(page.url()).pathname === `${prefix}terms/`, 'touch policy navigation failed')
      }
    } finally { await touch.close() }
  })

  const plain = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 1100, height: 900 } })
  const staticPage = await plain.newPage()
  await check('services: all languages remain readable and cycle controls work without JavaScript', async () => {
    for (const [, prefix] of LOCALES) {
      await staticPage.goto(base + prefix)
      await staticPage.locator('label[for="home-cycle-year"]').click()
      assert(await staticPage.locator('.home-price-year').isVisible() && (await staticPage.locator('.home-price-year').innerText()).includes('$79') && !await staticPage.locator('.home-price-month').isVisible(), 'static homepage annual switch failed')
      assert(await staticPage.locator('.home-annual-saving').isVisible() && (await staticPage.locator('.home-annual-saving').innerText()).includes('$28.88'), 'annual savings unavailable without JavaScript')
      await staticPage.locator('#home-cycle-year').focus()
      await staticPage.keyboard.press('ArrowLeft')
      assert(await staticPage.locator('.home-price-month').isVisible(), 'static homepage keyboard switch failed')
      for (const plan of ['free', 'plus']) {
        const info = staticPage.locator(`.home-plan-${plan} .info-disclosure`)
        await info.locator('summary').click()
        assert(await info.locator('.info-panel').isVisible(), 'plan information unavailable without JavaScript')
        await info.locator('summary').press('Enter')
        assert(!(await info.locator('.info-panel').isVisible()), 'native information disclosure did not close')
      }
      await staticPage.goto(`${base}${prefix}pricing/`)
      await staticPage.locator('label[for="pricing-cycle-year"]').click()
      assert(await staticPage.locator('.home-price-year').isVisible(), 'CSS-only annual control failed')
      assert(await staticPage.locator('.common-faq details').first().locator('p').isVisible() && await staticPage.locator('.billing-faq details').first().locator('p').isVisible(), 'no-JS FAQ failed')
      await staticPage.goto(`${base}${prefix}pricing/#service-trial`)
      assert(await staticPage.locator('#service-trial').isVisible(), 'trial fragment must reveal its answer without JavaScript')
      // Same-document navigation resolves before native smooth scrolling reaches the answer.
      await expect.poll(() => staticPage.locator('#service-trial').evaluate(node =>
        Math.abs(node.getBoundingClientRect().top - parseFloat(getComputedStyle(node).scrollMarginTop))
      )).toBeLessThan(3)
      await staticPage.locator('.service-faq #support summary').press('Enter')
      assert(await staticPage.locator('.service-faq #support a[href^="mailto:"]').isVisible(), 'static private support')
      await staticPage.locator('.service-faq #manage summary').press('Enter')
      assert(await staticPage.locator('.service-faq #manage ul').isVisible() && await staticPage.locator('.common-faq #support p').isVisible(), 'static management disclosure or exclusive expansion failed')
      await staticPage.locator(`.site-footer a[href="${prefix}privacy/"]`).press('Enter')
      await staticPage.waitForURL(`${base}${prefix}privacy/`)
      assert(new URL(staticPage.url()).pathname === `${prefix}privacy/`, 'static policy navigation failed')
      await staticPage.goto(`${base}${prefix}billing/continue/`)
      assert(await staticPage.locator('noscript p').isVisible(), 'billing no-JS explanation missing')
      assert(await staticPage.locator('.service-policies a[href$="#download"]').count() === 1, 'billing fallback download missing')
    }
    await shot(staticPage, 'billing-no-js')
  })
  await plain.close()

  await check('services: static export has no platform secrets or active billing SDK', async () => {
    const violations = [], counts = { html: 0, js: 0 }
    function scan(dir) {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name)
        if (statSync(path).isDirectory()) { scan(path); continue }
        if (!/\.(html|js)$/u.test(name)) continue
        const body = readFileSync(path, 'utf8')
        counts[name.endsWith('.html') ? 'html' : 'js']++
        if (/(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{12,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----|eyJhbGci[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/u.test(body)) violations.push(path.slice(out.length))
        if (/https:\/\/(?:js\.stripe\.com|checkout\.stripe\.com|buy\.stripe\.com)/u.test(body)) violations.push(path.slice(out.length))
      }
    }
    scan(out)
    assert(violations.length === 0, `unsafe build paths: ${violations.join(', ')}`)
    writeFileSync(join(artifact, 'service-boundaries.json'), JSON.stringify({ at: new Date().toISOString(), stage: 'live', publicClient: '1.10.0', windowsFreeClient: '1.9.10', windowsPlusAvailable: false, states, externalRequests: external, browserErrors: errors, staticScan: { counts, violations }, providerLifecycle: 'Desktop starts authenticated purchase; local web E2E does not establish provider readiness', policyText: 'finalized v1.0 incorporated; provider configuration and lifecycle not verified' }, null, 2))
  })
}
