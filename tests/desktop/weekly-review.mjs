/**
 * [INPUT]: Production Electron build, real workspace date and first/last-day weekly history fixtures.
 * [OUTPUT]: Weekly review-entry removal, separate planning invitations, default destinations, custom menu/focus, read-only titles, theme connectors, resume and creation evidence in output/tests/insight/weekly-review/.
 * [POS]: Flow-insight desktop regression using real renderer/preload/SQLite and isolated synthetic records.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import electronPath from 'electron'
import { _electron as electron } from 'playwright'
import { build } from 'vite'
import { seedPreviewCache, urls } from './fixtures/link-preview-cache.mjs'
import { verifyReviewDraftFocus } from './fixtures/review-draft-focus.mjs'
import { verifyReviewCompletion } from './fixtures/review-completion.mjs'
import { verifyReviewInvitation } from './fixtures/review-invitation.mjs'

const args = process.argv.slice(2), focusOnly = args.includes('--draft-focus'), completionOnly = args.includes('--completion'), invitationOnly = args.includes('--invitation')
const out = resolve(focusOnly ? 'output/tests/review-draft-focus/native' : completionOnly ? 'output/tests/review-completion/native' : invitationOnly ? 'output/tests/review-invitation/native' : 'output/tests/insight/weekly-review')
const packaged = args.find(value => !value.startsWith('--'))
const modes = args.includes('--week-last') ? ['week-last'] : args.includes('--week-first') ? ['week-first'] : ['week-first', 'week-last']
await mkdir(out, { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/review', emptyOutDir: false,
  lib: { entry: 'tests/desktop/fixtures/review-seed.ts', formats: ['cjs'], fileName: () => 'review-seed.cjs' }, rollupOptions: { external: [/^node:/] }, minify: false } })
const report = { ok: false, packaged: Boolean(packaged), group: focusOnly ? 'draft-focus' : completionOnly ? 'completion' : invitationOnly ? 'invitation' : 'weekly', scope: 'Real Electron/IPC/SQLite; isolated synthetic data',
  host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, machine: 'Physical/VM status unverified' }, scenarios: [] }
try {
  for (const mode of modes) for (const variant of completionOnly ? ['create', 'skip'] : [null]) await verify(mode, variant)
  report.ok = true
} finally { await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2)) }

async function verify(mode, variant) {
  const profile = await mkdtemp(join(tmpdir(), 'goalloom-weekly-review-'))
  const seed = spawnSync(electronPath, ['output/tests/build/review/review-seed.cjs', profile, mode], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8' })
  assert.equal(seed.status, 0, seed.stderr)
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  await seedPreviewCache(profile)
  const fixture = JSON.parse(await readFile(join(profile, 'review-fixture.json'), 'utf8'))
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
  const options = packaged ? { executablePath: resolve(packaged), args: [`--user-data-dir=${profile}`] } : { args: ['.', `--user-data-dir=${profile}`] }
  const app = await electron.launch({ ...options, env })
  const scenario = { mode, variant, ok: false, fixture, checks: [] }
  report.scenarios.push(scenario)
  const check = label => { scenario.checks.push(label); console.log(`✓ ${mode}: ${label}`) }
  const page = await app.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await app.evaluate(({ shell }) => {
      globalThis.reviewExternalLinks = []
      shell.openExternal = async url => { globalThis.reviewExternalLinks.push(url) }
    })
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1440, 900))
    await page.locator('.board').waitFor()
    // A monthly boundary must not take ownership of this independent weekly scenario.
    await page.evaluate(keys => localStorage.setItem('goalloom.insight', JSON.stringify({ reviewed: keys })), fixture.monthKeys)
    await page.reload(); await page.locator('.board').waitFor()
    scenario.runtime = await page.evaluate(() => window.goalloom.getRuntime())
    if (invitationOnly) {
      await verifyReviewInvitation({ page, fixture, mode, out, scenario, check })
      assert.deepEqual(errors, [])
      scenario.ok = true
      return
    }
    if (completionOnly) {
      await verifyReviewCompletion({ page, app, fixture, mode, variant, out, scenario, check })
      assert.deepEqual(errors, [])
      scenario.ok = true
      return
    }
    if (focusOnly) {
      await verifyReviewDraftFocus({ page, mode, out, scenario, check })
      assert.deepEqual(errors, [])
      scenario.ok = true
      return
    }
    const week = page.locator('[data-horizon=week]'), guide = week.locator('.review-guide').filter({ has: page.locator('[data-review]') })
    const reviewedName = mode === 'week-first' ? '上周' : '本周', nextName = mode === 'week-first' ? '本周' : '下周'
    await guide.waitFor()
    assert.equal(await page.locator('[data-review]').count(), 1)
    assert.equal(await week.locator('.backlog-entry, .insight-empty, .empty-column, .review-entry').count(), 0)
    assert.equal(await guide.getByRole('button').count(), 1)
    assert.equal(await guide.locator('h3').innerText(), `回顾 ${reviewedName}，安排 ${nextName}`)
    assert.equal(await guide.getByRole('button').innerText(), `开始 ${reviewedName}复盘`)
    assert.equal(await guide.locator('p').innerText(), '3 项未完成，一起整理后再出发。')
    assert.equal(await week.locator('.task-row').count(), mode === 'week-first' ? 0 : 2, 'The guide preserves visible current tasks')
    await week.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${out}/${mode}-unified-board.png` })
    await week.screenshot({ path: `${out}/${mode}-unified-guide.png` })
    check('One guide contains the unfinished count, suppresses competing hints and preserves current tasks')

    await guide.getByRole('button').click()
    const drawer = page.locator('dialog.review-drawer[open]')
    await drawer.locator('.review-body[aria-busy=false]').waitFor()
    assert.equal(await drawer.locator('.review-matrix-legend li').count(), 2)
    assert.equal(await drawer.getByText('点击目标，只看这条流程', { exact: true }).count(), 0)
    const footer = drawer.locator('.review-foot .review-text-button')
    await footer.hover()
    const laterHover = await footer.evaluate(async node => {
      await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => undefined)))
      return getComputedStyle(node).backgroundColor
    })
    assert.notEqual(laterHover, 'rgba(0, 0, 0, 0)', 'Later uses the shared hover background')
    await drawer.screenshot({ path: `${out}/${mode}-later-hover.png` })
    await drawer.locator('.review-head h2').hover()
    if (mode === 'week-last') {
      const link = drawer.locator('.review-matrix .link-inline').filter({ hasText: 'Fixture article without image' })
      await link.waitFor()
      assert.equal(await drawer.locator('.review-matrix button a').count(), 0, 'Matrix links are siblings of its filter button')
      const goal = drawer.locator('.review-matrix [role=rowheader] .review-item-title').first()
      assert.equal(await drawer.locator('.review-matrix button, .review-matrix [role=button]').count(), 0)
      assert.equal(await goal.evaluate(node => node.tabIndex), -1)
      await goal.click({ position: { x: 4, y: 8 } })
      assert.equal(await drawer.isVisible(), true, 'Matrix goal text does not filter or close the review')
      assert.equal(await page.locator('dialog.detail[open]').count(), 0)
      assert.equal(await page.locator('.flow-filter [aria-pressed=true]').innerText(), '全部')
      await drawer.screenshot({ path: `${out}/${mode}-read-only-matrix.png` })
      await link.click()
      assert.equal(await drawer.isVisible(), true, 'Following a matrix link does not filter and close the review')
      assert.deepEqual(await app.evaluate(() => globalThis.reviewExternalLinks), [urls.article])
    }
    const ids = [fixture.earlier, fixture.unfinished, fixture.defaultMove, fixture.parent]
    const originals = await page.evaluate(async ids => Promise.all(ids.map(async id => (await window.goalloom.getItem(id)).item)), ids)
    await drawer.locator('.review-foot .primary').click()
    const unfinished = drawer.locator('.review-close-row').filter({ hasText: 'Weekly unfinished review item' })
    await unfinished.waitFor()
    const earlier = drawer.locator('.review-close-row').filter({ hasText: 'Earlier weekly backlog' })
    const moving = drawer.locator('.review-close-row').filter({ hasText: 'Default weekly move' })
    assert.equal(await drawer.locator('.review-bulk').count(), 0)
    assert.equal(await drawer.getByRole('button', { name: /^全部移入/ }).count(), 0)
    assert.equal(await drawer.locator('.review-close-row .review-todo-check').count(), 3)
    const compactRows = await drawer.locator('.review-close-row').evaluateAll(rows => rows.map(row => {
      const marker = row.querySelector('.review-todo-check'), title = row.querySelector('.review-item-title'), choice = row.querySelector('[role=combobox]')
      const markerBox = marker.getBoundingClientRect(), titleBox = title.getBoundingClientRect(), rowBox = row.getBoundingClientRect()
      const style = getComputedStyle(row)
      return { height: rowBox.height, top: rowBox.top, bottom: rowBox.bottom, border: style.borderBottomWidth,
        marker: { width: markerBox.width, height: markerBox.height, center: markerBox.top + markerBox.height / 2, hidden: marker.getAttribute('aria-hidden'), tabIndex: marker.tabIndex },
        titleCenter: titleBox.top + parseFloat(getComputedStyle(title).lineHeight) / 2, choiceHeight: choice.getBoundingClientRect().height }
    }))
    assert(compactRows.every(row => row.border === '0px' && row.marker.hidden === 'true' && row.marker.tabIndex === -1))
    assert(compactRows.every(row => Math.abs(row.marker.center - row.titleCenter) <= 1), 'Task markers align with the first title line')
    assert(compactRows.every(row => row.choiceHeight === 30), 'Single-line Chinese choices use the compact height')
    assert(compactRows.every(row => row.height <= 50), 'Short fixture rows are compact')
    scenario.compactRows = compactRows
    const assertReadOnly = async container => {
      assert.equal(await container.locator('.task-title, button[aria-label], [role=button]').count(), 0, 'Task text has no detail/filter action')
      const title = container.locator('.review-item-title').first()
      assert.equal(await title.evaluate(node => node.tabIndex), -1)
      await title.click({ position: { x: 4, y: 8 } })
      assert.equal(await drawer.isVisible(), true)
      assert.equal(await page.locator('dialog.detail[open]').count(), 0)
      assert.equal(await page.locator('.flow-filter [aria-pressed=true]').innerText(), '全部')
    }
    await assertReadOnly(unfinished.locator('.review-goal-title'))
    for (const row of [earlier, unfinished, moving]) assert.equal(await row.getByRole('combobox').innerText(), `移入 ${nextName}`)
    await unfinished.locator(`a[href="${urls.article}"][data-status=ready]`).waitFor()
    assert.equal(await unfinished.locator('.link-domain-label').innerText(), 'Fixture article without image')
    await unfinished.locator(`a[href="${urls.article}"]`).click()
    assert.equal(await drawer.isVisible(), true)
    assert.equal(await app.evaluate(() => globalThis.reviewExternalLinks.at(-1)), urls.article)
    await moving.locator(`a[href="${urls.x}"][data-status=ready]`).waitFor()
    assert.equal(await moving.locator('.link-domain-label').innerText(), 'Fixture X post')
    assert.equal(await drawer.locator('.review-close-row small').count(), 0, 'Row dates do not duplicate the header')
    assert(await drawer.locator('.review-head p').innerText())
    assert.equal(await drawer.locator('.review-section > .review-note').innerText(), '未完成项默认移入目标周期，也可以留在原处或归档。')
    scenario.appearances = []
    for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
      const geometry = await drawer.evaluate((node, { style, theme }) => {
        document.documentElement.dataset.style = style; document.documentElement.dataset.theme = theme
        const steps = [...node.querySelectorAll('.review-steps li:not(:last-child)')].map(item => {
          const line = getComputedStyle(item, '::after')
          return { width: parseFloat(line.width), height: parseFloat(line.height), background: line.backgroundColor }
        })
        const trigger = node.querySelector('.review-close-row [role=combobox]'), icon = trigger.querySelector('.select-icon')
        return { style, theme, steps, iconInset: trigger.getBoundingClientRect().right - icon.getBoundingClientRect().right }
      }, { style, theme })
      assert(geometry.steps.every(line => line.width >= 12 && line.height === 1 && line.background !== 'rgba(0, 0, 0, 0)'), 'Both connectors remain visible after completing step one')
      assert(geometry.iconInset >= 12, 'The chevron has an intentional right inset')
      scenario.appearances.push(geometry)
      await footer.hover()
      const hover = await footer.evaluate(async node => {
        await Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => undefined)))
        return { background: getComputedStyle(node).backgroundColor, expected: getComputedStyle(node).getPropertyValue('--hover').trim() }
      })
      assert.notEqual(hover.background, 'rgba(0, 0, 0, 0)', 'Back has a hover surface in each appearance')
      geometry.footerHover = hover
      await drawer.screenshot({ path: `${out}/${mode}-closing-${style}-${theme}.png` })
      await drawer.locator('.review-head h2').hover()
    }
    await page.evaluate(() => { document.documentElement.dataset.style = 'paper'; document.documentElement.dataset.theme = 'light' })
    check('Saved URLs render as page titles, row dates are removed and completed connectors remain visible in four appearances')

    const trigger = unfinished.getByRole('combobox')
    assert.equal(await trigger.evaluate(node => node.tagName), 'BUTTON', 'The choice uses the shared custom Select')
    await trigger.press('Enter')
    const menu = drawer.getByRole('listbox')
    await menu.waitFor()
    assert.equal(await menu.getByRole('option').count(), 3)
    assert.equal(await menu.evaluate(node => node.closest('dialog')?.className), 'review-drawer')
    await menu.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => undefined))))
    await drawer.screenshot({ path: `${out}/${mode}-choice-menu.png` })
    await page.keyboard.press('Escape')
    await menu.waitFor({ state: 'detached' })
    await page.waitForFunction(label => document.activeElement?.getAttribute('aria-labelledby') === label, await trigger.getAttribute('aria-labelledby'))
    assert.equal(await drawer.isVisible(), true)
    assert.equal(await trigger.evaluate(node => document.activeElement === node), true, 'Escape returns focus to the trigger')
    await trigger.press('Enter')
    await menu.waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option')
    await page.keyboard.press('End')
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option' && document.activeElement.textContent === '归档')
    await page.keyboard.press('Enter')
    await menu.waitFor({ state: 'detached' })
    assert.equal(await trigger.innerText(), '归档')
    await earlier.getByRole('combobox').click()
    await drawer.getByRole('option', { name: '留在原处', exact: true }).click()
    await assertReadOnly(unfinished.locator('.review-goal-title'))
    assert.equal(await unfinished.getByRole('combobox').innerText(), '归档')
    assert.equal(await earlier.getByRole('combobox').innerText(), '留在原处')
    assert.deepEqual(await page.evaluate(async ids => Promise.all(ids.map(async id => (await window.goalloom.getItem(id)).item)), ids), originals, 'Rendering and changing choices do not write item data')
    check('The custom menu stays inside the modal, supports keyboard selection and Escape, and leaves source items unchanged until confirmation')
    await drawer.locator('.review-head .icon-button').click()
    await drawer.waitFor({ state: 'hidden' })
    await guide.getByRole('button', { name: '继续复盘', exact: true }).click()
    await drawer.locator('.review-body[aria-busy=false]').waitFor()
    assert.equal(await unfinished.getByRole('combobox').innerText(), '归档')
    assert.equal(await earlier.getByRole('combobox').innerText(), '留在原处')
    assert.equal(await moving.getByRole('combobox').innerText(), `移入 ${nextName}`)
    await app.evaluate(({ ipcMain }) => {
      const command = ipcMain._invokeHandlers.get('goalloom:command')
      let reject = true
      ipcMain.removeHandler('goalloom:command')
      ipcMain.handle('goalloom:command', (event, input) => {
        if (reject && input.type === 'move') { reject = false; return { ok: false, code: 'stale', message: 'Synthetic review move rejection' } }
        return command(event, input)
      })
    })
    await drawer.locator('.review-foot .primary').click()
    await drawer.getByRole('alert').waitFor()
    await drawer.screenshot({ path: `${out}/${mode}-partial-failure.png` })
    await drawer.locator('.review-foot .primary').click()
    const plan = drawer.locator('.review-plan-row').filter({ hasText: 'Current monthly direction' })
    const includeName = `排入${nextName}`
    await plan.waitFor()
    assert.equal(await drawer.locator('.review-existing').count(), 0, 'Existing plans are used for deduplication without being displayed')
    assert.equal(await drawer.getByRole('heading', { name: '为目标补上下一步', exact: true }).count(), 1)
    assert.equal(await drawer.locator('.review-plan-row').count(), 2)
    assert.equal(await drawer.locator('.review-plan-row .review-plan-source .check').count(), 2)
    assert.equal(await drawer.locator('.review-plan-row .review-plan-child .check').count(), 2)
    const planGeometry = await drawer.locator('.review-plan-row').evaluateAll(rows => rows.map(row => {
      const source = row.querySelector('.review-plan-source'), select = row.querySelector('[role=combobox]'), child = row.querySelector('.review-plan-child'), input = child.querySelector('.seed-title')
      const box = node => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, width: r.width } }
      const style = getComputedStyle(row)
      const parentMarker = source.querySelector('.check'), childMarker = child.querySelector('.check'), connector = getComputedStyle(row, '::before'), rowBox = box(row)
      return { row: rowBox, source: box(source), select: box(select), choiceHeight: select.getBoundingClientRect().height, iconInset: select.getBoundingClientRect().right - select.querySelector('.select-icon').getBoundingClientRect().right, child: box(child), input: box(input), parentMarker: box(parentMarker), childMarker: box(childMarker), borderLeft: style.borderLeftWidth, borderRight: style.borderRightWidth, borderTop: style.borderTopWidth,
        sourceRing: getComputedStyle(parentMarker).getPropertyValue('--flow-ring'), childRing: getComputedStyle(childMarker).getPropertyValue('--flow-ring'), connector: { border: connector.borderLeftWidth,
          top: rowBox.top + parseFloat(style.borderTopWidth) + parseFloat(connector.top),
          right: rowBox.left + parseFloat(style.borderLeftWidth) + parseFloat(connector.left) + parseFloat(connector.width),
          centerX: rowBox.left + parseFloat(style.borderLeftWidth) + parseFloat(connector.left) + .5,
          centerY: rowBox.bottom - parseFloat(style.borderBottomWidth) - parseFloat(connector.bottom) - .5 } }
    }))
    assert(planGeometry.every(row => row.select.left > row.source.right && row.row.right - row.select.right < 2), 'Selection controls sit at the right edge')
    assert(planGeometry.every(row => row.choiceHeight === compactRows[0].choiceHeight && row.iconInset === 13), 'Planning shares the compact closing Select height and chevron inset')
    assert(planGeometry.every(row => row.select.width < 130), 'Destination controls size to their text instead of a fixed field width')
    assert.equal(await drawer.locator('.review-plan-row [role=switch]').count(), 0)
    assert(planGeometry.every(row => row.input.left > row.source.left + 25 && row.connector.border === '1px'), 'Drafts are indented with a connector')
    assert(planGeometry.every(row => Math.abs(row.connector.top - row.parentMarker.bottom) <= .6 && Math.abs(row.connector.centerX - (row.parentMarker.left + row.parentMarker.width / 2)) <= .6), 'The vertical line touches and centres on the parent marker')
    assert(planGeometry.every(row => Math.abs(row.connector.centerY - (row.childMarker.top + row.childMarker.height / 2)) <= .6 && Math.abs(row.connector.right - row.childMarker.left) <= .6), 'The horizontal line touches the child marker at its midpoint')
    const shortRows = planGeometry.filter(row => row.source.height <= 22)
    assert(shortRows.length && shortRows.every(row => row.childMarker.top - row.parentMarker.bottom <= 11), 'Short parent/child rows use a compact gap')
    assert(planGeometry.every(row => row.borderLeft === '0px' && row.borderRight === '0px' && row.sourceRing && row.sourceRing === row.childRing))
    assert.equal(planGeometry[0].borderTop, '0px'); assert.equal(planGeometry[1].borderTop, '1px')
    scenario.planGeometry = planGeometry
    await plan.locator('.link-inline[data-status=ready]').waitFor()
    const saved = await page.evaluate(async ids => Promise.all(ids.map(async id => (await window.goalloom.getItem(id)).item)), ids)
    assert.deepEqual(saved[0], originals[0], 'A manual keep preserves the earlier item')
    assert(saved[1].archivedAt)
    assert.equal(saved[1].version, originals[1].version + 1, 'Retry does not archive the item twice')
    assert.equal(saved[2].placement.horizon, 'week')
    assert.equal(saved[2].placement.periodId, mode === 'week-first' ? fixture.current.id : fixture.current.id.replace(fixture.current.startDate, fixture.current.endDate))
    assert.equal(saved[2].version, originals[2].version + 1, 'The default move commits once')
    assert.equal(saved[2].title, originals[2].title, 'Metadata does not replace source URLs')
    scenario.decisions = { kept: saved[0].id, archived: saved[1].id, moved: saved[2].id, destination: saved[2].placement.periodId }
    check('Default move uses the exact first/last-day destination, manual keep/archive persist, and a partial rejection retries without duplicates')
    await plan.locator('.seed-title').fill('Preserved weekly draft')
    const draftFocus = await plan.locator('.seed-title').evaluate(input => {
      const style = getComputedStyle(input)
      return { focused: input === document.activeElement, outline: style.outlineStyle, shadow: style.boxShadow, border: style.borderTopWidth, background: style.backgroundColor }
    })
    assert.equal(draftFocus.focused, true)
    assert.equal(draftFocus.outline, 'none')
    assert.equal(draftFocus.shadow, 'none')
    assert.equal(draftFocus.border, '0px')
    scenario.draftFocus = draftFocus
    await plan.screenshot({ path: `${out}/${mode}-focused-draft.png` })
    await plan.locator('.seed-title').press('Tab')
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox')
    const followingFocus = await drawer.evaluate(() => ({ role: document.activeElement?.getAttribute('role'), outline: getComputedStyle(document.activeElement).outlineStyle }))
    assert.equal(followingFocus.role, 'combobox')
    assert.equal(followingFocus.outline, 'solid', 'Dropdown keyboard focus stays visible')
    await assertReadOnly(plan.locator('.review-plan-source'))
    const planChoice = plan.getByRole('combobox')
    assert.equal(await planChoice.innerText(), includeName, 'A source title click does not toggle inclusion')
    await planChoice.focus()
    await page.keyboard.press('Space')
    await drawer.getByRole('option', { name: includeName, exact: true }).waitFor()
    await page.waitForFunction(name => document.activeElement?.getAttribute('role') === 'option' && document.activeElement.textContent === name, includeName)
    assert(await drawer.getByRole('option', { name: '不排入', exact: true }).evaluate(node => !!node.closest('dialog.review-drawer')))
    await drawer.screenshot({ path: `${out}/${mode}-planning-menu.png` })
    await page.keyboard.press('ArrowDown')
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option' && document.activeElement.textContent === '不排入')
    await page.keyboard.press('Enter')
    await planChoice.getByText('不排入', { exact: true }).waitFor()
    assert.equal(await planChoice.innerText(), '不排入')
    await planChoice.press('Enter')
    await drawer.getByRole('option', { name: '不排入', exact: true }).waitFor()
    await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'option' && document.activeElement.textContent === '不排入')
    await page.keyboard.press('Escape')
    await drawer.getByRole('listbox').waitFor({ state: 'detached' })
    assert.equal(await drawer.isVisible(), true)
    await page.waitForFunction(() => document.activeElement?.getAttribute('data-slot') === 'select-trigger')
    assert.equal(await planChoice.evaluate(node => node === document.activeElement), true)
    await planChoice.click()
    await drawer.getByRole('option', { name: includeName, exact: true }).click()
    assert.equal(await planChoice.innerText(), includeName)
    assert.equal(await plan.locator('.seed-title').inputValue(), 'Preserved weekly draft')
    await drawer.screenshot({ path: `${out}/${mode}-read-only-plans.png` })
    check('Matrix, closing, existing and source task titles remain read-only while choices, drafts and independent URLs work')
    await drawer.locator('.review-head .icon-button').click()
    await guide.getByRole('button', { name: '继续复盘', exact: true }).click()
    await drawer.locator('.review-body[aria-busy=false]').waitFor()
    assert.equal(await plan.locator('.seed-title').inputValue(), 'Preserved weekly draft')
    if (mode === 'week-first') {
      const beforeSkip = await page.evaluate(() => window.goalloom.getSnapshot().then(snapshot => snapshot.workspace.revision))
      if (await page.locator('.toast .icon-button').count()) await page.locator('.toast .icon-button').last().click()
      await drawer.locator('.review-foot .primary:not(:disabled)').waitFor()
      await drawer.screenshot({ path: `${out}/${mode}-suggestions.png` })
      await drawer.getByRole('button', { name: '不排入', exact: true }).click()
      await drawer.waitFor({ state: 'detached' })
      assert.equal(await page.evaluate(() => window.goalloom.getSnapshot().then(snapshot => snapshot.workspace.revision)), beforeSkip, 'Skipping checked drafts writes no workspace data')
    } else {
      await drawer.locator('.review-plan-row').filter({ hasText: 'Additional monthly direction' }).getByRole('combobox').click()
      await drawer.getByRole('option', { name: '不排入', exact: true }).click()
      if (await page.locator('.toast .icon-button').count()) await page.locator('.toast .icon-button').last().click()
      await drawer.locator('.review-foot .primary:not(:disabled)').waitFor()
      await drawer.screenshot({ path: `${out}/${mode}-suggestions.png` })
      await drawer.locator('.review-foot .primary').click()
      await drawer.waitFor({ state: 'detached' })
      const written = await page.evaluate(async fixture => {
        const snapshot = await window.goalloom.getSnapshot()
        const context = await window.goalloom.getReviewContext({ type: 'reviewContext', generation: snapshot.workspace.generation, periods: [{ horizon: 'week', startDate: fixture.period.startDate }] })
        return { items: context.planning.items.filter(item => item.title === 'Preserved weekly draft'), relations: context.planning.relations }
      }, fixture)
      assert.equal(written.items.length, 1)
      assert(written.relations.some(edge => edge.parentId === fixture.parent && edge.childId === written.items[0].id))
    }
    await page.screenshot({ path: `${out}/${mode}-finished-board.png` })
    assert.equal(await week.locator('[data-review]').count(), 0)
    await guide.waitFor({ state: 'detached' })
    check('The weekly session resumes decisions and drafts, then completes without creating unchecked plans')

    await page.reload(); await page.locator('.board').waitFor()
    assert.equal(await week.locator('[data-review]').count(), 0)
    assert.equal(await week.locator('.backlog-entry').count(), 1)
    assert.equal(await week.locator('.insight-empty, .empty-column').count(), 0)
    assert.equal(await week.locator('.reviewed-note').innerText(), `${reviewedName}已复盘`)
    const afterReview = await page.evaluate(async () => window.goalloom.getSnapshot())
    assert.equal(afterReview.backlog.week, 1)
    assert.equal(afterReview.items.filter(item => item.placement.horizon === 'week').length, mode === 'week-first' ? 1 : 0)
    await week.screenshot({ path: `${out}/${mode}-completed.png` })
    if (mode === 'week-first') {
      assert.equal(await week.locator('.review-plan-invitation').count(), 0, 'The moved item keeps the current week populated')
      await week.locator('.task-row .link-domain-label').filter({ hasText: 'Fixture X post' }).waitFor()
      const cleared = await page.evaluate(async id => {
        const { item } = await window.goalloom.getItem(id), snapshot = await window.goalloom.getSnapshot()
        return window.goalloom.execute({ type: 'archive', itemId: id, expectedVersion: item.version, archived: true,
          generation: snapshot.workspace.generation, operationId: crypto.randomUUID() })
      }, fixture.defaultMove)
      assert.equal(cleared.ok, true)
    }
    const invitation = week.locator('.review-plan-invitation')
    await invitation.waitFor()
    assert.equal(await invitation.locator('h3').innerText(), '安排 本周')
    await week.locator('.backlog-entry').click()
    await page.getByText('Earlier weekly backlog', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    check('Completion persists across reload, preserves a default-moved task and retained backlog, and offers one invitation when the current week is empty')

    await invitation.getByRole('button', { name: '起草下一步', exact: true }).click()
    const composer = page.getByRole('dialog', { name: '新建', exact: true })
    await composer.locator('.seed-title').first().fill(`Current weekly action ${mode}`)
    await composer.getByRole('button', { name: /^创建 1 项/ }).click()
    await composer.waitFor({ state: 'detached' })
    const created = await page.evaluate(async title => {
      const snapshot = await window.goalloom.getSnapshot()
      return { item: snapshot.items.find(item => item.title === title), relations: snapshot.relations }
    }, `Current weekly action ${mode}`)
    assert.equal(created.item.placement.horizon, 'week')
    assert.equal(created.item.placement.periodId, fixture.current.id)
    assert(created.relations.some(edge => edge.parentId === fixture.parent && edge.childId === created.item.id))
    assert.equal(await invitation.count(), 0)
    await week.screenshot({ path: `${out}/${mode}-current-week-created.png` })
    check('The post-review invitation creates in the current week under its monthly parent')
    assert.deepEqual(errors, [])
    scenario.ok = true
  } catch (error) {
    scenario.error = String(error)
    scenario.native = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() }))).catch(() => null)
    scenario.document = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML })).catch(() => null)
    await page.screenshot({ path: `${out}/${mode}-failure.png` }).catch(() => {})
    throw error
  } finally { await app.close(); await rm(profile, { recursive: true, force: true }) }
}
