/**
 * [INPUT]: Native Electron page, isolated period fixture and the owning period suite's artifact directory.
 * [OUTPUT]: Inline-header and directional-motion assertions, sampled keyframes and repeatable screenshots.
 * [POS]: Period-navigation scenarios shared by the focused selector and full period acceptance; no production API replacement.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'

export async function verifyPeriodNavigation(page, column, evidence) {
  const week = column('week'), body = week.locator('.period-body')
  const origin = await week.getAttribute('data-period-id')
  const result = { frames: [], screenshots: [] }
  const settled = () => page.waitForFunction(() => document.querySelector('[data-horizon="week"]')?.getAttribute('aria-busy') === 'false')
  const date = async () => {
    const geometry = await week.locator('.column-header').evaluate(header => {
      const rect = selector => { const box = header.querySelector(selector).getBoundingClientRect(); return { left: box.left, right: box.right, center: box.top + box.height / 2 } }
      return { title: rect('.period-title'), date: rect('.column-meta'), action: rect('[data-return-current]'), next: rect('[data-next-period]'), text: header.querySelector('.column-meta').textContent }
    })
    assert(geometry.date.left >= geometry.title.right && Math.abs(geometry.date.center - geometry.title.center) <= 3)
    assert(geometry.date.right <= geometry.action.left && geometry.action.right <= geometry.next.left)
    assert(Math.abs(geometry.action.center - geometry.next.center) < 1)
    assert.equal(await week.locator('[data-return-current]').innerText(), '回到本周')
    assert.equal(await week.locator('.period-meta').count(), 0)
    return geometry
  }
  const finish = async () => {
    await body.evaluate(node => node.getAnimations().forEach(animation => animation.finish()))
    await page.waitForFunction(() => {
      const node = document.querySelector('[data-horizon="week"] .period-body')
      return node.getAnimations().length === 0 && node.style.willChange === ''
    })
  }
  const slide = async (selector, direction, name, keep = false) => {
    const previous = await week.getAttribute('data-period-id')
    const capture = page.waitForFunction(previous => {
      const column = document.querySelector('[data-horizon="week"]')
      if (column.dataset.periodId === previous) return false
      const animation = column.querySelector('.period-body').getAnimations().find(value => value.id === 'period-navigation')
      if (!animation) return false
      animation.pause()
      return true
    }, previous)
    await week.locator(selector).click()
    await capture
    await settled()
    const sample = await body.evaluate(node => {
      const animation = node.getAnimations().find(value => value.id === 'period-navigation')
      const duration = Number(animation.effect.getTiming().duration)
      const header = node.closest('[data-horizon]').querySelector('.column-header')
      const frames = [0, duration / 2, duration].map(time => {
        animation.currentTime = time
        const style = getComputedStyle(node)
        return { time, x: new DOMMatrixReadOnly(style.transform).m41, opacity: Number(style.opacity), headerX: header.getBoundingClientRect().x }
      })
      animation.currentTime = duration / 2
      return { duration, frames, overflowX: getComputedStyle(node.closest('.column-content')).overflowX }
    })
    assert.equal(sample.duration, 220)
    assert.equal(Math.sign(sample.frames[0].x), direction)
    assert(Math.abs(sample.frames[1].x) < Math.abs(sample.frames[0].x))
    assert(Math.abs(sample.frames[2].x) < .01)
    assert.equal(sample.frames[2].opacity, 1)
    assert(sample.frames.every(frame => frame.headerX === sample.frames[0].headerX))
    assert.equal(sample.overflowX, 'hidden')
    const screenshot = join(evidence, `navigation-${name}.png`)
    await week.screenshot({ path: screenshot, animations: 'allow' })
    result.frames.push({ name, direction, ...sample }); result.screenshots.push(screenshot)
    if (!keep) await finish()
  }

  assert.equal(await body.evaluate(node => node.getAnimations().length), 0, 'Initial render is static')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await slide('[data-next-period]', 1, 'next-week')
  result.future = await date()
  await week.locator('.column-header').screenshot({ path: join(evidence, 'header-next-week.png') })
  await slide('[data-return-current]', -1, 'return-from-future')
  assert.equal(await week.getAttribute('data-period-id'), origin)
  await slide('[data-previous-period]', -1, 'previous-week')
  result.past = await date()
  await week.locator('.column-header').screenshot({ path: join(evidence, 'header-previous-week.png') })
  await slide('[data-return-current]', 1, 'return-from-past')

  await slide('[data-next-period]', 1, 'interrupted-next', true)
  await body.evaluate(node => { window.interruptedPeriodAnimation = node.getAnimations()[0] })
  await slide('[data-previous-period]', -1, 'rapid-reversal')
  assert.equal(await page.evaluate(() => window.interruptedPeriodAnimation.playState), 'idle')
  assert.equal(await week.getAttribute('data-period-id'), origin)

  await week.locator('[data-next-period]').focus()
  await page.keyboard.press('Enter'); await settled()
  assert.equal(await body.evaluate(node => node.getAnimations().length), 0, 'Keyboard changes are immediate')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await week.locator('[data-return-current]').click(); await settled()
  assert.equal(await body.evaluate(node => node.getAnimations().length), 0, 'Reduced-motion pointer changes are immediate')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await slide('[data-next-period]', 1, 'reduced-mid-flight', true)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.waitForFunction(() => document.querySelector('[data-horizon="week"] .period-body').getAnimations().length === 0)
  await week.locator('[data-return-current]').click(); await settled()
  assert.equal(await week.getAttribute('data-period-id'), origin)
  for (const [horizon, steps, label] of [['week', 2, '回到本周'], ['day', 2, '回到今日'], ['cycle', 1, '回到当期']]) {
    const target = column(horizon)
    for (let index = 0; index < steps; index++) {
      await target.locator('[data-next-period]').click()
      await page.waitForFunction(horizon => document.querySelector(`[data-horizon="${horizon}"]`)?.getAttribute('aria-busy') === 'false', horizon)
    }
    const header = target.locator('.column-header')
    assert.equal(await header.locator('.column-meta').count(), 0, 'Distant dates and non-current cycles stand alone as the heading')
    const title = header.locator('.period-title')
    assert.match(await title.innerText(), /\d/)
    assert(!/20\d{2}/.test(await title.innerText()), 'Compact heading omits years')
    assert.match(await title.getAttribute('title'), /20\d{2}/, 'Absolute year stays available in the tooltip')
    assert.equal(await header.locator('[data-return-current]').innerText(), label)
    assert(await header.locator('[data-return-current] > span').evaluate(node => node.scrollWidth <= node.clientWidth + 1), 'Chinese return action remains readable')
    const screenshot = join(evidence, `header-date-only-${horizon}.png`)
    await header.screenshot({ path: screenshot }); result.screenshots.push(screenshot)
    await target.locator('[data-return-current]').click()
  }
  return result
}
