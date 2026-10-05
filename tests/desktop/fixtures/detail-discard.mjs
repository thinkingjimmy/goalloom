/**
 * [INPUT]: Production Electron/IPC, isolated title-only tasks and controlled command/receipt failures.
 * [OUTPUT]: Empty-detail removal, one-step undo, content guards and receipt/race screenshots and assertions.
 * [POS]: Autosave-owned acceptance; product/failure contracts are recorded in task-descriptions.md.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { pollPage } from './poll.mjs'
import { waitForDetailSave } from './detail-save.mjs'

export async function verifyDetailDiscard(app, page, output) {
  const checks = [], screenshots = []
  const dialog = page.locator('dialog.detail'), title = dialog.locator('.title-input')
  const stored = id => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
  const execute = action => page.evaluate(async action => {
    const { workspace } = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, operationId: crypto.randomUUID(), generation: workspace.generation })
    if (!reply.ok) throw Error(reply.message)
    return reply.result
  }, action)
  const create = async (name, extra = {}) => (await execute({ type: 'create', horizon: 'day', title: name, ...extra })).itemId
  const open = async id => { await page.locator(`#item-${id} .task-title`).press('Enter'); await dialog.locator('.detail-title-display').waitFor() }
  const edit = () => dialog.getByRole('button', { name: 'Edit title', exact: true }).click()
  const clear = async () => { await edit(); await title.press('ControlOrMeta+a'); await title.press('Backspace') }
  const close = () => dialog.locator('.modal-header').getByRole('button', { name: 'Close', exact: true }).click()
  const mode = value => app.evaluate((_, value) => {
    const probe = globalThis.autosaveProbe
    probe.mode = value
    if (value === 'delay') probe.ready = new Promise(resolve => { probe.held = resolve })
  }, value)
  const shot = async name => { const path = `${output}/${name}.png`; await page.screenshot({ path }); screenshots.push(path) }
  const trash = () => page.evaluate(async () => ({ counts: await window.goalloom.getCounts(), list: await window.goalloom.listItems({ type: 'list', view: 'trash' }) }))
  const originalTrash = await trash()
  const beforeId = await create('Before the empty detail'), id = await create('Restore this original title'), afterId = await create('After the empty detail')
  const before = await stored(id)
  await open(id); await clear(); await close()
  await dialog.waitFor({ state: 'hidden' })
  await page.locator(`#item-${id}`).waitFor({ state: 'hidden' })
  assert((await stored(id)).deletedAt)
  assert.deepEqual(await trash(), originalTrash, 'Discarded details never enter trash or its count')
  await page.locator('.toast').filter({ hasText: 'Remove empty item' }).waitFor()
  await shot('empty-detail-removed')
  await page.keyboard.press('ControlOrMeta+z')
  await page.locator(`#item-${id}`).waitFor()
  const restored = await stored(id)
  assert.equal(restored.title, before.title); assert.equal(restored.deletedAt, null)
  assert.deepEqual(restored.placement, before.placement)
  assert(restored.version > before.version)
  const order = await page.locator('[data-horizon="day"] .task-row').evaluateAll(rows => rows.map(row => row.id))
  assert(order.indexOf(`item-${beforeId}`) < order.indexOf(`item-${id}`) && order.indexOf(`item-${id}`) < order.indexOf(`item-${afterId}`))
  await page.locator('.toast').filter({ hasText: 'Undone' }).waitFor()
  await shot('empty-detail-restored')
  checks.push('Close removes a title-only todo outside trash; one keyboard undo restores its saved title, identity and exact placement/order')

  await open(id); await edit(); await title.fill('   '); await title.press('Escape'); await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' }); assert((await stored(id)).deletedAt)
  await page.keyboard.press('ControlOrMeta+z'); await page.locator(`#item-${id}`).waitFor()
  await open(id); await clear(); await title.press('ControlOrMeta+z'); await close()
  await dialog.waitFor({ state: 'hidden' }); assert.equal((await stored(id)).deletedAt, null)
  await open(id); await clear(); await title.fill('Rewritten before closing'); await close()
  await dialog.waitFor({ state: 'hidden' }); assert.equal((await stored(id)).title, 'Rewritten before closing')
  checks.push('Whitespace plus Escape closes; native text undo and clearing/retyping before closure retain the todo')

  const guarded = [
    ['description', { description: 'Keep this note' }], ['deadline', { dueDate: '2027-01-01' }], ['flow', { horizon: 'month', flowColor: 7 }],
    ['done', {}, { type: 'status', status: 'done' }], ['cancelled', {}, { type: 'status', status: 'cancelled' }], ['archived', {}, { type: 'archive', archived: true }],
  ]
  const parent = await create('Relation guard parent', { horizon: 'month', flowColor: 6 })
  const child = await create('Relation guard child', { parentId: parent, expectedParentVersion: 1 })
  await execute({ type: 'flowColor', itemId: parent, expectedVersion: (await stored(parent)).version, flowColor: null })
  guarded.push(['parent relation', null, null, child], ['child relation', null, null, parent])
  for (const [name, extra, action, existing] of guarded) {
    const target = existing ?? await create(`Guard ${name}`, extra)
    await open(target)
    if (action) await execute({ ...action, itemId: target, expectedVersion: (await stored(target)).version })
    const committed = await stored(target)
    const rejected = await page.evaluate(async id => {
      const { workspace } = await window.goalloom.getSnapshot(), { item } = await window.goalloom.getItem(id)
      return window.goalloom.execute({ type: 'discardEmpty', itemId: id, expectedVersion: item.version, operationId: crypto.randomUUID(), generation: workspace.generation })
    }, target)
    assert.equal(rejected.ok, false, `Authoritative discard rejects ${name}`)
    assert.deepEqual(await stored(target), committed)
    await clear(); await close(); await dialog.getByRole('alert').waitFor()
    assert.equal(await title.inputValue(), ''); assert.equal((await stored(target)).deletedAt, null)
    await page.keyboard.press('ControlOrMeta+z')
    assert.equal(await title.inputValue(), committed.title)
    await close(); await dialog.waitFor({ state: 'hidden' })
  }
  checks.push('Description, deadline, flow, incoming/outgoing relations and done/cancelled/archived states prevent discard in both renderer and transaction')

  const draftId = await create('Protect the unsaved note')
  await open(draftId)
  await dialog.getByRole('textbox', { name: 'Description', exact: true }).fill('Unsaved content must stay')
  await clear(); await close(); await dialog.getByRole('alert').waitFor()
  assert.equal((await stored(draftId)).deletedAt, null)
  assert.equal(await dialog.getByRole('textbox', { name: 'Description', exact: true }).innerText(), 'Unsaved content must stay')
  await page.keyboard.press('ControlOrMeta+z'); await close(); await dialog.waitFor({ state: 'hidden' })
  assert.equal((await stored(draftId)).description, 'Unsaved content must stay')
  checks.push('Unsaved description content protects the invalid title and drains after title recovery')

  const delayed = await create('Before the delayed title edit')
  await open(delayed); await edit(); await mode('delay'); await title.fill('Latest saved title before clearing')
  await pollPage(page, async id => (await window.goalloom.getItem(id)).item.title === 'Latest saved title before clearing', delayed)
  await app.evaluate(() => globalThis.autosaveProbe.ready)
  await title.press('ControlOrMeta+a'); await title.press('Backspace'); await close()
  assert.equal(await dialog.count(), 1)
  await app.evaluate(() => { globalThis.autosaveProbe.mode = 'normal'; globalThis.autosaveProbe.release() })
  await dialog.waitFor({ state: 'hidden' }); assert((await stored(delayed)).deletedAt)
  await page.keyboard.press('ControlOrMeta+z'); await page.locator(`#item-${delayed}`).waitFor()
  assert.equal((await stored(delayed)).title, 'Latest saved title before clearing')
  checks.push('Closing waits for an in-flight edit and one undo recovers the latest committed title')

  for (const failure of ['failure', 'unknown', 'unknown-before']) {
    const target = await create(`Discard ${failure}`)
    await open(target); await clear(); await mode(failure); await close(); await dialog.getByRole('alert').waitFor()
    assert.equal(await dialog.count(), 1)
    if (failure !== 'unknown') assert.equal((await stored(target)).deletedAt, null)
    if (failure === 'unknown-before') {
      await mode('failure'); await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
      await dialog.getByRole('alert').filter({ hasText: 'Synthetic autosave failure' }).waitFor()
    }
    await mode('normal'); await dialog.getByRole('button', { name: 'Retry', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' }); assert((await stored(target)).deletedAt)
    await page.keyboard.press('ControlOrMeta+z'); await page.locator(`#item-${target}`).waitFor()
    assert.equal((await stored(target)).title, `Discard ${failure}`)
    const activity = await page.evaluate(id => window.goalloom.getActivity({ type: 'activity', itemId: id }), target)
    assert.equal(activity.events.filter(event => event.type === 'deleted').length, 1)
    assert.equal(activity.events.filter(event => event.type === 'undo').length, 1)
  }
  checks.push('Known failure, lost committed receipt and unknown-before-write retry keep the dialog; successful Retry closes with exactly one deletion/undo')

  const race = await create('Concurrent content guard')
  await open(race); await clear(); await mode('add-content'); await close(); await dialog.getByRole('alert').waitFor()
  assert.equal((await stored(race)).deletedAt, null)
  assert.equal((await stored(race)).description, 'Concurrent note must survive')
  await mode('normal'); await page.keyboard.press('ControlOrMeta+z'); await close(); await dialog.waitFor({ state: 'hidden' })
  assert.equal((await stored(race)).description, 'Concurrent note must survive')
  checks.push('Content added between preparation and execution makes discard fail atomically and survives title recovery')

  const ordinary = await create('Regular deletion still uses trash')
  await execute({ type: 'delete', itemId: ordinary, expectedVersion: 1 })
  assert.equal((await trash()).counts.trash, originalTrash.counts.trash + 1)
  assert((await trash()).list.items.some(item => item.id === ordinary))
  const normalDeleted = await stored(ordinary)
  await execute({ type: 'restoreItem', itemId: ordinary, expectedVersion: normalDeleted.version })
  const finalTrash = await trash()
  assert.equal(finalTrash.counts.trash, originalTrash.counts.trash)
  assert.deepEqual(finalTrash.list, originalTrash.list)
  await page.locator('.toast').getByRole('button', { name: 'Dismiss notification', exact: true }).click()
  checks.push('Ordinary deletion/restore retains existing trash behavior')
  return { checks, screenshots }
}
