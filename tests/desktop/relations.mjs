import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { _electron as electron } from 'playwright'

// 关系线：筛选单个流程时连起上下级，其余流程原位置灰；悬停高亮整条链；滚出视野的端点给标记；设置里可关闭。
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

  // One flow spanning all five columns: a two-parent item, a skip-level child (3个月 → 本周) and a done leaf.
  const ids = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const version = async id => (await window.goalloom.getSnapshot()).items.find(item => item.id === id).version
    const execute = async action => { const reply = await window.goalloom.execute({ ...action, generation, operationId: crypto.randomUUID() }); if (!reply.ok) throw new Error(reply.message); return reply.result }
    const create = async (title, horizon, parentId = null, flowColor = null) => (await execute({ type: 'create', title, horizon, flowColor, parentId, expectedParentVersion: parentId ? await version(parentId) : null })).itemId
    const root = await create('副业收入', 'later', null, 1)
    const other = await create('自媒体运营', 'later', null, 2)
    const b = await create('上线付费订阅', 'cycle', root), c = await create('接咨询客户', 'cycle', root)
    await create('小红书粉丝', 'cycle', other)
    const d = await create('移动端开发', 'month', b), f = await create('咨询介绍页', 'month', c)
    const j = await create('开发日志', 'week', d)
    await execute({ type: 'link', parentId: f, childId: j, expectedParentVersion: await version(f), expectedChildVersion: await version(j) })
    const p = await create('联系潜在客户', 'week', c)
    const k = await create('日志初稿', 'day', j)
    await execute({ type: 'status', itemId: k, expectedVersion: await version(k), status: 'done' })
    await create('剪演示视频', 'week', other)
    return { root, b, c, d, f, j, p, k }
  })
  const board = page.getByRole('main', { name: '时间看板' })
  const edges = board.locator('.relation-edge')
  assert.equal(await board.locator('.relation-lines').count(), 0, '「全部」不画线')

  await page.getByRole('button', { name: '只看 副业收入', exact: true }).click()
  // root→b, root→c, b→d, c→f, d→j, f→j, c→p; the done leaf stays folded, so j→k is not drawn.
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge').length === 7)
  assert.equal(await board.locator('.relation-edge[data-skip]').count(), 1, '3个月 → 本周 按跨级虚线')
  assert.equal(await board.locator('[data-dimmed="true"]').count(), 3, '其他流程原位置灰，不隐藏')
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

  // Push this flow's week rows out of view: the lines park on the column edge behind a marker that reveals them.
  await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    for (let index = 0; index < 30; index++) await window.goalloom.execute({ type: 'create', title: `本周杂事 ${index}`, horizon: 'week', generation, operationId: crypto.randomUUID() })
  })
  await page.waitForFunction(() => document.querySelectorAll('[data-horizon="week"] .task-row').length >= 32)
  await page.locator('[data-horizon="week"] .column-content').evaluate(node => { node.scrollTop = node.scrollHeight })
  const marker = board.getByRole('button', { name: '上方还有 2 项相关', exact: true })
  await marker.waitFor()
  assert.equal(await edges.count(), 7, '端点滚出视野时线仍停在列边')
  await board.screenshot({ path: `${shots}/relation-lines-marker.png` })
  await marker.click()
  await page.waitForFunction(id => {
    const row = document.getElementById(`item-${id}`), content = row?.closest('.column-content')
    if (!row || !content) return false
    const r = row.getBoundingClientRect(), c = content.getBoundingClientRect()
    return r.top >= c.top - 1 && r.bottom <= c.bottom + 1
  }, ids.p)

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
  console.log('relation lines: 7 edges, 1 skip, hover chain 6/1, marker reveal, settings switch persisted')
} finally {
  await application.close()
  await rm(profile, { recursive: true, force: true })
}
