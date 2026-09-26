/**
 * [INPUT]: Real Electron, an isolated profile, authoritative IPC fixtures and renderer UI actions.
 * [OUTPUT]: Contextual Toast, preserved keyboard undo, duration and partial-restore evidence in JSON and screenshots.
 * [POS]: Desktop feedback acceptance; the batch driver calls the mounted renderer submit without replacing IPC or receipts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, platform, release, tmpdir, version } from 'node:os'
import { join, resolve } from 'node:path'
import { _electron as electron } from 'playwright'

const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2], profile = await mkdtemp(join(tmpdir(), 'goalloom-feedback-'))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
const checks = [], errors = [], screenshots = []
const report = {
  packaged: Boolean(packaged), runtime: null,
  environment: { platform: platform(), release: release(), version: version(), arch: arch(), cpu: cpus()[0]?.model, machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified' },
  checks, screenshots, timing: {},
  scope: 'Actual UI actions and production IPC fixtures. Multi-item createPlan is dispatched through the mounted Composer submit callback; this does not verify Jev analysis UI. No command receipts are mocked. Windows acceptance remains manual.',
}
await mkdir('output/tests/screenshots', { recursive: true })
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1880, height: 1000 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '先跳过', exact: true }).click()
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const toast = page.locator('.toast')
  const detail = () => page.getByRole('dialog', { name: '当前条目', exact: true })
  const settings = () => page.getByRole('dialog', { name: '设置与数据', exact: true })
  const item = id => page.evaluate(async id => (await window.goalloom.getItem(id)).item, id)
  const dismiss = async () => { if (await toast.count()) await toast.getByRole('button', { name: '关闭操作提示', exact: true }).click() }
  const silent = async label => { await page.waitForTimeout(200); assert.equal(await toast.count(), 0, label) }
  const shot = async name => { const path = `output/tests/screenshots/${name}.png`; await page.screenshot({ path }); screenshots.push(path) }
  const closePanels = async () => {
    if (await detail().count()) await detail().getByRole('button', { name: '关闭', exact: true }).click()
    if (await settings().count()) await settings().getByRole('button', { name: '关闭', exact: true }).click()
  }
  const more = async name => {
    await detail().getByRole('button', { name: '更多操作', exact: true }).click()
    await page.getByRole('menuitem', { name, exact: true }).click()
  }
  const toggleLater = async () => {
    await page.getByRole('button', { name: '显示的列', exact: true }).click()
    await page.getByRole('menuitemcheckbox', { name: 'Later', exact: true }).click()
    await page.keyboard.press('Escape')
  }
  const createSingle = async title => {
    await page.getByRole('button', { name: '新建', exact: true }).click()
    await page.getByRole('textbox', { name: '写下想法', exact: true }).fill(title)
    await page.getByRole('button', { name: /保存到 Later/ }).click()
    await page.getByRole('dialog', { name: '新建', exact: true }).waitFor({ state: 'hidden' })
    const snapshot = await page.evaluate(() => window.goalloom.getSnapshot())
    return snapshot.items.find(row => row.title === title).id
  }
  const openStored = async (title, kind) => {
    await page.getByRole('button', { name: '设置与数据', exact: true }).click()
    await settings().getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: kind === 'trash' ? '回收站' : '已完成', exact: true }).click()
    if (kind === 'archived') await settings().getByRole('radio', { name: /^归档/ }).click()
    await settings().locator('.items-open').filter({ hasText: title }).click()
    await detail().getByRole('textbox', { name: '标题', exact: true }).waitFor()
  }

  const visible = await createSingle('Visible single creation')
  await page.locator(`#item-${visible}`).waitFor()
  await silent('Single creation visible on the board is quiet')
  await page.keyboard.press('ControlOrMeta+z')
  await toast.getByRole('button', { name: '还原', exact: true }).waitFor()
  assert((await item(visible)).deletedAt)
  await toast.getByRole('button', { name: '还原', exact: true }).focus()
  await page.mouse.move(5, 5)
  await page.waitForTimeout(6200)
  assert.equal(await toast.count(), 1, 'Keyboard focus keeps the restore action available')
  await toast.getByRole('button', { name: '还原', exact: true }).click()
  await page.waitForFunction(async id => !(await window.goalloom.getItem(id)).item.deletedAt, visible)
  await toast.filter({ hasText: 'Later' }).waitFor()
  await page.getByRole('button', { name: '新建', exact: true }).focus()
  await page.mouse.move(5, 5)
  await page.waitForTimeout(3100)
  assert.equal(await toast.count(), 1, 'Actionable restore confirmation lasts longer than a plain undo')
  await dismiss()
  checks.push('Visible global single creation is quiet; keyboard undo still gives scoped restore; focused action survives six seconds; restore confirms destination')

  await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const reply = await window.goalloom.execute({ type: 'create', title: 'Feedback flow', horizon: 'cycle', flowColor: 0, generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw new Error(reply.message)
  })
  await page.getByRole('button', { name: '只看 Feedback flow', exact: true }).click()
  const dimmed = await createSingle('Dimmed single creation')
  await silent('A flow filter dims unrelated rows without hiding their visible result')
  assert.equal(await page.locator(`#item-${dimmed}`).getAttribute('data-dimmed'), 'true')
  await page.getByRole('button', { name: '只看 Feedback flow', exact: true }).click()
  checks.push('Dimmed rows under a flow filter still count as visible and need no success Toast')

  await toggleLater()
  const hidden = await createSingle('Hidden single creation')
  await toast.filter({ hasText: 'Later' }).waitFor()
  await toast.getByRole('button', { name: /撤销/ }).waitFor()
  assert.equal(await page.locator(`#item-${hidden}`).count(), 0)
  await shot('feedback-hidden-destination')
  await page.keyboard.press('ControlOrMeta+z')
  await toast.getByRole('button', { name: '还原', exact: true }).waitFor()
  assert((await item(hidden)).deletedAt)
  await dismiss()
  checks.push('Hidden-column single creation reports destination and remains undoable')

  const ids = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const execute = async action => {
      const reply = await window.goalloom.execute({ ...action, generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
      return reply.result
    }
    const change = async (id, action) => execute({ ...action, itemId: id, expectedVersion: (await window.goalloom.getItem(id)).item.version })
    const create = async (title, horizon) => (await execute({ type: 'create', title, horizon })).itemId
    const result = {}
    for (const [key, title, horizon, status, archived] of [
      ['reopenVisible', 'Visible reopening', 'week', 'done', false],
      ['reopenHidden', 'Hidden reopening', 'later', 'done', false],
      ['unarchiveVisible', 'Visible unarchive', 'week', 'todo', true],
      ['unarchiveHidden', 'Hidden unarchive', 'later', 'todo', true],
      ['restore', 'Restore archived completion', 'week', 'done', true],
      ['cancel', 'Cancel and undo timing', 'day', 'todo', false],
      ['history', 'History-view reopening', 'week', 'done', false],
    ]) {
      const id = await create(title, horizon); result[key] = id
      if (status !== 'todo') await change(id, { type: 'status', status })
      if (archived) await change(id, { type: 'archive', archived: true })
    }
    await change(result.restore, { type: 'delete' })
    const parent = await create('Deleted relation endpoint', 'month')
    const child = await create('Partial relation restore', 'week'); result.warning = child
    await execute({ type: 'link', parentId: parent, childId: child, expectedParentVersion: (await window.goalloom.getItem(parent)).item.version, expectedChildVersion: (await window.goalloom.getItem(child)).item.version })
    await change(child, { type: 'delete' })
    await change(parent, { type: 'delete' })
    return result
  })

  for (const [title, id, visible] of [['Visible reopening', ids.reopenVisible, true], ['Hidden reopening', ids.reopenHidden, false]]) {
    await openStored(title, 'done')
    await detail().getByRole('button', { name: '重新打开', exact: true }).click()
    await page.waitForFunction(async id => (await window.goalloom.getItem(id)).item.status === 'todo', id)
    if (visible) await silent('Reopened item visible underneath the modal needs no Toast')
    else await toast.filter({ hasText: 'Later' }).waitFor()
    await closePanels(); await dismiss()
  }
  checks.push('Reopen checks actual board visibility and ignores modal occlusion; hidden destination gets feedback')
  for (const [title, id, visible] of [['Visible unarchive', ids.unarchiveVisible, true], ['Hidden unarchive', ids.unarchiveHidden, false]]) {
    await openStored(title, 'archived')
    await more('解除归档')
    await page.waitForFunction(async id => !(await window.goalloom.getItem(id)).item.archivedAt, id)
    if (visible) await silent('Unarchive into a visible row stays quiet')
    else await toast.filter({ hasText: 'Later' }).waitFor()
    await closePanels(); await dismiss()
  }
  checks.push('Unarchive is quiet for a visible board destination and explicit for a hidden column')

  await page.getByRole('button', { name: 'Cancel and undo timing', exact: true }).click()
  await more('取消事项')
  await toast.filter({ hasText: '已取消' }).waitFor()
  await closePanels()
  await page.getByRole('button', { name: '新建', exact: true }).focus()
  await toast.hover()
  await page.waitForTimeout(6200)
  assert.equal(await toast.count(), 1, 'Pointer hover pauses the actionable Toast')
  await page.mouse.move(5, 5)
  const actionStarted = Date.now()
  await toast.waitFor({ state: 'detached', timeout: 7500 })
  report.timing.actionAfterHoverMs = Date.now() - actionStarted
  assert(report.timing.actionAfterHoverMs >= 5600 && report.timing.actionAfterHoverMs < 7500)
  await page.keyboard.press('ControlOrMeta+z')
  await toast.filter({ hasText: '已撤销' }).waitFor()
  assert.equal((await item(ids.cancel)).status, 'todo')
  const plainStarted = Date.now()
  await toast.waitFor({ state: 'detached', timeout: 4000 })
  report.timing.plainUndoMs = Date.now() - plainStarted
  assert(report.timing.plainUndoMs >= 2000 && report.timing.plainUndoMs < 3800)
  checks.push('Cancellation retains feedback; hovering pauses six-second action feedback; keyboard undo succeeds and plain confirmation expires around 2.5 seconds')

  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await settings().getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '回收站', exact: true }).click()
  await settings().locator('.items-row').filter({ hasText: 'Restore archived completion' }).getByRole('button', { name: '还原', exact: true }).click()
  await toast.filter({ hasText: '本周' }).waitFor()
  const restoredText = await toast.textContent()
  assert.match(restoredText, /完成/); assert.match(restoredText, /归档/)
  await closePanels(); await shot('feedback-restore-destination'); await dismiss()
  checks.push('Trash restore confirms original horizon, completed state and archived location')

  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  await settings().getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '回收站', exact: true }).click()
  await settings().locator('.items-row').filter({ hasText: 'Partial relation restore' }).getByRole('button', { name: '还原', exact: true }).click()
  await toast.filter({ hasText: '关联' }).waitFor()
  assert.equal(await toast.getAttribute('data-warning'), 'true')
  assert.equal(await toast.locator('[role="alert"]').count(), 1)
  assert.equal(await page.locator('.error-banner').count(), 0, 'Partial restore uses one unified feedback message')
  assert.equal((await item(ids.warning)).deletedAt, null)
  const modalFeedback = await toast.evaluate(node => {
    const layer = node.closest('[popover]'), close = node.querySelector('button[aria-label="关闭操作提示"]')
    const bounds = close.getBoundingClientRect()
    return {
      topLayer: !!layer?.matches(':popover-open'),
      ownedBySettings: !!node.closest('dialog.settings-modal'),
      focusStolen: node.contains(document.activeElement),
      clickable: close.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)),
    }
  })
  assert.deepEqual(modalFeedback, { topLayer: true, ownedBySettings: true, focusStolen: false, clickable: true })
  report.modalFeedback = modalFeedback
  await page.mouse.move(5, 5)
  await settings().locator('.items-search input').focus()
  await page.waitForTimeout(6300)
  assert.equal(await toast.count(), 1, 'Partial restore warnings stay until dismissed')
  await shot('feedback-partial-restore')
  await toast.getByRole('button', { name: /撤销/ }).click()
  await page.waitForFunction(async id => !!(await window.goalloom.getItem(id)).item.deletedAt, ids.warning)
  await toast.filter({ hasText: '已撤销' }).waitFor()
  assert.equal(await settings().isVisible(), true, 'Toast undo works while Settings stays open')
  await dismiss()
  await settings().locator('.items-row').filter({ hasText: 'Partial relation restore' }).getByRole('button', { name: '还原', exact: true }).click()
  await toast.filter({ hasText: '关联' }).waitFor()
  await dismiss()
  assert.equal(await settings().isVisible(), true, 'Toast dismissal leaves Settings open')
  await closePanels()
  checks.push('A real missing endpoint produces one persistent warning above the native Settings modal without stealing focus; Toast undo and dismissal work without closing Settings')

  await toggleLater()
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('textbox', { name: '写下想法', exact: true }).waitFor()
  const batch = await page.evaluate(async () => {
    const node = document.querySelector('.composer-modal')
    const key = Object.keys(node).find(key => key.startsWith('__reactFiber$'))
    let fiber = key && node[key]
    while (fiber && !(fiber.memoizedProps?.submit && fiber.memoizedProps?.smart)) fiber = fiber.return
    if (!fiber) throw new Error('Mounted Composer submit unavailable')
    return fiber.memoizedProps.submit({ type: 'createPlan', items: ['Batch feedback one', 'Batch feedback two'].map((title, index) => ({ draftId: `batch-${index}`, title, horizon: 'later', previewPeriodId: null, parentRefs: [], flowColor: null })) })
  })
  assert.equal(batch.itemIds.length, 2)
  await page.keyboard.press('Escape')
  await toast.filter({ hasText: '2' }).waitFor()
  await toast.getByRole('button', { name: /撤销/ }).waitFor()
  await page.keyboard.press('ControlOrMeta+z')
  await toast.getByRole('button', { name: '查看回收站', exact: true }).waitFor()
  for (const id of batch.itemIds) assert((await item(id)).deletedAt)
  await dismiss()
  checks.push('Real renderer createPlan batch keeps one count summary; keyboard undo deletes the whole batch and offers trash navigation')

  await page.getByRole('region', { name: '本周列', exact: true }).hover()
  await page.getByRole('button', { name: '查看本周上一期', exact: true }).click()
  await openStored('History-view reopening', 'done')
  await detail().getByRole('button', { name: '重新打开', exact: true }).click()
  await toast.filter({ hasText: '本周' }).waitFor()
  await closePanels(); await dismiss()
  checks.push('A column displaying its previous period reports a newly reopened current-period destination')

  await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    for (let index = 0; index < 60; index++) {
      const reply = await window.goalloom.execute({ type: 'create', title: `Later viewport fixture ${index}`, horizon: 'later', generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
    }
  })
  await page.locator('[data-horizon="later"] .column-content').evaluate(node => { node.scrollTop = 0 })
  const outside = await createSingle('Outside viewport creation')
  await toast.filter({ hasText: 'Later' }).waitFor()
  assert.equal(await page.locator(`#item-${outside}`).count(), 0, 'Virtual row is outside the mounted viewport')
  checks.push('A single creation below the virtual viewport reports destination even when its column is shown')
  await dismiss()
  await page.evaluate(() => window.goalloom.setLanguage('en'))
  await page.reload()
  await page.locator('.board').waitFor()
  await page.locator('.fab').click()
  await page.locator('.composer-input').fill('English destination feedback')
  await page.locator('.composer-primary').click()
  await page.locator('.composer-modal').waitFor({ state: 'hidden' })
  await toast.filter({ hasText: 'Location: Later' }).waitFor()
  assert.match(await toast.textContent(), /Outside the current view/)
  checks.push('English destination feedback is rendered by the real app after changing the device language')
  assert.deepEqual(errors, [])
  report.rendererErrors = errors
  report.passed = true
  await writeFile('output/tests/feedback.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
} finally {
  await application.close()
  await rm(profile, { recursive: true, force: true })
}
