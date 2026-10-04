/**
 * [INPUT]: Built Electron, an isolated synthetic workspace and real pointer/keyboard detail controls.
 * [OUTPUT]: Repeatable task-title focus-return assertions, screenshots and native-window diagnostics under output/tests/task-focus/.
 * [POS]: Board/detail focus regression; checks pointer returns, keyboard continuation and rich-title parity without editing tasks.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release, tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'
import { finishSetup } from './fixtures/setup.mjs'

// Failure cases: a pointer-opened detail leaves a ring after Escape or close; suppressing the ring loses actual focus;
// suppression survives subsequent keyboard input; keyboard-opened details lose their ring; rich titles behave differently;
// repeated openings leak suppression to other controls, or pure focus changes mutate task data.
const profile = await mkdtemp(join(tmpdir(), 'goalloom-task-focus-'))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const out = resolve('output/tests/task-focus')
await mkdir(out, { recursive: true })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
const app = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env })
const report = { ok: false, scope: 'Source Electron, real renderer/IPC/SQLite, isolated synthetic profile; no packaged or Windows acceptance',
  host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model }, checks: [] }
let page
try {
  page = await app.firstWindow()
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 840))
  await finishSetup(page)
  await page.locator('.board').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const ids = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation, ids = []
    for (const title of ['Focus regression task', 'Focus regression [reference](https://example.invalid/focus)']) {
      const result = await window.goalloom.execute({ type: 'create', generation, operationId: crypto.randomUUID(), horizon: 'year', title })
      if (!result.ok) throw Error(result.message)
      ids.push(result.result.itemId)
    }
    return ids
  })
  const detail = page.getByRole('dialog', { name: '当前条目', exact: true })
  const focusState = title => title.evaluate(node => ({ active: document.activeElement === node, focusVisible: node.matches(':focus-visible'),
    outlineStyle: getComputedStyle(node).outlineStyle, outlineWidth: getComputedStyle(node).outlineWidth, returnOrigin: node.dataset.focusReturn ?? null }))
  const waitForReturn = id => page.waitForFunction(id => document.activeElement === document.querySelector(`#item-${id} .task-title`), id)
  for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
    await page.evaluate(async ({ style, theme }) => {
      const generation = (await window.goalloom.getSnapshot()).workspace.generation
      const result = await window.goalloom.execute({ type: 'preferences', style, theme, generation, operationId: crypto.randomUUID() })
      if (!result.ok) throw Error(result.message)
    }, { style, theme })
    await page.waitForFunction(({ style, theme }) => document.documentElement.dataset.style === style && document.documentElement.dataset.theme === theme, { style, theme })
    const revision = await page.evaluate(() => window.goalloom.getSnapshot().then(snapshot => snapshot.workspace.revision))
    for (const [index, id] of ids.entries()) {
      const title = page.locator(`#item-${id} .task-title`), label = `${style}-${theme}-${index === 0 ? 'plain' : 'rich'}`
      // Rich titles keep links independently clickable; open the detail through the prose on the first line.
      const openByPointer = () => title.click({ position: { x: 48, y: 12 } })
      for (const method of ['escape', 'close']) {
        await openByPointer()
        await detail.waitFor()
        if (method === 'escape') await page.keyboard.press('Escape')
        else await detail.getByRole('button', { name: '关闭', exact: true }).click()
        await detail.waitFor({ state: 'hidden' })
        await waitForReturn(id)
        const state = await focusState(title)
        await page.locator(`#item-${id}`).screenshot({ path: `${out}/${label}-pointer-${method}.png` })
        assert.equal(state.outlineStyle, 'none', 'A pointer-opened detail returns focus without a keyboard ring')
        assert.equal(state.active, true)
        report.checks.push({ case: `${label}-pointer-${method}`, ...state })
      }
      // Keyboard activation must end the pointer-return suppression before the next detail opens.
      await page.keyboard.press('Enter')
      await detail.waitFor()
      await page.keyboard.press('Escape')
      await detail.waitFor({ state: 'hidden' })
      await waitForReturn(id)
      const keyboard = await focusState(title)
      assert.equal(keyboard.outlineStyle, 'solid', 'Keyboard-opened details retain a visible return target')
      assert.equal(keyboard.outlineWidth, '2px')
      assert.equal(keyboard.returnOrigin, null)
      await page.locator(`#item-${id}`).screenshot({ path: `${out}/${label}-keyboard.png` })
      report.checks.push({ case: `${label}-keyboard`, ...keyboard })
      await openByPointer()
      await detail.waitFor()
      await page.keyboard.press('Escape')
      await detail.waitFor({ state: 'hidden' })
      await waitForReturn(id)
      const pointerAgain = await focusState(title)
      assert.equal(pointerAgain.outlineStyle, 'none', 'A mouse reopen after keyboard use returns to pointer presentation')
      report.checks.push({ case: `${label}-pointer-after-keyboard`, ...pointerAgain })
      await page.keyboard.press('Shift+Tab')
      assert.equal(await page.locator(`#item-${id} .check`).evaluate(node => document.activeElement === node && node.matches(':focus-visible')), true)
      await page.keyboard.press('Tab')
      assert.equal((await focusState(title)).outlineStyle, 'solid', 'Tab navigation keeps the title focus indicator')
    }
    assert.equal(await page.evaluate(() => window.goalloom.getSnapshot().then(snapshot => snapshot.workspace.revision)), revision, 'Opening and closing details do not write task data')
  }
  report.ok = true
  console.log(`Passed ${report.checks.length} focus-return checks across plain/rich titles and four themes`)
} catch (error) {
  report.error = error.message
  report.nativeWindows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() }))).catch(() => null)
  report.document = await page?.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML,
    viewport: { width: innerWidth, height: innerHeight } })).catch(() => null)
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  throw error
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
  await app.close()
  await rm(profile, { recursive: true, force: true })
}
