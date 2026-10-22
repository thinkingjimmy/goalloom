/**
 * [INPUT]: Built Electron, production preference controls and an isolated synthetic profile.
 * [OUTPUT]: Repeatable appearance, persistence, protected-upgrade and accessibility evidence.
 * [POS]: Native desktop acceptance for the macOS 27 theme; no user data or live cloud services.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { cpus, release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from 'playwright'
import electronPath from 'electron'
import { spawnSync } from 'node:child_process'
import { build } from 'vite'
import { finishSetup } from './fixtures/setup.mjs'

// Failures: rejected writes/sync, lost restart state, destructive schema widening,
// wrong system appearance, clipped translations, unreadable glass and missing focus/fallback.
const out = 'output/tests/macos-theme'
await mkdir(out, { recursive: true })
await build({ configFile: false, build: { outDir: 'output/tests/build/macos-theme', emptyOutDir: true, target: 'node24', minify: false,
  lib: { entry: 'tests/fixtures/macos-storage.ts', formats: ['es'], fileName: () => 'storage.mjs' }, rollupOptions: { external: [/^node:/] } } })
const storage = spawnSync(electronPath, ['output/tests/build/macos-theme/storage.mjs', `${out}/storage.json`], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 60_000 })
process.stdout.write(storage.stdout ?? '')
process.stderr.write(storage.stderr ?? '')
assert.equal(storage.status, 0, storage.error?.message ?? 'Appearance storage E2E failed')
const profile = await mkdtemp(join(tmpdir(), 'goalloom-macos-theme-'))
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const report = { ok: false, host: { platform: process.platform, arch: process.arch, os: release(), cpu: cpus()[0]?.model, scope: 'Local host; source Electron; no VM or Windows acceptance' }, views: [], checks: [] }
let application, page
async function launch() {
  application = await electron.launch({ args: ['.', `--user-data-dir=${profile}`], env, timeout: 30_000 })
  page = await application.firstWindow()
  await page.emulateMedia({ reducedMotion: 'reduce' })
}
async function size(width, height) {
  await application.evaluate(({ BrowserWindow }, [width, height]) => BrowserWindow.getAllWindows()[0].setContentSize(width, height), [width, height])
}
async function capture(name) {
  await page.mouse.move(2, 2)
  await page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled' })
  report.views.push(name)
}
async function choose(name) {
  await page.getByRole('radio', { name, exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('.settings-modal button:disabled'))
}
async function openSettings() {
  await page.keyboard.press('ControlOrMeta+Comma')
  await page.locator('.settings-modal[open]').waitFor()
}
try {
  await launch()
  await size(1280, 900)
  await finishSetup(page, { timezone: 'UTC' })
  await page.locator('.board').waitFor()
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  await openSettings()
  await choose('macOS 27')
  await page.waitForFunction(() => document.documentElement.dataset.style === 'macos')
  for (const theme of ['Light', 'Dark', 'Match system']) {
    await choose(theme)
    if (theme === 'Match system') await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
    await capture(`settings-${theme.replaceAll(' ', '-').toLowerCase()}`)
    const colors = await page.evaluate(() => ({ scheme: getComputedStyle(document.documentElement).colorScheme, bg: getComputedStyle(document.body).backgroundColor }))
    assert.equal(colors.scheme, theme === 'Light' ? 'light' : 'dark')
    report.checks.push({ theme, colors })
  }
  await choose('Light')
  for (const locale of ['zh', 'en', 'ja', 'es', 'fr']) {
    await page.evaluate(language => window.goalloom.setLanguage(language), locale)
    await page.waitForFunction(locale => document.documentElement.lang.split('-')[0] === locale, locale)
    await size(720, 600)
    await page.getByRole('radio', { name: 'macOS 27', exact: true }).waitFor()
    assert.equal(await page.locator('.settings-modal').evaluate(node => node.scrollWidth <= node.clientWidth), true)
    await capture(`settings-${locale}-720`)
  }
  await page.evaluate(() => window.goalloom.setLanguage('en'))
  await size(1440, 900)
  await page.keyboard.press('Tab')
  await page.getByRole('radio', { name: 'macOS 27', exact: true }).focus()
  assert.equal(await page.getByRole('radio', { name: 'macOS 27', exact: true }).evaluate(node => getComputedStyle(node).outlineStyle), 'solid')
  await page.locator('.settings-select').click()
  assert.equal(await page.getByRole('listbox').evaluate(node => !!node.closest('dialog[open]')), true)
  await capture('language-menu')
  assert.match(await page.getByRole('listbox').evaluate(node => getComputedStyle(node).backdropFilter), /blur/)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }, { name: 'prefers-reduced-motion', value: 'reduce' }] })
  assert.equal(await page.getByRole('listbox').evaluate(node => getComputedStyle(node).backdropFilter), 'none')
  await capture('language-menu-reduced-transparency')
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await page.locator('.settings-modal').waitFor({ state: 'hidden' })
  await capture('board-light-wide')
  await page.keyboard.press('ControlOrMeta+n')
  await page.locator('.composer-input').fill('A clear next step')
  await capture('composer-light')
  await page.keyboard.press('Enter')
  await page.locator('.composer-modal').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'A clear next step', exact: true }).click()
  await page.locator('dialog.detail[open]').waitFor()
  await capture('detail-light')
  await page.keyboard.press('Escape')
  await page.locator('dialog.detail').waitFor({ state: 'hidden' })
  await openSettings()
  await choose('Dark')
  await page.keyboard.press('Escape')
  await capture('board-dark-wide')
  const saved = await page.evaluate(() => window.goalloom.getSnapshot())
  await application.close()
  await launch()
  await page.locator('.board').waitFor()
  const reopened = await page.evaluate(() => window.goalloom.getSnapshot())
  assert.equal(reopened.workspace.style, 'macos')
  assert.equal(reopened.workspace.theme, 'dark')
  assert.deepEqual(reopened.items, saved.items)
  assert.equal(reopened.workspace.generation, saved.workspace.generation)
  report.checks.push('Real process restart preserves appearance and tasks')
  report.ok = true
} catch (error) {
  report.error = error.stack
  await page?.screenshot({ path: `${out}/failure.png` }).catch(() => {})
  throw error
} finally {
  await writeFile(`${out}/report.json`, JSON.stringify(report, null, 2))
  await application?.close()
  await rm(profile, { recursive: true, force: true })
}
