/**
 * [INPUT]: Native weekly App or monthly component harness with real IPC/SQLite and synthetic nested review records.
 * [OUTPUT]: Repeatable row order, 24px indentation, read-only rendering and group-choice evidence with screenshots.
 * [POS]: Shared review acceptance; source data includes overlapping child sort keys and an independently completed parent.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

export async function verifyReviewOutline({ page, fixture, out, scenario, check, month = false }) {
  const outline = fixture.outline, drawer = page.locator('.review-drawer[open]')
  const originals = await page.evaluate(async ids => Promise.all(ids.map(async id => (await window.goalloom.getItem(id)).item)), outline.all)
  const geometry = rows => rows.evaluateAll(nodes => nodes.map(row => {
    const marker = row.querySelector('.check').getBoundingClientRect()
    const title = row.querySelector('.review-item-title').getBoundingClientRect()
    return { id: row.dataset.itemId, nested: row.dataset.nested, left: marker.left, right: row.getBoundingClientRect().right,
      markerTop: marker.top, titleTop: title.top, choiceRight: row.querySelector('[role=combobox]')?.getBoundingClientRect().right }
  }))
  const ids = rows => rows.map(row => row.id).filter(id => outline.all.includes(id))
  if (month) {
    await drawer.locator('.review-goal-records').last().locator('summary').click()
    const records = await geometry(drawer.locator('.review-records li:visible'))
    assert.deepEqual(ids(records), outline.all, 'Monthly records keep board outline order across independent statuses')
    for (const row of records.filter(row => outline.all.includes(row.id))) {
      const parent = records.find(value => value.id === outline.parent)
      assert.equal(row.nested, String(outline.nested.includes(row.id)))
      assert.equal(Math.round(row.left - parent.left), outline.nested.includes(row.id) ? 24 : 0)
    }
    scenario.recordOutline = records
    await drawer.screenshot({ path: `${out}/outline-month-records.png` })
  }
  await drawer.locator('.review-foot .primary').click()
  await drawer.locator('.review-close-row').first().waitFor()
  const rows = drawer.locator('.review-close-row')
  const closing = await geometry(rows)
  assert.deepEqual(ids(closing), outline.closing, 'Closing follows each parent with its own ordered children, even when a parent is complete')
  for (const appearance of ['paper-light', 'paper-dark', 'minimal-light', 'minimal-dark']) {
    const [style, theme] = appearance.split('-')
    await page.evaluate(({ style, theme }) => { document.documentElement.dataset.style = style; document.documentElement.dataset.theme = theme }, { style, theme })
    const layout = (await geometry(rows)).filter(row => outline.all.includes(row.id))
    const parent = layout.find(row => row.id === outline.parent)
    for (const row of layout) {
      assert.equal(row.nested, String(outline.nested.includes(row.id)))
      assert.equal(Math.round(row.left - parent.left), outline.nested.includes(row.id) ? 24 : 0)
      assert(Math.abs(row.choiceRight - parent.choiceRight) < 1, 'Destination controls retain right alignment')
    }
    await drawer.screenshot({ path: `${out}/outline-${month ? 'month' : scenario.mode}-${appearance}.png` })
  }
  const parent = drawer.locator(`.review-close-row[data-item-id="${outline.parent}"]`), child = drawer.locator(`.review-close-row[data-item-id="${outline.child}"]`)
  await child.getByRole('combobox').click()
  await drawer.getByRole('option', { name: '留在原处', exact: true }).click()
  assert.equal(await parent.getByRole('combobox').innerText(), '留在原处', 'Group choices stay synchronized from a child')
  const remote = drawer.locator(`.review-close-row[data-item-id="${outline.remote.child}"]`)
  const remoteParent = drawer.locator(`.review-close-row[data-item-id="${outline.remote.parent}"]`)
  const local = drawer.locator(`.review-close-row[data-item-id="${outline.remote.local}"]`)
  assert.equal(await remote.getAttribute('data-nested'), 'false')
  assert.equal(await local.getAttribute('data-nested'), 'true')
  assert.equal(await remote.getByRole('combobox').getAttribute('aria-description'), null)
  const beforeRemote = await remoteParent.getByRole('combobox').innerText()
  await remote.getByRole('combobox').click()
  await drawer.getByRole('option', { name: '留在原处', exact: true }).click()
  assert.equal(await remoteParent.getByRole('combobox').innerText(), beforeRemote, 'A remote child keeps its own review decision')
  assert.equal(await local.getByRole('combobox').innerText(), beforeRemote)
  await remoteParent.getByRole('combobox').click()
  await drawer.getByRole('option', { name: '归档', exact: true }).click()
  assert.equal(await remote.getByRole('combobox').innerText(), '留在原处', 'A parent decision does not change its remote child')
  scenario.remoteOwnership = { parent: outline.remote.parent, child: outline.remote.child, local: outline.remote.local }
  await parent.locator('.review-item-title').click()
  assert.equal(await page.locator('dialog.detail').count(), 0)
  assert.deepEqual(await page.evaluate(async ids => Promise.all(ids.map(async id => (await window.goalloom.getItem(id)).item)), outline.all), originals)
  scenario.closingOutline = closing
  check('Review preserves board outline order, independent completion, 24px subtask indentation in four appearances, aligned choices and read-only source data')
}
