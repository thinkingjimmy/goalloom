/**
 * [INPUT]: Real Electron, an isolated profile, production IPC fixtures and board interactions.
 * [OUTPUT]: Relation-line/flow-dot assertions, full-title geometry, endpoint dimensions, dynamic popover bounds, board-ordered filter evidence and app-local failure diagnostics in JSON and screenshots.
 * [POS]: Desktop flow acceptance; exercises live snapshots, keyboard moves and positional filter shortcuts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { arch, cpus, platform, release, tmpdir, version } from 'node:os'
import { _electron as electron } from 'playwright'
import { pollPage } from './fixtures/poll.mjs'
import { verifyFlowDotPosition } from './fixtures/flow-dot-position.mjs'

// 关系线：筛选单个流程时连起上下级，其余流程原位置灰；悬停高亮整条链；滚出视野的端点给标记；设置里可关闭。
// 流程圆点：悬停预览该条目的流程（连线 + 流程底色）；起点改色、下级改上级、独立条目二选一；Later 不参与。
const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
const packaged = process.argv[2], profile = await mkdtemp(join(tmpdir(), 'Goalloom 关系线 '))
// Assertions use Chinese copy; pin the device language instead of following the machine's system language.
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
const application = await electron.launch({ ...options, env: environment, timeout: 30_000 })
const shots = 'output/tests/screenshots'
const errors = []
try {
  const page = await application.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  // Use the actual native viewport, including the host's screen-size constraints.
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1600, 900))
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
    const b = await create('上线付费订阅', 'month', root), c = await create('接咨询客户：整理报价单、约三次访谈，并沉淀成可复用的咨询方案模板、交付清单和复盘记录，再同步到官网案例页', 'month', root)
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
    return { root, other, b, c, d, f, j, p, k, later, loose }
  })
  const board = page.getByRole('main', { name: '时间看板' })
  // The draggable titlebar corner does not provide a reliable DOM pointer target.
  const leaveBoard = () => page.getByRole('button', { name: '全部', exact: true }).hover()
  const edges = board.locator('.relation-edge')
  const dot = id => page.locator(`#item-${id} .flow-dot-button`)
  const waitForDotOpacity = (id, opacity) => page.waitForFunction(({ id, opacity }) => {
    const button = document.querySelector(`#item-${id} .flow-dot-button`)
    return button && getComputedStyle(button).opacity === opacity
  }, { id, opacity })
  const endpointMeasurements = []
  const measureEndpoints = async state => {
    const endpoints = await page.evaluate(async () => {
      const { relations } = await window.goalloom.getSnapshot()
      return [...document.querySelectorAll('.relation-edge')].map(path => {
        const edge = relations.find(edge => edge.id === path.dataset.edgeId)
        const parent = document.getElementById(`item-${edge.parentId}`).getBoundingClientRect()
        const button = document.querySelector(`#item-${edge.childId} .flow-dot-button`)
        const dot = button.querySelector('.flow-dot').getBoundingClientRect(), hit = button.getBoundingClientRect()
        const port = document.querySelector(`[data-port-key^="${edge.parentId}:"]`).getBoundingClientRect()
        const end = path.getPointAtLength(path.getTotalLength()).matrixTransform(path.getScreenCTM())
        return { edgeId: edge.id, dot: [dot.width, dot.height], port: [port.width, port.height], hit: [hit.width, hit.height],
          portError: Math.abs(port.left + port.width / 2 - parent.right),
          connectionError: Math.hypot(end.x - dot.left, end.y - dot.top - dot.height / 2) }
      })
    })
    assert.equal(endpoints.length, 7)
    for (const endpoint of endpoints) {
      assert.deepEqual(endpoint.dot, [6, 6], 'Incoming dots match the 6px outgoing ports, including hover')
      assert.deepEqual(endpoint.port, endpoint.dot)
      assert.deepEqual(endpoint.hit, [18, 18], 'The smaller dot keeps its existing hit target')
      assert(endpoint.portError < 0.5 && endpoint.connectionError < 0.5, 'Lines meet the row edge and the incoming dot')
    }
    endpointMeasurements.push({ state, endpoints })
  }
  assert.equal(await board.locator('.relation-lines').count(), 0, '「全部」不画线')

  await page.getByRole('button', { name: '只看 副业收入', exact: true }).click()
  // root→b, root→c, b→d, c→f, d→j, f→j, c→p; the done leaf stays folded, so j→k is not drawn.
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge').length === 7)
  // Insight owns the guide's acceptance; complete it before exercising the underlying flow menus.
  await board.locator('.breakpoint-guide').getByRole('button', { name: '知道了', exact: true }).click()
  assert.equal(await board.locator('.relation-edge[data-skip]').count(), 1, '本月 → 今天 按跨级虚线')
  assert.equal(await board.locator('[data-dimmed="true"]').count(), 5, '其他流程与无流程条目原位置灰，不隐藏')
  assert.equal(await board.locator('[data-lit="true"]').count(), 7, '本流程的行铺上流程底色')
  assert.equal(await board.getByRole('button', { name: '剪演示视频', exact: true }).isVisible(), true)
  const row = await page.locator(`#item-${ids.b}`).evaluate(node => { const style = getComputedStyle(node); return { margin: style.marginRight, ground: style.backgroundColor } })
  // Rows keep their full width while lines are drawn; the opaque ground hides curves passing behind.
  assert.equal(row.margin, '-8px'); assert.notEqual(row.ground, 'rgba(0, 0, 0, 0)')
  // Long titles show every line; the checkbox and the line anchors stay on the first line.
  const tall = await page.locator(`#item-${ids.c}`).evaluate(node => {
    const r = node.getBoundingClientRect(), title = node.querySelector('.task-title > span'), board = node.closest('.board').getBoundingClientRect()
    const anchor = r.top - board.top + 16
    const add = document.querySelector(`.breakpoint[data-spot-key="skip:${node.dataset.itemId}"]`)?.getBoundingClientRect()
    const checkbox = node.querySelector('.check'), check = checkbox.getBoundingClientRect()
    const text = document.createRange(); text.selectNodeContents(title)
    const fragments = [...text.getClientRects()]
    return { height: Math.round(r.height), lines: Math.round(title.getBoundingClientRect().height / 22), clipped: title.scrollHeight > title.clientHeight + 1,
      firstLineAligned: Math.abs(fragments[0].left - check.right - 12) < 0.5,
      continuationAligned: fragments.slice(1).every(fragment => Math.abs(fragment.left - check.left) < 0.5),
      checkClickable: document.elementFromPoint(check.left + check.width / 2, check.top + check.height / 2)?.closest('.check') === checkbox,
      addAligned: !!add && Math.abs(add.left + add.width / 2 - r.right) < 0.5 && Math.abs(add.top + add.height / 2 - r.top - 16) < 0.5,
      check: Math.round(node.querySelector('.check').getBoundingClientRect().top - r.top - 2), anchored: [...document.querySelectorAll('.relation-port')].some(port => Math.abs(Number(port.getAttribute('cy')) - anchor) < 1) }
  })
  assert(tall.lines > 2, 'A long task title grows beyond two lines')
  assert.deepEqual(tall, { height: tall.lines * 22 + 10, lines: tall.lines, clipped: false, firstLineAligned: true, continuationAligned: true, checkClickable: true, addAligned: true, check: 5, anchored: true })
  // Neighbouring tinted rows keep a clear band between their grounds instead of merging into one block.
  const band = await page.evaluate(([upper, lower]) => {
    const a = document.getElementById(`item-${upper}`), b = document.getElementById(`item-${lower}`)
    const inset = node => parseFloat(getComputedStyle(node).borderTopWidth)
    const groundEnd = a.getBoundingClientRect().bottom - inset(a), nextGround = b.getBoundingClientRect().top + inset(b)
    return { band: Math.round(nextGround - groundEnd), divider: getComputedStyle(a.querySelector('.task-line'), '::after').content }
  }, [ids.b, ids.c])
  // Rows carry no divider: that band is the only separation.
  assert.deepEqual(band, { band: 4, divider: 'none' })
  // Hover and tint paint only the ground, never the band, so the separation stays visible.
  await page.locator(`#item-${ids.c} .task-title`).hover()
  assert.deepEqual(await page.evaluate(ids => ids.map(id => getComputedStyle(document.getElementById(`item-${id}`)).backgroundClip), [ids.b, ids.c]), ['padding-box', 'padding-box'])
  await leaveBoard()
  // Columns keep a comfortable width, and a row's ground sits 8px from both column rules.
  const inset = await page.locator(`#item-${ids.d}`).evaluate(node => {
    const column = node.closest('.board-column').getBoundingClientRect(), r = node.getBoundingClientRect()
    // The column draws its own 1px rule on the left; the right rule belongs to the next column.
    return { width: Math.round(column.width), left: Math.round(r.left - column.left - 1), right: Math.round(column.right - r.right) }
  })
  assert.ok(inset.width >= 356, `column width ${inset.width}`)
  assert.deepEqual([inset.left, inset.right], [8, 8])
  await page.waitForTimeout(1000)
  const dimmedTitle = await board.getByRole('button', { name: '剪演示视频', exact: true }).evaluate(node => getComputedStyle(node.closest('.task-line')).opacity)
  assert.equal(dimmedTitle, '0.28')
  await waitForDotOpacity(ids.root, '0')
  await waitForDotOpacity(ids.b, '1')
  await measureEndpoints('filtered')
  await mkdir(shots, { recursive: true })
  await board.screenshot({ path: `${shots}/relation-lines.png` })

  // Filtering hides the cycle TODO dot at rest, while hover, keyboard focus and the open menu keep it usable.
  const rootCheckbox = page.locator(`#item-${ids.root} .check`)
  // Hover may scroll the overflowing board; compare the checkbox's position inside its row.
  const checkboxPosition = () => rootCheckbox.evaluate(node => {
    const rect = node.getBoundingClientRect(), row = node.closest('.task-row').getBoundingClientRect()
    return { x: rect.x - row.x, y: rect.y - row.y, width: rect.width, height: rect.height }
  })
  const checkboxBounds = await checkboxPosition()
  await page.locator(`#item-${ids.root} .task-title`).hover()
  await waitForDotOpacity(ids.root, '1')
  assert.deepEqual(await checkboxPosition(), checkboxBounds, 'Revealing the dot keeps the checkbox in place')
  await board.screenshot({ path: `${shots}/flow-dot-filtered-hover.png` })
  await dot(ids.root).click()
  const filteredMenu = page.locator('.popover-floating .flow-menu')
  await filteredMenu.waitFor()
  await filteredMenu.locator('.flow-menu-header').hover()
  await waitForDotOpacity(ids.root, '1')
  await page.keyboard.press('Escape')
  await filteredMenu.waitFor({ state: 'detached' })
  // Escape leaves visible keyboard focus on the trigger; clear it before checking the idle state.
  await dot(ids.root).blur()
  await leaveBoard()
  await waitForDotOpacity(ids.root, '0')
  await page.locator(`#item-${ids.root} .drag-handle`).focus()
  await page.keyboard.press('Shift+Tab')
  assert.equal(await dot(ids.root).evaluate(node => node === document.activeElement && node.matches(':focus-visible')), true)
  await waitForDotOpacity(ids.root, '1')
  await dot(ids.root).blur()
  await waitForDotOpacity(ids.root, '0')

  // Hovering the two-parent item lights both ancestor paths and its descendants; the rest fades.
  await page.locator(`#item-${ids.j} .task-title`).hover()
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge[data-state="hot"]').length === 6)
  assert.equal(await board.locator('.relation-edge[data-state="faded"]').count(), 1)
  assert.equal(await board.locator('[data-chain-out="true"]').count(), 1, '只有「联系潜在客户」不在链上')
  await board.screenshot({ path: `${shots}/relation-lines-hover.png` })
  await leaveBoard()
  await page.waitForFunction(() => !document.querySelector('.relation-edge[data-state="hot"], [data-chain-out]'))

  // Keyboard focus lights the chain too.
  await page.locator(`#item-${ids.p} .task-title`).focus()
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge[data-state="hot"]').length === 2)
  await page.locator(`#item-${ids.p} .task-title`).blur()

  // Flow dot: under 全部, hovering a coloured dot previews that item's flows — lines ending on the dots, rows in the flow tinted.
  const relationCount = () => page.evaluate(async () => (await window.goalloom.getSnapshot()).relations.length)
  await page.getByRole('button', { name: '只看 副业收入', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.relation-lines'))
  assert.equal(await page.locator(`#item-${ids.later} .flow-dot-button`).count(), 0, 'Later 不显示圆点，不参与关联')
  await page.locator(`#item-${ids.j} .task-title`).hover()
  await dot(ids.j).hover()
  await page.waitForFunction(() => document.querySelectorAll('.relation-edge[data-state="hot"]').length === 6)
  assert.equal(await board.locator('[data-lit="true"]').count(), 7, '预览时本流程的行铺上流程底色')
  await waitForDotOpacity(ids.root, '1')
  const [tinted, ground] = await Promise.all([ids.b, ids.loose].map(id => page.locator(`#item-${id}`).evaluate(node => getComputedStyle(node).backgroundColor)))
  assert.notEqual(tinted, ground)
  await page.waitForTimeout(300)
  await measureEndpoints('hover-preview')
  await board.screenshot({ path: `${shots}/flow-dot-preview.png` })
  await leaveBoard()
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
  await pollPage(page, async () => (await window.goalloom.getSnapshot()).relations.length === 9)
  await page.keyboard.press('Escape')
  await parents.waitFor({ state: 'detached' })
  assert.equal(await page.locator('.toast').count(), 0, 'Unlink is quiet')
  await page.keyboard.press('ControlOrMeta+z')
  await pollPage(page, async () => (await window.goalloom.getSnapshot()).relations.length === 10)
  await page.locator('.toast [role="status"]').filter({ hasText: '已撤销' }).waitFor()
  await page.getByRole('button', { name: '关闭操作提示', exact: true }).click()

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
  await pollPage(page, async () => (await window.goalloom.getSnapshot()).relations.length === 11)
  await page.keyboard.press('Escape')
  await page.waitForFunction(id => document.querySelector(`#item-${id} .flow-dot-button`)?.dataset.role === 'child', ids.loose)
  assert.equal(await page.locator('.toast').count(), 0, 'Link is quiet')
  await page.keyboard.press('ControlOrMeta+z')
  await pollPage(page, async () => (await window.goalloom.getSnapshot()).relations.length === 10)
  await page.locator('.toast [role="status"]').filter({ hasText: '已撤销' }).waitFor()
  await page.getByRole('button', { name: '关闭操作提示', exact: true }).click()
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
  assert.equal(await page.locator(`#item-${ids.b}`).evaluate(node => getComputedStyle(node).marginRight), '-8px', '关闭后行宽不变')
  const even = await page.locator(`#item-${ids.b}`).evaluate(node => { const column = node.closest('.board-column').getBoundingClientRect(), r = node.getBoundingClientRect(); return [Math.round(r.left - column.left - 1), Math.round(column.right - r.right)] })
  assert.deepEqual(even, [8, 8], '行底色左右离两侧竖线对等')
  assert.equal(await page.evaluate(() => localStorage.getItem('goalloom.relationLines')), 'false')
  assert.equal(await page.getByRole('banner').getByText('关系线').count(), 0, '顶栏没有关系线入口')
  await page.reload()
  await page.getByRole('main', { name: '时间看板' }).waitFor()
  await page.getByRole('button', { name: '只看 副业收入', exact: true }).click()
  assert.equal(await board.locator('.relation-lines').count(), 0, '重启窗口后保持关闭')
  await page.evaluate(() => localStorage.removeItem('goalloom.relationLines'))

  // Palette order intentionally disagrees with both the column order and each column's row order.
  await page.getByRole('button', { name: '全部', exact: true }).click()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1880, 1000))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const roots = await page.evaluate(async () => {
    const generation = (await window.goalloom.getSnapshot()).workspace.generation
    const create = async (title, horizon, flowColor) => {
      const reply = await window.goalloom.execute({ type: 'create', title, horizon, flowColor, generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw new Error(reply.message)
      return reply.result.itemId
    }
    return {
      day: await create('Daily direction', 'day', 0),
      month: await create('Monthly direction A', 'month', 7),
      nextMonth: await create('Monthly direction B', 'month', 4),
      week: await create('Weekly direction', 'week', 3),
      cycle: await create('Fitness direction', 'cycle', 6),
    }
  })
  const rootNames = new Map([[ids.root, '副业收入'], [ids.other, '自媒体运营'], [roots.cycle, 'Fitness direction'],
    [roots.month, 'Monthly direction A'], [roots.nextMonth, 'Monthly direction B'], [roots.week, 'Weekly direction'], [roots.day, 'Daily direction']])
  const checkpoints = []
  const filterOrder = async (expected, label, displayed = expected) => {
    const names = expected.map(id => rootNames.get(id))
    await page.waitForFunction(names => JSON.stringify([...document.querySelectorAll('.flow-filter .chip[aria-label]')].map(node => node.getAttribute('aria-label'))) === JSON.stringify(names.map(name => `只看 ${name}`)), names)
    await page.waitForFunction(({ expected, displayed }) => JSON.stringify([...document.querySelectorAll('.board .task-row')].map(row => row.dataset.itemId).filter(id => expected.includes(id))) === JSON.stringify(displayed), { expected, displayed })
    const actual = await board.locator('.task-row').evaluateAll((rows, rootIds) => rows.map(row => row.dataset.itemId).filter(id => rootIds.includes(id)), expected)
    assert.deepEqual(actual, displayed, `${label}: filters follow the board's column/row order`)
    checkpoints.push({ label, order: names, shortcuts: await page.locator('.flow-filter .chip[aria-label]').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-keyshortcuts'))) })
  }
  const drag = async (id, direction) => {
    await page.locator(`#item-${id} .drag-handle`).focus()
    await page.keyboard.press('Space')
    await page.waitForFunction(() => document.documentElement.dataset.dragging === 'true')
    await page.keyboard.press(direction)
    await page.keyboard.press('Space')
    await page.waitForFunction(() => !document.documentElement.dataset.dragging)
  }
  let order = [ids.root, ids.other, roots.cycle, roots.month, roots.nextMonth, roots.week, roots.day]
  await filterOrder(order, 'Initial order across all planning columns')
  await page.getByRole('button', { name: '只看 自媒体运营', exact: true }).click()
  await drag(ids.other, 'ArrowUp')
  order = [ids.other, ids.root, roots.cycle, roots.month, roots.nextMonth, roots.week, roots.day]
  await filterOrder(order, 'Cycle reordering updates filters without changing flow metadata')
  assert.equal(await page.getByRole('button', { name: '只看 自媒体运营', exact: true }).getAttribute('aria-pressed'), 'true')
  await drag(roots.nextMonth, 'ArrowUp')
  order = [ids.other, ids.root, roots.cycle, roots.nextMonth, roots.month, roots.week, roots.day]
  await filterOrder(order, 'Same-column order takes priority over palette order')
  for (let index = 0; index < order.length; index++) {
    await page.keyboard.press(`ControlOrMeta+${index + 2}`)
    await page.getByRole('button', { name: `只看 ${rootNames.get(order[index])}`, exact: true, pressed: true }).waitFor()
  }
  await page.keyboard.press('ControlOrMeta+2')
  await drag(ids.other, 'ArrowRight')
  await filterOrder([ids.root, roots.cycle, ids.other, roots.nextMonth, roots.month, roots.week, roots.day], 'Cross-column move follows the destination column')
  assert.equal(await page.getByRole('button', { name: '只看 自媒体运营', exact: true }).getAttribute('aria-pressed'), 'true')
  await page.keyboard.press('ControlOrMeta+z')
  await filterOrder(order, 'Undo restores the original filter order')
  await page.getByRole('button', { name: '关闭操作提示', exact: true }).click()

  await page.locator(`#item-${ids.other} .check`).click()
  await page.locator('[data-horizon="cycle"] .completed-fold summary').click()
  await filterOrder([ids.root, roots.cycle, ids.other, roots.nextMonth, roots.month, roots.week, roots.day], 'Completed roots follow TODO roots within the same column')
  await page.keyboard.press('ControlOrMeta+z')
  await filterOrder(order, 'Undo completion restores row and filter order')
  await page.getByRole('button', { name: '关闭操作提示', exact: true }).click()

  const changeRoot = async (itemId, fields) => page.evaluate(async ({ itemId, fields }) => {
    const snapshot = await window.goalloom.getSnapshot(), { item } = await window.goalloom.getItem(itemId)
    const reply = await window.goalloom.execute({ ...fields, itemId, expectedVersion: item.version, generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
    if (!reply.ok) throw new Error(reply.message)
  }, { itemId, fields })
  await changeRoot(roots.month, { type: 'flowColor', flowColor: 5 })
  await filterOrder(order, 'Changing a color preserves placement-based order')
  await changeRoot(roots.nextMonth, { type: 'archive', archived: true })
  await filterOrder(order.filter(id => id !== roots.nextMonth), 'Archived roots are omitted')
  await changeRoot(roots.nextMonth, { type: 'archive', archived: false })
  await filterOrder(order, 'Restored roots return to their board position')

  await page.locator('#later-toggle').click()
  await filterOrder(order, 'Collapsing Later keeps the fixed planning columns, filters and shortcut positions')
  await page.locator('#later-toggle').click()
  await filterOrder(order, 'Expanding Later preserves the same filter order')

  const monthColumn = page.locator('[data-horizon="month"]')
  await page.locator(`#item-${roots.nextMonth}`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: /移到下月/ }).click()
  const outside = [...order.filter(id => id !== roots.nextMonth), roots.nextMonth]
  await filterOrder(outside, 'Off-board roots stay available after visible roots', outside.filter(id => id !== roots.nextMonth))
  await monthColumn.locator('[data-next-period]').click()
  const future = [ids.other, ids.root, roots.cycle, roots.nextMonth, roots.week, roots.day, roots.month]
  await filterOrder(future, 'Future-period roots use their displayed column position', future.filter(id => id !== roots.month))
  await monthColumn.locator('[data-return-current]').click()
  await filterOrder(outside, 'Returning to the current period restores its ordering', outside.filter(id => id !== roots.nextMonth))
  await page.keyboard.press('ControlOrMeta+z')
  await filterOrder(order, 'Undo future move restores the current row and filter')
  await page.reload()
  await board.waitFor()
  await filterOrder(order, 'Reload derives the same order from persisted placements')
  await page.locator(`#item-${roots.week}`).scrollIntoViewIfNeeded()
  await leaveBoard()
  const screenshot = `${shots}/flow-filter-order.png`
  await page.screenshot({ path: screenshot })
  const positioning = await verifyFlowDotPosition(application, page, shots)
  const report = {
    ok: true, packaged: Boolean(packaged), runtime: await page.evaluate(() => window.goalloom.getRuntime()),
    environment: { platform: platform(), release: release(), version: version(), arch: arch(), cpu: cpus()[0]?.model, machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified' },
    scope: 'Real Electron with production IPC and keyboard dragging in an isolated profile. Source runs do not verify packaged or Windows acceptance.',
    checkpoints, screenshot,
  }
  await writeFile('output/tests/flow-filter-order.json', JSON.stringify(report, null, 2))
  await writeFile('output/tests/flow-dot-position.json', JSON.stringify({ ok: true, runtime: report.runtime, environment: report.environment, scope: report.scope, ...positioning }, null, 2))
  await writeFile('output/tests/relation-endpoints.json', JSON.stringify({ ok: true, runtime: report.runtime, environment: report.environment, scope: report.scope, fullTitle: tall, measurements: endpointMeasurements }, null, 2))
  assert.deepEqual(errors, [])
  console.log(`flow filter order: ${checkpoints.length} checkpoints; output/tests/flow-filter-order.json`)
  console.log('relation lines: 7 edges, 1 skip, hover chain 6/1, marker reveal, settings switch persisted; flow dot: filtered cycle TODO visibility, hover/focus/menu access, unfiltered preview + tint, root colour, child parents, loose join, horizon rule')
} catch (error) {
  const page = await application.firstWindow()
  await mkdir(shots, { recursive: true })
  const diagnostics = {
    error: String(error), errors, url: page.url(),
    native: await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getBounds(), contentBounds: window.getContentBounds() }))),
    renderer: await page.evaluate(() => {
      const describe = node => node ? { tag: node.tagName, id: node.id, className: node.getAttribute('class'), label: node.getAttribute('aria-label') } : null
      return { focused: document.hasFocus(), visibility: document.visibilityState, viewport: { width: innerWidth, height: innerHeight }, active: describe(document.activeElement), hovered: [...document.querySelectorAll(':hover')].map(describe), hotEdges: document.querySelectorAll('.relation-edge[data-state="hot"]').length }
    }),
  }
  await writeFile('output/tests/relations-failure.json', JSON.stringify(diagnostics, null, 2))
  await page.screenshot({ path: `${shots}/relations-failure.png` })
  console.error({ errors, url: page.url(), body: await page.locator('body').innerText() })
  throw error
} finally {
  await application.close()
  await rm(profile, { recursive: true, force: true })
}
