/**
 * [INPUT]: Explicit synthetic Data Protection write authorization, the accepted private signed candidate and temporary test data.
 * [OUTPUT]: Scoped session-key creation/restart/replacement/deletion evidence; default/search-list keychains remain unchanged.
 * [POS]: Local Developer ID acceptance, separate from the CI-only legacy safeStorage/upgrade gate. Default mode only prints a plan.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { cpus, homedir, release } from 'node:os'
import { dirname, join, resolve } from 'node:path'

const mode = process.argv[2] ?? '--plan'
assert(['--plan', '--execute'].includes(mode), 'Use --plan or --execute <candidate-executable> <authorization-json>')
if (mode === '--plan') {
  console.log(JSON.stringify({ execute: false, keychainWrites: 0, requirements: [
    'Explicit user approval for one synthetic Data Protection session scope and exact-scope cleanup',
    'Accepted private1.10.0 Developer ID/Hardened Runtime candidate and exclusive native slot',
    'Fresh temporary userData; installed matching identity; unchanged default/search-list keychains',
  ], excluded: ['legacy safeStorage', 'real account/session', 'keychain import/default/search-list changes', 'CI-only test impersonation'] }, null, 2))
  process.exit(0)
}

assert.equal(process.platform, 'darwin')
assert.equal(process.env.GITHUB_ACTIONS, undefined, 'Use the original gate on CI; this runner is local only')
const authorizationPath = resolve(process.argv[4] ?? '')
const authorizationBytes = await readFile(authorizationPath)
const authorization = JSON.parse(authorizationBytes)
assert.equal(authorization.userApprovedSyntheticDataProtectionWrite, true, 'Specific user approval is required')
assert.equal(authorization.scope, 'local-signed-session-first-use-restart-replacement-cleanup')
assert.equal(authorization.candidateVersion, '1.10.0')
assert.equal(authorization.allowDefaultKeychainChange, false)
assert.equal(authorization.allowSearchListChange, false)
const root = resolve('../..'), executable = resolve(process.argv[3] ?? '')
assert.equal(executable, join(root, 'apps/desktop/release/mac-arm64/Goalloom.app/Contents/MacOS/Goalloom'), 'Use only the prepared private candidate')
const accepted = JSON.parse(await readFile(join(root, 'output/tests/billing/desktop/bill30-release/private-mac-finish/result.json'), 'utf8'))
assert(accepted.ok, 'Independent private package signature/notary acceptance must pass first')
const { validateSessionProfile } = await import('../scripts/build/session-profile.mjs')
const { _electron: electron } = await import('playwright')
const { default: headers } = await import('node-api-headers')
const run = (command, args, timeout = 30000) => execFileSync(command, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] })
function validateSignature(path) {
  run('codesign', ['--verify', '--deep', '--strict', path])
  const result = spawnSync('codesign', ['-dv', '--verbose=4', path], { encoding: 'utf8', timeout: 30000 })
  assert.equal(result.status, 0)
  const details = result.stdout + result.stderr
  assert(details.includes('TeamIdentifier=947MAGH97Q') && details.includes('Developer ID Application') && details.includes('(runtime)'), 'Expected Developer ID team and Hardened Runtime are required')
}
const defaultKeychain = () => run('security', ['default-keychain', '-d', 'user'])
const searchList = () => run('security', ['list-keychains', '-d', 'user'])
const beforeDefault = defaultKeychain(), beforeSearch = searchList()
const identity = 'C54ECF19C71A39B7B6CD260D3EE920190F3BC48C'
const signingKeychain = join(homedir(), 'Library/Keychains/login.keychain-db')
assert(run('security', ['find-identity', '-v', '-p', 'codesigning', signingKeychain]).includes(identity))
const temporary = await mkdtemp('/private/tmp/goalloom-signed-session-local-')
const profile = join(temporary, 'profile'), probe = join(temporary, 'probe.node')
const scope = createHash('sha256').update(randomBytes(32)).update(temporary).digest('hex')
const evidence = resolve(`output/tests/keychain-signed-local/runs/${Date.now()}-${randomUUID()}`)
await mkdir(evidence, { recursive: true }); await mkdir(profile)
await writeFile(join(profile, 'preferences.json'), JSON.stringify({ language: 'en' }))
const report = { ok: false, checks: [], scope, authorizationSha256: createHash('sha256').update(authorizationBytes).digest('hex'),
  host: { platform: process.platform, arch: process.arch, kernel: release(), cpu: cpus()[0]?.model, physicalOrVM: 'Not independently verified' },
  acceptance: 'Actual signed/Hardened Runtime candidate, one random synthetic Data Protection account, restart and signed same-identity replacement. No safeStorage/legacy AI-upgrade, installed-app/user credential, live account/model, Windows or public updater acceptance.' }
let application, page, sessionMayExist = false, cleanupComplete = true
const check = label => { report.checks.push(label); console.log(`PASS ${label}`) }
async function close() { await application?.close(); application = null; page = null }
async function launch(path) {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.ELECTRON_RENDERER_URL
  application = await electron.launch({ executablePath: path, args: [`--user-data-dir=${profile}`], env, timeout: 30000 })
  const identity = await application.evaluate(({ app }) => ({ packaged: app.isPackaged, profile: app.getPath('userData'), version: app.getVersion() }))
  assert(identity.packaged && identity.profile === profile && identity.version === '1.10.0', 'An isolated production candidate is required')
  await application.evaluate((_, paths) => {
    const require = process.getBuiltinModule('module').createRequire(process.execPath)
    globalThis.localSessionProbe = require(paths.probe)
    globalThis.localSessionPolicy = require(paths.policy)
  }, { probe, policy: resolve(dirname(path), '../Resources/app.asar.unpacked/out/main/keychain-policy.node') })
  page = await application.firstWindow(); await page.locator('.start-cards').waitFor()
  const disabled = await application.evaluate((_, unused) => JSON.parse(globalThis.localSessionProbe.operation('policy', unused, '')).interactionDisabled, join(temporary, 'never-created.keychain-db'))
  assert.equal(disabled, true, 'Production startup must disable interaction; the test must not enable it')
}
const keyHash = () => application.evaluate((_, scope) => {
  const key = globalThis.localSessionPolicy.sessionKey(scope, false)
  if (!key) return null
  try { return process.getBuiltinModule('crypto').createHash('sha256').update(key).digest('hex') }
  finally { key.fill(0) }
}, scope)
async function removeOwnScope() {
  await application.evaluate((_, scope) => globalThis.localSessionPolicy.deleteSessionKey(scope), scope)
  assert.equal(await keyHash(), null, 'The exact synthetic scope must be absent after cleanup')
  sessionMayExist = false; cleanupComplete = true
}
try {
  const app = resolve(dirname(executable), '../..')
  validateSignature(app)
  validateSessionProfile(resolve(dirname(executable), '../embedded.provisionprofile'))
  run('xcrun', ['clang', '-fobjc-arc', '-Wno-deprecated-declarations', '-DGOALLOOM_KEYCHAIN_NODE', '-DNAPI_VERSION=8', '-I', headers.include_dir, '-bundle', '-undefined', 'dynamic_lookup', '-framework', 'Foundation', '-framework', 'Security', resolve('tests/fixtures/keychain-native.m'), '-o', probe])
  run('codesign', ['--force', '--sign', identity, '--keychain', signingKeychain, '--timestamp', '--options', 'runtime', '--entitlements', resolve('build/entitlements.mac.inherit.plist'), probe])
  await launch(executable)
  assert.equal(await keyHash(), null, 'Never reuse or delete an existing account')
  sessionMayExist = true; cleanupComplete = false
  await application.evaluate((_, scope) => globalThis.localSessionPolicy.sessionKey(scope, true).fill(0), scope)
  const originalHash = await keyHash(); assert(originalHash)
  assert.equal(await keyHash(), originalHash)
  report.runtime = await page.evaluate(() => window.goalloom.getRuntime())
  await page.screenshot({ path: join(evidence, 'first-use.png') })
  check('the actual signed candidate creates and reads one fresh synthetic session scope without interaction')
  await close(); await launch(executable)
  assert.equal(await keyHash(), originalHash)
  check('the same synthetic session scope survives a complete signed-process restart')
  await close()
  const replacement = join(temporary, 'replacement/Goalloom.app')
  run('ditto', [app, replacement], 120000)
  run('plutil', ['-replace', 'CFBundleVersion', '-string', '9999.0.0', join(replacement, 'Contents/Info.plist')])
  run('codesign', ['--force', '--sign', identity, '--keychain', signingKeychain, '--timestamp', '--options', 'runtime', '--entitlements', resolve('build/entitlements.mac.session.plist'), replacement])
  run('codesign', ['--verify', '--deep', '--strict', replacement])
  await launch(join(replacement, 'Contents/MacOS/Goalloom'))
  assert.equal(await keyHash(), originalHash)
  await page.screenshot({ path: join(evidence, 'replacement.png') })
  check('a runner-owned signed replacement with the same application/access group retains that synthetic scope')
  await removeOwnScope()
  check('exact-scope deletion leaves no synthetic session key; no existing account was queried')
  await close(); await launch(executable)
  assert.equal(await keyHash(), null)
  report.independentAbsenceVerified = true
  check('a fresh signed process independently confirms the synthetic scope is absent after cleanup')
  report.ok = true
} catch (error) {
  report.error = error.message
  if (page && !page.isClosed()) {
    report.focus = await page.evaluate(() => ({ focused: document.hasFocus(), visibility: document.visibilityState })).catch(() => null)
    await page.screenshot({ path: join(evidence, 'failure.png') }).catch(() => {})
  }
  throw error
} finally {
  if (sessionMayExist) {
    try {
      if (!application || !page || page.isClosed()) { await close().catch(() => {}); await launch(executable) }
      await removeOwnScope()
    } catch { cleanupComplete = false }
  }
  await close().catch(() => {})
  report.cleanupComplete = cleanupComplete
  report.defaultKeychainUnchanged = defaultKeychain() === beforeDefault
  report.searchListUnchanged = searchList() === beforeSearch
  report.ok = report.ok && cleanupComplete && report.defaultKeychainUnchanged && report.searchListUnchanged
  await writeFile(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  if (cleanupComplete && report.defaultKeychainUnchanged && report.searchListUnchanged) await rm(temporary, { recursive: true, force: true })
  assert(report.ok, `Inspect local signed-session evidence: ${evidence}`)
}
