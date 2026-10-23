/**
 * [INPUT]: Isolated source Electron board with a controlled Jev transport.
 * [OUTPUT]: Repeatable Cmd+N ready/late ownership, manual override and ambiguity screenshots.
 * [POS]: Native acceptance of matching through IPC, transactions and visible board outlines.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { pollPage } from './poll.mjs'

export async function runCaptureNestingUI({ app, page, out, check }) {
  const ids = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const create = async values => {
      const result = await window.goalloom.execute({ type: 'create', operationId: crypto.randomUUID(), generation, ...values })
      if (!result.ok) throw Error(result.message)
      return result.result.itemId
    }
    const release = await create({ title: 'Release Aurora with billing', horizon: 'month', flowColor: 3 })
    const owner = await create({ title: 'Complete Aurora 2 development', horizon: 'week', parentId: release,
      expectedParentVersion: (await window.goalloom.getItem(release)).item.version })
    return { release, owner }
  })
  const set = values => app.evaluate((_, values) => Object.assign(globalThis.captureFixture, values), values)
  const release = () => app.evaluate(() => {
    const f = globalThis.captureFixture; f.hold = false; f.waiters.splice(0).forEach(resolve => resolve())
  })
  const open = async title => {
    await page.keyboard.press('ControlOrMeta+n')
    const field = page.getByRole('textbox', { name: '写下想法', exact: true })
    await field.fill(title)
    return field
  }
  const saved = title => pollPage(page, async title => (await window.goalloom.getSnapshot()).items.some(item => item.title === title), title)
  const item = title => page.evaluate(async title => (await window.goalloom.getSnapshot()).items.find(item => item.title === title), title)
  const nested = id => pollPage(page, async ({ id, owner }) => (await window.goalloom.getItem(id)).item.placement.nestingParentId === owner, { id, owner: ids.owner })
  await set({ target: 'Complete Aurora 2 development', extraTarget: 'Release Aurora with billing', horizon: 'week', hold: true })
  const lateTitle = 'Implement Aurora account AI'
  await (await open(lateTitle)).press('Enter')
  await saved(lateTitle)
  const late = await item(lateTitle)
  assert.equal(late.placement.horizon, 'later')
  await release(); await nested(late.id)
  const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
  assert(snapshot.relations.some(edge => edge.childId === late.id && edge.parentId === ids.release && edge.inheritedFrom?.rootId === ids.owner))
  await page.screenshot({ path: `${out}/nesting-late.png` })
  await page.keyboard.press('ControlOrMeta+z')
  await pollPage(page, async id => !!(await window.goalloom.getItem(id)).item.deletedAt, late.id)
  await page.locator('.toast').getByRole('button', { name: '还原', exact: true }).click()
  await nested(late.id)
  check('Cmd+N before provider reply nests under the concrete weekly task, inherits release goals and supports one-step undo/restore')

  const readyTitle = 'Verify Aurora account AI'
  const field = await open(readyTitle)
  await page.locator('.plan-sentence').filter({ hasText: '设为其二级 todo： Complete Aurora 2 development' }).waitFor()
  await page.screenshot({ path: `${out}/nesting-preview.png` })
  await field.press('Enter'); await saved(readyTitle)
  await nested((await item(readyTitle)).id)
  check('Ready Cmd+N preview names the owning task and commits the same outline as late completion')

  const manualTitle = 'Manual Aurora task'
  const manual = await open(manualTitle)
  await page.locator('.plan-sentence').filter({ hasText: 'Complete Aurora 2 development' }).waitFor()
  await manual.press('Tab'); await page.keyboard.press('p')
  await page.getByRole('button', { name: '恢复为一级', exact: true }).click()
  await page.keyboard.press('Escape')
  await manual.press('Enter'); await saved(manualTitle)
  assert.equal((await item(manualTitle)).placement.nestingParentId ?? null, null)
  check('Explicit independent-task choice removes automatic ownership before creation')

  await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const result = await window.goalloom.execute({ type: 'create', operationId: crypto.randomUUID(), generation, title: 'Complete Aurora platform development', horizon: 'week' })
    if (!result.ok) throw Error(result.message)
  })
  await set({ extraTarget: 'Complete Aurora platform development' })
  const ambiguousTitle = 'Ambiguous Aurora development task', ambiguous = await open(ambiguousTitle)
  await page.locator('.plan-sentence').waitFor()
  assert(!(await page.locator('.plan-sentence').innerText()).includes('设为其二级'))
  await ambiguous.press('Enter'); await saved(ambiguousTitle)
  assert.equal((await item(ambiguousTitle)).placement.nestingParentId ?? null, null)
  check('Two matching weekly owners leave capture independent instead of choosing an arbitrary task')
  await set({ target: 'Delivery target', extraTarget: null, horizon: null })
}
