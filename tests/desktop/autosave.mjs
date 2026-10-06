/**
 * [INPUT]: Production Electron, isolated SQLite, real editing and controlled write/receipt failures.
 * [OUTPUT]: Repeatable autosave, interaction, receipt and native close/quit evidence.
 * [POS]: Detail persistence acceptance; failures were recorded in the task-description spec before implementation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import electronPath from 'electron'
import { join } from 'node:path'
import { arch, cpus, platform, release, tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'
import { waitForDetailSave } from './fixtures/detail-save.mjs'
import { verifyDetailDiscard } from './fixtures/detail-discard.mjs'

const discardOnly = process.argv.includes('--discard')
const output = discardOnly ? 'output/tests/autosave/discard' : 'output/tests/autosave', profile = await mkdtemp(join(tmpdir(), 'goalloom-autosave-'))
await mkdir(output, { recursive: true })
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const report = { result: 'running', checks: [], runtime: null, environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: 'Host OS; physical/VM status not independently verified' }, screenshots: [] }
let app, page
const detail = () => page.locator('dialog.detail'), note = () => detail().getByRole('textbox', { name: 'Description', exact: true })
const stored = id => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
const open = async id => { await page.locator(`#item-${id} .task-title`).press('Enter'); await note().waitFor() }
const close = async () => { await detail().getByRole('button', { name: 'Close', exact: true }).click(); await detail().waitFor({ state: 'hidden' }) }
const shot = async name => { const path = `${output}/${name}.png`; await page.screenshot({ path }); report.screenshots.push(path) }
const launch = async () => {
  app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
  page = await app.firstWindow()
  page.on('dialog', dialog => { if (dialog.type() === 'beforeunload') void dialog.dismiss().catch(() => {}) })
  await page.waitForFunction(() => !!window.goalloom)
  await app.evaluate(({ ipcMain }) => {
    const command = ipcMain._invokeHandlers.get('goalloom:command'), query = ipcMain._invokeHandlers.get('goalloom:query')
    const probe = globalThis.autosaveProbe = { mode: 'normal', edits: [], release: null }
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command', async (event, input) => {
      if (!['edit', 'discardEmpty'].includes(input.type)) return command(event, input)
      if (input.type === 'edit') probe.edits.push(input.operationId)
      if (input.type === 'discardEmpty' && probe.mode === 'add-content') {
        const detail = await query(event, { type: 'item', itemId: input.itemId })
        await command(event, { type: 'edit', itemId: input.itemId, expectedVersion: detail.item.version, title: detail.item.title, description: 'Concurrent note must survive', dueDate: null, operationId: crypto.randomUUID(), generation: input.generation })
      }
      if (probe.mode === 'unknown-before') throw Error('Synthetic failure before writing')
      if (probe.mode === 'failure') return { ok: false, code: 'storage', message: 'Synthetic autosave failure' }
      const reply = await command(event, input)
      if (probe.mode === 'unknown') throw Error('Synthetic lost receipt')
      if (probe.mode === 'delay') await new Promise(resolve => { probe.release = resolve; probe.held?.() })
      return reply
    })
    ipcMain.removeHandler('goalloom:query')
    ipcMain.handle('goalloom:query', (event, input) => {
      if (input.type === 'receipt' && ['unknown', 'unknown-before'].includes(probe.mode)) throw Error('Synthetic unavailable receipt')
      return query(event, input)
    })
  })
}
try {
  await launch()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const id = await page.evaluate(async () => {
    let snapshot = await window.goalloom.getSnapshot()
    await window.goalloom.execute({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-01' }, confirmed: true, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    snapshot = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ type: 'create', title: 'Autosave fixture', description: 'Original note', horizon: 'day', generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result.itemId
  })
  await page.reload()
  const discarded = await verifyDetailDiscard(app, page, output)
  report.checks.push(...discarded.checks); report.screenshots.push(...discarded.screenshots)
  await build({ configFile: false, build: { outDir: 'output/tests/build/discard', emptyOutDir: false, lib: { entry: 'tests/desktop/fixtures/discard-data.ts', formats: ['cjs'], fileName: () => 'discard-data.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
  const boundaries = spawnSync(electronPath, ['output/tests/build/discard/discard-data.cjs', profile, join(output, 'discard-boundaries.json')], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
  assert.equal(boundaries.status, 0, boundaries.stderr)
  report.boundaries = JSON.parse(await readFile(join(output, 'discard-boundaries.json'), 'utf8'))
  if (!discardOnly) {
    await open(id)
    const original = await stored(id)
    assert.equal(await detail().locator('.save-bar').count(), 0)
    await note().fill('First automatic edit')
    await waitForDetailSave(page)
    assert.equal((await stored(id)).description, 'First automatic edit')
    assert(await note().evaluate(element => element === document.activeElement))
    assert.equal(await page.locator('.toast').count(), 0)
    await shot('silent-edit')
    report.checks.push('Debounced save persists without a button, Toast, focus loss or manual submit')

    await detail().getByRole('button', { name: 'Edit title', exact: true }).click()
    const title = detail().locator('.title-input')
    await title.fill('Title with a pause ')
    await waitForDetailSave(page)
    assert.equal(await title.inputValue(), 'Title with a pause ')
    assert.equal(await title.evaluate(element => element.selectionStart), 19)
    await title.pressSequentially('and more')
    await close(); await open(id)
    assert.equal((await stored(id)).title, 'Title with a pause and more')
    await note().fill('The last keystroke before closing')
    await close(); await open(id)
    assert.equal(await note().innerText(), 'The last keystroke before closing')
    report.checks.push('Autosave preserves title whitespace/caret; closing before debounce drains the final title and description')

    await app.evaluate(() => { globalThis.autosaveProbe.mode = 'delay' })
    await note().fill('Committed while receipt waits')
    await pollPage(page, async id => (await window.goalloom.getItem(id)).item.description === 'Committed while receipt waits', id)
    await note().fill('Newer typing survives the receipt')
    await app.evaluate(() => { globalThis.autosaveProbe.mode = 'normal'; globalThis.autosaveProbe.release() })
    await waitForDetailSave(page)
    assert.equal(await note().innerText(), 'Newer typing survives the receipt')
    assert.equal((await stored(id)).description, 'Newer typing survives the receipt')
    report.checks.push('An authoritative delayed receipt retains and automatically drains newer typing')

    await note().evaluate(element => element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
    await note().fill('中文输入')
    await note().evaluate(element => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', metaKey: true, isComposing: true, bubbles: true })))
    await page.waitForTimeout(650) // Cross the specified 500ms debounce while composition is active.
    assert.equal((await stored(id)).description, 'Newer typing survives the receipt')
    await note().evaluate(element => element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
    await waitForDetailSave(page)
    assert.equal((await stored(id)).description, '中文输入')
    report.checks.push('Simulated IME suppresses debounce/Enter until composition ends')

    await app.evaluate(() => { globalThis.autosaveProbe.mode = 'failure' })
    await note().fill('Retained after failure')
    await detail().getByRole('alert').waitFor()
    await detail().getByRole('button', { name: 'Close', exact: true }).click()
    assert.equal(await detail().count(), 1)
    await app.evaluate(({ app }) => { app.quit() })
    await detail().getByRole('alert').waitFor()
    assert.equal(await note().innerText(), 'Retained after failure')
    assert(await page.evaluate(() => window.goalloom.getRuntime()))
    await shot('failed-save-keeps-input')
    await app.evaluate(() => { globalThis.autosaveProbe.mode = 'normal' })
    await detail().getByRole('button', { name: 'Retry', exact: true }).click()
    await waitForDetailSave(page)
    assert.equal((await stored(id)).description, 'Retained after failure')
    report.checks.push('Known failure retains the detail and blocks native quit; retry saves with storage still available')

    await app.evaluate(() => { globalThis.autosaveProbe.mode = 'unknown' })
    await note().fill('A committed edit with an unknown receipt')
    await detail().getByRole('alert').waitFor()
    const writes = await app.evaluate(() => globalThis.autosaveProbe.edits.length)
    await note().fill('New typing while outcome is unknown')
    await app.evaluate(() => { globalThis.autosaveProbe.mode = 'normal' })
    await detail().getByRole('button', { name: 'Retry', exact: true }).click()
    await waitForDetailSave(page)
    assert.equal((await stored(id)).description, 'New typing while outcome is unknown')
    assert.equal(await app.evaluate(() => globalThis.autosaveProbe.edits.length), writes + 1, 'Retry resolves the existing receipt before writing only the newer draft')
    report.checks.push('Unknown receipt recovery avoids duplicate writes and preserves later input')

    await app.evaluate(() => { globalThis.autosaveProbe.mode = 'unknown-before' })
    await note().fill('A draft whose first retry fails')
    await detail().getByRole('alert').waitFor()
    await app.evaluate(() => { globalThis.autosaveProbe.mode = 'failure' })
    await detail().getByRole('button', { name: 'Retry', exact: true }).click()
    await detail().getByRole('alert').filter({ hasText: 'Synthetic autosave failure' }).waitFor()
    assert.notEqual((await stored(id)).description, 'A draft whose first retry fails')
    await app.evaluate(() => { globalThis.autosaveProbe.mode = 'normal' })
    await detail().getByRole('button', { name: 'Retry', exact: true }).click()
    await waitForDetailSave(page)
    assert.equal((await stored(id)).description, 'A draft whose first retry fails')
    report.checks.push('Definitive failure after an unknown outcome never advances the unsaved baseline; a later retry commits it')

    await detail().getByRole('button', { name: 'Edit title', exact: true }).click()
    await title.fill(' ')
    await detail().getByRole('button', { name: 'Close', exact: true }).click()
    await detail().getByRole('alert').waitFor()
    assert.equal((await stored(id)).title, 'Title with a pause and more')
    await detail().getByRole('button', { name: 'Edit title', exact: true }).click()
    await title.fill('Valid title restored'); await title.press('Enter')
    await waitForDetailSave(page)
    await note().fill('Text alongside completion')
    await detail().getByRole('button', { name: 'Mark as done', exact: true }).click()
    await pollPage(page, async id => (await window.goalloom.getItem(id)).item.status === 'done', id)
    assert.equal((await stored(id)).description, 'Text alongside completion')
    await detail().getByRole('button', { name: 'Reopen', exact: true }).click()
    await pollPage(page, async id => (await window.goalloom.getItem(id)).item.status === 'todo', id)
    report.checks.push('Invalid titles retain their last committed value; text saves before completion/reopen with fresh versions')

    const parentId = await page.evaluate(async id => {
      const snapshot = await window.goalloom.getSnapshot()
      const execute = action => window.goalloom.execute({ ...action, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
      const created = await execute({ type: 'create', title: 'Parent autosave fixture', horizon: 'month', flowColor: 0 })
      if (!created.ok) throw Error(created.message)
      const parent = (await window.goalloom.getItem(created.result.itemId)).item, child = (await window.goalloom.getItem(id)).item
      const linked = await execute({ type: 'link', parentId: parent.id, childId: id, expectedParentVersion: parent.version, expectedChildVersion: child.version })
      if (!linked.ok) throw Error(linked.message)
      return parent.id
    }, id)
    const parentChip = detail().getByRole('button', { name: 'Parents: Parent autosave fixture', exact: true })
    await parentChip.waitFor()
    await note().fill('Saved while changing the parent link')
    await parentChip.click()
    await page.getByRole('menuitemcheckbox', { name: /Parent autosave fixture/, checked: true }).click()
    await page.getByRole('menuitemcheckbox', { name: /Parent autosave fixture/, checked: false }).waitFor()
    assert.equal((await stored(id)).description, 'Saved while changing the parent link')
    await page.keyboard.press('Escape')
    await close(); await open(parentId)
    await detail().locator('.detail-title-display').filter({ hasText: 'Parent autosave fixture' }).waitFor()
    assert.equal((await stored(parentId)).description, '')
    await close(); await open(id)
    report.checks.push('A parent-link change drains pending text; opening the parent keeps the child draft isolated')

    await note().fill('Persisted before native window close')
    const windowClosed = page.waitForEvent('close')
    await app.evaluate(({ BrowserWindow }) => { BrowserWindow.getAllWindows()[0].close() })
    await windowClosed
    const reopened = app.waitForEvent('window')
    await app.evaluate(({ app }) => { app.emit('activate') })
    page = await reopened
    await page.waitForFunction(() => !!window.goalloom)
    assert.equal((await stored(id)).description, 'Persisted before native window close')
    report.checks.push('Native window close drains pending changes and reopening retains them')

    await page.locator('.fab').click()
    await page.locator('.composer-input').fill('Composer remains a deliberate draft')
    page.on('dialog', dialog => { if (dialog.type() === 'beforeunload') void dialog.dismiss().catch(() => {}) })
    const prompted = await app.evaluate(async ({ app, dialog }) => {
      const original = dialog.showMessageBoxSync
      let prompted = false
      dialog.showMessageBoxSync = () => { prompted = true; return 0 }
      try {
        app.quit()
        for (let attempt = 0; attempt < 100 && !prompted; attempt++) await new Promise(resolve => setTimeout(resolve, 10))
        return prompted
      } finally { dialog.showMessageBoxSync = original }
    })
    assert.equal(prompted, true)
    await page.getByRole('button', { name: 'Clear draft', exact: true }).click()
    if (await page.locator('dialog.composer-modal').count()) await page.locator('dialog.composer-modal').getByRole('button', { name: 'Close', exact: true }).click()
    await open(id); await note().fill('Persisted before native application quit')
    const quit = app.waitForEvent('close')
    await app.evaluate(({ app }) => { setImmediate(() => app.quit()) })
    await quit; app = null
    await launch()
    assert.equal((await stored(id)).description, 'Persisted before native application quit')
    assert.deepEqual((await stored(id)).placement, original.placement)
    await shot('after-native-restart')
    report.checks.push('Composer quit cancellation keeps storage alive; normal application quit drains detail edits and survives restart')
  }
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'; report.failure = error.stack ?? String(error)
  if (page && !page.isClosed()) {
    report.focus = await page.evaluate(() => ({ focused: document.hasFocus(), active: document.activeElement?.outerHTML.slice(0, 600) })).catch(() => null)
    await shot('failure').catch(() => {})
  }
  throw error
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  if (app) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {}); await app.close().catch(() => {}) }
  await rm(profile, { recursive: true, force: true })
  console.log(JSON.stringify({ result: report.result, report: `${output}/report.json` }))
}
