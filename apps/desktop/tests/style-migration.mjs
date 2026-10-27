/**
 * [INPUT]: Built desktop, isolated synthetic workspace and optional --record / --compare visual baseline.
 * [OUTPUT]: Native-window screenshots, computed-style/geometry snapshots, runtime details and comparison failures.
 * [POS]: Shared UI styling acceptance; feature suites retain ownership of business interactions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus, release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import { chooseLocalStart, chooseSetupCalendar, reloadDeviceLanguage, settleSetupStep } from './fixtures/setup.mjs'

// Failure cases: theme drift, changed control density/wrapping, lost DOM hooks,
// invisible native-dialog portals, broken keyboard dismissal and unexpected task writes.
const record = process.argv.includes('--record'), compare = process.argv.includes('--compare')
assert.ok(!(record && compare), 'Choose either --record or --compare')
const root = 'output/tests/style-migration', out = `${root}/${record ? 'baseline' : 'current'}`
await mkdir(out, { recursive: true })
const baseline = compare ? JSON.parse(await readFile(`${root}/baseline/snapshots.json`, 'utf8')) : null
const profile = await mkdtemp(join(tmpdir(), 'goalloom-styles-'))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const report = { ok: false, record, compared: compare, host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model }, runtime: null, views: [], differences: [] }
const snapshots = {}
let application, page

async function capture(name, selector) {
  const target = page.locator(selector).first()
  await target.waitFor()
  await page.mouse.move(2, 2)
  await target.evaluate(async node => {
    await Promise.all(node.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  snapshots[name] = await target.evaluate(root => {
    const origin = root.getBoundingClientRect(), round = value => Math.round(value * 100) / 100
    const properties = ['display', 'position', 'flexDirection', 'alignItems', 'justifyContent', 'gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'color', 'backgroundColor', 'backgroundImage', 'borderTopWidth', 'borderTopColor', 'borderTopLeftRadius', 'boxShadow', 'opacity', 'overflowX', 'overflowY', 'whiteSpace', 'outlineStyle', 'outlineWidth', 'outlineColor', 'outlineOffset', 'transform']
    return [root, ...root.querySelectorAll('*')].filter(node => node instanceof HTMLElement && node.getBoundingClientRect().width && node.getBoundingClientRect().height).map(node => {
      const bounds = node.getBoundingClientRect(), style = getComputedStyle(node)
      // Tailwind v4 uses the individual translate property; compare the effective matrix.
      const matrix = new DOMMatrix(style.transform === 'none' ? undefined : style.transform)
      const [x = 0, y = 0] = style.translate === 'none' ? [] : style.translate.split(' ').map(Number.parseFloat)
      const transform = new DOMMatrix().translate(x, y).multiply(matrix)
      return { tag: node.tagName, role: node.getAttribute('role'), rect: [bounds.x - origin.x, bounds.y - origin.y, bounds.width, bounds.height].map(round), style: Object.fromEntries(properties.map(key => [key, key === 'transform' ? transform.isIdentity ? 'none' : transform.toString() : style[key]])) }
    })
  })
  await target.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' })
  report.views.push({ name, elements: snapshots[name].length })
  if (baseline) {
    const before = baseline[name], after = snapshots[name]
    if (!before || before.length !== after.length) report.differences.push({ name, count: [before?.length, after.length] })
    for (let index = 0; index < Math.min(before?.length ?? 0, after.length); index++) {
      for (const key of ['tag', 'role']) if (before[index][key] !== after[index][key]) report.differences.push({ name, index, key, before: before[index][key], after: after[index][key] })
      if (before[index].rect.some((value, at) => Math.abs(value - after[index].rect[at]) > .1)) report.differences.push({ name, index, key: 'rect', before: before[index].rect, after: after[index].rect })
      for (const [key, value] of Object.entries(before[index].style)) {
        // Zero-width borders and Tailwind's transparent shadow placeholders draw no pixels.
        if (key === 'borderTopColor' && before[index].style.borderTopWidth === '0px' && after[index].style.borderTopWidth === '0px') continue
        const normalize = text => key === 'boxShadow'
          ? text.replace(/rgba\(0, 0, 0, 0\) 0px 0px 0px 0px(?:, )?/g, '').replace(/, $/, '') || 'none'
          : key === 'transform' && text === 'matrix(1, 0, 0, 1, 0, 0)' ? 'none' : text
        if (normalize(value) !== normalize(after[index].style[key])) report.differences.push({ name, index, key, before: value, after: after[index].style[key] })
      }
    }
  }
}

async function matrix(name, selector) {
  for (const style of ['paper', 'minimal']) for (const theme of ['light', 'dark']) {
    await page.evaluate(({ style, theme }) => Object.assign(document.documentElement.dataset, { style, theme }), { style, theme })
    await capture(`${name}-${style}-${theme}`, selector)
  }
  await page.evaluate(() => Object.assign(document.documentElement.dataset, { style: 'paper', theme: 'light' }))
}

try {
  application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env, timeout: 30_000 })
  page = await application.firstWindow()
  await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 900))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await reloadDeviceLanguage(page, 'en')
  await chooseLocalStart(page)
  await settleSetupStep(page)
  await matrix('setup-calendar', '.onboarding')
  await chooseSetupCalendar(page, { timezone: 'UTC', weekStart: 1 })
  await matrix('setup-direction', '.onboarding')
  await page.locator('.onboarding-actions button').last().click()
  await page.getByRole('button', { name: 'Connect an AI service', exact: true }).click()
  await page.getByLabel('OpenRouter API Key').waitFor()
  await matrix('setup-provider', '.onboarding')
  await page.getByRole('button', { name: 'Skip for now', exact: true }).click()
  await page.locator('.board').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  await page.getByRole('button', { name: 'Settings & data', exact: true }).click()
  await page.locator('.settings-modal[open]').waitFor()
  const navigation = page.locator('.settings-nav button')
  const count = await navigation.count()
  for (let index = 0; index < count; index++) {
    await navigation.nth(index).click()
    await matrix(`settings-${index}`, '.settings-modal[open]')
  }
  // Radix content must remain inside the native dialog's top layer.
  await navigation.first().click()
  await page.locator('.settings-select').click()
  const list = page.getByRole('listbox')
  await list.waitFor()
  assert.equal(await list.evaluate(node => !!node.closest('dialog[open]')), true)
  await matrix('settings-language-menu', '.settings-modal[open]')
  await page.keyboard.press('Escape')
  await list.waitFor({ state: 'hidden' })
  assert.equal(await page.locator('.settings-modal[open]').count(), 1)
  const toggle = page.locator('.settings-modal [role="switch"]').first()
  const checked = await toggle.getAttribute('aria-checked')
  await toggle.focus()
  await page.keyboard.press('Space')
  assert.notEqual(await toggle.getAttribute('aria-checked'), checked)
  await page.keyboard.press('Space')
  assert.equal(await toggle.getAttribute('aria-checked'), checked)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.keyboard.press('ControlOrMeta+n')
  await page.locator('.composer-input').fill('Style migration capture')
  await matrix('composer', '.composer-modal[open]')
  assert.equal((await page.evaluate(() => window.goalloom.getSnapshot())).items.length, 0)
  await page.locator('.composer-input').fill('')
  await page.keyboard.press('Escape')
  await page.locator('.composer-modal[open]').waitFor({ state: 'hidden' })
  report.ok = !report.differences.length
  await writeFile(`${out}/snapshots.json`, JSON.stringify(snapshots, null, 2))
  assert.equal(report.differences.length, 0, `Style migration changed ${report.differences.length} measured values; see ${out}/report.json`)
  console.log(JSON.stringify({ ok: true, views: report.views.length, runtime: report.runtime, evidence: out }))
} catch (error) {
  report.error = error.stack
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  throw error
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
  await application?.close()
  await rm(profile, { recursive: true, force: true })
}
