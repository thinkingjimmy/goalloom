/**
 * [INPUT]: Fresh static website, finalized policy v1.0 and the owning E2E helpers.
 * [OUTPUT]: Five-language policy/retrieval/notice journeys, launch-boundary, mobile and no-JS evidence.
 * [POS]: Policy publication acceptance only; never executes purchases, refunds, deletion or provider calls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'playwright/test'

const SECTION_IDS = ['free', 'prices', 'trial', 'cancellation', 'changes', 'grace', 'refunds', 'disputes', 'cloud-retention', 'deletion', 'records', 'ai-use']
const EXPECTED = {
  en: { tax: 'not added on top', trial: 'A refund does not restore', change: 'take effect at the next renewal', rights: 'statutory withdrawal', apple: 'do not automatically cancel' },
  'zh-CN': { tax: '不在该标价上另加', trial: '退款不会恢复', change: '都在下一次续订时生效', rights: '撤回权', apple: '不会随 Goalloom 账号删除自动取消' },
  ja: { tax: '上乗せしません', trial: '返金されても', change: '次回更新時に適用', rights: '撤回', apple: '自動で解約されない' },
  es: { tax: 'no se añaden', trial: 'Un reembolso no restaura', change: 'próxima renovación', rights: 'desistimiento', apple: 'no se cancela automáticamente' },
  fr: { tax: 'sans ajout', trial: 'Un remboursement ne restaure', change: 'prochain renouvellement', rights: 'rétractation', apple: 'ne s’annule pas automatiquement' },
}
const LIFECYCLE = {
  en: { copy: 'separate local copy', notices: 'inside Goalloom', push: 'system push', boundary: 'original renewal', scope: 'launch policy' },
  'zh-CN': { copy: '独立本地副本', notices: 'Goalloom 应用内', push: '系统推送', boundary: '原续订', scope: '上线政策' },
  ja: { copy: '独立したローカルコピー', notices: 'Goalloom アプリ内', push: 'システム通知', boundary: '元の更新', scope: '提供開始時の方針' },
  es: { copy: 'copia local independiente', notices: 'dentro de Goalloom', push: 'notificaciones del sistema', boundary: 'renovación original', scope: 'política de lanzamiento' },
  fr: { copy: 'copie locale indépendante', notices: 'dans Goalloom', push: 'notifications système', boundary: 'renouvellement initial', scope: 'politique de lancement' },
}
async function openSection(page, id) {
  await page.locator(`.legal-contents a[href="#${id}"]`).click()
  // Poll from the test driver: page animation frames and timers are disabled in no-JS contexts.
  await expect.poll(() => page.locator(`#${id}`).evaluate(section =>
    Math.abs(section.getBoundingClientRect().top - parseFloat(getComputedStyle(section).scrollMarginTop))
  )).toBeLessThan(3)
}
export async function runPolicyCases({ browser, base, LOCALES, check, assert, shot, artifact }) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  const page = await context.newPage(), requests = [], facts = []
  context.on('request', request => {
    const url = new URL(request.url())
    if (url.origin !== base) requests.push({ origin: url.origin, path: url.pathname })
  })
  for (const [locale, prefix] of LOCALES) await check(`policy ${locale}: inclusive prices, renewal/refund rules and distinct deletion windows`, async () => {
    const expected = EXPECTED[locale]
    const lifecycle = LIFECYCLE[locale]
    await page.goto(`${base}${prefix}pricing/`)
    assert(await page.locator('main[data-stage="unavailable"]').count() === 1, 'policy approval opened sales')
    for (const id of ['renewal', 'grace', 'refunds', 'expiry']) {
      const answer = page.locator(`.service-faq #service-${id}`)
      await answer.locator('..').locator('summary').click()
      assert(await answer.isVisible(), `pricing FAQ missing ${id}`)
    }
    assert((await page.locator('#service-grace').textContent()).includes('3'), 'grace answer missing')
    const expiryAnswer = await page.locator('#service-expiry').textContent()
    assert(expiryAnswer.includes(lifecycle.copy), 'expiry answer does not distinguish independent retrieval from sync')
    await page.locator(`.site-footer a[href="${prefix}terms/"]`).click()
    assert(await page.locator('.legal-policy-notice, [data-policy-status]').count() === 0, 'removed Plus banner remains')
    for (const id of SECTION_IDS) {
      assert(await page.locator(`#billing-${id} p`).count() >= 2, `policy section missing ${id}`)
      assert(await page.locator(`.legal-contents a[href="#billing-${id}"]`).count() === 1, `contents missing ${id}`)
    }
    const text = async id => page.locator(`#billing-${id}`).innerText()
    const prices = await text('prices'), trial = await text('trial'), grace = await text('grace')
    assert(prices.includes('USD 8.99') && prices.includes('USD 79') && prices.includes(expected.tax), 'tax-inclusive prices disagree')
    assert(trial.includes(expected.trial), 'refund incorrectly restores trial')
    assert((await text('changes')).includes(expected.change), 'cycle change is not at next renewal')
    assert(grace.includes('3') && grace.includes('Apple'), 'channel-specific grace missing')
    assert(grace.includes(lifecycle.boundary), 'renewal grace lost its original boundary')
    assert((await text('refunds')).includes(expected.rights), 'mandatory withdrawal rights missing')
    assert((await text('deletion')).includes(expected.apple), 'account deletion incorrectly cancels Apple')
    const cloud = await text('cloud-retention'), deletion = await text('deletion'), records = await text('records')
    assert(cloud.includes('30') && cloud.includes('7'), 'ordinary expiry/deletion windows missing')
    assert(cloud.includes(lifecycle.copy) && cloud.includes(lifecycle.notices) && cloud.includes(lifecycle.push), 'retrieval or in-app notice scope missing')
    assert(deletion.includes('30') && deletion.includes('7'), 'explicit deletion exception missing')
    for (const value of ['35', '7', '180']) assert(records.includes(value), `limited-retention value missing ${value}`)
    assert(records.includes(lifecycle.scope), 'backup requirement reads as verified current service')
    assert((await page.locator('#license').innerText()).includes('MIT'), 'license changed')
    assert(!/\{(?:monthly|graceDays|onlineDeleteDays|backupDays|billingYears|abuseDays|supportEmail)\}/u.test(await page.locator('body').innerText()), 'unexpanded policy token')
    await openSection(page, 'billing-refunds')
    assert(new URL(page.url()).hash === '#billing-refunds', 'refund policy anchor failed')
    if (locale === 'en') await shot(page, 'billing-policy-en-refunds')
    if (locale === 'zh-CN') {
      await openSection(page, 'billing-cloud-retention')
      await shot(page, 'billing-policy-zh-independent-copy')
      await openSection(page, 'billing-records')
      await shot(page, 'billing-policy-zh-retention')
    }
    await page.goto(`${base}${prefix}privacy/`)
    for (const id of ['cloud-retention', 'deletion', 'records']) assert(await page.locator(`#billing-${id}`).count() === 1, 'privacy lifecycle rules missing')
    assert((await page.locator('#billing-cloud-retention').innerText()).includes(lifecycle.copy), 'privacy lost independent-copy retrieval')
    assert(await page.locator('.legal-policy-notice, [data-policy-status]').count() === 0, 'removed privacy banner remains')
    const schema = JSON.parse(await page.locator('script[type="application/ld+json"]').first().textContent())
    assert(schema.dateModified === await page.locator('time').getAttribute('datetime'), 'policy date mismatch')
    facts.push({ locale, policy: '1.0', sections: SECTION_IDS, stage: 'unavailable', tax: 'inclusive', graceDays: 3, retrievalDays: 30, onlineDeleteDays: 7, backupDays: 35, billingYears: 7, abuseDays: 180, retrievalCopy: 'independent', lifecycleNotices: 'in-app only', providerRetentionVerified: false })
  })
  await check('policy: narrow dark documents and tall desktop contents remain navigable', async () => {
    await page.goto(`${base}/fr/terms/`)
    const contents = await page.locator('.legal-contents').boundingBox()
    assert(contents.height <= 936, 'tall sticky contents extends beyond the viewport')
    await openSection(page, 'billing-records')
    assert(new URL(page.url()).hash === '#billing-records', 'last policy anchor unreachable')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(`${base}/fr/terms/`)
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'long policy translation overflows')
    await openSection(page, 'billing-deletion')
    await shot(page, 'billing-policy-fr-mobile-dark')
    await page.setViewportSize({ width: 320, height: 844 })
    for (const [locale, prefix] of LOCALES) {
      await page.goto(`${base}${prefix}terms/`)
      await openSection(page, 'billing-cloud-retention')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `narrow lifecycle policy overflows in ${locale}`)
      if (locale === 'zh-CN' || locale === 'fr') await shot(page, `billing-policy-${locale}-lifecycle-320-dark`)
    }
    assert(requests.length === 0, 'policy browsing made external requests')
  })
  await context.close()
  const plain = await browser.newContext({ javaScriptEnabled: false })
  const staticPage = await plain.newPage()
  await check('policy: finalized terms and private support remain accessible without JavaScript in every language', async () => {
    for (const [locale, prefix] of LOCALES) {
      await staticPage.goto(`${base}${prefix}terms/`)
      assert(await staticPage.locator('.legal-policy-notice, [data-policy-status]').count() === 0, 'removed banner remains without JavaScript')
      await openSection(staticPage, 'billing-deletion')
      assert(new URL(staticPage.url()).hash === '#billing-deletion', 'static deletion anchor failed')
      assert((await staticPage.locator('#billing-records').innerText()).includes('180'), 'static records policy missing')
      assert((await staticPage.locator('#billing-cloud-retention').innerText()).includes(LIFECYCLE[locale].notices), 'static lifecycle notice scope missing')
      assert(await staticPage.locator('#contact a[href="mailto:hellojimmywong@gmail.com"]').count() === 1, 'private support missing')
    }
    writeFileSync(join(artifact, 'billing-policy.json'), JSON.stringify({ at: new Date().toISOString(), policyVersion: '1.0', scope: 'content-only website acceptance; lifecycle and provider configuration unverified', facts, externalRequests: requests }, null, 2))
  })
  await plain.close()
}
