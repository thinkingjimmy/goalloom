/**
 * [INPUT]: Open native details, production preferences/IPC and the isolated Electron window.
 * [OUTPUT]: Single-pane detail, header actions, editor geometry and read-only evidence across four appearances and two sizes.
 * [POS]: Workspace acceptance fixture for the current detail layout; it never changes item data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { arch, cpus, release } from 'node:os'
import { join, resolve } from 'node:path'

// Failure cases: a retired rail or calendar is visible, action labels or hit targets are clipped,
// narrow layouts overlap the editor, and opening assistance writes item data.
export async function verifyDetailRail(app, page, detail) {
  const output = resolve('output/tests/detail-rail')
  await mkdir(output, { recursive: true })
  const before = await page.evaluate(() => window.goalloom.getSnapshot())
  const original = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds())
  const report = { passed: false, cases: [], runtime: await page.evaluate(() => window.goalloom.getRuntime()),
    environment: { release: release(), arch: arch(), cpu: cpus()[0]?.model, scope: 'Native Electron; isolated synthetic data' } }
  const preferences = async (style, theme) => {
    await page.evaluate(async ({ style, theme }) => {
      const { workspace } = await window.goalloom.getSnapshot()
      const reply = await window.goalloom.execute({ type: 'preferences', style, theme, generation: workspace.generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw Error(reply.message)
    }, { style, theme })
    await page.waitForFunction(({ style, theme }) => document.documentElement.dataset.style === style && document.documentElement.dataset.theme === theme, { style, theme })
  }
  try {
    for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
      await preferences(style, theme)
      for (const width of [1280, 720]) {
        await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, width === 720 ? 640 : 840), width)
        await page.waitForFunction(width => innerWidth === width, width)
        const rail = detail.locator('.detail-management')
        await rail.waitFor()
        assert.deepEqual(await rail.locator('button').allTextContents(), ['取消', '归档', '删除'])
        assert.equal(await detail.getByRole('button', { name: '更多操作', exact: true }).count(), 0)
        assert.equal(await detail.locator('.detail-rail, .activity-drawer').count(), 0, 'The task sheet has no activity rail or calendar')
        const geometry = await rail.evaluate(node => {
          const bounds = element => element.getBoundingClientRect().toJSON()
          const buttons = [...node.querySelectorAll('button')].map(button => {
            const rect = button.getBoundingClientRect()
            return { label: button.textContent, rect: rect.toJSON(), hit: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)) }
          })
          return { rail: bounds(node), dialog: bounds(node.closest('dialog')), editor: bounds(node.closest('dialog').querySelector('.detail-main')), buttons,
            viewport: { width: innerWidth, height: innerHeight } }
        })
        assert(geometry.rail.bottom <= geometry.editor.top + 1, 'Actions stay in the header above the editor')
        assert(geometry.rail.right <= geometry.dialog.right + 1 && geometry.rail.bottom <= geometry.dialog.bottom + 1, 'Header actions stay inside the detail')
        assert(geometry.buttons.every(button => button.hit && button.rect.height >= 32 && button.rect.right <= geometry.viewport.width && button.rect.bottom <= geometry.viewport.height), 'Header actions stay visible and clickable')
        const screenshot = join(output, `${style}-${theme}-${width}.png`)
        await detail.screenshot({ path: screenshot })
        report.cases.push({ style, theme, width, geometry, screenshot })
      }
    }
    assert.deepEqual((await page.evaluate(() => window.goalloom.getSnapshot())).items, before.items, 'Inspecting the detail never changes item data')
    report.passed = true
  } catch (error) {
    report.failure = error.message
    report.nativeWindows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() })))
    report.document = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML }))
    await detail.screenshot({ path: join(output, 'failure.png') }).catch(() => {})
    throw error
  } finally {
    await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
    if (report.passed) {
      await preferences(before.workspace.style, before.workspace.theme)
      await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setContentSize(bounds.width, bounds.height), original)
      await page.waitForFunction(bounds => innerWidth === bounds.width && innerHeight === bounds.height, original)
    }
  }
}
