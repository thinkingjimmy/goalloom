import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const trace = resolve('output/tests/review-fixes/virtual.jsonl')
await mkdir(resolve('output/tests/review-fixes'), { recursive: true }); await writeFile(trace, '')
const profile = await mkdtemp(join(tmpdir(), 'Goalloom virtual ')), environment = { ...process.env, GOALLOOM_PERF_LOG: trace }
delete environment.ELECTRON_RUN_AS_NODE
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const app = await electron.launch(process.argv[2] ? { executablePath: resolve(process.argv[2]), args: [`--user-data-dir=${profile}`], env: environment } : { args: ['.', `--user-data-dir=${profile}`], env: environment })
const checks = [], evidence = resolve('output/tests/review-fixes')
await mkdir(evidence, { recursive: true })
try {
  const page = await app.firstWindow()
  await page.getByRole('button', { name: 'Skip', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm and start', exact: true }).click()
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await page.locator('.board').waitFor()
  const rows = await page.evaluate(async () => {
    const { workspace } = await window.goalloom.getSnapshot(), rows = []
    for (let i = 0; i < 150; i++) {
      const reply = await window.goalloom.execute({ type: 'create', operationId: crypto.randomUUID(), generation: workspace.generation, title: `Synthetic row ${String(i).padStart(3, '0')}`, description: 'Long synthetic description. '.repeat(1000), horizon: 'later' })
      if (!reply.ok) throw Error(reply.message)
      rows.push(reply.result.itemId)
      if (i >= 120) await window.goalloom.execute({ type: 'status', operationId: crypto.randomUUID(), generation: workspace.generation, itemId: reply.result.itemId, expectedVersion: 1, status: 'done' })
    }
    return rows
  })
  const column = page.locator('[data-horizon="later"]'), scroller = column.locator('.column-content')
  await page.waitForFunction(() => document.querySelector('[data-horizon="later"] [data-total="120"]'))
  const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.equal(snapshot.items.length, 150)
  assert(snapshot.items.every(item => !('description' in item) && item.hasDescription))
  assert.equal(await page.locator('.task-row[data-done="true"]').count(), 0)
  assert(await page.locator('.task-row').count() < 45)
  checks.push('summary DTOs, logical counts, bounded mounted rows, collapsed done unmounted')
  await scroller.evaluate(element => { element.scrollTop = element.scrollHeight })
  await page.getByRole('button', { name: 'Synthetic row 119', exact: true }).waitFor()
  await column.locator('summary').click()
  await page.getByRole('button', { name: 'Synthetic row 120', exact: true }).waitFor()
  await column.locator('summary').click()
  await page.waitForFunction(() => document.querySelectorAll('.task-row[data-done="true"]').length === 0)
  assert.equal(await page.locator('.task-row[data-done="true"]').count(), 0)
  await page.getByRole('button', { name: 'Synthetic row 119', exact: true }).focus()
  await page.keyboard.press('Home')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Synthetic row 000')
  for (let i = 0; i < 70; i++) { await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Tab') }
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Synthetic row 070')
  await page.keyboard.press('End')
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Synthetic row 119')
  checks.push('logical Home/End and Tab traversal across the viewport; completed fold')
  await page.keyboard.press('Home')
  const firstBounds = await page.getByRole('button', { name: 'Synthetic row 000', exact: true }).boundingBox(), scrollBounds = await scroller.boundingBox()
  await page.mouse.move(firstBounds.x + 40, firstBounds.y + 20); await page.mouse.down()
  await page.mouse.move(scrollBounds.x + 50, scrollBounds.y + scrollBounds.height - 8, { steps: 20 })
  await page.waitForFunction(() => document.querySelector('[data-horizon="later"] .column-content').scrollTop > 75)
  await page.keyboard.press('Escape'); await page.mouse.up()
  await page.getByRole('button', { name: 'Synthetic row 000', exact: true }).focus(); await page.keyboard.press('End')
  checks.push('pointer autoscroll while the drag source remains mounted')
  const handle = page.locator(`#item-${rows[119]} .drag-handle`)
  await handle.focus(); await page.keyboard.press('Space')
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Space')
  await page.waitForFunction(async id => {
    const data = await window.goalloom.getSnapshot(), todo = data.items.filter(item => item.status === 'todo' && item.placement.horizon === 'later')
    return todo.findIndex(item => item.id === id) === 94
  }, rows[119])
  checks.push('keyboard drag crosses virtual viewport')
  // The pointer can move a mounted row into a completely empty column.
  const row = page.locator(`#item-${rows[119]} .task-title`), target = page.locator('[data-horizon="day"]')
  await row.scrollIntoViewIfNeeded(); await target.scrollIntoViewIfNeeded()
  const from = await row.boundingBox(), to = await target.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2); await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + 140, { steps: 18 }); await page.mouse.up()
  await page.waitForFunction(async id => (await window.goalloom.getItem(id)).item.placement.horizon === 'day', rows[119])
  checks.push('pointer cross-column drag into empty destination')
  await page.getByRole('button', { name: 'Search & commands', exact: true }).click()
  await page.getByRole('textbox', { name: 'Search items', exact: true }).fill('Synthetic row 002')
  await page.locator('.command-results .menu-item').first().click()
  await page.locator('.modal.detail').waitFor()
  await page.getByRole('button', { name: 'More actions', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Show on board', exact: true }).click()
  await page.locator(`#item-${rows[2]}`).waitFor()
  await page.waitForFunction(id => document.activeElement?.closest('.task-row')?.getAttribute('data-item-id') === id, rows[2])
  checks.push('search locates an offscreen item and restores row focus')
  const beforeFocus = await page.evaluate(() => performance.getEntriesByName('goalloom.board-commit').at(-1)?.detail.sequence)
  await app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.blur(); window.focus() })
  await page.waitForTimeout(500)
  assert.equal(await page.evaluate(() => performance.getEntriesByName('goalloom.board-commit').at(-1)?.detail.sequence), beforeFocus)
  const queryCount = async () => (await readFile(trace, 'utf8')).trim().split('\n').map(line => JSON.parse(line)).filter(row => row.stage === 'worker' && row.query === 'snapshot').length
  const beforeWrite = await queryCount()
  await page.locator('[data-horizon="day"] .column-header button').last().click()
  await page.locator('.quick-add input').fill('One authoritative refresh')
  await page.locator('.quick-add input').press('Enter')
  await page.getByRole('button', { name: 'One authoritative refresh', exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('.quick-add input').value === '')
  assert.equal((await queryCount()) - beforeWrite, 1)
  checks.push('unchanged focus reconciliation makes no board commit; one UI write requests one snapshot')
  await page.screenshot({ path: join(evidence, 'virtual.png') })
  await writeFile(join(evidence, 'virtual.json'), JSON.stringify({ runtime: await page.evaluate(() => window.goalloom.getRuntime()), mountedRows: await page.locator('.task-row').count(), checks }, null, 2))
  console.log(JSON.stringify(checks))
} finally { await app.close(); await rm(profile, { recursive: true, force: true }) }
