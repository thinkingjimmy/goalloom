/**
 * [INPUT]: An open native item detail, production preferences/IPC and the isolated Electron window.
 * [OUTPUT]: More-menu alignment, visibility, retained actions and Escape evidence at wide/narrow sizes in four themes.
 * [POS]: Workspace acceptance fixture; uses native hit testing and never changes task data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { arch, cpus, release, version } from 'node:os'
import { join, resolve } from 'node:path'

// Failure cases: the menu expands left, is clipped by the dialog, overflows a narrow window,
// retains the removed navigation action, closes the detail on Escape or writes task data while browsing.
export async function verifyDetailMore(app, page, detail) {
  const output = resolve('output/tests/detail-more')
  await mkdir(output, { recursive: true })
  const before = await page.evaluate(() => window.goalloom.getSnapshot())
  const original = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getContentBounds())
  const report = { passed: false, cases: [], runtime: await page.evaluate(() => window.goalloom.getRuntime()),
    environment: { os: version(), release: release(), arch: arch(), cpu: cpus()[0]?.model,
      machineScope: process.env.GOALLOOM_TEST_MACHINE_SCOPE ?? 'Host OS reported; physical/VM status not independently verified' } }
  const preferences = async (style, theme) => {
    await page.evaluate(async ({ style, theme }) => {
      const { workspace } = await window.goalloom.getSnapshot()
      const reply = await window.goalloom.execute({ type: 'preferences', style, theme, generation: workspace.generation, operationId: crypto.randomUUID() })
      if (!reply.ok) throw Error(reply.message)
    }, { style, theme })
    await page.waitForFunction(({ style, theme }) => document.documentElement.dataset.style === style && document.documentElement.dataset.theme === theme, { style, theme })
  }
  const more = detail.getByRole('button', { name: '更多操作', exact: true })
  const menu = detail.getByRole('menu', { name: '更多操作', exact: true })
  try {
    for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
      await preferences(style, theme)
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 840))
      await page.waitForFunction(() => innerWidth === 1280)
      await more.click()
      await menu.waitFor()
      for (const width of [1280, 720]) {
        if (width === 720) {
          await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(720, 640))
          await page.waitForFunction(() => innerWidth === 720)
        }
        await page.waitForFunction(() => {
          const button = document.querySelector('dialog.detail .modal-header button[aria-expanded="true"]')
          const panel = document.querySelector('dialog.detail [role="menu"]')
          if (!button || !panel) return false
          const anchor = button.getBoundingClientRect(), rect = panel.getBoundingClientRect()
          const left = Math.max(8, Math.min(anchor.left - 6, innerWidth - rect.width - 8))
          return Math.abs(rect.left - left) < 1 && rect.right <= innerWidth - 8 && rect.bottom <= innerHeight - 8
        })
        const geometry = await menu.evaluate(node => {
          const dialog = node.closest('dialog'), button = dialog.querySelector('.modal-header button[aria-expanded="true"]')
          const rect = node.getBoundingClientRect(), anchor = button.getBoundingClientRect()
          const target = document.elementFromPoint(rect.right - 12, rect.bottom - 12)
          return { menu: rect.toJSON(), anchor: anchor.toJSON(), dialog: dialog.getBoundingClientRect().toJSON(),
            viewport: { width: innerWidth, height: innerHeight }, hit: node.contains(target) }
        })
        assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['取消事项', '归档条目', '移到回收站'])
        assert.equal(geometry.hit, true, 'The menu remains clickable outside the dialog bounds')
        if (width === 1280) {
          assert(Math.abs(geometry.menu.left - geometry.anchor.left) <= 6, 'More uses the shared start inset')
          assert(geometry.menu.right > geometry.dialog.right, 'The menu opens right beyond the detail edge')
        }
        const screenshot = join(output, `${style}-${theme}-${width}.png`)
        await page.screenshot({ path: screenshot })
        report.cases.push({ style, theme, width, geometry, screenshot })
      }
      await page.keyboard.press('Escape')
      await menu.waitFor({ state: 'detached' })
      assert.equal(await detail.isVisible(), true, 'Escape closes only More')
      assert.equal(await more.getAttribute('aria-expanded'), 'false')
    }
    assert.deepEqual((await page.evaluate(() => window.goalloom.getSnapshot())).items, before.items, 'Browsing More never writes task data')
    report.passed = true
  } catch (error) {
    report.failure = error.message
    report.nativeWindows = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ focused: window.isFocused(), visible: window.isVisible(), bounds: window.getContentBounds() })))
    report.document = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState, active: document.activeElement?.outerHTML }))
    await page.screenshot({ path: join(output, 'failure.png') })
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
