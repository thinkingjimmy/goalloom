/**
 * [INPUT]: Current-source Chromium, isolated first-run IPC and provider outcomes.
 * [OUTPUT]: Responsive/camera/consent/failure/partial-success evidence without a real credential or network request.
 * [POS]: AI onboarding interaction acceptance; native continuity is covered by test:composer.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { chooseLocalStart, settleSetupStep } from './setup.mjs'

export async function reviewAiOnboarding(page, { url, repo, evidence }) {
  await page.goto(`${url}?setup`)
  await page.evaluate(async repo => {
    const { currentPeriod } = await import(`/@fs${repo}/src/domain/calendar.ts`)
    const r = window.review, execute = window.goalloom.execute, smart = window.goalloom.smart
    r.aiRequests = []
    window.goalloom.execute = async command => {
      if (command.type !== 'confirmSetup') return execute(command)
      const now = new Date().toISOString(), today = now.slice(0, 10)
      const calendar = { id: 'confirmed', mode: command.mode, timezone: command.timezone, weekStart: command.weekStart, cycleAnchor: today }
      r.snapshot.workspace.calendar = calendar; r.snapshot.workspace.setupConfirmedAt = now; r.snapshot.observedAt = now
      r.snapshot.periods = ['year', 'half', 'cycle', 'month', 'week', 'day'].map(horizon => currentPeriod(calendar, horizon, now))
      return execute({ ...command, type: 'review-confirmed' })
    }
    window.goalloom.smart = async action => {
      if (action.type !== 'connect') return smart(action)
      r.aiRequests.push(action)
      const base = await smart({ type: 'status' })
      const failure = { kind: 'quota_exhausted', message: 'Review quota exhausted', status: 429, retryAt: null }
      const partial = r.aiRequests.length > 1
      return { ...base, test: { ok: partial, failure: partial ? null : failure, sampleMatched: partial ? true : null,
        results: { jev: { ok: partial, failure: partial ? null : failure }, chat: { ok: false, failure } }, enabled: partial ? ['smart'] : [] } }
    }
  }, repo)
  await chooseLocalStart(page)
  await page.locator('.setup-next').click()
  await page.locator('.direction-input').fill('')
  const world = await page.locator('.setup-world').elementHandle()
  await page.locator('.setup-next').click()
  await page.getByRole('button', { name: 'Connect an AI service', exact: true }).waitFor()
  assert.equal(await world.evaluate(node => node.isConnected), true)
  await settleSetupStep(page)
  const views = []
  for (const view of [
    ...['zh', 'en', 'ja', 'es', 'fr'].map(locale => ({ locale, theme: 'light', width: 1280, height: 840 })),
    { locale: 'zh', theme: 'dark', width: 1280, height: 840 },
    { locale: 'en', theme: 'light', width: 760, height: 560 },
    { locale: 'fr', theme: 'dark', width: 360, height: 720 },
  ]) {
    await page.setViewportSize({ width: view.width, height: view.height })
    await page.evaluate(async view => {
      const { setLocale } = await import('/i18n/index.ts')
      await setLocale(view.locale)
      document.documentElement.dataset.theme = view.theme
    }, view)
    await settleSetupStep(page)
    const geometry = await page.locator('.onboarding-stage').evaluate(node => {
      const stage = node.getBoundingClientRect(), logo = node.querySelector('.setup-logo').getBoundingClientRect(), canvas = node.querySelector('.setup-canvas').getBoundingClientRect()
      return { logoTop: logo.top - stage.top, canvasTop: canvas.top - stage.top, overflow: document.documentElement.scrollWidth > innerWidth }
    })
    assert.equal(geometry.overflow, false)
    assert(geometry.logoTop <= 112)
    views.push({ ...view, ...geometry })
    await page.screenshot({ path: `${evidence}/ai-${view.locale}-${view.theme}-${view.width}.png` })
  }
  await writeFile(`${evidence}/ai-responsive.json`, JSON.stringify({ scope: 'Current source in Chromium; direct locale boundary, mocked IPC and zero external requests', views }, null, 2))
  await page.setViewportSize({ width: 1280, height: 840 })
  await page.evaluate(async () => { await (await import('/i18n/index.ts')).setLocale('en'); document.documentElement.dataset.theme = 'light' })
  await page.screenshot({ path: `${evidence}/ai-smart-native.png` })
  await page.getByRole('button', { name: 'Insight', exact: true }).click()
  await settleSetupStep(page)
  await page.screenshot({ path: `${evidence}/ai-insight-native.png` })
  const toolbar = await page.locator('.setup-board-toolbar').boundingBox()
  const canvas = await page.locator('.setup-canvas').boundingBox()
  assert(Math.abs(toolbar.x - canvas.x - 26) < 2, 'Toolbar stays fixed while timeline pans')
  await page.getByRole('button', { name: 'Smart input', exact: true }).focus()
  await page.keyboard.press('Space')
  assert.equal(await page.locator('.setup-world').evaluate(node => node.getAnimations().length), 0)
  await page.getByRole('button', { name: 'Connect an AI service', exact: true }).click()
  const key = page.getByLabel('OpenRouter API Key', { exact: true })
  await key.fill('review-not-a-live-key')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Test and turn on', exact: true }).click()
  await page.getByRole('status').filter({ hasText: 'Review quota exhausted' }).waitFor()
  assert.equal(await key.inputValue(), '')
  assert.equal(await page.getByRole('button', { name: 'Go to board', exact: true }).count(), 0)
  await page.screenshot({ path: `${evidence}/ai-connect-failure.png` })
  await key.fill('review-not-a-live-key')
  await page.getByRole('button', { name: 'Test and turn on', exact: true }).click()
  await page.getByRole('button', { name: 'Go to board', exact: true }).waitFor()
  assert.equal(await page.locator('.ai-onboarding-results li[data-on=true]').count(), 1)
  assert.equal(await page.locator('.ai-onboarding-results li[data-on=false]').count(), 1)
  assert.match(await page.locator('.ai-onboarding-results').innerText(), /Review quota exhausted/)
  await page.screenshot({ path: `${evidence}/ai-connect-partial.png` })
  assert.equal(await page.evaluate(() => review.snapshot.items.length), 0)
  assert.equal(await page.evaluate(() => review.aiRequests.length), 2)
  await page.getByRole('button', { name: 'Go to board', exact: true }).click()
  await page.getByRole('main', { name: 'Timeline board', exact: true }).waitFor()
}
