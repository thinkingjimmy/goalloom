/**
 * [INPUT]: Built production Electron, isolated SQLite and controlled autosave read/write failures.
 * [OUTPUT]: Settings navigation regression evidence from real UI, preload, IPC and storage.
 * [POS]: Assistance entry acceptance; no provider calls or production test controls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 * Failure cases: navigation unmounts unsaved notes; typing during a save is lost; failed or
 * unknown writes discard drafts; cancelled navigation opens settings late; empty titles delete items.
 */
import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { finishSetup } from '../fixtures/setup.mjs'
import { waitForDetailSave } from '../fixtures/detail-save.mjs'

const output = resolve('output/tests/assistance/settings-navigation')
await mkdir(output, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'goalloom-settings-navigation-'))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const report = { ok: false, checks: [], screenshots: [], scope: 'Source Electron; synthetic workspace; real IPC/SQLite; no provider, packaged or Windows acceptance.',
  host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, physicalOrVm: 'unverified' } }
let application, page, id
const checked = label => { report.checks.push(label); console.log(`✓ settings navigation: ${label}`) }
const detail = () => page.locator('dialog.detail'), settings = () => page.locator('dialog.settings-modal')
const note = () => detail().getByRole('textbox', { name: 'Description', exact: true })
const connect = () => detail().getByRole('button', { name: 'Open Settings', exact: true })
const stored = () => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
const openHelp = async () => {
  await detail().locator('.action-invitation').click()
  await connect().waitFor()
}
const reopen = async () => {
  await settings().getByRole('button', { name: 'Close', exact: true }).click()
  await settings().waitFor({ state: 'detached' })
  await page.locator(`#item-${id} .task-title`).click()
  await note().waitFor()
}
const mode = value => application.evaluate((_, value) => { globalThis.navigationProbe.mode = value }, value)
const releaseRead = () => application.evaluate(() => {
  const probe = globalThis.navigationProbe
  probe.holdRead = false; probe.release?.(); probe.release = null
})
const shot = async name => {
  const path = `${output}/${name}.png`
  await page.screenshot({ path }); report.screenshots.push(path)
}
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))

