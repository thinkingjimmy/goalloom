/**
 * [INPUT]: Isolated native Electron page and production history fixture identities.
 * [OUTPUT]: Live past-task editing, focus, undo, immutable-history, paging and query-boundary evidence.
 * [POS]: History acceptance scenarios using real UI commands and the validated production bridge.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { finishDetailEditing } from './detail-save.mjs'
import assert from 'node:assert/strict'
import { pollPage } from './poll.mjs'

const detail = page => page.getByRole('dialog', { name: '当前条目', exact: true })
const item = (page, id) => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
const settle = async column => column.page().waitForFunction(horizon => document.querySelector(`[data-horizon="${horizon}"]`)?.getAttribute('aria-busy') === 'false', await column.getAttribute('data-horizon'))
const dismiss = async page => { if (await page.locator('.toast').count()) await page.getByRole('button', { name: '关闭操作提示', exact: true }).click() }
const outcome = async (page, column, id, expected) => {
  await page.waitForFunction(({ id, expected }) => document.getElementById(`item-${id}`)?.dataset.outcome === expected, { id, expected })
  await settle(column)
}
const focusOn = async (page, id) => page.waitForFunction(id => document.querySelector(`#item-${id} [data-state-action]`) === document.activeElement, id)
const closeDetail = async page => detail(page).getByRole('button', { name: '关闭', exact: true }).click()
const move = async (page, column, id, destination) => {
  await column.locator(`#item-${id} .task-title`).click()
  await detail(page).locator('.placement-chip').click()
  await page.getByRole('menuitemradio', { name: destination, exact: true }).click()
  await column.locator(`#item-${id}`).waitFor({ state: 'detached' })
  await closeDetail(page)
  await settle(column)
}

export async function verifyPastPaging(page, column) {
  const ids = await column.locator('.past-period-row').evaluateAll(rows => rows.map(row => row.dataset.itemId))
  assert.equal(ids.length, 5)
  for (const id of ids) await move(page, column, id, 'Later')
  assert.equal(await column.locator('.past-period-row').count(), 50, 'Removing the last page returns to an available page')
  assert.equal(await column.locator('.pagination').count(), 0)
  for (const [index] of ids.entries()) {
    await page.keyboard.press('ControlOrMeta+z')
    await page.waitForFunction(total => document.querySelector('[data-horizon="day"] .pagination')?.textContent.includes(`1–50/${total}`), 51 + index)
    await settle(column)
    await dismiss(page)
  }
  const screenshot = 'output/tests/screenshots/past-task-pagination.png'
  await column.screenshot({ path: screenshot })
  return { moved: ids.length, restoredTotal: 55, offsetAfterUndo: 0, screenshot }
}

export async function verifyPastEditing(page, column, fixture) {
  const row = id => column.locator(`#item-${id}`)
  const original = await item(page, fixture.waitingId)
  const projected = () => page.evaluate(async startDate => (await window.goalloom.getHistory({ type: 'history', horizon: 'month', startDate, offset: 0, limit: 100 })).rows.map(row => ({ id: row.item.id, endState: row.endState, outcome: row.outcome })), fixture.sourceDate)
  const before = await projected(), startedAt = Date.now()
  await row(fixture.waitingId).locator('button.check').click()
  await outcome(page, column, fixture.waitingId, 'done')
  await focusOn(page, fixture.waitingId)
  const completed = await item(page, fixture.waitingId)
  assert(Date.parse(completed.completedAt) >= startedAt, 'Completion records the real action time')
  assert.equal(completed.placement.periodId, original.placement.periodId)
  assert.equal(await page.locator('.toast').count(), 0, 'Completing a past task stays quiet')
  await page.keyboard.press('ControlOrMeta+z')
  await outcome(page, column, fixture.waitingId, 'open')
  assert((await item(page, fixture.waitingId)).placement.holdPeriodId, 'Undo retains the expired-period hold')
  await dismiss(page)
  await row(fixture.waitingId).locator('button.check').click()
  await outcome(page, column, fixture.waitingId, 'done')
  await focusOn(page, fixture.waitingId)
  await page.keyboard.press('Enter')
  await outcome(page, column, fixture.waitingId, 'open')
  await focusOn(page, fixture.waitingId)
  assert.equal(await page.locator('.toast').count(), 0, 'Reopening a visible past task stays quiet')

  await row(fixture.finishedId).locator('.task-title').click()
  await detail(page).getByRole('button', { name: '编辑标题', exact: true }).click()
  await detail(page).getByRole('textbox', { name: '标题', exact: true }).fill('Edited past task')
  await detail(page).getByRole('textbox', { name: '说明', exact: true }).fill('Saved after the original period ended.')
  await finishDetailEditing(page)
  await pollPage(page, async id => (await window.goalloom.getItem(id)).item.title === 'Edited past task', fixture.finishedId)
  await closeDetail(page)
  await row(fixture.finishedId).getByRole('button', { name: 'Edited past task', exact: true }).waitFor()
  await row(fixture.finishedId).locator('.task-title').click()
  page.once('dialog', dialog => dialog.accept())
  await detail(page).locator('.detail-rail-actions').getByRole('button', { name: '删除', exact: true }).click()
  await detail(page).waitFor({ state: 'hidden' })
  await outcome(page, column, fixture.finishedId, 'deleted')
  assert.equal((await item(page, fixture.finishedId)).placement.periodId, original.placement.periodId)
  await dismiss(page)
  await row(fixture.finishedId).getByRole('button', { name: '还原', exact: true }).click()
  await outcome(page, column, fixture.finishedId, 'done')
  await focusOn(page, fixture.finishedId)
  await page.locator('.toast-detail').filter({ hasText: '往期' }).waitFor()
  assert(!/当前视图未显示/.test(await page.locator('.toast-detail').innerText()))
  const restored = await item(page, fixture.finishedId)
  assert.equal(restored.title, 'Edited past task')
  assert.equal(restored.description, 'Saved after the original period ended.')
  await dismiss(page)
  const screenshot = 'output/tests/screenshots/past-tasks-edited.png'
  await column.locator('.past-period-rows').screenshot({ path: screenshot })
  await move(page, column, fixture.finishedId, '本月')
  assert.equal(await row(fixture.finishedId).count(), 0)
  await page.keyboard.press('ControlOrMeta+z')
  await outcome(page, column, fixture.finishedId, 'done')
  await dismiss(page)
  assert.deepEqual(await projected(), before, 'Task actions never rewrite the original period-end states')

  const boundaries = await page.evaluate(async ({ id, startDate }) => {
    const snapshot = await window.goalloom.getSnapshot(), generation = snapshot.workspace.generation
    const command = async action => window.goalloom.execute({ ...action, generation, operationId: crypto.randomUUID() })
    const before = (await window.goalloom.getItem(id)).item
    await command({ type: 'edit', itemId: id, expectedVersion: before.version, title: 'Concurrent past edit', description: before.description, dueDate: before.dueDate })
    const revision = (await window.goalloom.getSnapshot()).workspace.revision
    const rejected = await command({ type: 'status', itemId: id, expectedVersion: before.version, status: 'done' })
    const current = (await window.goalloom.getItem(id)).item
    const rejectedRevision = (await window.goalloom.getSnapshot()).workspace.revision
    await command({ type: 'edit', itemId: id, expectedVersion: current.version, title: before.title, description: current.description, dueDate: current.dueDate })
    const query = { type: 'pastPeriod', generation, horizon: 'month', startDate, offset: 0, limit: 50 }
    const rejects = async query => { try { await window.goalloom.getPastPeriod(query); return false } catch { return true } }
    return { stale: !rejected.ok && rejected.code === 'stale', unchanged: current.status === before.status && revision === rejectedRevision,
      generation: await rejects({ ...query, generation: crypto.randomUUID() }),
      currentPeriod: await rejects({ ...query, startDate: snapshot.periods.find(period => period.horizon === 'month').startDate }),
      unknownField: await rejects({ ...query, sql: 'SELECT 1' }) }
  }, { id: fixture.waitingId, startDate: fixture.sourceDate })
  assert(Object.values(boundaries).every(Boolean), JSON.stringify(boundaries))
  await row(fixture.waitingId).getByRole('button', { name: original.title, exact: true }).waitFor()
  const activity = await page.evaluate(id => window.goalloom.getActivity({ type: 'activity', itemId: id, limit: 50 }), fixture.waitingId)
  assert(activity.events.some(event => event.type === 'status_changed' && event.after.status === 'done' && Date.parse(event.at) >= startedAt))
  return { completedAt: completed.completedAt, periodId: original.placement.periodId, boundaries, screenshot,
    checks: ['complete/reopen with focus and silent feedback', 'real completion time and immutable end states', 'edit/delete/inline restore preserves content', 'move removes the source; undo restores membership', 'stale-version and invalid query guards'] }
}
