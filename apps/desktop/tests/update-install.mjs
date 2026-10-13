/**
 * [INPUT]: Current `out/` build, the local Developer ID identity, electron-builder's API and a 127.0.0.1 generic update feed.
 * [OUTPUT]: Two signed macOS packages (old app + new zip/latest-mac.yml); UI readiness after native staging, then install-on-quit
 *           verified from the old bundle's version and signature; output/tests/updates/install.json and screenshots.
 * [POS]: Optional, macOS-only release check of the real electron-updater/Squirrel.Mac loop, outside verify. The feed is overridden only
 *        in these throwaway packages; the restart button's relaunch is not driven because it would open the default profile.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
// Failure cases: ready is announced before Squirrel stages the update; immediate quit cancels installation;
// a native staging error leaves a false ready state; an installation failure loses its repeatable evidence.
import { finishSetup } from './fixtures/setup.mjs'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { arch, release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Arch, Platform, build } from 'electron-builder'
import { _electron as electron } from 'playwright'

assert.equal(process.platform, 'darwin', 'update-install covers Squirrel.Mac only; Windows NSIS updates stay a manual check')
const out = 'output/tests/updates', work = await mkdtemp(join(tmpdir(), 'goalloom-update-install-'))
const oldVersion = '90.0.0', newVersion = '90.0.1'
const feed = join(work, 'feed'), requests = []
await mkdir(out, { recursive: true })

// --- Local feed: serves only files electron-builder wrote for the new version. ---
const server = createServer(async (request, response) => {
  const name = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname.slice(1))
  requests.push(`${request.method} ${name}`)
  const path = join(feed, name)
  const info = name && !name.includes('/') ? await stat(path).catch(() => null) : null
  if (!info?.isFile()) { response.writeHead(404).end(); return }
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
  if (range) {
    const start = Number(range[1]), end = range[2] ? Number(range[2]) : info.size - 1
    response.writeHead(206, { 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${info.size}`, 'Accept-Ranges': 'bytes' })
    createReadStream(path, { start, end }).pipe(response)
  } else {
    response.writeHead(200, { 'Content-Length': info.size, 'Accept-Ranges': 'bytes' })
    createReadStream(path).pipe(response)
  }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const url = `http://127.0.0.1:${server.address().port}`
const pack = (version, target, output) => build({
  targets: Platform.MAC.createTarget([target], Arch.arm64), publish: 'never',
  config: { extraMetadata: { version }, directories: { output }, publish: [{ provider: 'generic', url }] },
})
const plist = (app, key) => execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, join(app, 'Contents/Info.plist')], { encoding: 'utf8' }).trim()
const checks = [], screenshots = []
const timing = {}, logs = []
let nativeStage
let application
try {
  let started = Date.now()
  await pack(newVersion, 'zip', feed)
  const oldRoot = join(work, 'old')
  // A zip build, unlike `dir`, bakes app-update.yml into the bundle; the test runs its unpacked app.
  await pack(oldVersion, 'zip', oldRoot)
  timing.packagingMs = Date.now() - started
  const app = join(oldRoot, 'mac-arm64/Goalloom.app')
  assert.equal(plist(app, 'CFBundleShortVersionString'), oldVersion)
  assert((await readdir(feed)).includes('latest-mac.yml'), 'latest-mac.yml was not written')
  checks.push(`packaged ${oldVersion} app and ${newVersion} zip + latest-mac.yml, both signed`)

  const profile = await mkdtemp(join(tmpdir(), 'goalloom-update-profile-'))
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  const environment = { ...process.env }; delete environment.ELECTRON_RUN_AS_NODE
  application = await electron.launch({ executablePath: join(app, 'Contents/MacOS/Goalloom'), args: [`--user-data-dir=${profile}`], env: environment, timeout: 30_000 })
  // Main-process output and the feed's request log are the evidence when a phase never arrives.
  for (const stream of [application.process().stdout, application.process().stderr]) stream.on('data', chunk => logs.push(String(chunk)))
  const page = await application.firstWindow()
  await application.evaluate(({ autoUpdater, BrowserWindow }) => {
    globalThis.updateInstallEvidence = { nativeDownloaded: false, readyAfterNativeDownload: null }
    autoUpdater.prependListener('update-downloaded', () => { globalThis.updateInstallEvidence.nativeDownloaded = true })
    const contents = BrowserWindow.getAllWindows()[0].webContents, send = contents.send.bind(contents)
    contents.send = (channel, ...args) => {
      if (channel === 'goalloom:update-state' && args[0]?.state.phase === 'ready') globalThis.updateInstallEvidence.readyAfterNativeDownload = globalThis.updateInstallEvidence.nativeDownloaded
      return send(channel, ...args)
    }
  })
  await page.setViewportSize({ width: 1440, height: 900 })
  await finishSetup(page)
  await page.getByRole('main', { name: '时间看板' }).waitFor()

  // --- Manual check from Settings › About (before the 15 s background check). ---
  await page.getByRole('button', { name: '设置与数据', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '设置与数据', exact: true })
  await dialog.getByRole('button', { name: /^关于/ }).click()
  assert.equal(await dialog.locator('.about-version').textContent(), oldVersion)
  started = Date.now()
  await dialog.getByRole('button', { name: '检查更新', exact: true }).click()
  await dialog.getByRole('button', { name: '重启并更新', exact: true }).waitFor({ timeout: 60_000 })
  timing.checkToReadyMs = Date.now() - started
  nativeStage = await application.evaluate(() => globalThis.updateInstallEvidence)
  assert.equal(nativeStage.readyAfterNativeDownload, true, 'Ready must follow native Squirrel staging so immediate quit can install')
  await dialog.getByText(`${newVersion} 已下载，重启即可完成更新`, { exact: true }).waitFor()
  await dialog.locator('.settings-nav-meta[data-dot="update"]').waitFor()
  const path = `${out}/install-ready.png`; await page.screenshot({ path }); screenshots.push(path)
  checks.push(`manual check found ${newVersion}, staged it in native Squirrel and offered restart (${timing.checkToReadyMs} ms)`)

  // --- Install on quit (Squirrel ShipIt replaces the bundle after the process exits). ---
  started = Date.now()
  await application.close(); application = null
  for (let deadline = Date.now() + 120_000; plist(app, 'CFBundleShortVersionString') !== newVersion;) {
    assert(Date.now() < deadline, 'Bundle was not replaced after quitting')
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  timing.quitToInstalledMs = Date.now() - started
  execFileSync('codesign', ['--verify', '--deep', '--strict', app])
  const authority = spawnSync('codesign', ['-dv', '--verbose=2', app], { encoding: 'utf8' }).stderr.split('\n').filter(line => line.startsWith('Authority='))
  assert(authority[0]?.startsWith('Authority=Developer ID Application'), 'Installed update is not Developer ID signed')
  checks.push(`quitting installed ${newVersion} in place with a valid signature (${timing.quitToInstalledMs} ms)`)
  await writeFile(`${out}/install.json`, JSON.stringify({ ok: true, oldVersion, newVersion, feed: url, requests, timing, nativeStage, checks, screenshots, authority, environment: { platform: process.platform, release: release(), arch: arch() } }, null, 2))
  console.log(JSON.stringify({ ok: true, checks, timing, report: `${out}/install.json` }))
} catch (error) {
  await writeFile(`${out}/install-failure.json`, JSON.stringify({ ok: false, error: String(error), requests, timing, nativeStage, checks, main: logs.join('').slice(-4000) }, null, 2))
  console.error({ requests, main: logs.join('').slice(-4000) })
  throw error
} finally {
  await application?.close().catch(() => undefined)
  server.close()
  await rm(work, { recursive: true, force: true }).catch(() => undefined)
}
