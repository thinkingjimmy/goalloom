/**
 * [INPUT]: The real insight Electron page, its seeded two-flow board and an empty today column.
 * [OUTPUT]: Highlighted-chain gap/skip controls across ancestor/sibling switching, scoped bridge labels/writes, hover/focus/undo assertions, measured endpoint bounds and screenshots.
 * [POS]: Insight acceptance fixture; uses native controls and authoritative IPC, restoring its temporary children and extra parent.
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
  const skipPreview = await verifySkipPreview(page, out, ids)
  await showLater(true)
  return { geometry, screenshot, monthlyPreview, rootPreview, mixedPreview, created, skipPreview, checks: ['highlighted chain only', 'same-flow sibling switching', 'monthly preview exposes weekly leaf', 'all highlighted leaves have actions', 'mixed-horizon leaves', 'faded branches excluded', 'empty target', 'row and action hover retention', 'clean preview exit', 'multi-flow deduplication', 'non-current target guard', 'keyboard activation', 'descendant action creates under its own parent', 'linked current-day creation', 'terminal horizon', 'undo restores gap', ...skipPreview.checks] }
}

async function verifySkipPreview(page, out, ids) {
  const board = page.locator('.board'), all = page.getByRole('button', { name: '全部', exact: true })
  const skip = board.locator(`.breakpoint[data-spot-key="skip:${ids.month}"]`)
  const weeklyGap = board.locator(`.breakpoint[data-spot-key="gap:${ids.week}"]`)
  const dot = id => page.locator(`#item-${id} .flow-dot-button`)
  const children = await page.evaluate(async parentId => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation, children = []
    for (let index = 1; index <= 9; index++) {
      const parent = (await window.goalloom.getItem(parentId)).item
      const reply = await window.goalloom.execute({ type: 'create', title: `Preview direct task ${index}`, horizon: 'day', parentId,
        expectedParentVersion: parent.version, generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
      children.push(reply.result.itemId)
    }
    const snapshot = await window.goalloom.getSnapshot()
    return snapshot.relations.filter(edge => edge.parentId === parentId && children.includes(edge.childId)).map(edge => edge.childId)
  }, ids.month)
  await dot(children.at(-1)).waitFor()
  const labels = []
  const expectSkip = async (count, state) => {
    await skip.waitFor()
    await pollPage(page, ({ parent, count }) => document.querySelector(`.breakpoint[data-spot-key="skip:${parent}"]`)?.getAttribute('aria-label')?.includes(`今天 ${count} 项`), { parent: ids.month, count })
    const label = await skip.getAttribute('aria-label')
    assert(label.includes(`今天 ${count} 项`), `${state}: the bridge label counts only the selected children: ${label}`)
    labels.push({ state, count, label })
  }
  const shot = name => page.screenshot({ path: join(out, `skip-preview-${name}.png`), animations: 'disabled' })

  await dot(ids.week).hover()
  await weeklyGap.waitFor()
  assert.equal(await skip.count(), 0, 'A month → week preview excludes direct day siblings outside its highlighted chain')
  await shot('no-skip-week')

  await dot(ids.month).hover()
  await expectSkip(8, 'month preview')
  await shot('month')
  await dot(ids.root).hover()
  await expectSkip(8, 'root preview')

  const rootTitle = await page.evaluate(async id => (await window.goalloom.getItem(id)).item.title, ids.root)
  const filter = page.getByRole('button', { name: `只看 ${rootTitle}`, exact: true })
  await filter.click()
  await all.hover()
  await page.waitForFunction(() => !document.querySelector('.task-row[data-chain-out="true"]'))
  await expectSkip(8, 'filtered overview')
  await shot('overview')
  await all.click()
  await skip.waitFor({ state: 'detached' })

  // The ninth child proves chain filtering happens before the overview's eight-child limit.
  const selected = children.at(-1)
  await dot(selected).hover()
  await expectSkip(1, 'day preview beyond overview batch')
  await shot('one-day')
  await page.locator(`#item-${ids.week} .drag-handle`).focus()
  await page.keyboard.press('Shift+Tab')
  await weeklyGap.waitFor()
  assert.equal(await dot(ids.week).evaluate(node => node === document.activeElement && node.matches(':focus-visible')), true)
  assert.equal(await skip.count(), 0, 'Keyboard week previews exclude skipped sibling branches')
  await page.locator(`#item-${selected} .drag-handle`).focus()
  await page.keyboard.press('Shift+Tab')
  await expectSkip(1, 'keyboard day preview')

  await skip.click({ modifiers: ['Shift'] })
  const composer = page.getByRole('dialog', { name: '新建', exact: true })
  await composer.waitFor()
  assert.equal(await composer.locator('.seed-chip').filter({ hasText: '下级：今天 1 项' }).count(), 1)
  await shot('scoped-composer')
  const title = 'Preview scoped week milestone'
  await composer.getByRole('textbox').fill(title)
  await composer.getByRole('textbox').press('Enter')
  await composer.waitFor({ state: 'hidden' })
  const created = await page.evaluate(async ({ parent, selected, children, week, title }) => {
    const snapshot = await window.goalloom.getSnapshot(), milestone = snapshot.items.find(item => item.title === title)
    const linked = (from, to) => snapshot.relations.some(edge => edge.parentId === from && edge.childId === to)
    return { id: milestone?.id, horizon: milestone?.placement.horizon, period: milestone?.placement.periodId,
      currentWeek: snapshot.periods.find(period => period.horizon === 'week').id,
      parentLinked: linked(parent, milestone?.id), selectedLinked: linked(milestone?.id, selected), selectedDirect: linked(parent, selected),
      siblingsPreserved: children.filter(id => id !== selected).every(id => linked(parent, id) && !linked(milestone?.id, id)),
      weekPreserved: linked(parent, week) }
  }, { parent: ids.month, selected, children, week: ids.week, title })
  assert(created.id && created.parentLinked && created.selectedLinked && !created.selectedDirect && created.siblingsPreserved && created.weekPreserved)
  assert.equal(created.horizon, 'week')
  assert.equal(created.period, created.currentWeek)
  await shot('scoped-write')
  await page.keyboard.press('ControlOrMeta+z')
  await pollPage(page, async ({ parent, children, milestone }) => {
    const snapshot = await window.goalloom.getSnapshot()
    return !snapshot.items.some(item => item.id === milestone) && children.every(id => snapshot.relations.some(edge => edge.parentId === parent && edge.childId === id))
  }, { parent: ids.month, children, milestone: created.id })

  await page.evaluate(async children => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    for (const id of children) {
      const item = (await window.goalloom.getItem(id)).item
      const reply = await window.goalloom.execute({ type: 'delete', itemId: id, expectedVersion: item.version, generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
    }
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, children)
  await all.hover()
  await page.waitForFunction(() => !document.querySelector('.relation-lines, .breakpoint'))
  return { labels, created, selected, children, checks: ['no sibling skip on a week preview', 'month/root/overview preserve bounded grouping', 'day scope precedes eight-child limit', 'keyboard skips share preview scope', 'scoped composer and insertBetween preserve siblings', 'bridge undo restores direct edges'] }
}
