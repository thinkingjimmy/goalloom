/**
 * [INPUT]: Static website, Chromium and the owning E2E assertion/artifact helpers.
 * [OUTPUT]: Repeatable Hero filtering, nesting, URLs, creation/undo and connector screenshots.
 * [POS]: Playable Hero acceptance shared by the full website runner and the hero-demo selector.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

export async function runHeroDemoCases({ browser, base, check, assert, shot, artifact }) {
  const desk = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await desk.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  try {
    await page.goto(`${base}/zh-CN/`)
    await check('hero demo: filter one goal lights its rows and draws relation lines', async () => {
      await page.getByRole('button', { name: '全部', exact: true }).click()
      assert(await page.locator('.window .edge').count() === 0, 'All should clear the relation filter')
      await page.getByRole('button', { name: '只看发布新版 Goalloom', exact: true }).click()
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
      assert(await dialog.locator('.composer-tip').count() === 0, 'Hero composer still shows the removed entry-tip footer')
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
      await page.getByRole('tab', { name: '关系线' }).click()
      assert(await page.getByRole('dialog').count() === 0 && await page.locator('.window .edge').count() > 0, 'return to relation lines')
      assert(await page.getByRole('tab', { name: '目标看板' }).count() === 0, 'obsolete scene remains')
      await page.getByRole('tab', { name: '关系线' }).focus()
      await page.keyboard.press('ArrowRight')
      assert(await page.getByRole('tab', { name: '智能输入' }).getAttribute('aria-selected') === 'true', 'keyboard scene change')
      await page.keyboard.press('Escape')
      assert(await page.getByRole('tab', { name: '关系线' }).getAttribute('aria-selected') === 'true', 'Escape did not return to lines')
    })
    await check('hero demo: local outlines indent 24px and complete independently', async () => {
      const facts = await page.evaluate(() => {
        const row = id => document.querySelector(`.window .trow[data-item="${id}"]`)
        const box = id => row(id).querySelector('.check').getBoundingClientRect()
        return { inset: box('d8').left - box('d1').left,
          inherited: getComputedStyle(row('d8')).getPropertyValue('--row-stroke') === getComputedStyle(row('d1')).getPropertyValue('--row-stroke'),
          edge: !!document.querySelector('.window .edge[data-from="d1"][data-to="d8"][data-nested="true"]'),
          duplicate: !!document.querySelector('.window .edge[data-from="w1"][data-to="d8"]') }
      })
      assert(facts.inset === 24 && facts.inherited && facts.edge && !facts.duplicate, JSON.stringify(facts))
      const child = page.locator('.window .trow[data-item="d8"]')
      await child.getByRole('button').click()
      assert(await child.getAttribute('data-done') === 'true', 'child not completed')
      for (const id of ['d1', 'd2']) assert(await page.locator(`.window .trow[data-item="${id}"]`).getAttribute('data-done') === 'false', `${id} changed with child`)
      await shot(page, 'desktop-hero-nested-completed')
      await child.getByRole('button').click()
    })
    await check('hero demo: URL cards use local assets and external links preserve board state', async () => {
      await desk.route('https://www.goalloom.com/**', route => route.fulfill({ contentType: 'text/html', body: '<title>Demo link destination</title>' }))
      const row = page.locator('.window .trow[data-item="w1"]')
      const link = row.locator('.demo-link-inline')
      assert(await link.getAttribute('href') === 'https://www.goalloom.com', 'wrong URL')
      assert(await row.locator('.demo-link-preview').evaluate(node => node.getBoundingClientRect().height) === 128, 'preview height')
      assert(await row.locator('.demo-link-preview img').getAttribute('src') === '/og.png', 'nonlocal artwork')
      const popupPromise = page.waitForEvent('popup')
      await link.focus()
      await page.keyboard.press('Enter')
      const popup = await popupPromise
      await popup.waitForLoadState('domcontentloaded')
      assert(popup.url() === 'https://www.goalloom.com/', 'link did not open')
      await popup.close()
      assert(new URL(page.url()).pathname === '/zh-CN/', 'main page navigated away')
      assert(await row.getAttribute('data-done') === 'false', 'link changed task status')
      await desk.unroute('https://www.goalloom.com/**')
      await page.mouse.move(5, 5)
      await shot(page, 'desktop-hero-url-previews')
    })
    await check('hero demo: wrapping URL rows keep rounded connectors attached after resizing', async () => {
      for (const width of [1440, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await page.waitForFunction(() => [...document.querySelectorAll('.window .edge')].every(path => {
          const row = document.querySelector(`.window .trow[data-item="${path.dataset.to}"]`)
          const dot = row.querySelector('.fdot > span').getBoundingClientRect()
          const end = path.getPointAtLength(path.getTotalLength())
          const point = new DOMPoint(end.x, end.y).matrixTransform(path.getScreenCTM())
          return Math.abs(point.x - dot.left) < 1 && Math.abs(point.y - (dot.top + dot.height / 2)) < 1
        }))
        const facts = await page.evaluate(() => ({
          columns: [...document.querySelectorAll('.window .bcol')].map(node => node.getBoundingClientRect().width),
          rows: [...document.querySelectorAll('.window .trow')].map(node => ({ id: node.dataset.item, height: node.getBoundingClientRect().height })),
          connections: [...document.querySelectorAll('.window .edge')].map(path => {
            const dot = document.querySelector(`.window .trow[data-item="${path.dataset.to}"] .fdot > span`).getBoundingClientRect()
            const end = path.getPointAtLength(path.getTotalLength())
            const point = new DOMPoint(end.x, end.y).matrixTransform(path.getScreenCTM())
            return { from: path.dataset.from, to: path.dataset.to, d: path.getAttribute('d'), errorX: point.x - dot.left, errorY: point.y - dot.top - dot.height / 2 }
          }),
          rounded: [...document.querySelectorAll('.window .edge')].some(path => path.getAttribute('d').includes('Q')),
          overflow: document.documentElement.scrollWidth - innerWidth,
        }))
        assert(facts.columns.every(value => value >= 320) && facts.rounded && facts.overflow <= 0, JSON.stringify(facts))
        assert(facts.rows.some(row => row.id === 'w1' && row.height > 160), 'URL row was truncated')
        writeFileSync(join(artifact, `hero-geometry-${width}.json`), JSON.stringify(facts, null, 2))
      }
      await shot(page, 'desktop-hero-measured-lines')
    })
    await check('hero demo: no browser errors', async () => assert(errors.length === 0, errors.join('\n')))
  } finally { await desk.close() }
}
