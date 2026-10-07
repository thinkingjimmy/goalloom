/**
 * [INPUT]: Built production main/preload/renderer, isolated profile and synthetic HTTP transport.
 * [OUTPUT]: Native entry/generation/language reports, app-only focus evidence and screenshots.
 * [POS]: Feature E2E; keeps the production UI, service, cancellation, writes and receipts active.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 * Failure cases: open triggers AI/writes, stale replies overwrite edits, consent expands silently,
 * cancel fails to abort transport, conversation loses prior turns, entry intent loses to a cached draft,
 * unknown receipts duplicate adoption, focus/IME is lost, and translated actions clip.
 */
import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir, cpus, release } from 'node:os'
import { join, resolve } from 'node:path'
import { finishSetup } from '../fixtures/setup.mjs'

const groups = process.argv.slice(2), out = resolve('output/tests/assistance')
await mkdir(out, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'Goalloom assistance native '))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
const page = await application.firstWindow(), errors = []
page.on('pageerror', error => errors.push(error.message))
const report = { ok: false, groups, checks: [], screenshots: [], scope: 'Source native Electron, real preload/main/SQLite/safeStorage, synthetic HTTP only; synthesized composition, no physical IME, packaged, live-model or Windows acceptance', host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, physicalOrVm: 'unverified' } }
const checked = label => { report.checks.push(label); console.log(`✓ native: ${label}`) }
try {
  await installTransport(application)
  await finishSetup(page, { skipAi: true })
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const id = await page.evaluate(async () => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ type: 'create', title: 'Synthetic tutorial draft', description: 'The concept section is already written.', horizon: 'week', generation: workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result.itemId
  })
  const before = await page.evaluate(() => window.goalloom.getSnapshot())
  await page.locator(`#item-${id} .task-title`).click()
  const detail = page.locator('dialog.detail')
  await detail.waitFor(); await detail.locator('.activity-insight').waitFor()
  await detail.locator('.execution-help button').first().click()
  const panel = detail.locator('.assistance-panel')
  await panel.waitFor(); await page.waitForFunction(() => document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
  assert.equal(await calls(application), 0)
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).workspace.revision, before.workspace.revision)
  assert.equal(await panel.locator('textarea').first().evaluate(node => document.activeElement === node), true)
  checked('opening facts and assistance is local-only, does not write, and focuses the explicit user input')
  if (groups.includes('entry')) {
    await panel.getByLabel('What is hardest to move forward now?', { exact: true }).fill('Keep this unsaved help draft')
    await panel.getByRole('button', { name: 'Back to task', exact: true }).click()
    await detail.locator('.execution-help button').nth(1).click()
    await panel.locator('.assistance-preview').waitFor()
    await panel.getByRole('heading', { name: 'Reschedule', exact: true }).waitFor()
    assert.equal(await panel.getByLabel('What is hardest to move forward now?', { exact: true }).count(), 0)
    assert.equal(await panel.locator('select').inputValue(), 'week')
    await panel.locator('select').selectOption('day')
    const date = before.periods.find(period => period.horizon === 'day').startDate
    await panel.getByLabel('Target date', { exact: true }).fill(date)
    await panel.getByRole('button', { name: 'Back to task', exact: true }).click()
    await detail.locator('.execution-help button').first().click()
    await panel.getByLabel('What is hardest to move forward now?', { exact: true }).waitFor()
    assert.equal(await panel.getByLabel('What is hardest to move forward now?', { exact: true }).inputValue(), 'Keep this unsaved help draft')
    await detail.locator('.execution-help button').nth(1).click()
    await panel.locator('.assistance-preview').waitFor()
    assert.equal(await panel.getByLabel('What is hardest to move forward now?', { exact: true }).count(), 0)
    assert.equal(await panel.locator('select').inputValue(), 'day')
    assert.equal(await panel.getByLabel('Target date', { exact: true }).inputValue(), date)
    await checkCheckbox(panel)
    assert.equal(await calls(application), 0)
    await page.screenshot({ path: `${out}/reschedule-entry.png` }); report.screenshots.push('reschedule-entry.png')
    await panel.getByRole('button', { name: 'Back to task', exact: true }).click()
    await detail.locator('.execution-help button').first().click()
    await panel.getByLabel('What is hardest to move forward now?', { exact: true }).waitFor()
    checked('rescheduling switches an open help form, restores its own draft and preserves the separate help draft without AI or writes')
    await panel.getByRole('button', { name: 'Write guidance myself', exact: true }).click()
    await panel.getByLabel('What to do first next time', { exact: true }).fill('Start with one existing example')
    await panel.getByLabel('What to do first next time', { exact: true }).evaluate(node => node.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    await panel.getByRole('button', { name: 'Save guidance', exact: true }).click()
    assert.equal((await page.evaluate(id => window.goalloom.getItem(id), id)).guidance, null)
    await panel.getByLabel('What to do first next time', { exact: true }).evaluate(node => node.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    await panel.getByRole('button', { name: 'Save guidance', exact: true }).click()
    await panel.waitFor({ state: 'detached' })
    const saved = await page.evaluate(id => window.goalloom.getItem(id), id)
    assert.equal(saved.guidance.value.nextAction, 'Start with one existing example')
    assert.equal(saved.item.description, 'The concept section is already written.')
    await detail.locator('.saved-guidance').waitFor()
    assert.equal(await calls(application), 0)
    await page.screenshot({ path: `${out}/manual-guidance.png` }); report.screenshots.push('manual-guidance.png')
    await detail.getByRole('button', { name: 'Clear guidance', exact: true }).click()
    await detail.locator('.saved-guidance').waitFor({ state: 'detached' })
    const tombstone = await page.evaluate(id => window.goalloom.getItem(id), id)
    assert.equal(tombstone.guidance.value, null)
    assert.equal(tombstone.guidance.revision, 2)
    checked('manual guidance works without AI, IME blocks early adoption, clear persists a tombstone and original text stays')
    await page.evaluate(async id => {
      const { workspace } = await window.goalloom.getSnapshot(), { item } = await window.goalloom.getItem(id)
      const done = await window.goalloom.execute({ type: 'status', itemId: id, expectedVersion: item.version, status: 'done', generation: workspace.generation, operationId: crypto.randomUUID() })
      if (!done.ok) throw Error(done.message)
      const undo = await window.goalloom.execute({ type: 'undo', originalOperationId: done.result.operationId, generation: workspace.generation, operationId: crypto.randomUUID() })
      if (!undo.ok || !undo.result.changed) throw Error('Synthetic completion undo failed')
    }, id)
    await detail.locator('.activity-all').click()
    await detail.locator('.activity-list em').filter({ hasText: 'Undone' }).waitFor()
    await page.screenshot({ path: `${out}/undone-completion.png` }); report.screenshots.push('undone-completion.png')
    await detail.locator('.activity-all').click()
    checked('completion undo is visible on the original activity record')
    await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' })
    await page.locator(`#item-${id} .task-title`).focus()
    await page.keyboard.press('Shift+F10')
    await page.getByRole('menuitem', { name: 'I’m stuck…', exact: true }).click()
    await panel.waitFor(); await panel.getByRole('button', { name: 'Back to task', exact: true }).click()
    await panel.waitFor({ state: 'detached' }); await page.keyboard.press('Escape')
    await detail.waitFor({ state: 'detached' })
    assert.equal(await page.locator(`#item-${id} .task-title`).evaluate(node => document.activeElement === node), true)
    checked('keyboard context-menu help returns through the existing detail to the source row')
    await page.locator(`#item-${id} .task-title`).click(); await detail.waitFor()
  }
  if (groups.includes('generation')) {
    await page.evaluate(async () => {
      const { workspace } = await window.goalloom.getSnapshot()
      const reply = await window.goalloom.smart({ type: 'connect', generation: workspace.generation, provider: 'openrouter', apiKey: 'synthetic-assistance-key', consent: true })
      if (reply.type !== 'status' || !reply.test?.ok) throw Error('Synthetic connection failed')
    })
    if (await panel.count()) await panel.getByRole('button', { name: 'Back to task', exact: true }).click()
    await detail.locator('.execution-help button').first().click()
    await page.waitForFunction(() => document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
    await panel.getByLabel('What is hardest to move forward now?', { exact: true }).fill('The example keeps changing')
    await panel.getByRole('button', { name: 'Help me find an approach', exact: true }).click()
    await panel.getByRole('alert').waitFor()
    assert.equal(await calls(application), 0, 'Old connection consent grants no new task-body permission')
    await panel.getByRole('checkbox', { name: 'Allow sending to this service', exact: true }).check()
    await setMode(application, 'clarify')
    await panel.getByRole('button', { name: 'Help me find an approach', exact: true }).click()
    await panel.getByLabel('Your answer', { exact: true }).waitFor()
    await panel.getByLabel('Your answer', { exact: true }).fill('The rough cut is finished; the opening is unclear')
    await setMode(application, 'proposal')
    await panel.getByRole('button', { name: 'Help me find an approach', exact: true }).click()
    await panel.getByLabel('What to do first next time', { exact: true }).waitFor()
    const fixture = await application.evaluate(() => globalThis.assistanceFixture)
    assert.equal(fixture.calls.length, 2)
    assert.equal(fixture.lastRequest.context.facts.calculationVersion, 1)
    assert.equal(fixture.lastRequest.context.item.id, id)
    assert.equal(await detail.locator('.activity-drawer').getAttribute('data-facts-as-of'), fixture.lastRequest.context.facts.asOf)
    assert.equal(await detail.locator('.activity-drawer').getAttribute('data-facts-revision'), fixture.lastRequest.context.facts.sourceRevision)
    assert.equal(fixture.lastRequest.context.item.description, 'The concept section is already written.')
    assert.equal(fixture.lastRequest.conversation.length, 1)
    assert.equal(fixture.lastRequest.conversation[0].output.question, 'Which part is already finished?')
    assert.equal(fixture.lastRequest.conversation[0].input.text, 'The example keeps changing')
    assert.equal(fixture.lastRequest.answer, 'The rough cut is finished; the opening is unclear')
    assert.equal(await panel.getByLabel('What to do first next time', { exact: true }).inputValue(), 'Write one existing example')
    checked('new purpose consent gates task content; one clarification and one explicit proposal use the authoritative facts')
    await setMode(application, 'hold')
    await panel.getByLabel('What should change?', { exact: true }).fill('Make it smaller')
    await panel.getByRole('button', { name: 'Adjust suggestion', exact: true }).click()
    await held(application)
    const adjustment = await application.evaluate(() => globalThis.assistanceFixture.lastRequest)
    assert.equal(adjustment.conversation.length, 2)
    assert.equal(adjustment.conversation[0].output.question, 'Which part is already finished?')
    assert.equal(adjustment.conversation[1].input.answer, 'The rough cut is finished; the opening is unclear')
    assert.equal(adjustment.conversation[1].output.guidance.nextAction, 'Write one existing example')
    assert.equal(adjustment.adjustment, 'Make it smaller')
    assert(JSON.stringify(adjustment).length <= 16_000)
    checked('second and third requests retain the prior question, proposal and reported progress inside the bounded session')
    await panel.getByLabel('What to do first next time', { exact: true }).fill('My edited next action')
    await releaseTransport(application)
    await page.waitForFunction(() => document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
    assert.equal(await panel.getByLabel('What to do first next time', { exact: true }).inputValue(), 'My edited next action')
    checked('late results preserve the user’s manual revision and never submit automatically')
    const writesBefore = await application.evaluate(() => globalThis.assistanceFixture.applyWrites)
    await application.evaluate(() => { globalThis.assistanceFixture.dropWrite = true; globalThis.assistanceFixture.hideReceipt = true })
    await panel.getByRole('button', { name: 'Save guidance', exact: true }).click()
    await panel.getByRole('alert').waitFor()
    assert.equal(await detail.locator('.execution-help button').evaluateAll(buttons => buttons.every(button => button.disabled)), true)
    await page.keyboard.press('Escape')
    assert.equal(await panel.count(), 1, 'An unknown write receipt keeps the assistance session open')
    await page.screenshot({ path: `${out}/unknown-receipt.png` }); report.screenshots.push('unknown-receipt.png')
    await application.evaluate(() => { globalThis.assistanceFixture.hideReceipt = false })
    await panel.getByRole('button', { name: 'Retry', exact: true }).click()
    await panel.waitFor({ state: 'detached' })
    const adopted = await page.evaluate(id => window.goalloom.getItem(id), id)
    assert.equal(adopted.guidance.value.nextAction, 'My edited next action')
    assert.equal(adopted.item.status, 'todo')
    assert.equal(await detail.locator('.saved-guidance').count(), 1)
    assert.equal(await application.evaluate(() => globalThis.assistanceFixture.applyWrites), writesBefore + 1, 'The lost reply does not create a second guidance write')
    checked('a lost adoption reply is resolved through the original receipt without a second guidance write or completion')
    await detail.locator('.execution-help button').first().click()
    await page.waitForFunction(() => document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
    await setMode(application, 'hold')
    await panel.getByRole('button', { name: 'Help me find an approach', exact: true }).click()
    await held(application)
    await panel.getByRole('button', { name: 'Cancel generation', exact: true }).click()
    await page.waitForFunction(() => !document.querySelector('.assistance-panel')?.getAttribute('aria-busy') || document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
    assert.equal(await application.evaluate(() => globalThis.assistanceFixture.aborted), 1)
    await panel.getByRole('button', { name: 'Back to task', exact: true }).click()
    checked('explicit session cancellation aborts the actual fetch transport')
    for (const mode of ['invalid', 'empty', 'oversized', 'unauthorized']) {
      await setMode(application, mode)
      await detail.locator('.execution-help button').first().click()
      await page.waitForFunction(() => document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
      await panel.getByLabel('What is hardest to move forward now?', { exact: true }).fill('Retain this input')
      await panel.getByRole('button', { name: 'Help me find an approach', exact: true }).click()
      await panel.getByRole('alert').waitFor()
      assert.equal(await panel.getByLabel('What is hardest to move forward now?', { exact: true }).inputValue(), 'Retain this input')
      await panel.getByRole('button', { name: 'Back to task', exact: true }).click()
    }
    checked('bad JSON, empty/oversized content and authentication failure retain the input and expose manual fallback')
  }
  if (groups.includes('language')) {
    if (await panel.count()) await panel.locator('.assistance-header button').click()
    await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' })
    report.geometry = []
    for (const locale of ['zh', 'en', 'ja', 'es', 'fr']) {
      await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
      await page.reload(); await page.locator('.board').waitFor()
      await page.locator(`#item-${id} .task-title`).click(); await detail.waitFor()
      await detail.locator('.activity-insight').waitFor()
      for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
        await page.evaluate(async ({ style, theme }) => {
          const { workspace } = await window.goalloom.getSnapshot()
          const reply = await window.goalloom.execute({ type: 'preferences', generation: workspace.generation, operationId: crypto.randomUUID(), style, theme })
          if (!reply.ok) throw Error(reply.message)
        }, { style, theme })
        for (const width of [1280, 720]) {
          await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 840), width)
          await page.waitForFunction(width => innerWidth === width, width)
          const geometry = await detail.evaluate(node => {
            const rail = node.querySelector('.detail-rail'), buttons = [...rail.querySelectorAll('.detail-rail-actions button')]
            return { rail: rail.getBoundingClientRect().toJSON(), buttons: buttons.map(button => { const r = button.getBoundingClientRect(); return { label: button.textContent, height: r.height, hit: button.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) } }) }
          })
          assert(geometry.buttons.every(button => button.hit && button.height >= 32))
          report.geometry.push({ locale, style, theme, width, geometry })
          if (style === 'paper' && theme === 'light') {
            const screenshot = `${locale}-${width}.png`; await detail.screenshot({ path: `${out}/${screenshot}` }); report.screenshots.push(screenshot)
          }
        }
      }
      await detail.locator('.execution-help button').first().click()
      await page.waitForFunction(() => document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
      assert.equal(await panel.locator('label').first().innerText() === 'What is hardest to move forward now?', locale === 'en')
      await detail.locator('.execution-help button').nth(1).click()
      await panel.locator('.assistance-preview').waitFor()
      assert.equal(await panel.getByRole('heading', { level: 2 }).innerText(), await detail.locator('.execution-help button').nth(1).innerText())
      await checkCheckbox(panel)
      await panel.locator('.assistance-header button').click()
      const date = detail.locator('.activity-date').first()
      await date.focus(); await page.keyboard.press('Enter')
      await detail.locator('.activity-day-details').waitFor()
      await detail.locator('.activity-all').click()
      await detail.locator('.activity-day-details').waitFor()
      assert.equal(await detail.locator('.activity-calendar').count(), 0)
      await detail.locator('.activity-all').click()
      assert.equal(await detail.locator('.activity-calendar').count(), 1)
      await page.keyboard.press('Escape'); await detail.waitFor({ state: 'detached' })
    }
    checked('five locales, four appearances and 720/1280 rails retain reachable actions and keyboard-accessible day/all activity')
  }
  assert.deepEqual(errors, [])
  report.ok = true
} catch (error) {
  report.error = error.stack
  report.nativeWindows = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() })))
  report.document = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML }))
  await page.screenshot({ path: `${out}/native-failure.png` }).catch(() => {})
  throw error
} finally {
  await writeFile(`${out}/native-report.json`, JSON.stringify(report, null, 2))
  await application.close(); await rm(profile, { recursive: true, force: true })
}

