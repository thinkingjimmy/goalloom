/**
 * [INPUT]: Native Electron page, production IPC and isolated ordering evidence.
 * [OUTPUT]: Repeatable adjacent-row edge drops, exact insertion previews, cancellation and undo evidence.
 * [POS]: Shared pointer-sorting regression for the ordering journey; uses synthetic tasks only.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pollPage } from './poll.mjs'

export async function edgeSorting({ page, report, evidence }) {
  const execute = action => page.evaluate(async action => {
    const snapshot = await window.goalloom.getSnapshot()
    const reply = await window.goalloom.execute({ ...action, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
    return reply.result
  }, action)
  const ids = []
  for (let index = 1; index <= 4; index++) ids.push((await execute({ type: 'create', title: `Edge task ${index}`, horizon: 'day' })).itemId)
  const row = id => page.locator(`#item-${id}`)
  const saved = () => page.evaluate(async ids => (await window.goalloom.getSnapshot()).items.filter(item => ids.includes(item.id)), ids)
  const order = async expected => {
    await pollPage(page, async expected => {
      const snapshot = await window.goalloom.getSnapshot()
      return JSON.stringify(snapshot.items.filter(item => expected.includes(item.id)).map(item => item.id)) === JSON.stringify(expected)
    }, expected)
    await page.waitForFunction(expected => JSON.stringify([...document.querySelectorAll('[data-horizon="day"] .task-row')].map(row => row.dataset.itemId).filter(id => expected.includes(id))) === JSON.stringify(expected), expected)
    await page.waitForFunction(() => !document.documentElement.dataset.dragging && !document.querySelector('.fab').disabled)
  }
  const shot = async name => {
    const path = join(evidence, `edge-${name}.png`)
    await page.screenshot({ path }); report.screenshots.push(path)
  }
  const openSettings = async () => {
    await page.getByRole('button', { name: '设置与数据', exact: true }).click()
    const settings = page.locator('dialog.settings-modal')
    await settings.getByRole('button', { name: '看板', exact: true }).click()
    return settings
  }
  const begin = async (sourceId, targetId, position, right = false) => {
    await row(sourceId).scrollIntoViewIfNeeded(); await row(targetId).scrollIntoViewIfNeeded()
    await row(sourceId).locator('.task-title').focus()
    const source = await row(sourceId).locator('.task-title').boundingBox()
    await page.mouse.move(source.x + 12, source.y + 10); await page.mouse.down()
    await page.mouse.move(source.x + 24, source.y + 10)
    await page.locator('.drag-overlay').waitFor()
    const target = await row(targetId).boundingBox()
    await page.mouse.move(right ? target.x + target.width - 12 : target.x + 100, position === 'before' ? target.y + 3 : target.y + target.height - 3, { steps: 12 })
  }
  report.edgeSorting = []
  const cases = [
    { name: 'second-below-third', source: 1, target: 2, position: 'after', marker: 3, expected: [0, 2, 1, 3] },
    { name: 'second-above-third', source: 1, target: 2, position: 'before', marker: 2, expected: [0, 1, 2, 3] },
    { name: 'third-below-second', source: 2, target: 1, position: 'after', marker: 3, expected: [0, 1, 2, 3] },
    { name: 'second-below-last', source: 1, target: 3, position: 'after', marker: 3, markerPosition: 'after', expected: [0, 2, 3, 1] },
    { name: 'last-above-second', source: 3, target: 1, position: 'before', marker: 1, expected: [0, 3, 1, 2] },
    { name: 'right-edge-below-third', source: 1, target: 2, position: 'after', marker: 3, right: true, expected: [0, 2, 1, 3] },
  ]
  for (const parentOrder of [false, true]) {
    if (parentOrder) {
      const settings = await openSettings()
      await settings.getByRole('switch', { name: '按上级自动放置', exact: true }).click()
      await settings.getByRole('button', { name: '关闭', exact: true }).click()
    }
    await order(ids)
    for (const test of cases) {
      const before = await saved()
      await begin(ids[test.source], ids[test.target], test.position, test.right)
      assert.equal(await page.locator('[data-nesting-target]').count(), 0, 'Row edges must not nest')
      await row(ids[test.marker]).locator(`:scope[data-sort-position="${test.markerPosition ?? 'before'}"]`).waitFor()
      assert.equal(await page.locator('[data-sort-position]').count(), 1, 'One insertion line describes the drop')
      if (test.name === 'second-below-third') await shot(`${parentOrder ? 'auto' : 'manual'}-preview`)
      await page.mouse.up()
      const expected = test.expected.map(index => ids[index])
      await order(expected)
      assert.equal(await page.locator('[data-sort-position], [data-nesting-target]').count(), 0, 'Dropping clears all previews')
      const after = await saved()
      assert(after.every(item => !item.placement.nestingParentId && item.status === 'todo'), 'Sorting keeps tasks independent and unfinished')
      report.edgeSorting.push({ name: test.name, parentOrder, expected, actual: after.map(item => item.id) })
      if (expected.some((id, index) => id !== ids[index])) {
        if (test.name === 'second-below-third') await shot(`${parentOrder ? 'auto' : 'manual'}-reordered`)
        await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')
        await order(ids)
      } else assert.deepEqual(after, before, 'An unchanged insertion must not write task data')
    }
    const beforeCancel = await saved()
    await begin(ids[1], ids[2], 'after')
    await row(ids[3]).locator(':scope[data-sort-position="before"]').waitFor()
    await page.keyboard.press('Escape'); await page.mouse.up()
    await page.locator('.drag-overlay').waitFor({ state: 'detached' })
    assert.equal(await page.locator('[data-sort-position], [data-nesting-target]').count(), 0)
    assert.deepEqual(await saved(), beforeCancel)
    await page.reload(); await page.locator('.board').waitFor()
    await order(ids)
  }
  const settings = await openSettings()
  await settings.getByRole('switch', { name: '按上级自动放置', exact: true }).click()
  await settings.getByRole('button', { name: '关闭', exact: true }).click()
  for (const item of await saved()) await execute({ type: 'delete', itemId: item.id, expectedVersion: item.version })
  await page.waitForFunction(ids => ids.every(id => !document.getElementById(`item-${id}`)), ids)
  report.checks.push('Pointer edge sorting matches its insertion line in both ordering modes: adjacent up/down, unchanged slots, list end, right edge, cancellation, one-step undo and reload persistence')
}
