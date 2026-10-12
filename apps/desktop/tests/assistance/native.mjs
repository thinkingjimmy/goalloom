/**
 * [INPUT]: Built production main/preload/renderer and a synthetic provider transport.
 * [OUTPUT]: Repeatable note-rewrite, concurrency, receipt, keyboard and localization acceptance evidence.
 * [POS]: Source Electron E2E; real service, SQLite and IPC, no live provider or personal data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 * Failure cases: read-only entry sends data; implicit preselection; stale/late output overwrites typing;
 * cancel fails; completed tasks disappear; rethink duplicates notes; unknown writes repeat;
 * undo loses unrelated edits; inactive tasks generate; new UI clips or restores old controls.
 */
import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir, cpus, release } from 'node:os'
import { join, resolve } from 'node:path'
import { finishSetup } from '../fixtures/setup.mjs'
const groups = process.argv.slice(2), out = resolve('output/tests/assistance')
await mkdir(out, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'Goalloom note rewrite '))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
const page = await application.firstWindow(), errors = []
page.on('pageerror', error => errors.push(error.message))
const report = { ok: false, groups, checks: [], screenshots: [], scope: 'Source Electron; real preload/main/SQLite; synthetic provider. No live-model, packaged, physical IME or Windows acceptance.', host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, physicalOrVm: 'unverified' } }
const checked = label => { report.checks.push(label); console.log(`✓ rewrite: ${label}`) }
const detail = page.locator('dialog.detail'), panel = detail.locator('.assistance-panel')
const originalNotes = 'Validate the Web to PC flow.\n\n- [x] Connect the test PC\n- [ ] Check keyboard input'
let id
const read = () => page.evaluate(id => window.goalloom.getItem(id), id)
const edit = async description => page.evaluate(async ({ id, description }) => {
  const { workspace } = await window.goalloom.getSnapshot(), { item } = await window.goalloom.getItem(id)
  const reply = await window.goalloom.execute({ type: 'edit', generation: workspace.generation, operationId: crypto.randomUUID(), itemId: id, expectedVersion: item.version, title: item.title, dueDate: item.dueDate, description })
  if (!reply.ok) throw Error(reply.message)
}, { id, description })
const open = async () => {
  await detail.locator('.action-invitation, .rewrite-actions button').click()
  await page.waitForFunction(() => document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
}
const submit = async () => { await panel.locator('.help-option').first().click(); await panel.getByRole('button', { name: 'Find a next step', exact: true }).click() }
const shot = async name => { await detail.screenshot({ path: `${out}/${name}.png` }); report.screenshots.push(`${name}.png`) }
try {
  await installTransport(application)
  await finishSetup(page, { skipAi: true })
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  id = await page.evaluate(async description => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ type: 'create', title: 'Validate Web control of the test PC', description, horizon: 'week', generation: workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result.itemId
  }, originalNotes)
  await page.locator(`#item-${id} .task-title`).click(); await detail.waitFor()
  const before = await read()
  await open()
  assert.equal(await calls(application), 0)
  assert.deepEqual((await read()).item, before.item)
  assert.equal(await panel.locator('[aria-pressed="true"]').count(), 0)
  assert.equal(await panel.getByRole('button', { name: 'Find a next step', exact: true }).isDisabled(), true)
  assert.equal(await detail.locator('.detail-rail, .activity-drawer, .saved-guidance, .assistance-consent').count(), 0)
  assert.equal(await detail.locator('.detail-management button').count(), 3)
  assert.equal(await panel.locator('header button').count(), 0)
  assert.equal(await detail.locator('.description-editor').isVisible(), true)
  checked('entry is local-only, single-pane, choices unselected and the notes editor remains visible')
  if (groups.includes('entry')) {
    await panel.getByLabel('Something else…', { exact: true }).fill('Keep the existing acceptance scope')
    await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached' })
    await detail.getByRole('button', { name: 'Close', exact: true }).click()
    await page.locator(`#item-${id} .task-title`).click(); await open()
    assert.equal(await panel.getByLabel('Something else…', { exact: true }).inputValue(), 'Keep the existing acceptance scope')
    await panel.getByLabel('Something else…', { exact: true }).fill('')
    assert.equal(await panel.getByRole('button', { name: 'Find a next step', exact: true }).isDisabled(), true)
    await panel.locator('.help-option').first().focus(); await page.keyboard.press('b')
    assert.equal(await panel.locator('button.help-option').nth(1).getAttribute('aria-pressed'), 'true')
    await shot('rewrite-choices')
    checked('custom input, blank input guard, keyboard choices and session-only draft restoration')
  }
  await panel.getByRole('button', { name: 'Not now', exact: true }).click()
  if (groups.includes('generation')) {
    await page.evaluate(async () => {
      const { workspace } = await window.goalloom.getSnapshot()
      await window.goalloom.smart({ type: 'connect', generation: workspace.generation, provider: 'openrouter', apiKey: 'synthetic-assistance-key', consent: true })
      await window.goalloom.smart({ type: 'feature', generation: workspace.generation, feature: 'insight', provider: 'openrouter', enabled: true })
    })
    await open(); await submit()
    await panel.waitFor({ state: 'detached' }); await detail.getByRole('button', { name: 'Rethink', exact: true }).waitFor()
    const rewritten = (await read()).item.description
    assert.match(rewritten, /- \[x\] Connect the test PC/)
    assert.match(rewritten, /- \[ \] Check keyboard input/)
    assert.match(rewritten, /Verify one complete path/)
    assert.equal((await read()).assistedNotes, true)
    assert.equal(await detail.locator('.rewrite-actions button').count(), 1)
    assert.equal(await page.locator('.toast').count(), 0, 'Automatic note persistence stays quiet; keyboard undo remains available')
    assert.equal(await detail.locator('.rewrite-actions').evaluate(node => getComputedStyle(node).borderTopWidth), '0px')
    assert.equal(await calls(application), 1)
    await shot('rewrite-result')
    checked('settings enablement is sufficient; one request rewrites and persists notes without a Save step')
    await open(); await submit(); await panel.waitFor({ state: 'detached' })
    assert.equal((await read()).item.description, rewritten)
    checked('rethink reads current notes and does not append another next-step block')
    await setMode(application, 'hold'); await open(); await submit(); await held(application)
    await detail.locator('.description-content').fill('My newer notes while AI is working')
    await releaseTransport(application)
    await page.waitForFunction(() => document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
    await page.waitForFunction(async id => (await window.goalloom.getItem(id)).item.description === 'My newer notes while AI is working', id)
    assert.match(await detail.innerText(), /changed|kept/)
    checked('typing during generation is kept; stale output cannot overwrite it')
    await panel.getByRole('button', { name: 'Not now', exact: true }).click()
    await edit(originalNotes)
    await open(); await submit(); await held(application)
    await panel.getByRole('button', { name: 'Cancel', exact: true }).click(); await panel.waitFor({ state: 'detached' })
    assert.equal((await read()).item.description, originalNotes)
    checked('cancel aborts generation and preserves the original notes')
    for (const mode of ['invalid', 'empty', 'oversized', 'lose-completed']) {
      await setMode(application, mode); await open(); await submit()
      await panel.getByRole('alert').waitFor()
      assert.equal((await read()).item.description, originalNotes)
      await panel.getByRole('button', { name: 'Not now', exact: true }).click()
    }
    checked('invalid, empty, oversized and lost-completion responses leave notes intact')
    await edit('x'.repeat(7000)); const networkBefore = await calls(application)
    await setMode(application, 'proposal'); await open(); await submit(); await panel.getByRole('alert').waitFor()
    assert.equal(await calls(application), networkBefore)
    assert.equal((await read()).item.description.length, 7000)
    await panel.getByRole('button', { name: 'Not now', exact: true }).click(); await edit(originalNotes)
    checked('incomplete source is rejected locally before a provider request')
    await application.evaluate(() => { globalThis.assistanceFixture.dropWrite = true; globalThis.assistanceFixture.hideReceipt = true })
    const writes = await application.evaluate(() => globalThis.assistanceFixture.applyWrites)
    await open(); await submit(); await detail.locator('.detail-save-error').waitFor()
    assert.equal(await detail.locator('.description-content').getAttribute('contenteditable'), 'false')
    await application.evaluate(() => { globalThis.assistanceFixture.hideReceipt = false })
    await detail.locator('.detail-save-error button').click(); await panel.waitFor({ state: 'detached' })
    assert.equal(await application.evaluate(() => globalThis.assistanceFixture.applyWrites), writes + 1)
    assert.equal((await read()).item.description, rewritten)
    checked('lost write receipt locks the editor and retries the receipt without duplicating the rewrite')
    await detail.getByRole('button', { name: 'Close', exact: true }).click()
    await page.locator(`#item-${id} .task-title`).focus(); await page.keyboard.press('ControlOrMeta+z')
    await page.waitForFunction(async ({ id, originalNotes }) => (await window.goalloom.getItem(id)).item.description === originalNotes, { id, originalNotes })
    checked('workspace undo restores the original notes as one operation')
    await page.locator(`#item-${id} .task-title`).click()
    await open(); await submit(); await panel.waitFor({ state: 'detached' })
    await page.reload(); await page.locator(`#item-${id} .task-title`).click()
    await detail.getByRole('button', { name: 'Rethink', exact: true }).waitFor()
    checked('rewritten notes and Rethink survive a renderer reload')
  }
  if (groups.includes('language')) {
    for (const language of ['zh', 'en', 'ja', 'es', 'fr']) {
      await page.evaluate(language => window.goalloom.setLanguage(language), language)
      for (const width of [720, 1280]) {
        await application.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 840), width)
        await page.waitForFunction(width => innerWidth === width, width)
        if (!await panel.count()) await detail.locator('.action-invitation, .rewrite-actions button').click()
        await page.waitForFunction(() => document.querySelector('.assistance-panel')?.getAttribute('aria-busy') === 'false')
        const geometry = await detail.evaluate(node => {
          const d = node.getBoundingClientRect(), controls = [...node.querySelectorAll('.detail-management button, .help-option, .assistance-actions button')]
          return controls.map(control => { const r = control.getBoundingClientRect(); return { text: control.textContent, width: r.width, within: r.left >= d.left && r.right <= d.right + 1, clipped: control.scrollWidth > control.clientWidth + 1 } })
        })
        assert(geometry.every(row => row.within && !row.clipped))
        await shot(`rewrite-${language}-${width}`)
      }
      await page.keyboard.press('Escape'); await panel.waitFor({ state: 'detached' })
    }
    checked('all five locales fit the detail and option controls at 720/1280 widths')
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
      if (args[1].type === 'applyAssistance' && args[1].description !== undefined) {
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
      const value = { kind: 'rewrite', description: input.description.includes('### Next') ? input.description : `${input.description}\n\n### Next\n- [ ] Verify one complete path` }
      if (mode === 'lose-completed') value.description = '- [ ] Start from scratch'
      const content = mode === 'invalid' ? '{"kind":"create_habit"}' : mode === 'empty' ? '' : mode === 'oversized' ? 'x'.repeat(65_537) : JSON.stringify(value)
      return Response.json({ choices: [{ message: { content } }] })
    }
  })
}