async function calls(app) { return app.evaluate(() => globalThis.assistanceFixture.calls.length) }
async function checkCheckbox(panel) {
  const geometry = await panel.locator('.assistance-check').first().evaluate(label => ({ width: label.querySelector('input').getBoundingClientRect().width, content: label.scrollWidth, available: label.clientWidth }))
  assert(geometry.width <= 20 && geometry.content <= geometry.available + 1, 'A checkbox must not inherit full input width or push its label outside the form')
}
async function setMode(app, mode) { await app.evaluate((_, mode) => { globalThis.assistanceFixture.mode = mode }, mode) }
async function held(app) { await app.evaluate(async () => { const end = Date.now() + 5000; while (!globalThis.assistanceFixture.waiters.length) { if (Date.now() > end) throw Error('Assistance request did not reach held transport'); await new Promise(resolve => setTimeout(resolve, 20)) } }) }
async function releaseTransport(app) { await app.evaluate(() => { for (const resolve of globalThis.assistanceFixture.waiters.splice(0)) resolve() }) }
async function installTransport(app) {
  await app.evaluate(({ ipcMain }) => {
    globalThis.assistanceFixture = { mode: 'proposal', calls: [], aborted: 0, waiters: [], applyWrites: 0, dropWrite: false, hideReceipt: false, lastRequest: null }
    const original = ipcMain._invokeHandlers.get('goalloom:command')
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command', async (...args) => {
      const result = await original(...args), fixture = globalThis.assistanceFixture
      if (args[1].type === 'applyAssistance' && args[1].guidance.kind === 'set') {
        fixture.applyWrites++
        if (fixture.dropWrite) { fixture.dropWrite = false; throw Error('Synthetic lost write reply') }
      }
      return result
    })
    const originalQuery = ipcMain._invokeHandlers.get('goalloom:query')
    ipcMain.removeHandler('goalloom:query')
    ipcMain.handle('goalloom:query', async (...args) => { if (args[1].type === 'receipt' && globalThis.assistanceFixture.hideReceipt) throw Error('Synthetic temporarily unavailable receipt'); return originalQuery(...args) })
    globalThis.fetch = async (url, init) => {
      if (url === 'https://openrouter.ai/api/v1/systemone') return Response.json({ model: 'typesafe/jev-1.13', answers: { horizon: { type: 'choice', choice: 'day', probabilities: { day: 0.97, week: 0.02, later: 0.01 } }, task: { type: 'noul', noul: 0.99 } }, usage: { input_tokens: 120, output_tokens: 3 } })
      if (url !== 'https://openrouter.ai/api/v1/chat/completions') throw Error('Unexpected network request')
      const body = JSON.parse(init.body), input = JSON.parse(body.messages[1].content), fixture = globalThis.assistanceFixture
      if (input.check) return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] })
      fixture.calls.push({ model: body.model, reasoning: body.reasoning, format: body.response_format, locale: input.context ? body.messages[0].content.match(/locale \(([^)]+)\)/)?.[1] : null })
      fixture.lastRequest = input
      const mode = fixture.mode
      if (mode === 'hold') await new Promise((resolve, reject) => {
        const success = () => { init.signal.removeEventListener('abort', abort); resolve() }
        const abort = () => { fixture.aborted++; fixture.waiters = fixture.waiters.filter(value => value !== success); reject(new DOMException('Synthetic cancellation', 'AbortError')) }
        fixture.waiters.push(success)
        init.signal.addEventListener('abort', abort, { once: true })
      })
      if (mode === 'unauthorized') return Response.json({ error: { message: 'Synthetic authentication failure' } }, { status: 401 })
      const value = mode === 'clarify' ? { kind: 'clarify', question: 'Which part is already finished?' } : { kind: 'proposal', explanation: 'Continue the existing progress with one example.', guidance: { formatVersion: 1, kind: 'next_step', nextAction: 'Write one existing example', contextNote: 'The concept section is already written', scopeNote: null }, moveSuggestion: null }
      const content = mode === 'invalid' ? '{"kind":"create_habit"}' : mode === 'empty' ? '' : mode === 'oversized' ? 'x'.repeat(65_537) : JSON.stringify(value)
      return Response.json({ choices: [{ message: { content } }] })
    }
  })
}
