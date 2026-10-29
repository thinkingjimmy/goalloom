/**
 * [INPUT]: Static website, native Chromium view transitions and the owning E2E helpers.
 * [OUTPUT]: Circular snapshot/timing evidence and fallback, interruption, accessibility and persistence journeys.
 * [POS]: Browser theme acceptance; capability overrides simulate unsupported/blocked APIs without shipping test flags.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect } from 'playwright/test'

const clipAnimation = () => document.getAnimations().find(animation => animation.effect?.getKeyframes().some(frame => frame.clipPath))
const evidence = []
async function settle(page, theme) {
  await expect.poll(() => page.evaluate(() => ({ theme: document.documentElement.dataset.theme, active: Boolean(document.documentElement.dataset.themeTransition), held: document.documentElement.classList.contains('no-transitions') }))).toEqual({ theme, active: false, held: false })
}
async function circle(page, button, target, assert, shot, name) {
  await button.scrollIntoViewIfNeeded()
  const beforeClick = await button.boundingBox()
  // Hero scroll scaling can move the footer between scrolling it into view and the actual click.
  await button.evaluate(node => node.addEventListener('click', () => {
    const box = node.getBoundingClientRect()
    node.dataset.testThemeOrigin = JSON.stringify({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
  }, { once: true }))
  const viewport = page.viewportSize()
  await button.click()
  await expect.poll(() => page.evaluate(clipAnimation)).not.toBeUndefined()
  const motion = await page.evaluate(() => {
    const animation = document.getAnimations().find(value => value.effect?.getKeyframes().some(frame => frame.clipPath))
    animation.pause()
    animation.currentTime = 275
    return { frames: animation.effect.getKeyframes().map(frame => frame.clipPath), timing: animation.effect.getTiming(), pseudoElement: animation.effect.pseudoElement, theme: document.documentElement.dataset.theme }
  })
  const { x, y } = await button.evaluate(node => { const value = JSON.parse(node.dataset.testThemeOrigin); delete node.dataset.testThemeOrigin; return value })
  const radius = Math.hypot(Math.max(x, viewport.width - x), Math.max(y, viewport.height - y))
  assert(motion.theme === target && motion.timing.duration === 550 && motion.timing.easing === 'ease-in-out', JSON.stringify(motion))
  assert(motion.pseudoElement === '::view-transition-new(root)', 'circle targeted the live page instead of the new snapshot')
  const numbers = motion.frames.map(value => value.match(/[\d.]+/gu).map(Number))
  assert(Math.abs(numbers[0][0]) < .01 && Math.abs(numbers[1][0] - radius) < .1, `circle does not cover every viewport corner: ${JSON.stringify({ beforeClick, x, y, radius, numbers })}`)
  assert(numbers.every(frame => Math.abs(frame[1] - x) < .1 && Math.abs(frame[2] - y) < .1), 'circle is not centered on the button')
  await shot(page, name)
  evidence.push({ name, target, origin: { x, y }, beforeClick, viewport, motion })
  await page.evaluate(() => document.getAnimations().find(value => value.effect?.getKeyframes().some(frame => frame.clipPath)).play())
  await settle(page, target)
}

export async function runThemeCases({ browser, base, check, assert, shot, artifact }) {
  const errors = []
  const create = async (options = {}, init) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'no-preference', ...options })
    if (init) await context.addInitScript(init)
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(String(error)))
    return { context, page }
  }
  const open = async (page, path = '/zh-CN/') => { await page.goto(base + path); await page.waitForLoadState('networkidle') }
  await check('theme motion: both directions reveal from the button at the reference duration and easing', async () => {
    const { context, page } = await create()
    try {
      await open(page)
      await circle(page, page.locator('.site-footer .footer-theme'), 'dark', assert, shot, 'theme-circle-dark-midpoint')
      assert(await page.evaluate(() => localStorage.getItem('goalloom-theme')) === 'dark', 'dark preference not persisted')
      await circle(page, page.locator('.site-footer .footer-theme'), 'light', assert, shot, 'theme-circle-light-midpoint')
      assert(await page.evaluate(() => localStorage.getItem('goalloom-theme')) === null, 'returning to system theme did not restore auto')
      assert(await page.locator('.site-footer .footer-theme').evaluate(node => node === document.activeElement), 'theme change lost button focus')
    } finally { await context.close() }
  })
  await check('theme motion: information-page and mobile controls use their own viewport origin', async () => {
    for (const [path, width, selector, name] of [['/fr/pricing/',1440,'.site-header .nav-icon','theme-circle-pricing'],['/zh-CN/',390,'.site-footer .footer-theme','theme-circle-mobile']]) {
      const { context, page } = await create({ viewport: { width, height: 900 } })
      try { await open(page, path); await circle(page, page.locator(selector), 'dark', assert, shot, name) }
      finally { await context.close() }
    }
  })
  await check('theme motion: rapid clicks retain the latest intent without stuck snapshots', async () => {
    const { context, page } = await create()
    try {
      await open(page)
      await page.locator('.site-footer .footer-theme').evaluate(button => {
        for (let index = 0; index < 3; index++) button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
      })
      await settle(page, 'dark')
      await page.reload()
      await settle(page, 'dark')
      await shot(page, 'theme-rapid-settled')
    } finally { await context.close() }
  })
  await check('theme motion: reduced motion, keyboard and system changes switch immediately', async () => {
    const { context, page } = await create({ reducedMotion: 'reduce' })
    try {
      await open(page)
      await page.locator('.site-footer .footer-theme').click()
      await settle(page, 'dark')
      assert(await page.evaluate(clipAnimation) === undefined, 'reduced-motion preference animated')
      await page.locator('.site-footer .footer-theme').click()
      await settle(page, 'light')
      await page.emulateMedia({ colorScheme: 'dark' })
      await settle(page, 'dark')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.locator('.site-footer .footer-theme').focus()
      await page.locator('.site-footer .footer-theme').press('Enter')
      await settle(page, 'light')
      assert(await page.evaluate(clipAnimation) === undefined, 'keyboard theme change animated')
    } finally { await context.close() }
  })
  await check('theme motion: missing, throwing and skipped native transitions preserve a usable theme', async () => {
    const capabilities = [
      () => { Document.prototype.startViewTransition = undefined },
      () => { Element.prototype.animate = undefined },
      () => { Document.prototype.startViewTransition = () => { throw new Error('controlled unsupported transition') } },
      () => { const start = Document.prototype.startViewTransition; Document.prototype.startViewTransition = function(update) { const transition = start.call(this, update); transition.skipTransition(); return transition } },
    ]
    for (const init of capabilities) {
      const { context, page } = await create({}, init)
      try { await open(page); await page.locator('.site-footer .footer-theme').click(); await settle(page, 'dark') }
      finally { await context.close() }
    }
  })
  await check('theme motion: enabling reduced motion during a reveal cancels the animation cleanly', async () => {
    const { context, page } = await create()
    try {
      await open(page)
      await page.locator('.site-footer .footer-theme').click()
      await expect.poll(() => page.evaluate(clipAnimation)).not.toBeUndefined()
      await page.evaluate(() => document.getAnimations().find(value => value.effect?.getKeyframes().some(frame => frame.clipPath)).pause())
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await settle(page, 'dark')
      assert(await page.evaluate(clipAnimation) === undefined, 'cancelled animation retained a snapshot')
    } finally { await context.close() }
  })
  await check('theme motion: blocked storage does not prevent switching or leak browser errors', async () => {
    const { context, page } = await create({}, () => {
      Storage.prototype.getItem = () => { throw new Error('controlled blocked storage') }
      Storage.prototype.setItem = () => { throw new Error('controlled blocked storage') }
      Storage.prototype.removeItem = () => { throw new Error('controlled blocked storage') }
    })
    try { await open(page); await page.locator('.site-footer .footer-theme').click(); await settle(page, 'dark'); assert(errors.length === 0, errors.join('\n')) }
    finally { await context.close() }
    writeFileSync(join(artifact, 'theme-motion.json'), JSON.stringify({ at: new Date().toISOString(), reference: 'https://github.com/thinkingjimmy/jimmywong-dev/blob/562751bbcaafe53218013b6b3a85bc9ab219c6b8/components/theme-toggle.tsx', evidence, errors, scope: 'native Chromium plus controlled capability/storage fallbacks; no Safari/Firefox acceptance' }, null, 2))
  })
}
