/**
 * [INPUT]: The real insight Electron page, its seeded two-flow board and an empty today column.
 * [OUTPUT]: Highlighted-chain gap controls across ancestor/sibling switching, hover/focus/creation assertions, measured endpoint bounds and screenshots.
 * [POS]: Insight acceptance fixture; uses native controls and authoritative IPC, restoring its temporary child and extra parent.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { stepPeriod } from './period-step.mjs'
import { join } from 'node:path'
import { pollPage } from './poll.mjs'

export async function verifyPreviewBreakpoints(page, out, ids) {
  const board = page.locator('.board'), row = page.locator(`#item-${ids.week}`)
  const dot = row.locator('.flow-dot-button'), plus = board.locator(`.breakpoint[data-spot-key="gap:${ids.week}"]`)
  const all = page.getByRole('button', { name: '全部', exact: true })
  const screenshot = join(out, 'hover-preview-gap.png')
  const expectGaps = async (...parents) => {
    const keys = parents.map(id => `gap:${id}`).sort()
    for (const key of keys) await board.locator(`.breakpoint[data-spot-key="${key}"]`).waitFor()
    const actions = await board.locator('.breakpoint').evaluateAll(nodes => nodes.map(node => {
      const row = document.getElementById(`item-${node.dataset.spotKey.slice(4)}`)
      return { key: node.dataset.spotKey, highlighted: row.dataset.chainOut !== 'true' && row.dataset.dimmed !== 'true' }
    }))
    assert.deepEqual(actions.map(action => action.key).sort(), keys, 'Every highlighted gap has one action; faded branches have none')
    assert(actions.every(action => action.highlighted), 'Actions belong to highlighted rows')
    return actions
  }
  const preview = async () => { await row.locator('.task-title').hover(); await dot.hover(); await plus.waitFor() }
  const leave = async () => {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await all.hover()
    await page.waitForFunction(() => !document.querySelector('.relation-lines, .breakpoint'))
  }
  const showLater = async wanted => {
    const toggle = page.locator('#later-toggle')
    if ((await toggle.getAttribute('aria-expanded') === 'true') !== wanted) await toggle.click()
  }
  await showLater(false)
  await preview()
  await expectGaps(ids.week)
  assert.equal(await plus.count(), 1, 'An empty today column still allows a weekly next step')
  assert.equal(await board.locator('.breakpoint-guide').count(), 1, 'The first preview shows the one-time guide')
  await page.screenshot({ path: join(out, 'hover-preview-guide.png') })
  await board.getByRole('button', { name: '知道了' }).click()
  assert.equal(await board.locator('.breakpoint-guide').count(), 0)
  await preview()
  assert.equal(await board.locator(`[data-spot-key="gap:${ids.month}"]`).count(), 0, 'Connected parents do not offer a gap')
  assert.equal(await board.locator(`[data-spot-key="gap:${ids.otherMonth}"]`).count(), 0, 'Unrelated flows do not get preview controls')
  const geometry = await plus.evaluate(node => {
    const row = document.getElementById(`item-${node.dataset.spotKey.slice(4)}`).getBoundingClientRect(), button = node.getBoundingClientRect()
    return { xError: Math.abs(button.right - (row.right - 6)), yError: Math.abs(button.top + button.height / 2 - row.top - 16) }
  })
  assert(geometry.xError < 0.5 && geometry.yError < 0.5)
  await row.locator('.task-title').hover()
  // Deliberately exceed the 120ms exit grace while crossing the row, then while resting on the action.
  await page.waitForTimeout(180)
  assert.equal(await plus.isVisible(), true)
  await plus.hover()
  await page.waitForTimeout(180)
  assert.equal(await plus.isVisible(), true)
  await page.screenshot({ path: screenshot })
  await leave()

  // The dot's ancestor/descendant chain owns the actions; siblings join only when their common ancestor is previewed.
  await preview()
  await page.locator(`#item-${ids.sibling} .flow-dot-button`).hover()
  await expectGaps(ids.sibling)
  await page.screenshot({ path: join(out, 'hover-preview-sibling.png') })
  await dot.hover()
  await expectGaps(ids.week)
  await page.locator(`#item-${ids.month} .flow-dot-button`).hover()
  const monthlyPreview = await expectGaps(ids.week)
  await page.screenshot({ path: join(out, 'hover-preview-month-chain.png'), animations: 'disabled' })
  await page.locator(`#item-${ids.root} .flow-dot-button`).hover()
  const rootPreview = await expectGaps(ids.week, ids.sibling)
  await page.screenshot({ path: join(out, 'hover-preview-multiple-leaves.png'), animations: 'disabled' })
  await page.locator(`#item-${ids.month} .flow-dot-button`).hover()
  await expectGaps(ids.week)
  await leave()

  // Two inherited flows must still render just one next-step control on their shared leaf.
  const link = async remove => page.evaluate(async ({ ids, remove }) => {
    const s = await window.goalloom.getSnapshot()
    const expectedParentVersion = s.items.find(item => item.id === ids.otherMonth).version
    const expectedChildVersion = s.items.find(item => item.id === ids.week).version
    const edge = s.relations.find(edge => edge.parentId === ids.otherMonth && edge.childId === ids.week)
    const command = remove ? { type: 'unlink', relationId: edge.id } : { type: 'link', parentId: ids.otherMonth, childId: ids.week }
    const reply = await window.goalloom.execute({ ...command, expectedParentVersion, expectedChildVersion, generation: s.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw Error(reply.message)
  }, { ids, remove })
  await link(false)
  await preview()
  await expectGaps(ids.week)
  assert.match(await dot.getAttribute('aria-label'), /全网粉丝达到 5w\+/)
  assert.match(await dot.getAttribute('aria-label'), /副业收入提升到 \$5k/)
  await page.locator(`#item-${ids.otherMonth} .flow-dot-button`).hover()
  await expectGaps(ids.week)
  await page.locator(`#item-${ids.otherRoot} .flow-dot-button`).hover()
  const mixedPreview = await expectGaps(ids.week, ids.otherSiblingMonth)
  await page.screenshot({ path: join(out, 'hover-preview-mixed-horizons.png'), animations: 'disabled' })
  await leave()
  await link(true)

  const today = board.locator('[data-horizon="day"]')
  await stepPeriod(today, 'next')
  await dot.hover()
  assert.equal(await plus.count(), 0, 'A future destination does not offer a current-period shortcut')
  await all.hover()
  await today.locator('[data-return-current]').click()
  await leave()

  // Keyboard focus can travel from the flow dot to the same visible action.
  await row.locator('.drag-handle').focus()
  await page.keyboard.press('Shift+Tab')
  assert.equal(await dot.evaluate(node => node === document.activeElement && node.matches(':focus-visible')), true)
  await plus.waitFor()
  await expectGaps(ids.week)
  await plus.focus()
  await page.waitForTimeout(180)
  assert.equal(await plus.evaluate(node => node === document.activeElement), true)
  await plus.press('Enter')
  const composer = page.getByRole('dialog', { name: '新建', exact: true })
  await composer.waitFor()
  assert.equal(await composer.locator('.seed-chip').filter({ hasText: ids.weekTitle }).count(), 1)
  await page.keyboard.press('Escape')
  await composer.waitFor({ state: 'hidden' })
  await leave()

  await page.locator(`#item-${ids.month} .flow-dot-button`).hover()
  await expectGaps(ids.week)
  await plus.click()
  await composer.waitFor()
  assert.equal(await composer.locator('.seed-chip').filter({ hasText: ids.weekTitle }).count(), 1, 'A descendant action uses its own task as parent')
  await composer.getByRole('textbox').fill('Preview next step')
  await composer.getByRole('textbox').press('Enter')
  await composer.waitFor({ state: 'hidden' })
  const created = await page.evaluate(async parent => {
    const s = await window.goalloom.getSnapshot(), item = s.items.find(item => item.title === 'Preview next step')
    return { id: item?.id, horizon: item?.placement.horizon, period: item?.placement.periodId,
      today: s.periods.find(period => period.horizon === 'day').id,
      linked: s.relations.some(edge => edge.parentId === parent && edge.childId === item?.id) }
  }, ids.week)
  assert(created.id && created.linked)
  assert.equal(created.horizon, 'day')
  assert.equal(created.period, created.today)
  await dot.hover()
  assert.equal(await plus.count(), 0, 'Creating a child removes its parent gap')
  const child = page.locator(`#item-${created.id}`)
  await child.locator('.flow-dot-button').hover()
  assert.equal(await board.locator(`[data-spot-key="gap:${created.id}"]`).count(), 0, 'Today is the terminal horizon')
  await page.keyboard.press('ControlOrMeta+z')
  await pollPage(page, id => window.goalloom.getSnapshot().then(s => !s.items.some(item => item.id === id)), created.id)
  await preview()
  await leave()
  await showLater(true)
  return { geometry, screenshot, monthlyPreview, rootPreview, mixedPreview, created, checks: ['highlighted chain only', 'same-flow sibling switching', 'monthly preview exposes weekly leaf', 'all highlighted leaves have actions', 'mixed-horizon leaves', 'faded branches excluded', 'empty target', 'row and action hover retention', 'clean preview exit', 'multi-flow deduplication', 'non-current target guard', 'keyboard activation', 'descendant action creates under its own parent', 'linked current-day creation', 'terminal horizon', 'undo restores gap'] }
}
