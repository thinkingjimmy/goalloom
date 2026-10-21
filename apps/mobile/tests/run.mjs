/**
 * [INPUT]: A simulator-only app, an explicitly isolated simulator and local Maestro/Java.
 * [OUTPUT]: Local-only native Auth JUnit, screenshots, logs and a repeatable scope report.
 * [POS]: Mobile E2E runner. It rejects personal devices and never uses hosted Auth or Maestro Cloud.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { resolve, join } from 'node:path'
import { platform, arch, release } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
const root = resolve(import.meta.dirname, '../../..')
if (process.argv[2] !== 'auth') throw Error('Expected the auth test group')
const cases = [['auth-cancel', 'cancel'], ['auth-failure', 'failure'], ['auth-success', 'success'], ['auth-sign-out', 'success'], ['auth-storage-failure', 'storage-failure']]
const names = process.argv.slice(3)
if (names.some(name => !cases.some(([candidate]) => name === candidate))) throw Error('Unknown native Auth scenario')
const out = join(root, 'output/tests/mobile-sync')
await mkdir(out, { recursive: true })
const device = process.env.GOALLOOM_E2E_DEVICE || JSON.parse(await readFile(join(out, 'simulator.json'), 'utf8')).udid
const devices = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', '--json'], { encoding: 'utf8' }))
const selected = Object.values(devices.devices).flat().find(value => value.udid === device)
if (!selected?.name.startsWith('Goalloom ') || !selected.name.includes('E2E')) throw Error('Use a dedicated Goalloom E2E simulator; personal simulators are refused')
const app = process.env.GOALLOOM_E2E_APP
if (!app?.endsWith('/Goalloom.app')) throw Error('Set GOALLOOM_E2E_APP to the simulator-only synthetic-provider app')
const plist = execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleSupportedPlatforms:0', join(app, 'Info.plist')], { encoding: 'utf8' }).trim()
if (plist !== 'iPhoneSimulator') throw Error('Only simulator apps are accepted')
const buildConfig = JSON.parse(await readFile(join(app, 'EXConstants.bundle/app.config'), 'utf8'))
if (buildConfig.extra?.auth?.target !== 'development' || !buildConfig.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsLocalNetworking) throw Error('Use the explicit development E2E build')
// Xcode embeds simulator entitlements in Mach-O. Re-signing them as device
// entitlements makes an Apple Silicon simulator executable fail at launch.
const embedded = execFileSync('xcrun', ['otool', '-s', '__TEXT', '__entitlements', join(app, 'Goalloom')], { encoding: 'utf8' })
if (!embedded.includes('__entitlements')) throw Error('Build with CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM=E2ELOCAL01 for simulator Keychain access')
execFileSync('xcrun', ['simctl', 'install', device, app])
const base = 'http://127.0.0.1:54389'
let server
const health = async () => {
  try { return (await (await fetch(base + '/fixture/health', { signal: AbortSignal.timeout(2000) })).json()).scope === 'goalloom-native-auth-fixture' } catch { return false }
}
if (!(await health())) {
  server = spawn(process.execPath, [join(root, 'apps/mobile/tests/auth-server.mjs')], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] })
  const log = createWriteStream(join(out, 'auth-server.log'))
  server.stdout.pipe(log); server.stderr.pipe(log)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.once('exit', code => reject(Error('Auth fixture exited: ' + code)))
    server.stdout.once('data', resolve)
  })
  if (!(await health())) throw Error('Expected the local native Auth fixture')
}
const env = { ...process.env, MAESTRO_CLI_NO_ANALYTICS: 'true', MAESTRO_DISABLE_UPDATE_CHECK: 'true', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true', MAESTRO_API_URL: base }
const maestro = process.env.MAESTRO_BIN || 'maestro'
const report = { ok: false, host: { platform: platform(), arch: arch(), release: release(), node: process.version }, simulator: selected,
  scope: 'iOS simulator, real native Keychain/SQLite and Supabase SDK; synthetic provider and loopback Auth. No hosted OAuth, physical device, App Store or Windows acceptance.', scenarios: [] }
function inspect(name, sql) {
  const container = execFileSync('xcrun', ['simctl', 'get_app_container', device, 'app.goalloom.mobile', 'data'], { encoding: 'utf8' }).trim()
  const db = new DatabaseSync(join(container, 'Documents/SQLite', name + '.db'), { readOnly: true })
  try { return db.prepare(sql).get() } finally { db.close() }
}
try {
  for (const [name, mode] of cases.filter(([name]) => !names.length || names.includes(name))) {
    await fetch(base + '/fixture/mode?value=' + mode)
    const log = createWriteStream(join(out, name + '.log'))
    const child = spawn(maestro, ['test', '--udid', device, '--format', 'JUNIT', '--output', join(out, name + '.xml'), '--test-output-dir', join(out, name), join(root, 'apps/mobile/tests/maestro', name + '.yaml')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(log); child.stderr.pipe(log)
    const exitCode = await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
    const result = { name, exitCode }
    report.scenarios.push(result)
    console.log(`${name}: ${exitCode === 0 ? 'passed' : 'failed'}`)
    if (exitCode !== 0) throw Error(name + ' failed; inspect the local artifacts')
    if (name === 'auth-success') {
      const row = inspect('goalloom-credentials', "SELECT value FROM vault WHERE key LIKE '%:goalloom.auth.session'")
      if (!row || !/^[0-9a-f]+$/.test(row.value) || row.value.length < 65536) throw Error('Expected a large encrypted session outside Keychain')
      result.encryptedSessionBytes = row.value.length / 2
    }
    if (name === 'auth-sign-out') {
      const row = inspect('goalloom', "SELECT count(*) AS n FROM items WHERE title='Run a marathon' AND deletedAt IS NULL")
      if (row.n !== 1) throw Error('Sign-out/relogin must preserve the original local task')
      result.retainedLocalTasks = row.n
    }
    if (name === 'auth-storage-failure') {
      const row = inspect('goalloom-credentials', "SELECT count(*) AS n, max(key) AS key, max(value) AS value FROM vault")
      if (row.n !== 1 || !row.key.endsWith(':e2e-retained-ciphertext') || !/^[0-9a-f]+$/.test(row.value)) throw Error('Storage failure must retain ciphertext without a plaintext session')
      result.retainedCiphertext = true
    }
  }
  report.ok = true
} finally {
  server?.kill('SIGTERM')
  await writeFile(join(out, names.length ? `auth-${names.join('-')}-report.json` : 'auth-report.json'), JSON.stringify(report, null, 2))
}
