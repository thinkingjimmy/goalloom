/**
 * [INPUT]: Built desktop output, macOS packaging tools and a private synthetic keychain probe.
 * [OUTPUT]: Repeatable native-module package/loading/restart evidence in output/tests/keychain-package/.
 * [POS]: Local ad-hoc package smoke. No production certificate, notarization, protocol registration or user credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release } from 'node:os'
import { build, Platform, Arch } from 'electron-builder'
import headers from 'node-api-headers'
import yaml from 'js-yaml'
import { _electron as electron } from 'playwright'

const out = resolve('output/tests/keychain-package')
await mkdir(out, { recursive: true })
const report = { passed: false, checks: [], operations: [], scope: 'Local ad-hoc macOS package with Hardened Runtime disabled only for this test identity. Real packaged main, ASAR/unpacked native policy and private synthetic keychain. No Developer ID, notarization, installed-app upgrade or Windows acceptance.', host: { platform: process.platform, arch: process.arch, kernel: release(), cpu: cpus()[0]?.model } }
if (process.platform !== 'darwin') {
  report.skipped = 'macOS package required'
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
} else {
  const temporary = await mkdtemp('/private/tmp/goalloom-native-keychain-package-')
  const profile = join(temporary, 'profile')
  const keychain = join(temporary, 'synthetic.keychain-db')
  const probe = join(temporary, 'probe.node')
  const cleanup = join(temporary, 'cleanup')
  let application, created = false
  const run = (command, args, env) => execFileSync(command, args, { encoding: 'utf8', timeout: 30_000, stdio: ['ignore', 'pipe', 'pipe'], ...(env ? { env } : {}) })
  const searchList = () => run('/usr/bin/security', ['list-keychains', '-d', 'user'])
  const before = searchList()
  const check = label => { report.checks.push(label); console.log(`✓ ${label}`) }
  const operation = async action => {
    if (action === 'create') created = true
    const result = JSON.parse(await application.evaluate((_, input) => globalThis.nativeKeychainProbe.operation(input.action, input.keychain, ''), { action, keychain }))
    report.operations.push({ action, ...result })
    if (action === 'delete' && result.status === 0) created = false
    assert.equal(result.interactionDisabled, true)
    assert.equal(result.privateKeychainOnly, true)
    return result.status
  }
  try {
    report.host.macOS = run('/usr/bin/sw_vers', ['-productVersion']).trim()
    report.host.machine = run('/usr/sbin/sysctl', ['-n', 'kern.hv_vmm_present']).trim() === '0' ? 'Physical host (no hypervisor reported)' : 'VM'
    const fixture = resolve('tests/fixtures/keychain-native.m')
    run('/usr/bin/xcrun', ['clang', '-fobjc-arc', '-Wno-deprecated-declarations', '-DGOALLOOM_KEYCHAIN_NODE', '-DNAPI_VERSION=8', '-I', headers.include_dir, '-bundle', '-undefined', 'dynamic_lookup', '-framework', 'Foundation', '-framework', 'Security', fixture, '-o', probe])
    run('/usr/bin/xcrun', ['clang', '-fobjc-arc', '-Wno-deprecated-declarations', '-framework', 'Foundation', '-framework', 'Security', fixture, '-o', cleanup])
    const config = yaml.load(await readFile('electron-builder.yml', 'utf8'))
    config.appId = 'com.goalloom.credential-fixture'
    config.productName = 'Goalloom Credential Fixture'
    config.directories.output = join(temporary, 'package')
    config.mac.protocols = []
    config.mac.identity = '-'
    config.mac.hardenedRuntime = false
    config.afterSign = async () => {}
    delete config.publish
    process.env.CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    delete process.env.CSC_LINK
    delete process.env.CSC_KEY_PASSWORD
    await build({ projectDir: resolve('.'), targets: Platform.MAC.createTarget('dir', Arch.arm64), config, publish: 'never' })
    const bundle = join(config.directories.output, 'mac-arm64/Goalloom Credential Fixture.app')
    const native = join(bundle, 'Contents/Resources/app.asar.unpacked/out/main/keychain-policy.node')
    await readFile(native)
    run('/usr/bin/codesign', ['--verify', '--deep', '--strict', bundle])
    run('/usr/bin/codesign', ['--verify', '--strict', native])
    check('the package unpacks and ad-hoc signs the native interaction policy')
    const launch = async () => {
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      delete env.ELECTRON_RENDERER_URL
      application = await electron.launch({ executablePath: join(bundle, 'Contents/MacOS/Goalloom Credential Fixture'), args: [`--user-data-dir=${profile}`], env })
      await application.evaluate((_, path) => { globalThis.nativeKeychainProbe = process.getBuiltinModule('module').createRequire(process.execPath)(path) }, probe)
      const page = await application.firstWindow()
      await page.locator('.start-cards, .board').first().waitFor()
      const identity = await application.evaluate(({ app }) => ({ packaged: app.isPackaged, name: app.name, profile: app.getPath('userData') }))
      assert.equal(identity.packaged, true)
      assert.equal(identity.name, 'Goalloom')
      assert.equal(identity.profile, profile)
      report.identity = { packaged: true, name: identity.name, isolatedProfile: true }
      return page
    }
    let page = await launch()
    assert.equal(await operation('policy'), 0)
    assert.equal(await operation('create'), 0)
    assert.equal(await operation('read'), 0)
    report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
    await page.screenshot({ path: join(out, 'first-use.png') })
    check('the packaged main loads the policy and creates its first synthetic secret without UI')
    await application.close(); application = null
    page = await launch()
    assert.equal(await operation('read'), 0)
    assert.equal(await operation('lock'), 0)
    const locked = await operation('read-locked')
    assert(locked === -25308 || locked === -25293)
    assert.equal(await operation('read'), 0)
    await page.screenshot({ path: join(out, 'restart.png') })
    check('the packaged main restores after restart and rejects a locked keychain without UI')
    assert.equal(await operation('delete'), 0)
    await application.close(); application = null
    assert.equal(searchList(), before)
    check('the user keychain search list is unchanged')
    report.passed = true
  } catch (error) {
    report.failure = error.stack ?? String(error)
    throw error
  } finally {
    if (created && application) { try { await operation('delete') } catch {} }
    await application?.close()
    if (created) {
      try { created = JSON.parse(run(cleanup, ['delete', keychain])).status !== 0 } catch {}
    }
    report.cleanupComplete = !created
    report.searchListPreserved = searchList() === before
    if (!report.cleanupComplete || !report.searchListPreserved) report.passed = false
    await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
    if (report.cleanupComplete) await rm(temporary, { recursive: true, force: true })
    assert(report.cleanupComplete && report.searchListPreserved, 'Package fixture must preserve user keychains and remove its synthetic data')
  }
}
