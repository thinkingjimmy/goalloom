/**
 * [INPUT]: Signed current release executable and the hosted runner's disposable signing keychain.
 * [OUTPUT]: Private session-key restart/replacement and current safeStorage roundtrip evidence in output/tests/keychain-signed/.
 * [POS]: Developer ID/Hardened Runtime release gate. Runs only on the ephemeral macOS Actions runner, with synthetic data.
 */
// Failure cases: the policy is absent or cannot load under library validation;
// first encryption fails; restart/replacement loses its key;
// a test reads a real user's keychain or prints a secret.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { cpus, release } from 'node:os'
import headers from 'node-api-headers'
import { _electron as electron } from 'playwright'
import { validateSessionProfile } from '../../../apps/desktop/scripts/build/session-profile.mjs'

assert(process.platform === 'darwin' && process.env.GITHUB_ACTIONS === 'true', 'This gate requires an ephemeral macOS Actions runner')
const runner = process.env.RUNNER_TEMP
const keychain = process.env.CSC_KEYCHAIN
assert(runner && keychain?.startsWith(`${runner}/`), 'Use only the prepared disposable signing keychain')
const run = (command, args, timeout = 30_000) => execFileSync(command, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] })
assert.equal(run('/usr/bin/security', ['default-keychain', '-d', 'user']).trim().replaceAll('"', ''), keychain)
const current = resolve(process.argv[2])
const resources = resolve(dirname(current), '../Resources')
const policy = join(resources, 'app.asar.unpacked/out/main/keychain-policy.node')
const out = resolve('output/tests/keychain-signed')
const temporary = await mkdtemp('/private/tmp/goalloom-native-keychain-signed-')
const probe = join(temporary, 'probe.node')
const profile = join(temporary, 'profile')
const report = { passed: false, checks: [], host: { platform: process.platform, arch: process.arch, kernel: release(), cpu: cpus()[0]?.model }, scope: 'Ephemeral GitHub-hosted macOS VM, Developer ID/Hardened Runtime release app, actual Electron safeStorage and synthetic profiles. No physical-machine or Windows acceptance.' }
let application, page
let sessionCreated = false
const sessionScope = createHash('sha256').update(temporary).digest('hex')
const sessionHash = () => application.evaluate((_, scope) => {
  const key = globalThis.protectedSessionNative.sessionKey(scope, false)
  if (!key) return null
  try { return process.getBuiltinModule('crypto').createHash('sha256').update(key).digest('hex') }
  finally { key.fill(0) }
}, sessionScope)
const check = label => { report.checks.push(label); console.log(`✓ ${label}`) }
const disabled = () => application.evaluate((_, path) => JSON.parse(globalThis.signedKeychainProbe.operation('policy', path, '')).interactionDisabled, join(temporary, 'unused.keychain-db'))
const close = async () => { await application?.close(); application = null; page = null }
async function launch(executable, data) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  application = await electron.launch({ executablePath: executable, args: [`--user-data-dir=${data}`], env, timeout: 30_000 })
  await application.evaluate((_, path) => { globalThis.signedKeychainProbe = process.getBuiltinModule('module').createRequire(process.execPath)(path) }, probe)
  if (executable === current || executable.includes('/replacement/')) await application.evaluate((_, path) => {
    globalThis.protectedSessionNative = process.getBuiltinModule('module').createRequire(process.execPath)(path)
  }, join(dirname(executable), '../Resources/app.asar.unpacked/out/main/keychain-policy.node'))
  page = await application.firstWindow()
  await page.locator('.start-cards, .board').first().waitFor()
}
try {
  await mkdir(out, { recursive: true })
  await mkdir(profile)
  await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  run('/usr/bin/xcrun', ['clang', '-fobjc-arc', '-Wno-deprecated-declarations', '-DGOALLOOM_KEYCHAIN_NODE', '-DNAPI_VERSION=8', '-I', headers.include_dir, '-bundle', '-undefined', 'dynamic_lookup', '-framework', 'Foundation', '-framework', 'Security', resolve('../../.github/scripts/acceptance/keychain-native.m'), '-o', probe])
  const identity = `Developer ID Application: ${process.env.CSC_NAME}`
  run('/usr/bin/codesign', ['--force', '--sign', identity, '--keychain', keychain, '--timestamp', '--options', 'runtime', '--entitlements', resolve('build/entitlements.mac.inherit.plist'), probe])
  run('/usr/bin/codesign', ['--verify', '--strict', policy])
  validateSessionProfile(join(dirname(current), '../embedded.provisionprofile'))
  await launch(current, profile)
  assert.equal(await disabled(), true, 'The signed main must disable UI without a test setting the policy')
  assert.equal(await sessionHash(), null)
  sessionCreated = true
  await application.evaluate((_, scope) => { globalThis.protectedSessionNative.sessionKey(scope, true).fill(0) }, sessionScope)
  const stableSessionHash = await sessionHash()
  assert(stableSessionHash)
  const ciphertext = await application.evaluate(({ safeStorage }) => {
    if (!safeStorage.isEncryptionAvailable()) throw Error('System encryption is unavailable in the signed app')
    const encrypted = safeStorage.encryptString('synthetic-signed-release-roundtrip')
    if (safeStorage.decryptString(encrypted) !== 'synthetic-signed-release-roundtrip') throw Error('Cipher roundtrip failed')
    return encrypted.toString('base64')
  })
  await page.screenshot({ path: join(out, 'first-use.png') })
  check('the signed app loads the policy under Hardened Runtime and encrypts on first use with UI disabled')
  await close()
  await launch(current, profile)
  assert.equal(await disabled(), true)
  assert.equal(await sessionHash(), stableSessionHash)
  assert.equal(await application.evaluate(({ safeStorage }, bytes) => safeStorage.decryptString(Buffer.from(bytes, 'base64')) === 'synthetic-signed-release-roundtrip', ciphertext), true)
  check('actual safeStorage ciphertext remains readable after a full signed-app process restart')
  check('the private Data Protection session key survives a full process restart without authorization')
  await close()

  const replacement = join(temporary, 'replacement/Goalloom.app')
  run('/usr/bin/ditto', [resolve(dirname(current), '..', '..'), replacement], 60_000)
  run('/usr/bin/plutil', ['-replace', 'CFBundleVersion', '-string', '9999.0.0', join(replacement, 'Contents/Info.plist')])
  run('/usr/bin/codesign', ['--force', '--sign', identity, '--keychain', keychain, '--timestamp', '--options', 'runtime', '--entitlements', resolve('build/entitlements.mac.session.plist'), replacement])
  run('/usr/bin/codesign', ['--verify', '--deep', '--strict', replacement])
  await launch(join(replacement, 'Contents/MacOS/Goalloom'), profile)
  assert.equal(await disabled(), true); assert.equal(await sessionHash(), stableSessionHash)
  await application.evaluate((_, scope) => globalThis.protectedSessionNative.deleteSessionKey(scope), sessionScope)
  sessionCreated = false
  check('a replacement bundle with a new signed version and the same app/access-group identity retains the session key')
  await close()

  report.passed = true
} catch (error) {
  report.failure = error.stack ?? String(error)
  throw error
} finally {
  if (sessionCreated) {
    await close(); await launch(current, profile)
    await application.evaluate((_, scope) => globalThis.protectedSessionNative.deleteSessionKey(scope), sessionScope)
  }
  await close()
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
  await rm(temporary, { recursive: true, force: true })
}
