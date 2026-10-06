/**
 * [INPUT]: Built Electron, an optional packaged executable and a fresh synthetic workspace.
 * [OUTPUT]: Repeatable blank-space/todo-tail creation and growing-title acceptance, native app diagnostics and screenshots in output/tests/column-add/.
 * [POS]: Composer-owned desktop fixture; real preload/main/SQLite with controlled main-process read/write gates.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'
import { finishSetup } from './setup.mjs'
import { stepPeriod } from './period-step.mjs'

export async function runColumnAdd(packaged) {
  const evidence = resolve('output/tests/column-add')
  await mkdir(evidence, { recursive: true })
  const profile = await mkdtemp(join(tmpdir(), 'goalloom-column-add-'))
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  const report = {
    ok: false, packaged: Boolean(packaged), checks: [], placements: [], alignment: [], wrapping: [], screenshots: [],
    host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, machineScope: 'Host OS; physical/VM status not independently verified' },
  }
  let app, page
  try {
    app = await electron.launch({ ...(packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }), env: environment, timeout: 30_000 })
    page = await app.firstWindow()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      window.setSize(1280, 840)
      window.focus()
    })
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await finishSetup(page)
    report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
    const column = horizon => page.locator(`.board-column[data-horizon="${horizon}"]`)
    const footer = horizon => column(horizon).locator('[data-column-add]')
    const input = horizon => column(horizon).locator('.quick-add-title')
    const openFooter = async horizon => { await column(horizon).locator('.column-header').hover(); await footer(horizon).click() }
    const settled = horizon => page.waitForFunction(horizon => !document.querySelector('.fab')?.disabled && document.querySelector(`[data-horizon="${horizon}"]`)?.getAttribute('aria-busy') !== 'true', horizon)
    const active = locator => locator.evaluate(node => node === document.activeElement)
    const execute = async command => {
      const reply = await page.evaluate(async command => {
        const { workspace } = await window.goalloom.getSnapshot()
        return window.goalloom.execute({ ...command, generation: workspace.generation, operationId: crypto.randomUUID() })
      }, command)
      assert.equal(reply.ok, true, JSON.stringify(reply))
      return reply.result
    }
    const doubleBlank = async horizon => {
      await column(horizon).locator('.column-header').scrollIntoViewIfNeeded()
      await column(horizon).locator('.column-content').evaluate(node => { node.scrollTop = node.scrollHeight })
      const point = await column(horizon).locator('.column-content').evaluate(node => {
        const clip = node.getBoundingClientRect(), body = node.querySelector('.period-body').getBoundingClientRect()
        const x = clip.left + 60, y = Math.max(clip.top + 16, body.bottom + 16)
        return { x, y, bare: y < clip.bottom - 8 && document.elementFromPoint(x, y) === node }
      })
      assert.equal(point.bare, true, `${horizon}: the double click must hit visible trailing blank space`)
      await page.mouse.dblclick(point.x, point.y)
    }
    const save = async (horizon, title) => {
      await input(horizon).fill(title)
      await input(horizon).press('Enter')
      const task = column(horizon).getByRole('button', { name: title, exact: true })
      await task.waitFor()
      await settled(horizon)
      const id = await task.evaluate(node => node.closest('[data-item-id]').dataset.itemId)
      const { item } = await page.evaluate(id => window.goalloom.getItem(id), id)
      assert.equal(item.placement.horizon, horizon)
      assert.equal(item.placement.periodId, await column(horizon).getAttribute('data-period-id'))
      assert.equal(await active(input(horizon)), true)
      return item
    }
    const close = async horizon => { await input(horizon).press('Escape'); await input(horizon).waitFor({ state: 'detached' }) }
    const shot = async name => {
      const file = `${name}.png`
      await page.screenshot({ path: join(evidence, file) })
      report.screenshots.push(file)
    }
    const longTitle = '新建待办也应像双击编辑一样自动折行并完整显示所有文字。'.repeat(5)
    const measureInput = horizon => input(horizon).evaluate(node => {
      const css = getComputedStyle(node), box = node.getBoundingClientRect()
      const marker = node.parentElement.querySelector('.check').getBoundingClientRect()
      const hint = node.parentElement.querySelector('.quick-add-hint')?.getBoundingClientRect()
      return {
        width: box.width, height: box.height, lineHeight: parseFloat(css.lineHeight), fontSize: css.fontSize,
        clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, clientWidth: node.clientWidth, scrollWidth: node.scrollWidth,
        markerOffset: marker.top - box.top, hintOffset: hint ? hint.top - box.bottom : null,
      }
    })
    const wrappedInput = async (horizon, title = longTitle) => {
      await input(horizon).fill(title)
      const geometry = await measureInput(horizon)
      assert(geometry.height >= geometry.lineHeight * 2, `${horizon}: a long title grows beyond one line`)
      assert(geometry.scrollHeight <= geometry.clientHeight + 1, `${horizon}: the complete title is visible`)
      assert(geometry.scrollWidth <= geometry.clientWidth + 1, `${horizon}: unbroken text stays inside the field`)
      assert(geometry.markerOffset >= 0 && geometry.markerOffset <= 4, `${horizon}: the marker stays on the first line`)
      assert(geometry.hintOffset === null || geometry.hintOffset >= 0, `${horizon}: the hint sits below the title`)
      assert.equal(geometry.fontSize, '14px')
      assert.equal(geometry.lineHeight, 22)
      report.wrapping.push({ horizon, characters: title.length, ...geometry })
      return geometry
    }
    const alignedEntry = async horizon => {
      const geometry = await column(horizon).evaluate(node => {
        const start = element => {
          const range = document.createRange()
          range.setStart(element.firstChild, 0); range.setEnd(element.firstChild, 1)
          return range.getBoundingClientRect().left
        }
        const field = node.querySelector('.quick-add-title'), label = node.querySelector('[data-column-add] > span')
        const header = node.querySelector('[data-add-item]')
        return {
          style: document.documentElement.dataset.style, theme: document.documentElement.dataset.theme, language: document.documentElement.lang,
          kind: field ? 'input' : 'button', title: start(node.querySelector('.task-row[data-done="false"] .task-title > span')),
          entry: field ? field.getBoundingClientRect().left + parseFloat(getComputedStyle(field).paddingLeft) + parseFloat(getComputedStyle(field).textIndent) : start(label),
          headerBackground: getComputedStyle(header).backgroundColor, headerPressed: header.getAttribute('aria-pressed'),
        }
      })
      assert(Math.abs(geometry.entry - geometry.title) <= .5, JSON.stringify(geometry))
      if (geometry.kind === 'input') {
        assert.equal(geometry.headerPressed, null)
        assert.equal(geometry.headerBackground, 'rgba(0, 0, 0, 0)')
      }
      report.alignment.push({ horizon, ...geometry })
    }

    await column('later').locator('.empty-column').dblclick({ position: { x: 40, y: 40 } })
    assert.equal(await active(input('later')), true)
    await close('later')
    await column('later').locator('.empty-column p').dblclick()
    assert.equal(await page.locator('.quick-add').count(), 0)

    for (const horizon of ['later', 'year', 'half', 'cycle', 'month', 'week', 'day']) {
      assert.equal(await footer(horizon).count(), 0)
      await column(horizon).locator('.column-header').scrollIntoViewIfNeeded()
      const card = column(horizon).locator('.insight-empty')
      if (await card.count()) {
        await card.dblclick({ position: { x: 8, y: 8 } })
        assert.equal(await page.locator('.quick-add').count(), 0, 'An insight card is not blank space')
      }
      const before = await page.evaluate(() => window.goalloom.getSnapshot())
      await doubleBlank(horizon)
      assert.equal(await active(input(horizon)), true)
      assert.equal(await column(horizon).locator('.quick-add-hint').count(), 0, 'Plain creation does not show a keyboard hint')
      assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.length, before.items.length, 'Opening must not create an item')
      const blank = await save(horizon, `Blank ${horizon}`)
      await alignedEntry(horizon)
      assert.equal(await footer(horizon).count(), 0, 'The input replaces the tail button')
      await close(horizon)
      await alignedEntry(horizon)
      await openFooter(horizon)
      const tail = await save(horizon, `Footer ${horizon}`)
      await close(horizon)
      report.placements.push({ horizon, blank: blank.id, footer: tail.id, periodId: tail.placement.periodId })
    }
    report.checks.push('Both entries create in all seven columns; empty columns, insight-card exclusion, focus and continuous input')

    for (const horizon of ['later', 'year', 'half', 'cycle', 'month', 'week', 'day']) {
      await openFooter(horizon)
      const blank = await measureInput(horizon)
      await wrappedInput(horizon)
      await input(horizon).evaluate(node => {
        node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }))
      })
      assert.equal(await input(horizon).inputValue(), longTitle, 'Composition Enter must retain the draft')
      await input(horizon).evaluate(node => { window.columnAddInput = node })
      await doubleBlank(horizon)
      assert.equal(await input(horizon).evaluate(node => node === window.columnAddInput && node === document.activeElement), true)
      await shot(`wrapped-${horizon}`)
      await close(horizon)
      await openFooter(horizon)
      assert.equal(await input(horizon).inputValue(), longTitle)
      await wrappedInput(horizon, 'x'.repeat(500))
      await input(horizon).fill('Pasted first line\nPasted second line')
      assert.equal(await input(horizon).inputValue(), 'Pasted first line Pasted second line')
      await save(horizon, `${horizon}: ${longTitle}`)
      const cleared = await measureInput(horizon)
      assert.equal(await input(horizon).inputValue(), '')
      assert.equal(cleared.height, blank.height, 'Saving shrinks the field back to one line')
      await close(horizon)
    }
    await openFooter('month')
    const narrow = await wrappedInput('month')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(2800, 840))
    await page.waitForFunction(width => document.querySelector('[data-horizon="month"] .quick-add-title').getBoundingClientRect().width > width, narrow.width)
    const wide = await measureInput('month')
    assert(wide.height < narrow.height, 'Widening the column recomputes the wrapped height')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1280, 840))
    await page.waitForFunction(width => document.querySelector('[data-horizon="month"] .quick-add-title').getBoundingClientRect().width <= width + 1, narrow.width)
    assert.equal((await measureInput('month')).height, narrow.height)
    await input('month').fill('Short title')
    assert.equal((await measureInput('month')).height, 22, 'Shortening the draft returns to one line')
    await input('month').fill(''); await close('month')
    report.checks.push('Seven-column CJK/unbroken wrapping, first-line markers, hint placement, resize, paste normalization, IME protection, focus, long drafts and save/shortening shrink')

    await doubleBlank('month')
    await input('month').fill('Preserved flow draft')
    await column('month').locator('.quick-add button.check').click()
    await page.locator('.flow-picker .swatches button').nth(1).click()
    assert.equal(await column('month').locator('.quick-add-hint').count(), 1, 'Selected flow context remains visible')
    const choice = await column('month').locator('.quick-add button.check').getAttribute('aria-label')
    await input('month').evaluate(node => { window.columnAddInput = node })
    await doubleBlank('month')
    assert.equal(await input('month').evaluate(node => node === window.columnAddInput), true)
    assert.equal(await input('month').inputValue(), 'Preserved flow draft')
    assert.equal(await column('month').locator('.quick-add button.check').getAttribute('aria-label'), choice)
    await close('month')
    await openFooter('month')
    assert.equal(await input('month').inputValue(), 'Preserved flow draft')
    assert.equal(await column('month').locator('.quick-add button.check').getAttribute('aria-label'), choice)
    const flow = await save('month', 'Preserved flow draft')
    assert.notEqual(flow.flowColor, null)
    await close('month')
    report.checks.push('Repeated opening retains the same input node, title and flow choice; Escape/reopen retains the draft')

    const dayItems = (await page.evaluate(() => window.goalloom.getSnapshot())).items.filter(item => item.placement.horizon === 'day')
    for (const item of dayItems) await execute({ type: 'status', itemId: item.id, expectedVersion: item.version, status: 'done' })
    await footer('day').waitFor({ state: 'detached' })
    await column('day').locator('.completed-fold summary').dblclick()
    assert.equal(await page.locator('.quick-add').count(), 0)
    await doubleBlank('day')
    await save('day', 'Todo after completed')
    await close('day')
    const positions = await column('day').evaluate(node => ({ button: node.querySelector('[data-column-add]').getBoundingClientRect().bottom, completed: node.querySelector('.completed-fold').getBoundingClientRect().top }))
    assert(positions.button <= positions.completed, 'The button precedes completed tasks')
    await column('day').getByRole('button', { name: 'Todo after completed', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '当前条目', exact: true })
    await detail.waitFor()
    assert.equal(await page.locator('.quick-add').count(), 0)
    await detail.getByRole('button', { name: '关闭', exact: true }).click()
    report.checks.push('Only-completed columns hide the button but allow blank creation; completed groups and task titles do not trigger QuickAdd')

    await page.locator('#later-toggle').hover()
    assert.equal(await footer('day').evaluate(node => getComputedStyle(node).opacity), '0')
    const beforeHover = await column('day').locator('.completed-fold').boundingBox()
    await column('day').locator('.column-header').hover()
    assert.equal(await footer('day').evaluate(node => getComputedStyle(node).opacity), '1')
    assert.deepEqual(await column('day').locator('.completed-fold').boundingBox(), beforeHover)
    await page.locator('#later-toggle').hover()
    const lastControl = column('day').locator('.virtual-rows').first().locator('.task-row').last().locator('button:not(:disabled), a[href], [tabindex="0"]').last()
    await lastControl.focus()
    await page.keyboard.press('Tab')
    assert.equal(await active(footer('day')), true)
    assert.equal(await footer('day').evaluate(node => getComputedStyle(node).opacity), '1')
    await shot('keyboard-tail')
    for (const key of ['Enter', 'Space']) {
      await footer('day').focus()
      await footer('day').press(key)
      assert.equal(await active(input('day')), true)
      await close('day')
    }
    report.checks.push('Hovering the header reveals the button without shifting completed tasks; Tab, Enter and Space work without pointer hover')

    await app.evaluate(({ ipcMain }) => {
      const command = ipcMain._invokeHandlers.get('goalloom:command'), query = ipcMain._invokeHandlers.get('goalloom:query')
      const probe = globalThis.columnAddProbe = { writeGate: null, queryGate: null, failQuery: false }
      ipcMain.removeHandler('goalloom:command'); ipcMain.removeHandler('goalloom:query')
      ipcMain.handle('goalloom:command', async (event, input) => {
        if (input.type === 'create' && input.title === 'Busy column save') await probe.writeGate?.promise
        return command(event, input)
      })
      ipcMain.handle('goalloom:query', async (event, input) => {
        if (input.type === 'boardPeriods') {
          await probe.queryGate?.promise
          if (probe.failQuery) throw Error('Synthetic planning read failure')
        }
        return query(event, input)
      })
      globalThis.restoreColumnAddHandlers = () => {
        probe.writeGate?.resolve(); probe.queryGate?.resolve()
        ipcMain.removeHandler('goalloom:command'); ipcMain.removeHandler('goalloom:query')
        ipcMain.handle('goalloom:command', command); ipcMain.handle('goalloom:query', query)
      }
    })
    await app.evaluate(() => { globalThis.columnAddProbe.writeGate = Promise.withResolvers() })
    await openFooter('week')
    await input('week').fill('Busy column save'); await input('week').press('Enter')
    await page.waitForFunction(() => document.querySelector('.fab').disabled)
    assert.equal(await footer('day').isDisabled(), true)
    await doubleBlank('day')
    assert.equal(await input('day').count(), 0)
    assert.equal(await input('week').inputValue(), 'Busy column save')
    await app.evaluate(() => { globalThis.columnAddProbe.writeGate.resolve(); globalThis.columnAddProbe.writeGate = null })
    await column('week').getByRole('button', { name: 'Busy column save', exact: true }).waitFor()
    await settled('week'); await close('week')

    await app.evaluate(() => { globalThis.columnAddProbe.queryGate = Promise.withResolvers() })
    await stepPeriod(column('week'), 'next')
    await page.waitForFunction(() => document.querySelector('[data-horizon="week"]').getAttribute('aria-busy') === 'true')
    assert.equal(await column('week').locator('[data-add-item]').isDisabled(), true)
    await doubleBlank('week')
    assert.equal(await input('week').count(), 0)
    await app.evaluate(() => { globalThis.columnAddProbe.queryGate.resolve(); globalThis.columnAddProbe.queryGate = null })
    await settled('week')
    await doubleBlank('week'); await save('week', 'Future blank'); await close('week')
    await openFooter('week'); await save('week', 'Future footer'); await close('week')
    await app.evaluate(() => { globalThis.columnAddProbe.failQuery = true })
    await stepPeriod(column('week'), 'next')
    await column('week').locator('.inline-error').waitFor(); await settled('week')
    assert.equal(await column('week').locator('[data-add-item]').isDisabled(), true)
    await doubleBlank('week'); assert.equal(await input('week').count(), 0)
    await app.evaluate(() => { globalThis.columnAddProbe.failQuery = false })
    await column('week').locator('.inline-error button').click(); await settled('week')
    await column('week').locator('[data-return-current]').click()
    await stepPeriod(column('week'), 'previous')
    assert.equal(await column('week').getAttribute('data-history'), 'true')
    await column('week').locator('.past-period-rows').waitFor(); await settled('week')
    await doubleBlank('week'); assert.equal(await input('week').count(), 0)
    assert.equal(await footer('week').count(), 0)
    await column('week').locator('[data-return-current]').click(); await settled('week')
    report.checks.push('Busy writes, pending/failed future reads and history block creation; both future entries retain the displayed period')

    await page.locator('#later-toggle').click()
    await page.waitForFunction(() => document.querySelector('#later-toggle').getAttribute('aria-expanded') === 'false')
    assert.equal(await footer('later').isDisabled(), true)
    await column('later').locator('.column-content').dispatchEvent('dblclick', { button: 0, clientY: 10000 })
    assert.equal(await input('later').count(), 0)
    await page.locator('#later-toggle').click()
    await column('later').locator('.drag-handle').first().focus()
    await page.keyboard.press('Space')
    await page.waitForFunction(() => document.documentElement.dataset.dragging === 'true')
    assert.equal(await footer('later').isDisabled(), true)
    await doubleBlank('later'); assert.equal(await input('later').count(), 0)
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.documentElement.dataset.dragging)
    report.checks.push('Hidden Later and active task dragging block both new entries')

    for (let index = 0; index < 80; index++) await execute({ type: 'create', title: `Virtual ${String(index).padStart(2, '0')}`, horizon: 'later' })
    await column('later').getByRole('button', { name: 'Virtual 00', exact: true }).waitFor()
    const list = column('later').locator('.virtual-rows').first()
    await list.locator(':scope > div[aria-hidden="true"]').first().dispatchEvent('dblclick', { button: 0, clientY: 10000 })
    assert.equal(await input('later').count(), 0, 'A virtual spacer is not blank space')
    assert(await column('later').locator('.task-row').count() < 45)
    await doubleBlank('later')
    await save('later', 'Virtual tail blank'); await close('later')
    await openFooter('later'); await save('later', 'Virtual tail button'); await close('later')
    assert(await column('later').locator('.task-row').count() < 45)
    await shot('virtual-tail')
    report.checks.push('Virtual spacers do not trigger creation; both entries work at the logical list end with bounded mounted rows')

    for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
      await execute({ type: 'preferences', style, theme })
      await page.waitForFunction(({ style, theme }) => document.documentElement.dataset.style === style && document.documentElement.dataset.theme === theme, { style, theme })
      await column('day').locator('.column-header').hover()
      const surface = await footer('day').evaluate(node => {
        const css = getComputedStyle(node)
        return { background: css.backgroundColor, border: css.borderTopWidth, height: node.getBoundingClientRect().height }
      })
      assert.deepEqual(surface, { background: 'rgba(0, 0, 0, 0)', border: '0px', height: 40 })
      await alignedEntry('day')
      await shot(`${style}-${theme}`)
      await openFooter('day'); await alignedEntry('day'); await wrappedInput('day'); await shot(`${style}-${theme}-input`); await input('day').fill(''); await close('day')
    }
    const labels = { zh: '添加任务…', en: 'Add task…', ja: 'タスクを追加…', es: 'Añadir tarea…', fr: 'Ajouter une tâche…' }
    for (const [locale, label] of Object.entries(labels)) {
      await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
      await page.reload(); await page.locator('.board').waitFor()
      await column('day').locator('.column-header').hover()
      assert.equal(await footer('day').innerText(), label)
      assert(await footer('day').getAttribute('aria-label'))
      await alignedEntry('day')
      await openFooter('day'); assert.equal(await active(input('day')), true); await alignedEntry('day')
      assert.equal(await column('day').locator('.quick-add-hint').count(), 0, 'The keyboard hint stays absent in every locale')
      if (locale === 'en') await shot('english-empty-input')
      await wrappedInput('day'); await shot(`locale-${locale}-input`); await input('day').fill(''); await close('day')
      await shot(`locale-${locale}`)
    }
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 })
    await page.locator('#later-toggle').hover()
    report.touchMedia = await page.evaluate(() => ({ hover: matchMedia('(hover: none)').matches, coarse: matchMedia('(pointer: coarse)').matches }))
    assert.equal(report.touchMedia.hover, true)
    assert.equal(await footer('day').evaluate(node => getComputedStyle(node).opacity), '1')
    await shot('no-hover')
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false })
    await cdp.detach()
    assert.deepEqual(errors, [])
    report.checks.push('Title-aligned button/input text and inactive header Add across all columns, four themes and five locales; visible no-hover controls without renderer errors')
    report.checks.push('Plain creation has no keyboard hint in all seven columns and five locales; selected flow context remains visible')
    report.ok = true
  } catch (error) {
    report.error = error.stack ?? String(error)
    if (page) {
      report.renderer = await page.evaluate(() => ({ visibility: document.visibilityState, activeElement: document.activeElement?.outerHTML.slice(0, 1200), dragging: document.documentElement.dataset.dragging })).catch(() => null)
      await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => undefined)
    }
    if (app) report.window = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), minimized: window.isMinimized(), bounds: window.getBounds() }))).catch(() => null)
    throw error
  } finally {
    await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2))
    if (app) { await app.evaluate(() => globalThis.restoreColumnAddHandlers?.()).catch(() => undefined); await app.close() }
    await rm(profile, { recursive: true, force: true })
  }
  console.log(JSON.stringify(report))
}
