/**
 * [INPUT]: Production Electron, isolated SQLite and deterministic metadata cache fixtures.
 * [OUTPUT]: Repeatable description editing/serialization and inline-link evidence.
 * [POS]: Focused desktop acceptance; external network and browser opening are intercepted.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { arch, cpus, platform, release, tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { seedPreviewCache, urls } from './fixtures/link-preview-cache.mjs'
import { pollPage } from './fixtures/poll.mjs'
import { verifyDescriptionChecklists } from './fixtures/description-checklists.mjs'
import { verifyDescriptionSelection } from './fixtures/description-selection.mjs'
import { verifyDescriptionSignals } from './fixtures/description-signals.mjs'

const checklistsOnly = process.argv.includes('--checklists')
const selectionOnly = process.argv.includes('--selection-tools')
const signalsOnly = process.argv.includes('--signals')
const only = checklistsOnly || selectionOnly || signalsOnly
const output = `output/tests/descriptions${checklistsOnly ? '/checklists' : selectionOnly ? '/selection-tools' : signalsOnly ? '/signals' : ''}`, profile = await mkdtemp(join(tmpdir(), 'goalloom-descriptions-'))
await mkdir(output, { recursive: true })
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
await seedPreviewCache(profile)
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const report = { result: 'running', runtime: null, environment: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified' }, checks: [], screenshots: [], scope: 'Source Electron, production preload/main/SQLite. Synthetic notes and cache; network disabled. Not packaged or Windows acceptance.' }
let app, page
const errors = []
const shot = async name => { const path = `${output}/${name}.png`; await page.screenshot({ path }); report.screenshots.push(path) }
const detail = () => page.locator('dialog.detail')
const note = () => detail().getByRole('textbox', { name: 'Description', exact: true })
const stored = id => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
async function create(title, description = '') {
  return page.evaluate(async ({ title, description }) => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ type: 'create', title, description, horizon: 'later', generation: workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result.itemId
  }, { title, description })
}
const open = async id => { await page.locator(`#item-${id} .task-title`).press('Enter'); await note().waitFor() }
const close = () => detail().locator('.modal-header').getByRole('button', { name: 'Close', exact: true }).click()
const save = async () => { await detail().locator('.save-bar').getByRole('button', { name: /^Save/ }).click(); await detail().locator('.save-bar').waitFor({ state: 'hidden' }) }
async function paste(text) {
  await note().focus()
  await note().evaluate((element, text) => {
    const data = new DataTransfer(); data.setData('text/plain', text); data.setData('text/html', '<img src="https://unsafe.invalid/a" onerror="window.unsafePaste=true">')
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }))
  }, text)
}

try {
  app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
  await app.evaluate(async ({ app, shell, session }) => {
    await app.whenReady()
    globalThis.descriptionProbe = { external: [], network: [] }
    shell.openExternal = async url => { globalThis.descriptionProbe.external.push(url) }
    for (const protocol of ['http', 'https']) process.getBuiltinModule(protocol).request = (...args) => { globalThis.descriptionProbe.network.push(String(args[0]?.href ?? args[0])); throw Error('Offline fixture') }
    process.getBuiltinModule('dns/promises').lookup = async host => { globalThis.descriptionProbe.network.push(host); throw Error('Offline fixture') }
    session.fromPartition('goalloom-link-preview', { cache: false }).fetch = async url => { globalThis.descriptionProbe.network.push(url); throw Error('Offline fixture') }
    process.getBuiltinModule('module').syncBuiltinESMExports()
  })
  page = await app.firstWindow(); await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 920)); page.on('pageerror', error => errors.push(error.message)); page.on('dialog', dialog => dialog.accept().catch(() => {}))
  await page.getByRole('button', { name: 'Skip', exact: true }).first().click()
  await page.getByRole('button', { name: 'Confirm and start', exact: true }).click()
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await page.locator('main.board').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())

  if (!only || signalsOnly) report.checks.push(...await verifyDescriptionSignals({ page, create, stored, detail, shot }))
  if (!only || checklistsOnly) report.checks.push(...await verifyDescriptionChecklists({ app, page, create, open, close, save, paste, stored, detail, note, shot }))
  if (!only || selectionOnly) report.checks.push(...await verifyDescriptionSelection({ app, page, create, open, close, stored, detail, note, shot }))
  await app.evaluate(() => { globalThis.descriptionProbe.external = [] })
  if (!only) {
    const source = `# A small next step\n\n- Read **the brief**\n- Compare [the reference](${urls.youtube})\n\n${urls.x}\n\n> Keep it simple\n\n\`https://example.com/literal\`\n\n\`\`\`text\nhttps://example.com/code\n\`\`\`\n\n| Unsupported | table |\n<script>window.unsafeNote=true</script>`
    const id = await create(`Description fixture ${urls.x}`, source), before = await stored(id)
    await open(id)
    await note().locator('h1').waitFor()
    await pollPage(page, () => document.querySelector('.description-content .link-inline[data-status="ready"]') !== null)
    assert.equal(await detail().locator('.link-preview').count(), 0)
    assert.equal(await detail().locator('.save-bar').count(), 0)
    assert.equal(await note().locator('ul li').count(), 2)
    assert.equal(await note().locator('.description-link').count(), 2)
    assert(await note().getByRole('link', { name: 'the reference', exact: true }).isVisible())
    assert(await note().getByRole('link', { name: 'Fixture X post', exact: true }).isVisible())
    await pollPage(page, () => document.querySelector('.description-content .link-favicon img')?.naturalWidth > 0)
    assert.deepEqual(await stored(id), before)
    assert.equal(await page.evaluate(() => !!window.unsafeNote), false)
    await shot('markdown-and-inline-links')
    report.checks.push('Saved Markdown renders in place; code/unsupported text is inert; named links survive; favicon/title loading does not dirty or write; detail cards removed')
    await note().getByRole('link', { name: 'Fixture X post', exact: true }).click()
    assert.deepEqual(await app.evaluate(() => globalThis.descriptionProbe.external), [urls.x])
    await detail().getByRole('button', { name: 'Edit title', exact: true }).click()
    await detail().locator('.title-input').fill(`Renamed description ${urls.x}`); await save()
    assert.equal((await stored(id)).description, source)
    report.checks.push('Title-only saves preserve original Markdown bytes and original link destinations open through IPC')
    await note().press('ControlOrMeta+End'); await page.keyboard.type(' appended')
    await save()
    const editedSource = (await stored(id)).description
    for (const literal of ['| Unsupported | table |', '<script>window.unsafeNote=true</script>', '`https://example.com/literal`', 'https://example.com/code']) assert(editedSource.includes(literal))
    report.checks.push('Editing nearby text preserves unsupported syntax, HTML text and code URLs in the saved Markdown')
    await note().press('ControlOrMeta+End'); await page.keyboard.type(' quick save')
    await page.keyboard.press('ControlOrMeta+Enter')
    await detail().locator('.save-bar').waitFor({ state: 'hidden' })
    const quick = (await stored(id)).description
    assert(quick.includes(' quick save') && !quick.endsWith('\n'), 'Mod+Enter saves without inserting a line')
    assert.equal(await note().evaluate(node => node.contains(document.activeElement)), false, 'Mod+Enter leaves the editor')
    report.checks.push('Mod+Enter in the description saves without a new line and ends editing')
    await close()

    const typed = await create('Typed list fixture')
    await open(typed)
    await note().click()
    assert.equal(await note().evaluate(element => element === document.activeElement), true)
    await note().pressSequentially('- ')
    await note().locator('ul li').waitFor()
    await page.keyboard.type('First step'); await page.keyboard.press('Enter'); await page.keyboard.type('Nested step'); await page.keyboard.press('Tab')
    await note().locator('ul ul li').waitFor()
    await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.type('After the list')
    assert.match(await note().innerText(), /After the list/)
    await save()
    assert.match((await stored(typed)).description, /- First step\n- Nested step/)
    const committed = await stored(typed)
    await note().press('ControlOrMeta+End'); await page.keyboard.type(' temporary')
    await page.keyboard.press('ControlOrMeta+z')
    await pollPage(page, () => !document.querySelector('.save-bar'))
    assert.deepEqual(await stored(typed), committed)
    report.checks.push('List input shortcut, continuation, nesting/outdent and exit work; local undo restores clean state without workspace changes')

    await note().fill('A draft to discard')
    await detail().getByRole('button', { name: 'Discard', exact: true }).click()
    assert.match(await note().innerText(), /First step/)
    assert.equal(await detail().locator('.save-bar').count(), 0)
    await note().press('ControlOrMeta+a'); await paste(`## Pasted heading\n\n1. One\n2. Two\n\n${urls.article}`)
    await note().locator('h2').waitFor()
    assert.equal(await note().locator('ol li').count(), 2)
    assert.equal(await page.evaluate(() => !!window.unsafePaste), false)
    assert.equal(await note().getByRole('link').innerText(), 'example.com', 'Unsaved URL does not fetch metadata')
    await save()
    await pollPage(page, () => document.querySelector('.description-content .link-inline')?.textContent.includes('Fixture article'))
    await shot('pasted-markdown')
    report.checks.push('Discard restores editor state; Markdown paste is parsed without executing HTML; new URLs enrich only after Save')

    await note().fill('Composition draft')
    const version = (await stored(typed)).version
    await note().evaluate(element => {
      element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
      element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', metaKey: true, isComposing: true }))
      element.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '中文' }))
    })
    assert.equal((await stored(typed)).version, version)
    await detail().getByRole('button', { name: 'Discard', exact: true }).click()
    report.checks.push('Composition Enter never submits the draft')
    await note().press('ControlOrMeta+a')
    await note().evaluate(element => {
      const data = new DataTransfer(), event = new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: data })
      element.dispatchEvent(event); window.descriptionCopied = data.getData('text/plain')
    })
    assert.match(await page.evaluate(() => window.descriptionCopied), /https:\/\/example.com\/link-preview-article/)
    assert.doesNotMatch(await page.evaluate(() => window.descriptionCopied), /Fixture article/)
    report.checks.push('Copy exports authored Markdown/URLs, never fetched page titles')
    await note().fill('Format this text'); await note().press('ControlOrMeta+a')
    await detail().getByRole('button', { name: 'Bold', exact: true }).click()
    await note().locator('.description-bold').waitFor()
    await note().press('ControlOrMeta+a'); await note().press('ControlOrMeta+k')
    await detail().getByLabel('Link address', { exact: true }).fill(urls.article)
    await detail().getByLabel('Display text (leave empty for page title)', { exact: true }).fill('My reference')
    await detail().locator('.description-link-form').getByRole('button', { name: 'Save', exact: true }).click()
    await note().getByRole('link', { name: 'My reference', exact: true }).waitFor()
    await save()
    assert.match((await stored(typed)).description, /\[My reference\]\(https:\/\/example.com\/link-preview-article\)/)
    await note().press('ControlOrMeta+a'); await note().press('ControlOrMeta+k')
    await detail().getByLabel('Link address', { exact: true }).fill('javascript:alert(1)')
    assert.equal(await detail().locator('.description-link-form').getByRole('button', { name: 'Save', exact: true }).isDisabled(), true)
    await detail().getByLabel('Link address', { exact: true }).press('Escape')
    assert.equal(await detail().locator('.save-bar').count(), 0)
    await note().press('ControlOrMeta+a'); await note().press('ControlOrMeta+k')
    await detail().getByLabel('Display text (leave empty for page title)', { exact: true }).fill('My [reference]')
    await detail().locator('.description-link-form').getByRole('button', { name: 'Save', exact: true }).click()
    await save(); await close(); await open(typed)
    await note().getByRole('link', { name: 'My [reference]', exact: true }).waitFor()
    await note().press('ControlOrMeta+a'); await note().press('ControlOrMeta+k')
    await detail().getByRole('button', { name: 'Remove link', exact: true }).click()
    assert.equal(await note().getByRole('link').count(), 0)
    assert.equal(await note().innerText(), 'My [reference]')
    await note().press('ControlOrMeta+z')
    await note().getByRole('link', { name: 'My [reference]', exact: true }).waitFor()
    await note().press('ControlOrMeta+Shift+z')
    assert.equal(await note().getByRole('link').count(), 0)
    await detail().getByRole('button', { name: 'Discard', exact: true }).click()
    report.checks.push('Selection toolbar formats and edits links with authored labels; dangerous schemes are rejected without changing the document')

    await note().fill(''); await note().pressSequentially(`${urls.x} `)
    await note().getByRole('link', { name: 'Fixture X post', exact: true }).waitFor()
    await save()
    assert.equal((await stored(typed)).description.trim(), urls.x)
    await note().fill('Submitted note')
    await app.evaluate(({ ipcMain }) => {
      const handler = ipcMain._invokeHandlers.get('goalloom:command')
      globalThis.descriptionSaveGate = { release: null, restore: () => { ipcMain.removeHandler('goalloom:command'); ipcMain.handle('goalloom:command', handler) } }
      ipcMain.removeHandler('goalloom:command')
      ipcMain.handle('goalloom:command', async (event, input) => {
        const reply = await handler(event, input)
        if (input.type === 'edit') await new Promise(resolve => { globalThis.descriptionSaveGate.release = resolve })
        return reply
      })
    })
    await detail().locator('.save-bar').getByRole('button', { name: /^Save/ }).click()
    await pollPage(page, async id => (await window.goalloom.getItem(id)).item.description === 'Submitted note', typed)
    await note().fill('New typing while the receipt is pending')
    await app.evaluate(() => { globalThis.descriptionSaveGate.release(); globalThis.descriptionSaveGate.restore() })
    await pollPage(page, () => document.querySelector('.save-bar .primary')?.disabled === false)
    assert.equal(await note().innerText(), 'New typing while the receipt is pending')
    assert.equal((await stored(typed)).description, 'Submitted note')
    await save()
    await shot('saved-receipt-retains-new-input')
    report.checks.push('Typed bare URLs become semantic links; a delayed authoritative save receipt preserves subsequent rich-editor input')

    await note().fill('x'.repeat(100_001))
    await detail().getByRole('alert').waitFor()
    assert.equal(await detail().locator('.save-bar .primary').isDisabled(), true)
    await detail().getByRole('button', { name: 'Discard', exact: true }).click()
    report.checks.push('The 100,000-character serialization limit blocks Save and Discard restores the committed content')
    await close(); await open(typed)
    assert.equal(await note().innerText(), 'New typing while the receipt is pending'); assert.equal(await detail().locator('.save-bar').count(), 0)
    await close()
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(await app.evaluate(() => globalThis.descriptionProbe.network), [])
  report.result = 'passed'
} catch (error) {
  report.result = 'failed'; report.failure = error.stack ?? String(error); report.errors = errors
  if (page && !page.isClosed()) {
    report.focus = await page.evaluate(() => ({ focused: document.hasFocus(), active: document.activeElement?.outerHTML.slice(0, 600) })).catch(() => null)
    await shot('failure').catch(() => {})
  }
  throw error
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  if (app) { await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach(window => window.destroy())).catch(() => {}); await app.close().catch(() => {}) }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2))
  await rm(profile, { recursive: true, force: true })
  console.log(JSON.stringify({ result: report.result, checks: report.checks.length, report: `${output}/report.json` }))
}
