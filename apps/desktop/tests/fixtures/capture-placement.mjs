/**
 * [INPUT]: Native column-tail entry, isolated Jev transport and synthetic goal identities.
 * [OUTPUT]: Ready/late placement, submission-time preference, unchanged older rows and one-step undo/restore evidence.
 * [POS]: Composer/ordering acceptance; production renderer, IPC and SQLite, with no live provider calls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { pollPage } from './poll.mjs'

export async function runCapturePlacement({ app, page, out, ids, check, report }) {
  const column = page.locator('[data-horizon="day"]')
  const field = column.locator('.quick-add-title')
  const snapshot = () => page.evaluate(() => window.goalloom.getSnapshot())
  const rows = async () => (await snapshot()).items.filter(item => item.placement.horizon === 'day')
  const transport = values => app.evaluate((_, values) => Object.assign(globalThis.captureFixture, values), values)
  const release = () => app.evaluate(() => {
    const fixture = globalThis.captureFixture
    fixture.hold = false
    fixture.waiters.splice(0).forEach(resolve => resolve())
  })
  const placement = async enabled => {
    await page.locator('.settings-toggle').click()
    const dialog = page.locator('.settings-modal')
    await dialog.getByRole('button', { name: '看板', exact: true }).click()
    const control = dialog.getByRole('switch', { name: '按上级自动放置', exact: true })
    if ((await control.getAttribute('aria-checked') === 'true') !== enabled) await control.click()
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
  }
  const seeds = await page.evaluate(async parentId => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const create = async (title, parentId = null) => {
      const result = await window.goalloom.execute({ type: 'create', operationId: crypto.randomUUID(), generation, title, horizon: 'day', parentId,
        expectedParentVersion: parentId ? (await window.goalloom.getItem(parentId)).item.version : null })
      if (!result.ok) throw Error(result.message)
      return result.result.itemId
    }
    return { sibling: await create('Existing Delivery placement sibling', parentId), tail: await create('Independent placement tail') }
  }, ids.target)
  const remove = async id => page.evaluate(async id => {
    const detail = await window.goalloom.getItem(id)
    if (detail.item.deletedAt) return
    const result = await window.goalloom.execute({ type: 'delete', operationId: crypto.randomUUID(), generation: (await window.goalloom.getSnapshot()).workspace.generation, itemId: id, expectedVersion: detail.item.version })
    if (!result.ok) throw Error(result.message)
  }, id)
  const linked = id => pollPage(page, async ({ id, parentId }) => (await window.goalloom.getSnapshot()).relations.some(edge => edge.childId === id && edge.parentId === parentId), { id, parentId: ids.target })
  const open = async title => {
    const entry = column.locator('[data-column-add]')
    await entry.focus()
    await entry.press('Enter')
    await field.fill(title)
  }
  const save = async title => {
    const started = Date.now()
    await field.press('Enter')
    await pollPage(page, async title => (await window.goalloom.getSnapshot()).items.some(item => item.title === title), title)
    const item = (await rows()).find(item => item.title === title)
    const receipt = await app.evaluate((_, id) => globalThis.captureFixture.receipts.find(row => row.itemId === id), item.id)
    report.captures.push({ title, enterToCommittedMs: receipt.committedAtMs - started, initialHorizon: item.placement.horizon })
    return { item, receipt }
  }
  const expectedOrder = (before, id, enabled) => {
    const order = before.map(item => item.id)
    order.splice(enabled ? order.indexOf(seeds.sibling) + 1 : order.length, 0, id)
    return order
  }
  const verify = async (before, item, enabled, name) => {
    const actual = await rows(), expected = expectedOrder(before, item.id, enabled)
    assert.deepEqual(actual.map(item => item.id), expected, 'Bottom entry follows the captured placement preference')
    assert.deepEqual(actual.filter(row => row.id !== item.id).map(row => row.placement), before.map(row => row.placement), 'Automatic placement never moves an older task')
    const segment = enabled ? [seeds.sibling, item.id, seeds.tail] : [seeds.sibling, seeds.tail, item.id]
    await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-horizon="day"] .task-row')].map(node => node.dataset.itemId).filter(id => expected.includes(id))) === JSON.stringify(expected), segment)
    await page.waitForFunction(() => [...document.querySelectorAll('[data-horizon="day"] .virtual-rows')].every(node => node.getAnimations({ subtree: true }).every(animation => animation.playState !== 'running')))
    await page.screenshot({ path: `${out}/${name}.png` })
    report.placementCases ??= []
    report.placementCases.push({ name, enabled, before: before.map(row => row.id), after: expected, itemId: item.id })
    return expected
  }
  const undoRestore = async (item, expected) => {
    await field.fill('')
    await field.press('Escape')
    await page.keyboard.press('ControlOrMeta+z')
    await pollPage(page, async id => !!(await window.goalloom.getItem(id)).item.deletedAt, item.id)
    assert(!(await snapshot()).relations.some(edge => edge.childId === item.id))
    const calls = await app.evaluate(() => globalThis.captureFixture.calls.length)
    await page.locator('.toast').getByRole('button', { name: '还原', exact: true }).click()
    await linked(item.id)
    assert.deepEqual((await rows()).map(row => row.id), expected, 'Restore retains the automatic placement')
    assert.equal(await app.evaluate(() => globalThis.captureFixture.calls.length), calls, 'Restore never restarts the old model request')
  }

  await placement(true)
  await transport({ hold: false })
  const readyTitle = 'Improve Delivery keyboard navigation placement'
  const beforeReady = await rows()
  await open(readyTitle)
  await column.locator('.quick-add-smart').filter({ hasText: 'Delivery target' }).waitFor()
  const ready = await save(readyTitle)
  await linked(ready.item.id)
  assert.equal(ready.receipt.capture.pending, false)
  assert.equal(ready.receipt.capture.autoPlace, true, 'Bottom entry must not be marked as an explicit tail insertion')
  const readyOrder = await verify(beforeReady, ready.item, true, 'placement-ready')
  await undoRestore(ready.item, readyOrder)
  await remove(ready.item.id)
  check('Ready Jev parents place bottom-created items beside their siblings; one undo and restore include their position')

  await transport({ hold: true })
  const lateTitle = 'Verify Delivery drag control placement'
  const beforeLate = await rows()
  await open(lateTitle)
  const late = await save(lateTitle)
  assert.equal(late.receipt.capture.pending, true)
  assert.equal(late.receipt.capture.autoPlace, true)
  assert.deepEqual((await rows()).map(row => row.id), expectedOrder(beforeLate, late.item.id, false), 'Enter saves at once while the provider is held')
  await field.fill('Keep this next draft while Delivery placement completes')
  await placement(false)
  await field.focus()
  await release()
  await linked(late.item.id)
  const lateOrder = await verify(beforeLate, late.item, true, 'placement-late')
  assert.equal(await field.inputValue(), 'Keep this next draft while Delivery placement completes')
  assert.equal(await field.evaluate(node => node === document.activeElement), true)
  await undoRestore(late.item, lateOrder)
  await remove(late.item.id)
  check('Late parents use the enabled policy captured at Enter, preserve the next draft/focus and remain one creation undo')

  await transport({ hold: false })
  const offTitle = 'Review Delivery placement with automatic placement disabled'
  const beforeOff = await rows()
  await open(offTitle)
  await column.locator('.quick-add-smart').filter({ hasText: 'Delivery target' }).waitFor()
  const off = await save(offTitle)
  await linked(off.item.id)
  assert.equal(off.receipt.capture.autoPlace, false)
  await verify(beforeOff, off.item, false, 'placement-disabled-ready')
  await field.press('Escape')
  await remove(off.item.id)
  check('Disabled placement keeps a ready-matched bottom-created item at the tail with its goal link')

  await transport({ hold: true })
  const offLateTitle = 'Check Delivery late matching with placement disabled'
  const beforeOffLate = await rows()
  await open(offLateTitle)
  const offLate = await save(offLateTitle)
  assert.equal(offLate.receipt.capture.pending, true)
  assert.equal(offLate.receipt.capture.autoPlace, false)
  await field.fill('Keep the disabled-placement draft open')
  await placement(true)
  await release()
  await linked(offLate.item.id)
  await verify(beforeOffLate, offLate.item, false, 'placement-disabled-late')
  await field.fill('')
  await field.press('Escape')
  await remove(offLate.item.id)
  await placement(false)
  await remove(seeds.sibling)
  await remove(seeds.tail)
  check('Enabling placement after Enter never changes the disabled policy captured for an already saved item')
}
