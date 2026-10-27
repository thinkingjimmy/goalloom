/**
 * [INPUT]: Isolated native first-run window and the annual page's preview node.
 * [OUTPUT]: Repeatable AI preview, continuity, consent and provider-reset evidence without external requests.
 * [POS]: Onboarding coverage owned by test:composer; previews must never write tasks or enable AI.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { settleSetupStep } from './setup.mjs'

// Failure modes: remounted board, hidden Todo, unreachable preview controls, fake task writes,
// misleading connection success, inherited consent/key and unequal navigation heights.
export async function verifyAiOnboarding(page, world, application) {
  await page.getByRole('button', { name: '连接 AI 服务', exact: true }).waitFor()
  assert.equal(await world.evaluate(node => node.isConnected), true, 'The annual board survives AI entry')
  await settleSetupStep(page)
  const out = 'output/tests/onboarding-ai'
  await mkdir(out, { recursive: true })
  const report = { scope: 'Source Electron, isolated data, no live provider or packaged/Windows acceptance', runtime: await page.evaluate(() => window.goalloom.getRuntime()), views: [] }
  const size = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentSize())
  for (const view of [
    { locale: 'zh', theme: 'light', width: 1280, height: 840, zoom: 1 },
    { locale: 'zh', theme: 'dark', width: 1280, height: 840, zoom: 1 },
    { locale: 'zh', theme: 'light', width: 760, height: 560, zoom: 1 },
    { locale: 'zh', theme: 'light', width: 720, height: 620, zoom: 1.25 },
  ]) {
    await application.evaluate(({ BrowserWindow }, view) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.setContentSize(view.width, view.height); window.webContents.setZoomFactor(view.zoom)
    }, view)
    await page.evaluate(async view => { document.documentElement.dataset.theme = view.theme }, view)
    await page.waitForFunction(locale => document.documentElement.lang.split('-')[0] === locale, view.locale)
    await settleSetupStep(page)
    const geometry = await page.locator('.onboarding-stage').evaluate(node => {
      const stage = node.getBoundingClientRect(), logo = node.querySelector('.setup-logo').getBoundingClientRect(), canvas = node.querySelector('.setup-canvas').getBoundingClientRect()
      return { width: innerWidth, logoTop: logo.top - stage.top, canvasTop: canvas.top - stage.top, overflow: document.documentElement.scrollWidth > innerWidth, scrollableCanvas: node.querySelector('.setup-canvas').scrollHeight > canvas.height + 1 && getComputedStyle(node.querySelector('.setup-canvas')).overflowY === 'auto' }
    })
    assert.equal(geometry.overflow, false)
    assert.equal(geometry.scrollableCanvas, false)
    assert(geometry.logoTop <= 112, 'AI top spacing stays compact at native sizes and zoom')
    report.views.push({ ...view, ...geometry })
    await page.screenshot({ path: `${out}/${view.locale}-${view.theme}-${view.width}-${view.zoom}.png` })
  }
  await application.evaluate(({ BrowserWindow }, size) => {
    const window = BrowserWindow.getAllWindows()[0]
    window.setContentSize(...size); window.webContents.setZoomFactor(1)
  }, size)
  await page.evaluate(async () => { document.documentElement.dataset.theme = 'light' })
  await page.waitForFunction(() => document.documentElement.lang.split('-')[0] === 'zh')
  await page.getByRole('figure', { name: 'Jev 示例：一句话整理成三项行动' }).waitFor()
  assert.equal(await page.locator('.preview-window-controls span').count(), 3)
  assert.equal(await page.locator('.setup-canvas').getByRole('button').count(), 0, 'Read-only illustrations expose no action controls')
  assert.equal(await page.locator('.setup-canvas [data-horizon="later"]').count(), 0)
  assert.equal(await page.locator('.setup-canvas').innerText().then(text => text.includes('上线 2.0 版本')), true)
  await page.screenshot({ path: 'output/tests/screenshots/onboarding-jev.png' })
  await page.getByRole('button', { name: '洞察', exact: true }).click()
  await settleSetupStep(page)
  assert.equal(await world.evaluate(node => node.isConnected), true)
  const position = await page.locator('.setup-product-column[data-horizon="half"]').evaluate(node => {
    const header = node.querySelector('header').getBoundingClientRect()
    const card = node.querySelector('.insight-empty').getBoundingClientRect()
    return card.top - header.bottom
  })
  assert(position >= 0 && position < 12, 'Insight starts directly beneath the column heading')
  await page.screenshot({ path: 'output/tests/screenshots/onboarding-insight.png' })
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.length, 1)
  const status = await page.evaluate(async () => window.goalloom.smart({ type: 'status', generation: (await window.goalloom.getSnapshot()).workspace.generation }))
  assert.equal(status.status.features.smart.enabled, false)
  assert.equal(status.status.features.insight.enabled, false)
  await page.getByRole('button', { name: '连接 AI 服务', exact: true }).click()
  const key = page.getByLabel('OpenRouter API Key', { exact: true })
  await key.waitFor()
  const submit = page.getByRole('button', { name: '测试并开启', exact: true })
  assert.equal(await submit.isDisabled(), true)
  await key.fill('not-a-real-service-key')
  await page.getByRole('checkbox', { name: /发送给 OpenRouter/ }).check()
  assert.equal(await submit.isEnabled(), true)
  const heights = await page.locator('.ai-entry .setup-navigation button').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().height))
  assert.deepEqual(heights, [44, 44])
  await page.screenshot({ path: 'output/tests/screenshots/onboarding-ai-openrouter.png' })
  await page.getByRole('combobox', { name: 'AI 服务', exact: true }).click()
  await page.getByRole('option', { name: 'Vercel AI Gateway', exact: true }).click()
  assert.equal(await page.getByLabel('Vercel AI Gateway API Key', { exact: true }).inputValue(), '')
  assert.equal(await page.getByRole('checkbox', { name: /发送给 Vercel AI Gateway/ }).isChecked(), false)
  assert.equal(await submit.isDisabled(), true)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '洞察', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
}
