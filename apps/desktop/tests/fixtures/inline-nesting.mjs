/**
 * [INPUT]: Isolated native column-add page, real IPC helpers and evidence collectors.
 * [OUTPUT]: Seven-column Tab nesting, caret/draft retention, sibling creation, failed/late/unknown saves and one-step undo/restore checks.
 * [POS]: Composer-owned keyboard acceptance; storage failure cases live in subtasks-data.ts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

export async function runInlineNesting({ page, column, input, openFooter, close, save, shot, report }) {
  for (const horizon of ['later', 'year', 'half', 'cycle', 'month', 'week', 'day']) {
    const rows = column(horizon).locator('.task-row')
    const parentId = await rows.last().getAttribute('data-item-id')
    await openFooter(horizon)
    const draft = input(horizon)
    await draft.fill(`Nested ${horizon}`)
    await draft.press('ArrowLeft')
    const original = await draft.evaluate(node => ({ text: node.value, start: node.selectionStart, end: node.selectionEnd, left: node.getBoundingClientRect().left }))
    await draft.evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, isComposing: true })))
    assert.notEqual(await column(horizon).locator('.quick-add').getAttribute('data-nested'), 'true')
    await draft.press('Tab')
    const nested = await draft.evaluate(node => ({ text: node.value, start: node.selectionStart, end: node.selectionEnd, left: node.getBoundingClientRect().left, focused: node === document.activeElement }))
    assert.deepEqual({ ...nested, left: original.left }, { ...original, focused: true })
    assert.equal(nested.left - original.left, 24)
    assert.equal(await column(horizon).locator('.quick-add button.check').count(), 0)
    assert.match(await draft.getAttribute('aria-description'), /所属任务：/)
    const first = await save(horizon, `Nested ${horizon}`)
    assert.equal(first.placement.nestingParentId, parentId)
    const second = await save(horizon, `Sibling ${horizon}`)
    assert.equal(second.placement.nestingParentId, parentId)
    await close(horizon)
    await openFooter(horizon)
    assert.equal(await column(horizon).locator('.quick-add').getAttribute('data-nested'), 'true')
    await draft.fill(`Retained ${horizon}`)
    await draft.press('Shift+Tab')
    assert.equal(await column(horizon).locator('.quick-add').getAttribute('data-nested'), 'false')
    assert.equal(await draft.inputValue(), `Retained ${horizon}`)
    await draft.press('Tab')
    assert.equal(await column(horizon).locator('.quick-add').getAttribute('data-nesting-parent'), parentId, 'A preceding child resolves to its root')
    await draft.press('Tab')
    assert.equal(await draft.evaluate(node => node === document.activeElement), false, 'A second Tab can leave the input')
    await draft.focus()
    await draft.fill(''); await close(horizon)
    report.placements.push({ horizon, parentId, nested: first.id, sibling: second.id })
  }
  await openFooter('day')
  await input('day').fill('Nested keyboard draft')
  await shot('tab-nested-input')
  await close('day'); await openFooter('day')
  assert.equal(await input('day').inputValue(), 'Nested keyboard draft')
  const child = await save('day', 'Undo inline nested creation')
  await close('day')
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
  await column('day').locator(`[data-item-id="${child.id}"]`).waitFor({ state: 'detached' })
  const restore = page.locator('.toast').getByRole('button', { name: '还原', exact: true })
  await restore.click()
  await column('day').locator(`[data-item-id="${child.id}"]`).waitFor()
  const restored = await page.evaluate(id => window.goalloom.getItem(id), child.id)
  assert.equal(restored.item.placement.nestingParentId, child.placement.nestingParentId)
  await shot('tab-nested-restored')
  await openFooter('day'); await input('day').press('Shift+Tab')
  await column('day').locator('.quick-add button.check').click()
  await page.locator('.flow-picker .swatches button').nth(1).click()
  const flow = await column('day').locator('.quick-add button.check').getAttribute('aria-label')
  await input('day').press('Tab'); await input('day').press('Shift+Tab')
  assert.equal(await column('day').locator('.quick-add button.check').getAttribute('aria-label'), flow, 'Outdenting restores the suspended independent flow choice')
  await column('day').locator('.quick-add button.check').click()
  await page.locator('.flow-picker .swatches button').first().click()
  await close('day')
  report.checks.push('Tab indents by 24px without changing caret/text in all seven columns; Enter retains nesting, Shift+Tab outdents, sibling roots/drafts persist, IME/native Tab remain available, and one undo/restore retains the group')
}

export async function runInlineNestingSaves({ app, page, column, input, openFooter, close, shot, report }) {
  await app.evaluate(({ ipcMain }) => {
    const command = ipcMain._invokeHandlers.get('goalloom:command')
    const probe = globalThis.inlineNestingProbe = { fail: false, gate: null, drop: false, calls: [] }
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command', async (event, input) => {
      if (!input.nesting) return command(event, input)
      probe.calls.push(input)
      await probe.gate?.promise
      if (probe.fail) return { ok: false, code: 'conflict', message: 'Synthetic nested write failure' }
      const reply = await command(event, input)
      if (probe.drop) { probe.drop = false; throw Error('Synthetic lost nested reply') }
      return reply
    })
    globalThis.restoreInlineNestingHandler = () => {
      probe.gate?.resolve(); ipcMain.removeHandler('goalloom:command'); ipcMain.handle('goalloom:command', command)
    }
  })
  const settled = () => page.waitForFunction(() => !document.querySelector('.fab')?.disabled)
  try {
    await openFooter('day')
    await input('day').fill('Failed nested save'); await input('day').press('Tab')
    const parentId = await column('day').locator('.quick-add').getAttribute('data-nesting-parent')
    await page.evaluate(async () => {
      const { workspace } = await window.goalloom.getSnapshot()
      const reply = await window.goalloom.execute({ type: 'create', title: 'Unrelated root while nesting', horizon: 'day', generation: workspace.generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw Error(reply.message)
    })
    await column('day').getByRole('button', { name: 'Unrelated root while nesting', exact: true }).waitFor()
    assert.equal(await column('day').locator('.quick-add').getAttribute('data-nesting-parent'), parentId, 'A later root does not retarget the selected draft')
    await app.evaluate(() => { globalThis.inlineNestingProbe.fail = true })
    await input('day').press('Enter')
    await page.getByRole('alert').filter({ hasText: 'Synthetic nested write failure' }).waitFor()
    assert.equal(await input('day').inputValue(), 'Failed nested save')
    assert.equal(await column('day').locator('.quick-add').getAttribute('data-nesting-parent'), parentId)
    assert.equal(await page.evaluate(async () => (await window.goalloom.getSnapshot()).items.filter(item => item.title === 'Failed nested save').length), 0)
    await page.locator('.error-banner button').click()
    await app.evaluate(() => { globalThis.inlineNestingProbe.fail = false })
    await input('day').press('Enter')
    await column('day').getByRole('button', { name: 'Failed nested save', exact: true }).waitFor(); await settled()
    await page.waitForFunction(() => document.querySelector('[data-horizon="day"] .quick-add-title')?.value === '')

    await app.evaluate(() => { globalThis.inlineNestingProbe.gate = Promise.withResolvers() })
    await input('day').fill('Held nested save'); await input('day').press('Enter')
    await page.waitForFunction(() => document.querySelector('.fab').disabled)
    await input('day').press('Shift+Tab'); await input('day').fill('Following independent draft')
    await app.evaluate(() => { globalThis.inlineNestingProbe.gate.resolve(); globalThis.inlineNestingProbe.gate = null })
    await column('day').getByRole('button', { name: 'Held nested save', exact: true }).waitFor(); await settled()
    assert.equal(await input('day').inputValue(), 'Following independent draft')
    assert.equal(await column('day').locator('.quick-add').getAttribute('data-nested'), 'false')
    const saved = await page.evaluate(async () => (await window.goalloom.getSnapshot()).items.find(item => item.title === 'Held nested save'))
    assert.equal(saved.placement.nestingParentId, parentId)
    await shot('tab-late-save')

    await input('day').fill('Unknown nested save'); await input('day').press('Tab')
    await app.evaluate(() => { globalThis.inlineNestingProbe.drop = true })
    await input('day').press('Enter')
    await column('day').getByRole('button', { name: 'Unknown nested save', exact: true }).waitFor(); await settled()
    await page.waitForFunction(() => document.querySelector('[data-horizon="day"] .quick-add-title')?.value === '')
    const count = await app.evaluate(() => globalThis.inlineNestingProbe.calls.filter(command => command.title === 'Unknown nested save').length)
    assert.equal(count, 1, 'A lost reply is resolved through the receipt without a second create')
    await close('day')
    await page.keyboard.press('ControlOrMeta+z')
    await column('day').getByRole('button', { name: 'Unknown nested save', exact: true }).waitFor({ state: 'detached' })
    await openFooter('day'); await input('day').press('Shift+Tab'); await close('day')
    report.checks.push('Failed nested creation retains text/parent, retry saves once, a delayed save preserves subsequent text/outdent, and a lost reply recovers one undo entry without duplicate creation')
  } finally {
    await app.evaluate(() => { globalThis.restoreInlineNestingHandler?.(); delete globalThis.restoreInlineNestingHandler })
  }
}
