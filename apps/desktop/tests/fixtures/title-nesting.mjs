/**
 * [INPUT]: Native Electron board, real versioned IPC writes and isolated synthetic tasks.
 * [OUTPUT]: Repeatable title-edit Tab/Shift+Tab, draft/caret/focus, receipt failure and completed-section evidence.
 * [POS]: Subtask keyboard acceptance; uses production transactions and the existing undo session.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pollPage } from './poll.mjs'
import { stepPeriod } from './period-step.mjs'

export async function titleNesting({ page, application, report, evidence }) {
  const created = []
  const row = id => page.locator(`#item-${id}`)
  const field = id => row(id).locator('.task-title-input')
  const stored = id => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
  const execute = action => page.evaluate(async action => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, generation: workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result
  }, action)
  const create = async (title, horizon, extra = {}) => {
    const id = (await execute({ type: 'create', title, horizon, autoPlace: false, ...extra })).itemId
    created.push(id); return id
  }
  const settled = () => page.waitForFunction(() => !document.querySelector('.fab')?.disabled)
  const undo = async () => {
    await page.keyboard.press('ControlOrMeta+z')
    await settled()
  }
  const membership = (id, parent) => pollPage(page, async ({ id, parent }) => (await window.goalloom.getItem(id)).item.placement.nestingParentId === parent, { id, parent })
  const nest = async (id, parentId) => {
    const [source, target] = await Promise.all([stored(id), stored(parentId)])
    await execute({ type: 'nest', itemId: id, parentId, expectedVersion: source.version, expectedPlacementVersion: source.placement.version,
      expectedParentVersion: target.version, expectedParentPlacementVersion: target.placement.version })
  }
  const begin = async id => {
    await row(id).locator('.task-title').dblclick()
    await field(id).waitFor()
    await field(id).evaluate(node => { globalThis.titleEditor = node })
  }
  const unchangedEditor = async (id, value, start = 2, end = 6) => {
    assert.deepEqual(await field(id).evaluate(node => ({ same: node === globalThis.titleEditor, focused: node === document.activeElement, value: node.value, start: node.selectionStart, end: node.selectionEnd })),
      { same: true, focused: true, value, start, end })
  }
  const shot = async name => { const path = join(evidence, `${name}.png`); await page.screenshot({ path }); report.screenshots.push(path) }
  const cases = []
  for (const horizon of ['later', 'year', 'half', 'cycle', 'month', 'week', 'day']) {
    const parent = await create(`Keyboard parent ${horizon}`, horizon)
    const sibling = await create(`Keyboard sibling ${horizon}`, horizon)
    await nest(sibling, parent)
    const id = await create(`Keyboard source ${horizon}`, horizon), before = await stored(id)
    await begin(id)
    const draft = `Unsaved title ${horizon}`
    await field(id).fill(draft)
    await field(id).evaluate(node => node.setSelectionRange(2, 6))
    const left = (await row(id).locator('.check').boundingBox()).x
    for (const key of [{ key: 'Tab', isComposing: true }, { key: 'Tab', ctrlKey: true }, { key: 'Tab', altKey: true }, { key: 'Tab', metaKey: true }]) {
      await field(id).evaluate((node, key) => node.dispatchEvent(new KeyboardEvent('keydown', { ...key, bubbles: true })), key)
      assert.equal((await stored(id)).placement.nestingParentId, null)
    }
    await field(id).press('Tab'); await membership(id, parent); await settled()
    await unchangedEditor(id, draft)
    assert.equal((await row(id).locator('.check').boundingBox()).x - left, 24)
    assert.equal((await stored(id)).title, before.title, 'Nesting does not commit the title draft')
    await field(id).press('Shift+Tab'); await membership(id, null); await settled()
    await unchangedEditor(id, draft)
    assert.equal((await row(id).locator('.check').boundingBox()).x, left)
    await field(id).press('Tab'); await membership(id, parent); await settled()
    await unchangedEditor(id, draft)
    await field(id).press('Escape'); await row(id).locator('.task-title').waitFor()
    assert.equal((await stored(id)).title, before.title)
    assert.equal((await stored(id)).placement.nestingParentId, parent, 'Escape cancels only the title draft')
    await undo(); await membership(id, null)
    cases.push({ horizon, id, parent, sibling })
  }
  report.titleNesting = cases
  report.checks.push('Seven-column existing-title Tab resolves a preceding child to its root; Shift+Tab detaches; text, selection, DOM identity and focus persist; IME/modifiers do not change levels; Escape and undo are independent')

  const { id, parent } = cases.at(-1)
  await begin(id)
  await field(id).press('Home')
  assert.equal(await field(id).evaluate(node => node.selectionStart), 0, 'Home stays in the text editor')
  await field(id).press('End')
  assert.equal(await field(id).evaluate(node => node.selectionStart), (await field(id).inputValue()).length)
  await field(id).fill('Saved after keyboard nesting')
  await field(id).press('Tab'); await membership(id, parent); await settled()
  await shot('title-tab-nested')
  await field(id).press('Enter'); await row(id).locator('.task-title').waitFor(); await settled()
  assert.equal((await stored(id)).title, 'Saved after keyboard nesting')
  const current = await stored(id)
  await execute({ type: 'edit', itemId: id, expectedVersion: current.version, title: 'Later independent text', description: current.description, dueDate: current.dueDate })
  await undo(); await membership(id, null)
  assert.equal((await stored(id)).title, 'Later independent text', 'Level undo preserves later text')

  await nest(id, parent)
  await create('Following independent root', 'day')
  let currentItem = await stored(id)
  await execute({ type: 'status', itemId: id, expectedVersion: currentItem.version, status: 'done' })
  await begin(id); await field(id).fill('Completed child draft')
  await field(id).evaluate(node => node.setSelectionRange(2, 6))
  await field(id).press('Shift+Tab'); await membership(id, null); await settled()
  await unchangedEditor(id, 'Completed child draft')
  assert.equal(await row(id).locator('xpath=ancestor::details').count(), 0, 'Completed migration waits until title editing ends')
  await shot('title-outdent-completed')
  await field(id).press('Enter')
  await page.locator('[data-horizon="day"] .completed-fold').waitFor(); await settled()
  currentItem = await stored(id)
  assert.equal(currentItem.title, 'Completed child draft')
  assert.equal(currentItem.status, 'done')
  report.checks.push('Home/End remain native text keys; Enter saves separately; level undo preserves later text; completed detachment keeps the editor mounted until commit')

  const futurePeriod = await page.evaluate(async () => (await window.goalloom.getSnapshot()).periods.find(period => period.horizon === 'week').endDate)
  const futureParent = await create('Future keyboard parent', 'week', { period: { kind: 'date', startDate: futurePeriod } })
  const futureChild = await create('Future keyboard source', 'week', { period: { kind: 'date', startDate: futurePeriod } })
  const week = page.locator('[data-horizon="week"]')
  await stepPeriod(week, 'next'); await row(futureChild).waitFor()
  await begin(futureChild); await field(futureChild).fill('Future title draft'); await field(futureChild).evaluate(node => node.setSelectionRange(2, 6))
  await field(futureChild).press('Tab'); await membership(futureChild, futureParent); await settled(); await unchangedEditor(futureChild, 'Future title draft')
  await field(futureChild).press('Shift+Tab'); await membership(futureChild, null); await settled(); await unchangedEditor(futureChild, 'Future title draft')
  await shot('title-future-period'); await field(futureChild).press('Escape'); await stepPeriod(week, 'previous')
  await row(cases.find(item => item.horizon === 'week').parent).waitFor()
  report.checks.push('Future-period title editing uses only the displayed period and retains the same draft/editor through both level changes')

  const remote = await create('Remote keyboard child', 'week')
  await nest(remote, cases.find(item => item.horizon === 'week').parent)
  let item = await stored(remote)
  await execute({ type: 'move', itemId: remote, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: 'day' })
  const placement = (await stored(remote)).placement
  await begin(remote); await field(remote).fill('Remote child draft'); await field(remote).evaluate(node => node.setSelectionRange(2, 6))
  await field(remote).press('Shift+Tab'); await membership(remote, null); await settled()
  await unchangedEditor(remote, 'Remote child draft')
  assert.deepEqual(((await stored(remote)).placement), { ...placement, nestingParentId: null, version: placement.version + 1 })
  await field(remote).press('Escape')

  const first = cases.find(item => item.horizon === 'later').parent
  await begin(first)
  await field(first).press('Tab')
  await field(first).waitFor({ state: 'detached' })
  await begin(remote)
  await field(remote).press('Shift+Tab')
  await field(remote).waitFor({ state: 'detached' })

  await application.evaluate(({ ipcMain }) => {
    const handler = ipcMain._invokeHandlers.get('goalloom:command')
    const probe = globalThis.titleNestingProbe = { handler, fail: true, gate: null, writes: 0, loseReply: false }
    ipcMain.removeHandler('goalloom:command')
    ipcMain.handle('goalloom:command', async (event, input) => {
      if (input.type !== 'nest' && input.type !== 'unnest') return handler(event, input)
      probe.writes++; await probe.gate?.promise
      if (probe.fail) return { ok: false, code: 'conflict', message: 'Synthetic title nesting failure' }
      const reply = await handler(event, input)
      if (probe.loseReply) { probe.loseReply = false; throw Error('Synthetic lost title nesting reply') }
      return reply
    })
  })
  try {
    await begin(remote); await field(remote).fill('Failure keeps this draft'); await field(remote).evaluate(node => node.setSelectionRange(2, 6))
    await field(remote).press('Tab')
    await page.getByRole('alert').filter({ hasText: 'Synthetic title nesting failure' }).waitFor(); await settled()
    await unchangedEditor(remote, 'Failure keeps this draft')
    assert.equal((await stored(remote)).placement.nestingParentId, null)
    await application.evaluate(() => { globalThis.titleNestingProbe.fail = false; globalThis.titleNestingProbe.gate = Promise.withResolvers() })
    await field(remote).press('Tab')
    await page.waitForFunction(() => document.querySelector('.fab')?.disabled)
    await field(remote).press('Tab'); await field(remote).press('Shift+Tab')
    assert.equal(await application.evaluate(() => globalThis.titleNestingProbe.writes), 2, 'Pending key repeats do not duplicate writes')
    await field(remote).fill('Typed during pending nesting')
    await field(remote).press('Enter')
    await application.evaluate(() => { globalThis.titleNestingProbe.gate.resolve(); globalThis.titleNestingProbe.gate = null })
    await row(remote).locator('.task-title').waitFor(); await settled()
    assert.equal((await stored(remote)).title, 'Typed during pending nesting')
    assert((await stored(remote)).placement.nestingParentId)
    await begin(remote)
    await application.evaluate(() => { globalThis.titleNestingProbe.loseReply = true })
    await field(remote).press('Shift+Tab'); await membership(remote, null); await settled()
    assert.equal(await field(remote).evaluate(node => node === globalThis.titleEditor && node === document.activeElement), true)
    await shot('title-recovered-receipt'); await field(remote).press('Escape')
  } finally {
    await application.evaluate(({ ipcMain }) => {
      const probe = globalThis.titleNestingProbe; probe.gate?.resolve()
      ipcMain.removeHandler('goalloom:command'); ipcMain.handle('goalloom:command', probe.handler)
      delete globalThis.titleNestingProbe
    })
  }
  report.checks.push('Remote-child outdent retains placement and editor; native Tab fallback; failed writes retain drafts; delayed writes accept later typing/Enter without duplication; lost replies recover the receipt')
  const toast = page.locator('.toast')
  if (await toast.count()) await toast.getByRole('button', { name: '关闭操作提示', exact: true }).click()
  for (const id of created.reverse()) {
    const item = await stored(id)
    await execute({ type: 'delete', itemId: id, expectedVersion: item.version })
  }
}
