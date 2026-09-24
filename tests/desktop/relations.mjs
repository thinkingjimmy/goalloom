import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

// 关系线：筛选单个流程时连起上下级，其余流程原位置灰；悬停高亮整条链；滚出视野的端点给标记；设置里可关闭。
// 流程圆点：悬停预览该条目的流程（连线 + 流程底色）；起点改色、下级改上级、独立条目二选一；Later 不参与；新建关联只接受周期更长的上级。
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2], profile = await mkdtemp(join(tmpdir(), 'Goalloom 关系线 '))
// Assertions use Chinese copy; pin the device language instead of following the machine's system language.
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
const shots = 'output/tests/screenshots'
try {
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 1600, height: 900 })
  await page.getByRole('button', { name: '先跳过', exact: true }).click()
  await page.getByRole('button', { name: '确认并开始', exact: true }).click()
  await page.getByRole('button', { name: '暂时跳过', exact: true }).click()
  await page.getByRole('main', { name: '时间看板' }).waitFor()

  // One flow from 3个月 down to 今天: a two-parent item, a skip-level child (本月 → 今天) and a done leaf. Later only parks a loose item.
  const ids = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const version = async id => (await window.goalloom.getSnapshot()).items.find(item => item.id === id).version
    const execute = async action => { const reply = await window.goalloom.execute({ ...action, generation, operationId: crypto.randomUUID() }); if (!reply.ok) throw new Error(reply.message); return reply.result }
    const create = async (title, horizon, parentId = null, flowColor = null) => (await execute({ type: 'create', title, horizon, flowColor, parentId, expectedParentVersion: parentId ? await version(parentId) : null })).itemId
    const root = await create('副业收入', 'cycle', null, 1)
    const other = await create('自媒体运营', 'cycle', null, 2)
    const b = await create('上线付费订阅', 'month', root), c = await create('接咨询客户', 'month', root)
    await create('小红书粉丝', 'month', other)
    const d = await create('移动端开发', 'week', b), f = await create('咨询介绍页', 'week', c)
    const j = await create('开发日志', 'day', d)
    await execute({ type: 'link', parentId: f, childId: j, expectedParentVersion: await version(f), expectedChildVersion: await version(j) })
    const p = await create('联系潜在客户', 'day', c)
    const k = await create('日志初稿', 'day', d)
    await execute({ type: 'status', itemId: k, expectedVersion: await version(k), status: 'done' })
    await create('剪演示视频', 'week', other)
    const later = await create('以后再说', 'later')
    const loose = await create('整理报销单', 'week')
    // New links only accept a strictly longer-horizon parent and never Later; each rejection writes nothing.
    const refusals = []
    for (const [parentId, childId] of [[later, loose], [loose, later], [d, f], [j, d]]) {
      const reply = await window.goalloom.execute({ type: 'link', parentId, childId, expectedParentVersion: await version(parentId), expectedChildVersion: await version(childId), generation, operationId: crypto.randomUUID() })
      refusals.push(reply.ok ? 'ok' : reply.message)
    }
    const flowInLater = await window.goalloom.execute({ type: 'flowColor', itemId: later, expectedVersion: await version(later), flowColor: 5, generation, operationId: crypto.randomUUID() })
    refusals.push(flowInLater.ok ? 'ok' : flowInLater.message)
    return { root, b, c, d, f, j, p, k, later, loose, refusals, edges: (await window.goalloom.getSnapshot()).relations.length }
  })
  assert.deepEqual(ids.refusals.map(message => message.includes('暂存区') ? 'later' : message.includes('周期更长') ? 'horizon' : message), ['later', 'later', 'horizon', 'horizon', 'later'])
  assert.equal(ids.edges, 10, '被拒绝的关联一条都没写入')
  const board = page.getByRole('main', { name: '时间看板' })
  const edges = board.locator('.relation-edge')
  assert.equal(await board.locator('.relation-lines').count(), 0, '「全部」不画线')

  await page.getByRole('button', { name: '只看 副业收入', exact: true }).click()
  // root→b, root→c, b→d, c→f, d→j, f→j, c→p; the done leaf stays folded, so j→k is not drawn.
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge').length === 7)
  assert.equal(await board.locator('.relation-edge[data-skip]').count(), 1, '本月 → 今天 按跨级虚线')
  assert.equal(await board.locator('[data-dimmed="true"]').count(), 5, '其他流程与无流程条目原位置灰，不隐藏')
  assert.equal(await board.locator('[data-lit="true"]').count(), 7, '本流程的行铺上流程底色')
  assert.equal(await board.getByRole('button', { name: '剪演示视频', exact: true }).isVisible(), true)
  // Rows give way to a corridor and keep an opaque ground, so no curve crosses a title.
  const row = await page.locator(`#item-${ids.b}`).evaluate(node => { const style = getComputedStyle(node); return { margin: style.marginRight, ground: style.backgroundColor } })
  assert.equal(row.margin, '24px'); assert.notEqual(row.ground, 'rgba(0, 0, 0, 0)')
  await page.waitForTimeout(1000)
  const dimmedTitle = await board.getByRole('button', { name: '剪演示视频', exact: true }).evaluate(node => getComputedStyle(node.closest('.task-line')).opacity)
  assert.equal(dimmedTitle, '0.28')
  await mkdir(shots, { recursive: true })
  await board.screenshot({ path: `${shots}/relation-lines.png` })

  // Hovering the two-parent item lights both ancestor paths and its descendants; the rest fades.
  await page.locator(`#item-${ids.j} .task-title`).hover()
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge[data-state="hot"]').length === 6)
  assert.equal(await board.locator('.relation-edge[data-state="faded"]').count(), 1)
  assert.equal(await board.locator('[data-chain-out="true"]').count(), 1, '只有「联系潜在客户」不在链上')
  await board.screenshot({ path: `${shots}/relation-lines-hover.png` })
  await page.mouse.move(5, 5)
  await page.waitForFunction(() => !document.querySelector('.relation-edge[data-state="hot"], [data-chain-out]'))

  // Keyboard focus lights the chain too.
  await page.locator(`#item-${ids.p} .task-title`).focus()
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge[data-state="hot"]').length === 2)
  await page.locator(`#item-${ids.p} .task-title`).blur()

  // Flow dot: under 全部, hovering a coloured dot previews that item's flows — lines ending on the dots, rows in the flow tinted.
  const relationCount = () => page.evaluate(async () => (await window.goalloom.getSnapshot()).relations.length)
  const undoToast = page.locator('.toast').getByRole('button', { name: /撤销/ })
  await page.getByRole('button', { name: '只看 副业收入', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.relation-lines'))
  assert.equal(await page.locator(`#item-${ids.later} .flow-dot-button`).count(), 0, 'Later 不显示圆点，不参与关联')
  const dot = id => page.locator(`#item-${id} .flow-dot-button`)
  await page.locator(`#item-${ids.j} .task-title`).hover()
  await dot(ids.j).hover()
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge[data-state="hot"]').length === 6)
  assert.equal(await board.locator('[data-lit="true"]').count(), 7, '预览时本流程的行铺上流程底色')
  const [tinted, ground] = await Promise.all([ids.b, ids.loose].map(id => page.locator(`#item-${id}`).evaluate(node => getComputedStyle(node).backgroundColor)))
  assert.notEqual(tinted, ground)
  await page.waitForTimeout(300)
  await board.screenshot({ path: `${shots}/flow-dot-preview.png` })
  await page.mouse.move(5, 5)
  await page.waitForFunction(() => !document.querySelector('.relation-lines'), null, { timeout: 2000 })

  // A flow root's dot edits its colour and spells out how far the change reaches.
  await page.locator(`#item-${ids.root} .task-title`).hover()
  await dot(ids.root).click()
  const colorMenu = page.locator('.popover-floating .flow-menu')
  await colorMenu.waitFor()
  assert.ok((await colorMenu.textContent()).includes('影响它和下面 7 项'))
  assert.equal(await colorMenu.getByRole('button', { name: '不设流程（共 8 项）', exact: true }).count(), 1)
  await page.screenshot({ path: `${shots}/flow-dot-color.png` })
  await page.keyboard.press('Escape')
  await colorMenu.waitFor({ state: 'detached' })

  // A child's dot edits its parents: only longer horizons are offered, current links on top; the flow follows the links.
  await page.locator(`#item-${ids.j} .task-title`).hover()
  await dot(ids.j).click()
  const parents = page.getByRole('dialog', { name: '关联到…', exact: true })
  await parents.waitFor()
  const option = title => parents.getByRole('menuitemcheckbox').filter({ hasText: title })
  assert.ok((await parents.textContent()).includes('所属流程由上级决定'))
  assert.equal(await option('移动端开发').getAttribute('aria-checked'), 'true')
  assert.equal(await option('咨询介绍页').getAttribute('aria-checked'), 'true')
  assert.equal(await option('以后再说').count(), 0, 'Later 不作为上级候选')
  assert.equal(await option('联系潜在客户').count(), 0, '同列不作为上级候选')
  await page.screenshot({ path: `${shots}/flow-dot-parents.png` })
  await option('咨询介绍页').click()
  await page.waitForFunction(async () => (await window.goalloom.getSnapshot()).relations.length === 9)
  await undoToast.click()
  await page.waitForFunction(async () => (await window.goalloom.getSnapshot()).relations.length === 10)
  await page.keyboard.press('Escape')
  await parents.waitFor({ state: 'detached' })

  // A loose item chooses: start a flow here or link to a longer-horizon parent, which puts it in that flow.
  await page.locator(`#item-${ids.loose} .task-title`).hover()
  assert.equal(await dot(ids.loose).getAttribute('data-role'), 'loose')
  await dot(ids.loose).click()
  const join = page.getByRole('menu', { name: '加入流程', exact: true })
  await join.waitFor()
  // The previous panel's preview ends after the 120ms leave grace.
  await page.waitForFunction(() => !document.querySelector('.relation-lines'))
  await page.screenshot({ path: `${shots}/flow-dot-join.png` })
  await join.getByRole('menuitem', { name: /关联到上级/ }).click()
  await parents.waitFor()
  assert.equal(await option('以后再说').count(), 0)
  await option('上线付费订阅').click()
  await page.waitForFunction(async () => (await window.goalloom.getSnapshot()).relations.length === 11)
  await page.keyboard.press('Escape')
  await page.waitForFunction(id => document.querySelector(`#item-${id} .flow-dot-button`)?.dataset.role === 'child', ids.loose)
  await undoToast.click()
  await page.waitForFunction(async () => (await window.goalloom.getSnapshot()).relations.length === 10)
  assert.equal(await relationCount(), 10)
  await page.getByRole('button', { name: '只看 副业收入', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge').length === 7)

  // Push this flow's week rows out of view: the lines park on the column edge behind a marker that reveals them.
  await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    for (let index = 0; index < 30; index++) await window.goalloom.execute({ type: 'create', title: `本周杂事 ${index}`, horizon: 'week', generation, operationId: crypto.randomUUID() })
  })
  await page.waitForFunction(() => document.querySelectorAll('[data-horizon="week"] .task-row').length >= 34)
  await page.locator('[data-horizon="week"] .column-content').evaluate(node => { node.scrollTop = node.scrollHeight })
  // This week's rows are both children (curves in on the left) and parents (curves out on the right), so each side gets a marker.
  const marker = board.locator('.relation-marker[data-align="start"]')
  await marker.waitFor()
  assert.equal(await marker.getAttribute('aria-label'), '上方还有 2 项相关')
  assert.equal(await board.getByRole('button', { name: '上方还有 2 项相关', exact: true }).count(), 2)
  assert.equal(await edges.count(), 7, '端点滚出视野时线仍停在列边')
  await board.screenshot({ path: `${shots}/relation-lines-marker.png` })
  await marker.click()
  await page.waitForFunction(id => {
    const row = document.getElementById(`item-${id}`), content = row?.closest('.column-content')
    if (!row || !content) return false
    const r = row.getBoundingClientRect(), c = content.getBoundingClientRect()
    return r.top >= c.top - 1 && r.bottom <= c.bottom + 1
  }, ids.f)

  // The switch lives only in Settings › Appearance and is stored on this device.
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  const settings = page.getByRole('dialog', { name: '设置与数据' })
  await settings.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '外观', exact: true }).click()
  const toggle = settings.getByRole('switch', { name: '关系线', exact: true })
  assert.equal(await toggle.getAttribute('aria-checked'), 'true')
  await settings.screenshot({ path: `${shots}/settings-relation-lines.png` })
  await toggle.click()
  assert.equal(await toggle.getAttribute('aria-checked'), 'false')
  await page.keyboard.press('Escape')
  await settings.waitFor({ state: 'hidden' })
  assert.equal(await board.locator('.relation-lines').count(), 0)
  assert.equal(await page.getByRole('button', { name: '只看 副业收入', exact: true }).getAttribute('aria-pressed'), 'true', '筛选仍在，只是不画线')
  assert.equal(await page.locator(`#item-${ids.b}`).evaluate(node => getComputedStyle(node).marginRight), '-8px', '关闭后不留走廊')
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.relationLines')), 'false')
  assert.equal(await page.getByRole('banner').getByText('关系线').count(), 0, '顶栏没有关系线入口')
  await page.reload()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  await page.getByRole('button', { name: '只看 副业收入', exact: true }).click()
  assert.equal(await board.locator('.relation-lines').count(), 0, '重启窗口后保持关闭')
  await page.evaluate(() => localStorage.removeItem('goalloom.relationLines'))
  assert.deepEqual(errors, [])
  console.log('relation lines: 7 edges, 1 skip, hover chain 6/1, marker reveal, settings switch persisted; flow dot: preview + tint, root colour, child parents, loose join, horizon rule')
} finally {
  await application.close()
  await rm(profile, { recursive: true, force: true })
}