try {
  application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
  page = await application.firstWindow()
  await finishSetup(page, { skipAi: true })
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  id = await page.evaluate(async () => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ type: 'create', title: 'Settings navigation fixture', description: 'Original notes',
      horizon: 'week', generation: workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result.itemId
  })
  await application.evaluate(({ ipcMain }, itemId) => {
    const command = ipcMain._invokeHandlers.get('goalloom:command'), query = ipcMain._invokeHandlers.get('goalloom:query')
    const probe = globalThis.navigationProbe = { mode: 'normal', holdRead: false, release: null, edits: [] }
    ipcMain.removeHandler('goalloom:query')
    ipcMain.handle('goalloom:query', async (event, input) => {
      if (input.type === 'item' && input.itemId === itemId && probe.holdRead) {
        probe.holdRead = false
        await new Promise(resolve => { probe.release = resolve })
      }
      if (input.type === 'receipt' && probe.mode === 'unknown') throw Error('Synthetic unavailable receipt')
      return query(event, input)
    })
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command', async (event, input) => {
      if (input.type !== 'edit' || input.itemId !== itemId) return command(event, input)
      probe.edits.push(input.operationId)
      if (probe.mode === 'failure') return { ok: false, code: 'storage', message: 'Synthetic autosave failure' }
      const reply = await command(event, input)
      if (probe.mode === 'unknown') throw Error('Synthetic lost receipt')
      return reply
    })
  }, id)
  await page.locator(`#item-${id} .task-title`).click()
  await openHelp()

  await application.evaluate(() => { globalThis.navigationProbe.holdRead = true })
  await note().fill('Notes typed immediately before opening settings')
  await connect().click()
  await settle()
  report.pendingSave = { detailVisible: await detail().isVisible(), settingsVisible: await settings().isVisible(),
    readHeld: await application.evaluate(() => !!globalThis.navigationProbe.release) }
  await shot('pending-save')
  assert.equal(report.pendingSave.settingsVisible, false, 'Settings must wait for the pending notes to be saved')
  assert.equal(report.pendingSave.detailVisible, true, 'The editor must remain mounted until saving succeeds')
  assert.equal(report.pendingSave.readHeld, true, 'The real autosave read must reach the controlled IPC gate')
  await note().fill('Newer notes typed while navigation waits')
  await releaseRead()
  await settings().waitFor()
  assert.equal((await stored()).description, 'Newer notes typed while navigation waits')
  await reopen()
  assert.equal(await note().innerText(), 'Newer notes typed while navigation waits')
  checked('Navigation waits for persistence and drains newer typing before closing the editor')

  await openHelp()
  await mode('failure')
  await note().fill('Draft retained after a failed save')
  await connect().click()
  await detail().locator('.detail-save-error').waitFor()
  assert.equal(await settings().count(), 0)
  assert.equal(await note().innerText(), 'Draft retained after a failed save')
  assert.equal((await stored()).description, 'Newer notes typed while navigation waits')
  await shot('failed-save')
  await mode('normal')
  await detail().locator('.detail-save-error').getByRole('button', { name: 'Retry', exact: true }).click()
  await waitForDetailSave(page)
  await connect().click(); await settings().waitFor()
  assert.equal((await stored()).description, 'Draft retained after a failed save')
  await reopen()
  checked('A failed save retains the editor and draft; retry permits navigation after persistence')

  await openHelp()
  await mode('unknown')
  await note().fill('Committed notes with a missing receipt')
  await connect().click()
  await detail().locator('.detail-save-error').waitFor()
  assert.equal(await settings().count(), 0)
  assert.equal(await note().innerText(), 'Committed notes with a missing receipt')
  const writes = await application.evaluate(() => globalThis.navigationProbe.edits.length)
  await mode('normal')
  await detail().locator('.detail-save-error').getByRole('button', { name: 'Retry', exact: true }).click()
  await waitForDetailSave(page)
  assert.equal(await application.evaluate(() => globalThis.navigationProbe.edits.length), writes, 'Retry must resolve the receipt without repeating the edit')
  await connect().click(); await settings().waitFor()
  assert.equal((await stored()).description, 'Committed notes with a missing receipt')
  await reopen()
  checked('An unknown outcome blocks navigation until receipt recovery, without a duplicate write')

  await openHelp()
  await application.evaluate(() => { globalThis.navigationProbe.holdRead = true })
  await note().fill('Notes retained after cancelling navigation')
  await connect().click()
  await detail().getByRole('button', { name: 'Not now', exact: true }).click()
  await releaseRead()
  await waitForDetailSave(page); await settle()
  assert.equal(await settings().count(), 0)
  assert.equal((await stored()).description, 'Notes retained after cancelling navigation')
  checked('Closing help cancels pending navigation while allowing the notes to finish saving')

  await note().fill(''); await waitForDetailSave(page)
  await openHelp()
  await detail().getByRole('button', { name: 'Edit title', exact: true }).click()
  await detail().locator('.title-input').fill('')
  await connect().click()
  await detail().locator('.detail-save-error').waitFor()
  assert.equal(await settings().count(), 0)
  assert.equal(await detail().locator('.title-input').inputValue(), '')
  assert.equal((await stored()).title, 'Settings navigation fixture')
  assert.equal((await stored()).deletedAt, null)
  await shot('invalid-title')
  await detail().getByRole('button', { name: 'Edit title', exact: true }).click()
  await detail().locator('.title-input').fill('Settings navigation fixture')
  await connect().click(); await settings().waitFor()
  checked('An empty title blocks navigation without discarding the item; correcting it allows navigation')
  report.ok = true
} catch (error) {
  report.error = error.stack
  if (application && page) {
    report.nativeWindows = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() })))
    report.document = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML }))
    await shot('failure').catch(() => {})
  }
  process.exitCode = 1
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
  if (application) {
    await releaseRead().catch(() => {}); await mode('normal').catch(() => {})
    // A deliberately invalid draft can veto normal quit; only this disposable test app is exited.
    if (!report.ok) await application.evaluate(({ app }) => app.exit()).catch(() => {})
    await application.close()
  }
  await rm(profile, { recursive: true, force: true })
}
