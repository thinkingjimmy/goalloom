/**
 * [INPUT]: Native Electron page with an isolated workspace and the current Chinese locale.
 * [OUTPUT]: Direct outline-line geometry, real cross-column dragging, owner navigation and repeatable screenshots.
 * [POS]: Subtask E2E UI extension; selected with --ownership or included in the complete subtask feature run.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pollPage } from './poll.mjs'

export async function subtaskOwnershipUI({ page, report, evidence }) {
  if (await page.locator('#later-toggle').getAttribute('aria-expanded') === 'false') await page.locator('#later-toggle').click()
  await page.locator('#column-toggle').click()
  for (const horizon of ['year', 'half', 'month']) {
    const choice = page.locator(`[data-column-choice="${horizon}"]`)
    if (await choice.getAttribute('aria-checked') === 'true') await choice.click()
  }
  await page.keyboard.press('Escape')
  const ids = await page.evaluate(async () => {
    const snapshot = await window.goalloom.getSnapshot(), generation = snapshot.workspace.generation
    const run = async action => {
      const result = await window.goalloom.execute({ generation, operationId: crypto.randomUUID(), ...action })
      if (!result.ok) throw Error(result.message)
      return result.result
    }
    const first = horizon => snapshot.items.find(item => item.placement.horizon === horizon && !item.placement.nestingParentId)?.id ?? null
    const goal = (await run({ type: 'create', title: 'Ownership visual flow', horizon: 'cycle', flowColor: 7, beforeId: first('cycle') })).itemId
    const parent = (await run({ type: 'create', title: '完成 Goalloom 2.0 开发', horizon: 'week', parentId: goal, expectedParentVersion: (await window.goalloom.getItem(goal)).item.version, beforeId: first('week') })).itemId
    const owner = (await window.goalloom.getItem(parent)).item
    const child = (await run({ type: 'create', title: '给 Goalloom 制作一个宣传视频', horizon: 'week', nesting: { parentId: parent, expectedParentVersion: owner.version, expectedParentPlacementVersion: owner.placement.version } })).itemId
    const neighbor = (await run({ type: 'create', title: 'Today placement target', horizon: 'day', parentId: goal, expectedParentVersion: (await window.goalloom.getItem(goal)).item.version, beforeId: first('day') })).itemId
    return { goal, parent, child, neighbor }
  })
  await page.locator('.flow-filter').getByRole('button', { name: /Ownership visual flow/ }).click()
  await page.locator('.column-content').evaluateAll(nodes => nodes.forEach(node => { node.scrollTop = 0 }))
  const row = id => page.locator(`#item-${id}`)
  await row(ids.parent).waitFor(); await row(ids.child).waitFor(); await row(ids.neighbor).waitFor()
  const line = page.locator(`[data-edge-id="nest/${ids.child}"]`)
  await line.waitFor()
  await page.waitForFunction(id => document.querySelector(`[data-edge-id="nest/${id}"]`)?.getAttribute('d')?.length > 5, ids.child)
  assert.equal(await row(ids.child).getAttribute('data-nested'), 'true')
  const samePeriodGeometry = await line.evaluate(path => {
    const box = path.getBBox()
    return { d: path.getAttribute('d'), width: box.width, height: box.height }
  })
  assert(samePeriodGeometry.width > 0 && samePeriodGeometry.width <= 25, 'Local ownership line stays in the 24px indentation gutter')
  assert.equal(await page.locator('[data-edge-id^="inherit:"]').count(), 0)
  assert.equal(await row(ids.parent).locator('.breakpoint').count(), 0, 'An owned current child covers its parent without an extra next-step prompt')
  const guide = page.locator('.breakpoint-guide')
  if (await guide.count()) await guide.getByRole('button').click()
  const same = join(evidence, 'ownership-same-period.png')
  await page.screenshot({ path: same }); report.screenshots.push(same)
  const source = await row(ids.child).boundingBox()
  await row(ids.child).locator('.task-title').focus()
  await page.mouse.move(source.x + 95, source.y + 16); await page.mouse.down()
  await page.mouse.move(source.x + 105, source.y + 16)
  await page.locator('.drag-overlay').waitFor()
  const target = await row(ids.neighbor).boundingBox()
  await page.mouse.move(target.x + 100, target.y + 2, { steps: 12 })
  await row(ids.neighbor).locator(':scope[data-sort-position="before"]').waitFor()
  await page.mouse.up()
  await pollPage(page, async value => {
    const child = (await window.goalloom.getItem(value.child)).item
    return child.placement.horizon === 'day' && child.placement.nestingParentId === value.parent
  }, ids)
  await row(ids.child).locator('.task-parent-link').waitFor()
  assert.equal(await row(ids.child).getAttribute('data-nested'), 'false')
  assert.equal(await page.locator(`[data-horizon="day"] #item-${ids.parent}`).count(), 0)
  await line.waitFor()
  const cross = join(evidence, 'ownership-cross-period.png')
  await page.screenshot({ path: cross }); report.screenshots.push(cross)
  await row(ids.child).locator('.task-parent-link').click()
  const detail = page.getByRole('dialog', { name: '当前条目', exact: true })
  await detail.waitFor()
  assert.equal(await detail.locator('.detail-title-display').innerText(), '完成 Goalloom 2.0 开发')
  await detail.getByRole('button', { name: '关闭', exact: true }).click()
  await detail.waitFor({ state: 'detached' })
  const returning = await row(ids.child).boundingBox(), parent = await row(ids.parent).boundingBox()
  await page.mouse.move(returning.x + 95, returning.y + 16); await page.mouse.down()
  await page.mouse.move(returning.x + 105, returning.y + 16)
  await page.locator('.drag-overlay').waitFor()
  await page.mouse.move(parent.x + 100, parent.y + 16, { steps: 12 })
  await row(ids.parent).locator(':scope[data-sort-position="after"][data-sort-nested="true"]').waitFor()
  await page.mouse.up()
  await pollPage(page, async value => {
    const child = (await window.goalloom.getItem(value.child)).item, parent = (await window.goalloom.getItem(value.parent)).item
    return child.placement.nestingParentId === parent.id && child.placement.horizon === parent.placement.horizon && child.placement.periodId === parent.placement.periodId
  }, ids)
  await row(ids.child).locator(':scope[data-nested="true"]').waitFor()
  assert.equal(await row(ids.child).locator('.task-parent-link').count(), 0)
  await page.evaluate(async value => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation, parent = (await window.goalloom.getItem(value.parent)).item
    const reply = await window.goalloom.execute({ type: 'archive', itemId: parent.id, expectedVersion: parent.version, archived: true, generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
  }, ids)
  await row(ids.parent).locator(':scope.nesting-context').waitFor()
  await line.waitFor()
  await page.waitForFunction(id => document.querySelector(`[data-port-key^="${id}:"]`), ids.parent)
  await page.evaluate(async value => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation, parent = (await window.goalloom.getItem(value.parent)).item
    const reply = await window.goalloom.execute({ type: 'status', itemId: parent.id, expectedVersion: parent.version, status: 'done', generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
  }, ids)
  await page.mouse.move(700, 20)
  await page.waitForFunction(id => document.querySelector(`[data-edge-id="nest/${id}"]`)?.dataset.state === 'done', ids.child)
  assert.equal((await page.evaluate(id => window.goalloom.getItem(id), ids.child)).item.status, 'todo')
  const archived = join(evidence, 'ownership-archived-parent.png')
  await page.screenshot({ path: archived }); report.screenshots.push(archived)
  await page.evaluate(async value => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation, child = (await window.goalloom.getItem(value.child)).item
    const reply = await window.goalloom.execute({ type: 'move', itemId: child.id, expectedVersion: child.version, expectedPlacementVersion: child.placement.version,
      horizon: 'day', beforeId: value.neighbor, generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
  }, ids)
  await row(ids.child).locator('.task-parent-link').waitFor()
  await page.locator('#column-toggle').click()
  await page.locator('[data-column-choice="week"]').click()
  await page.keyboard.press('Escape')
  await page.waitForFunction(id => !document.querySelector(`[data-edge-id="nest/${id}"]`), ids.child)
  assert.equal(await row(ids.child).locator('.task-parent-link').innerText(), '所属任务： 完成 Goalloom 2.0 开发')
  const laterChild = await page.evaluate(async value => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation, goal = (await window.goalloom.getItem(value.goal)).item
    const moved = await window.goalloom.execute({ type: 'move', itemId: goal.id, expectedVersion: goal.version, expectedPlacementVersion: goal.placement.version,
      horizon: 'later', generation, operationId: crypto.randomUUID() })
    if (!moved.ok) throw Error(moved.message)
    const parent = (await window.goalloom.getItem(goal.id)).item
    const created = await window.goalloom.execute({ type: 'create', title: 'Later local outline stays colorless', horizon: 'later',
      nesting: { parentId: parent.id, expectedParentVersion: parent.version, expectedParentPlacementVersion: parent.placement.version }, generation, operationId: crypto.randomUUID() })
    if (!created.ok) throw Error(created.message)
    return created.result.itemId
  }, ids)
  await page.locator('[data-horizon="later"] .column-content').evaluate(node => { node.scrollTop = node.scrollHeight })
  await row(laterChild).waitFor()
  assert.equal(await row(laterChild).getAttribute('data-nested'), 'true')
  assert.equal(await row(laterChild).getAttribute('data-lit'), null)
  assert.equal(await row(laterChild).locator('.flow-dot-button').count(), 0)
  assert.equal(await page.locator(`[data-edge-id="nest/${laterChild}"]`).count(), 0)
  report.ownership = { ids, samePeriodGeometry }
  report.checks.push('Native direct gutter line, cross-column ownership, unindented destination, parent navigation, own-group return, archived context anchors and hidden-parent links without phantom endpoints')
}
