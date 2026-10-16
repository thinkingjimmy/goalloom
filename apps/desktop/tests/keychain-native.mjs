/**
 * [INPUT]: Built app, macOS Security framework, a compiler and private keychains with synthetic secrets.
 * [OUTPUT]: Repeatable real-OS first-use/restart/lock/identity results in output/tests/keychain-native/.
 * [POS]: Native credential E2E through the production interaction policy, with no user credential access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { cpus, release } from 'node:os'
import { join, resolve } from 'node:path'
import headers from 'node-api-headers'
import { _electron as electron } from 'playwright'

const out = resolve('output/tests/keychain-native')
await mkdir(out, { recursive: true })
const report = { passed: false, checks: [], operations: [], scope: 'Real macOS Security APIs and source Electron production policy, private disposable keychains and synthetic secrets. The app must disable system interaction itself. No user credential read or ACL change; no signed packaged-app upgrade acceptance.', host: { platform: process.platform, arch: process.arch, kernel: release(), cpu: cpus()[0]?.model } }
if (process.platform !== 'darwin') {
  report.skipped = 'macOS Security framework required; Windows behavior is unchanged'
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
  console.log(report.skipped)
} else {
  const temporary = await mkdtemp('/private/tmp/goalloom-native-keychain-')
  const creator = join(temporary, 'creator')
  const different = join(temporary, 'different-identity')
  const first = join(temporary, 'creator-only.keychain-db')
  const second = join(temporary, 'explicit-trust.keychain-db')
  const appKeychain = join(temporary, 'electron.keychain-db')
  const probe = join(temporary, 'probe.node')
  let application
  const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', timeout: 20_000, stdio: ['ignore', 'pipe', 'pipe'] })
  const searchList = () => run('/usr/bin/security', ['list-keychains', '-d', 'user'])
  const before = searchList()
  const created = new Set()
  const operation = (binary, action, keychain, reader) => {
    if (action === 'create') created.add(keychain)
    const result = JSON.parse(run(binary, [action, keychain, ...(reader ? [reader] : [])]))
    report.operations.push({ identity: binary === creator ? 'creator' : 'different', action, keychain: keychain === first ? 'creator-only' : 'explicit-trust', ...result })
    if (action === 'delete' && result.status === 0) created.delete(keychain)
    assert.equal(result.interactionDisabled, true)
    assert.equal(result.privateKeychainOnly, true)
    return result.status
  }
  const check = label => { report.checks.push(label); console.log(`✓ ${label}`) }
  const appOperation = async (action, keychain) => {
    if (action === 'create') created.add(keychain)
    const result = JSON.parse(await application.evaluate((_, input) => globalThis.nativeKeychainProbe.operation(input.action, input.keychain, ''), { action, keychain }))
    report.operations.push({ identity: 'source-app', action, keychain: keychain === appKeychain ? 'electron' : 'creator-only', ...result })
    if (action === 'delete' && result.status === 0) created.delete(keychain)
    assert.equal(result.interactionDisabled, true, 'Production startup must disable Keychain UI before any credential access')
    assert.equal(result.privateKeychainOnly, true)
    return result.status
  }
  const launch = async () => {
    const env = { ...process.env, GOALLOOM_KEYCHAIN_PROBE: probe }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.ELECTRON_RENDERER_URL
    application = await electron.launch({ args: [resolve('tests/fixtures/keychain-entry.mjs'), `--user-data-dir=${join(temporary, 'profile')}`], env })
    const page = await application.firstWindow()
    await page.locator('.start-cards, .board').first().waitFor()
    return page
  }
  try {
    report.host.macOS = run('/usr/bin/sw_vers', ['-productVersion']).trim()
    report.host.machine = run('/usr/sbin/sysctl', ['-n', 'kern.hv_vmm_present']).trim() === '0' ? 'Physical host (no hypervisor reported)' : 'VM'
    for (const binary of [creator, different]) run('/usr/bin/xcrun', ['clang', '-fobjc-arc', '-Wno-deprecated-declarations', '-framework', 'Foundation', '-framework', 'Security', resolve('tests/fixtures/keychain-native.m'), '-o', binary])
    for (const [binary, identifier] of [[creator, 'com.goalloom.fixture.creator'], [different, 'com.goalloom.fixture.different']]) run('/usr/bin/codesign', ['--force', '--sign', '-', '--identifier', identifier, binary])
    run('/usr/bin/xcrun', ['clang', '-fobjc-arc', '-Wno-deprecated-declarations', '-DGOALLOOM_KEYCHAIN_NODE', '-DNAPI_VERSION=8', '-I', headers.include_dir, '-bundle', '-undefined', 'dynamic_lookup', '-framework', 'Foundation', '-framework', 'Security', resolve('tests/fixtures/keychain-native.m'), '-o', probe])
    assert.equal(operation(creator, 'create', first), 0)
    assert.equal(operation(creator, 'read', first), 0)
    assert.equal(operation(creator, 'read', first), 0)
    check('the creating application reads after separate process restarts without interaction')
    const denied = operation(different, 'read', first)
    assert(denied === -25308 || denied === -25293, `Expected interaction/auth denial, got ${denied}`)
    check('a different application identity cannot read the existing secret without authorization')
    assert.equal(operation(creator, 'create', second, different), 0)
    assert.equal(operation(different, 'read', second), 0)
    assert.equal(operation(different, 'read', second), 0)
    check('an explicitly trusted identity reads after separate process restarts without interaction')
    let page = await launch()
    assert.equal(await appOperation('policy', appKeychain), 0)
    check('production Electron startup disables Keychain dialogs before credential access')
    assert.equal(await appOperation('create', appKeychain), 0)
    assert.equal(await appOperation('read', appKeychain), 0)
    await page.screenshot({ path: join(out, 'first-use.png') })
    check('the app creates and reads a first-use secret without a system dialog')
    await application.close(); application = null
    page = await launch()
    assert.equal(await appOperation('read', appKeychain), 0)
    check('the app reads its saved secret after a full process restart with interaction disabled')
    const appDenied = await appOperation('read', first)
    assert(appDenied === -25308 || appDenied === -25293, `Expected silent identity denial, got ${appDenied}`)
    check('the app rejects an untrusted historical credential without showing authorization UI')
    assert.equal(await appOperation('lock', appKeychain), 0)
    const locked = await appOperation('read-locked', appKeychain)
    assert(locked === -25308 || locked === -25293, `Expected silent locked-keychain denial, got ${locked}`)
    await page.screenshot({ path: join(out, 'locked.png') })
    check('a locked keychain fails without showing an unlock dialog')
    assert.equal(await appOperation('read', appKeychain), 0)
    assert.equal(await appOperation('delete', appKeychain), 0)
    await application.close(); application = null
    for (const keychain of [...created]) assert.equal(operation(creator, 'delete', keychain), 0)
    assert.equal(searchList(), before)
    check('the user keychain search list is unchanged')
    report.passed = true
  } catch (error) {
    report.failure = error.stack ?? String(error)
    throw error
  } finally {
    await application?.close()
    for (const keychain of [...created]) {
      try { operation(creator, 'delete', keychain) } catch {}
    }
    report.searchListPreserved = searchList() === before
    report.cleanupComplete = created.size === 0
    if (!report.searchListPreserved || !report.cleanupComplete) report.passed = false
    await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
    if (report.cleanupComplete) await rm(temporary, { recursive: true, force: true })
    assert(report.searchListPreserved && report.cleanupComplete, 'Native fixture cleanup must preserve the user keychain search list')
  }
}
