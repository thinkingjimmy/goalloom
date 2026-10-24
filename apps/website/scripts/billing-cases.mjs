/**
 * [INPUT]: Fresh static export, local server and controlled canonical-route interception.
 * [OUTPUT]: Repeatable handoff/session/locale/input-rejection/manual-fallback evidence.
 * [POS]: Website-only D1 acceptance; no real provider, native protocol or payment-confirmation assertion.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'playwright/test'

const SITE = 'https://www.goalloom.com'
const KEY = 'goalloom.billing.continuation.v1'
const ID = '84c42898-b6ec-4df9-9a2f-e0fced544af9'
const dev = `v=1&environment=development&continue=${ID}&transport=loopback&port=53683`
const prod = `v=1&environment=production&continue=${ID}&transport=app`
const devTarget = `http://127.0.0.1:53683/billing-return?v=1&environment=development&continue=${ID}`
const prodTarget = `goalloom://billing-return?v=1&environment=production&continue=${ID}`

export async function runBillingCases({ browser, base, LOCALES, check, assert, shot, artifact }) {
  const evidence = { scope: 'Controlled canonical static website only; no provider or native app invocation', routes: [], phoneGutters: [], rejected: [], externalRequests: [], pageErrors: [] }
  async function context(options = {}) {
    const value = await browser.newContext({ viewport: { width: 1100, height: 900 }, reducedMotion: 'reduce', ...options })
    await value.route(`${SITE}/**`, async route => {
      const url = new URL(route.request().url())
      const response = await fetch(base + url.pathname + url.search)
      await route.fulfill({ status: response.status, contentType: response.headers.get('content-type') ?? 'application/octet-stream', body: Buffer.from(await response.arrayBuffer()) })
    })
    value.on('request', request => {
      const origin = new URL(request.url()).origin
      if (origin !== SITE && origin !== base) evidence.externalRequests.push({ origin, method: request.method() })
    })
    value.on('page', page => page.on('pageerror', error => evidence.pageErrors.push(String(error))))
    return value
  }
  const state = (page, name) => expect(page.locator('.billing-state')).toHaveAttribute('data-billing-state', name)
  async function scrubbed(page) {
    assert(!new URL(page.url()).search && !new URL(page.url()).hash, 'continuation remains in address')
    assert(await page.locator('[data-billing-state="confirmed"], [data-billing-state="cancelled"], [data-billing-state="failed"]').count() === 0, 'website inferred a payment outcome')
    assert(!(await page.locator('body').innerText()).includes(ID), 'continuation exposed as visible copy')
  }

  await check('billing handoff: ten canonical routes keep finite sessions without inferring payment', async () => {
    const ctx = await context()
    try {
      const page = await ctx.newPage()
      for (const [locale, prefix] of LOCALES) for (const kind of ['continue', 'return']) {
        await page.evaluate(() => sessionStorage.clear()).catch(() => undefined)
        await page.goto(`${SITE}${prefix}billing/${kind}/?${dev}`)
        await state(page, 'appClosed')
        await scrubbed(page)
        assert(await page.locator('[data-billing-return]').getAttribute('href') === devTarget, 'fixed loopback target drift')
        assert(await page.locator('[data-billing-return]').getAttribute('rel') === 'noreferrer', 'return link leaks referrer')
        assert(await page.locator('meta[name="referrer"]').getAttribute('content') === 'no-referrer', 'referrer policy missing')
        assert((await page.locator('meta[name="robots"]').getAttribute('content')).includes('noindex'), 'billing is indexable')
        const frame = await page.evaluate(() => {
          const header = document.querySelector('.site-header'), main = document.querySelector('.billing-main'), footer = document.querySelector('.site-footer')
          return { width: innerWidth, padding: [header, main, footer].map(node => parseFloat(getComputedStyle(node).paddingLeft)), textLeft: main.querySelector('h1').getBoundingClientRect().left }
        })
        assert(frame.padding.every(value => value >= 24 && value <= 32) && frame.textLeft >= 24, `${locale}/${kind}: desktop gutter missing ${JSON.stringify(frame)}`)
        if (locale === 'zh-CN') assert(await page.locator('.billing-state > p').first().innerText() === '返回 Goalloom，使用发起购买的账号查看订阅状态。', 'billing explanation is not the reviewed user instruction')
        const before = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)), KEY)
        assert(Object.keys(before).sort().join(',') === 'expiresAt,fields,kind' && before.fields === dev && before.kind === kind, 'session fields are not finite')
        assert(before.expiresAt > Date.now() && before.expiresAt <= Date.now() + 86400000, 'session exceeds 24 hours')
        await page.reload()
        await state(page, 'appClosed')
        assert(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).expiresAt, KEY) === before.expiresAt, 'reload extended expiry')
        for (const href of await page.locator('.menu-panel a[lang]').evaluateAll(nodes => nodes.map(node => node.getAttribute('href')))) assert(!href.includes('?') && !href.includes('#'), 'language link copied URL fields')
        evidence.routes.push({ locale, kind, target: 'fixed development loopback', paymentConfirmed: false, frame })
        if (locale === 'zh-CN' && kind === 'return') await shot(page, 'billing-d1-zh-return')
      }
    } finally { await ctx.close() }
  })

  await check('billing handoff: language recovery, original deadline and keyboard production return', async () => {
    const ctx = await context()
    try {
      const page = await ctx.newPage()
      await page.goto(`${SITE}/billing/return/?${prod}`)
      await state(page, 'appClosed')
      const deadline = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).expiresAt, KEY)
      assert(await page.locator('[data-billing-return]').getAttribute('href') === prodTarget, 'production target is not exact')
      await page.locator('.site-header .menu-pop summary').click()
      await page.locator('.site-header .menu-panel a[lang="fr"]').click()
      await page.waitForURL(`${SITE}/fr/billing/return/`)
      await state(page, 'appClosed')
      assert(await page.locator('[data-billing-return]').getAttribute('href') === prodTarget, 'language lost continuation')
      assert(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).expiresAt, KEY) === deadline, 'language extended expiry')
      await page.goto(`${SITE}/fr/billing/return/?${prod}`)
      await state(page, 'appClosed')
      assert(await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)).expiresAt, KEY) === deadline, 'same link extended expiry')
      // Prevent the OS handoff in controlled acceptance; capture a real keyboard user action instead.
      await page.evaluate(() => document.querySelector('[data-billing-return]').addEventListener('click', event => { event.preventDefault(); window.billingClick = { trusted: event.isTrusted, href: event.currentTarget.href } }))
      await page.locator('[data-billing-return]').focus()
      await page.keyboard.press('Enter')
      const click = await page.evaluate(() => window.billingClick)
      assert(click?.trusted && click.href === prodTarget, 'return is not a user-initiated fixed link')
      assert(await page.locator('[data-billing-return]').evaluate(node => node === document.activeElement), 'return stole focus')
      await page.locator('.billing-state button').focus()
      await page.keyboard.press('Enter')
      assert(await page.locator('.billing-state button').evaluate(node => node === document.activeElement), 'connection check stole focus')
      await state(page, 'appClosed')
      await scrubbed(page)
      await shot(page, 'billing-d1-fr-keyboard')
    } finally { await ctx.close() }
  })

  await check('billing handoff: malformed, duplicate, mixed-environment and destination fields fail closed', async () => {
    const ctx = await context()
    try {
      const page = await ctx.newPage()
      const invalid = [
        '?success=true', `?${dev}&success=true`, `?${dev}&v=1`, `?${dev}&continue=${ID}`, `?${dev}&port=53684`,
        `?${prod}&port=53683`, `?${prod.replace('production', 'development')}`, `?${dev.replace('development', 'production')}`,
        `?${dev.replace('loopback', 'app')}`, `?${dev.replace('v=1', 'v=2')}`, `?${dev.replace(ID, 'not-a-uuid')}`,
        `?${dev.replace('53683', '1023')}`, `?${dev.replace('53683', '65536')}`, `?${dev.replace('53683', '053683')}`,
        `?${dev.replace('53683', '53683.0')}`, `?${prod}&redirect=https%3A%2F%2Fevil.invalid`,
        `?${prod}&appUrl=goalloom%3A%2F%2Fapp`, `?${prod}&host=localhost`, `?${prod}&token=TEST_PRIVATE_MARKER`,
        `?${prod}#untrusted`, '#success', `?${dev}&extra=${'a'.repeat(300)}`, `?${prod.replace('transport=app', 'transport=app%00')}`,
      ]
      for (const [index, suffix] of invalid.entries()) {
        await page.goto(`${SITE}/billing/return/${suffix}`)
        await state(page, 'invalid').catch(error => { throw new Error(`Input case ${index + 1}: ${suffix}\n${error.message}`) })
        await scrubbed(page)
        assert(await page.locator('[data-billing-return]').count() === 0, 'invalid link offers native navigation')
        assert(await page.evaluate(key => sessionStorage.getItem(key), KEY) === null, 'invalid continuation persisted')
        assert(!(await page.locator('body').innerText()).includes('TEST_PRIVATE_MARKER'), 'raw field echoed')
        evidence.rejected.push({ case: evidence.rejected.length + 1, paymentConfirmed: false, nativeTarget: false })
      }
      // The browser/framework normalizes an empty fragment before hydration; it carries no payment claim.
      await page.goto(`${SITE}/billing/return/?${prod}#`)
      await state(page, 'appClosed')
      await scrubbed(page)
      await page.goto(`${base}/billing/return/?${dev}`)
      await state(page, 'invalid')
      assert(await page.locator('[data-billing-return]').count() === 0, 'noncanonical origin accepted continuation')
    } finally { await ctx.close() }
  })

  await check('billing handoff: expired/corrupt sessions and same-id conflicts preserve manual recovery', async () => {
    const ctx = await context()
    try {
      const page = await ctx.newPage()
      await page.goto(`${SITE}/billing/return/?${dev}`)
      await state(page, 'appClosed')
      await page.goto(`${SITE}/billing/continue/`)
      await state(page, 'unavailable')
      assert(await page.locator('[data-billing-return]').count() === 0, 'other route consumed saved context')
      await page.goto(`${SITE}/billing/return/`)
      await state(page, 'appClosed')
      await page.goto(`${SITE}/billing/return/?${dev.replace('53683', '53684')}`)
      await state(page, 'invalid')
      const records = [
        '{broken', JSON.stringify({ kind: 'return', fields: dev, expiresAt: Date.now() - 1 }),
        JSON.stringify({ kind: 'return', fields: dev, expiresAt: Date.now() + 172800000 }),
        JSON.stringify({ kind: 'return', fields: `${dev}&redirect=https://evil.invalid`, expiresAt: Date.now() + 60000 }),
        JSON.stringify({ kind: 'return', fields: dev, expiresAt: Date.now() + 60000, token: 'TEST_PRIVATE_MARKER' }),
      ]
      for (const record of records) {
        await page.evaluate(({ key, record }) => sessionStorage.setItem(key, record), { key: KEY, record })
        await page.reload()
        await state(page, 'invalid')
        assert(await page.evaluate(key => sessionStorage.getItem(key), KEY) === null, 'corrupt/expired session remains')
      }
      await page.goto(`${SITE}/billing/return/?${dev}`)
      await state(page, 'appClosed')
      await page.evaluate(key => { const end = JSON.parse(sessionStorage.getItem(key)).expiresAt; Date.now = () => end }, KEY)
      await page.locator('.billing-state button').click()
      await state(page, 'invalid')
      assert(await page.locator('[data-billing-return]').count() === 0, 'expired live-page link remains')
    } finally { await ctx.close() }
  })

  await check('billing handoff: offline/reconnected and denied storage retain manual recovery', async () => {
    const ctx = await context()
    try {
      const page = await ctx.newPage()
      await page.goto(`${SITE}/billing/return/?${dev}`)
      await state(page, 'appClosed')
      await ctx.setOffline(true)
      await page.locator('.billing-state button').click()
      await state(page, 'offline')
      assert(await page.locator('[data-billing-return]').getAttribute('href') === devTarget, 'offline lost original return')
      await shot(page, 'billing-d1-offline')
      await ctx.setOffline(false)
      await page.locator('.billing-state button').click()
      await state(page, 'appClosed')
      await scrubbed(page)
    } finally { await ctx.close() }
    const denied = await context()
    try {
      await denied.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('Storage denied', 'SecurityError') } }))
      const page = await denied.newPage()
      await page.goto(`${SITE}/billing/return/?${dev}`)
      await expect(page.locator('.billing-state button')).toBeEnabled()
      assert(await page.locator('[data-billing-return]').count() === 0 && await page.locator('.billing-manual').isVisible(), 'storage denial lacks fallback')
      await scrubbed(page)
    } finally { await denied.close() }
  })

  await check('billing handoff: five-language phone dark touch and no-JavaScript fallbacks', async () => {
    const ctx = await context({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true, colorScheme: 'dark' })
    try {
      const page = await ctx.newPage()
      for (const [locale, prefix] of LOCALES) {
        await page.goto(`${SITE}${prefix}billing/return/?${dev}`)
        await state(page, 'appClosed')
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}: phone overflow`)
        const gutters = await page.evaluate(() => ['.site-header', '.billing-main', '.site-footer'].map(selector => parseFloat(getComputedStyle(document.querySelector(selector)).paddingLeft)))
        assert(gutters.every(value => value >= 16), `${locale}: phone gutters missing ${gutters}`)
        evidence.phoneGutters.push({ locale, width: 320, gutters })
        for (const target of [page.locator('[data-billing-return]'), page.locator('.billing-state button')]) assert((await target.boundingBox()).height >= 44, `${locale}: small touch action`)
        await page.locator('.billing-state button').tap()
        await state(page, 'appClosed')
        assert(await page.locator('.billing-manual').isVisible() && await page.locator('.service-support a[href^="mailto:"]').isVisible(), 'manual/private support missing')
        if (locale === 'fr') await shot(page, 'billing-d1-fr-phone-dark')
      }
    } finally { await ctx.close() }
    const plain = await context({ javaScriptEnabled: false })
    try {
      const page = await plain.newPage()
      for (const [, prefix] of LOCALES) {
        await page.goto(`${SITE}${prefix}billing/return/?${dev}`)
        assert(await page.locator('noscript p').isVisible() && await page.locator('.billing-manual').isVisible(), 'no-JS recovery missing')
        assert(await page.locator('[data-billing-return]').count() === 0 && await page.locator('.service-policies a[href$="#download"]').count() === 1, 'no-JS navigation or download drift')
      }
      await shot(page, 'billing-d1-no-js')
    } finally { await plain.close() }
  })

  await check('billing handoff: no passive backend, loopback, payment SDK or native invocation', async () => {
    assert(evidence.externalRequests.length === 0 && evidence.pageErrors.length === 0, JSON.stringify({ requests: evidence.externalRequests, errors: evidence.pageErrors }))
  })
  writeFileSync(join(artifact, 'billing-handoff.json'), JSON.stringify(evidence, null, 2))
}
