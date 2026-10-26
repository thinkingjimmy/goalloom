/**
 * [INPUT]: A dedicated booted E2E simulator, a demo-seeded development build, local Maestro and Java 21.
 * [OUTPUT]: Native task-completion JUnit, video, screenshots and runtime/source evidence under output/tests/mobile-celebration/.
 * [POS]: Full-app acceptance runner. It rejects personal devices and never clears their data or uses hosted services.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { arch, platform, release } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const root = resolve(import.meta.dirname, '../../..')
const scenario = process.argv[2] ?? 'shapes'
assert(['shapes', 'disabled', 'reduced-motion'].includes(scenario), 'Expected shapes, disabled or reduced-motion')
const device = process.env.GOALLOOM_E2E_DEVICE
const app = process.env.GOALLOOM_E2E_APP
assert(device && app?.endsWith('/Goalloom.app'), 'Set GOALLOOM_E2E_DEVICE and GOALLOOM_E2E_APP')
const exec = (file, args) => execFileSync(file, args, { encoding: 'utf8' }).trim()
const devices = JSON.parse(exec('xcrun', ['simctl', 'list', 'devices', '--json']))
const selected = Object.values(devices.devices).flat().find(value => value.udid === device)
assert(selected?.name.startsWith('Goalloom ') && selected.name.includes('E2E') && selected.state === 'Booted', 'Use a booted, dedicated Goalloom E2E simulator')
if (scenario === 'reduced-motion') assert.equal(selected.deviceTypeIdentifier, 'com.apple.CoreSimulator.SimDeviceType.iPhone-17', 'The inspected system switch coordinates require iPhone 17 at standard text size')
assert.equal(exec('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleSupportedPlatforms:0', join(app, 'Info.plist')]), 'iPhoneSimulator')
const config = JSON.parse(await readFile(join(app, 'EXConstants.bundle/app.config'), 'utf8'))
assert(config.extra?.auth?.target === 'development' && config.ios?.infoPlist?.NSAppTransportSecurity?.NSAllowsLocalNetworking, 'Use an explicit development E2E build')
const bundle = await readFile(join(app, 'main.jsbundle'))
assert(bundle.includes(Buffer.from('Native decoration E2E sequence')), 'Rebuild with the native celebration E2E selector')
const out = join(root, 'output/tests/mobile-celebration', scenario, new Date().toISOString().replaceAll(':', '-'))
await mkdir(out, { recursive: true })
exec('xcrun', ['simctl', 'install', device, app])
// Always restart the JS runtime so the recorded shape sequence begins with default confetti.
try { exec('xcrun', ['simctl', 'terminate', device, 'app.goalloom.mobile']) } catch { /* Not running yet. */ }
const report = { ok: false, scenario, simulator: selected,
  host: { platform: platform(), arch: arch(), release: release(), node: process.version, machineScope: 'Host OS reported; physical/VM status not independently verified' },
  bundleSha256: createHash('sha256').update(bundle).digest('hex'),
  expectedShapes: scenario === 'shapes' ? ['confetti', '🎉', '❤️', '✨', '🎊', '⭐️', '🌈', '🔥', '🥳'] : [],
  scope: 'Source-based iOS simulator acceptance with real UI, native Animated and SQLite; deterministic E2E shape selection. Video requires visual inspection for decorative glyphs. No physical-device, Android, Windows or packaged acceptance.',
}
const completed = child => new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
const video = spawn('xcrun', ['simctl', 'io', device, 'recordVideo', '--codec=h264', join(out, 'completion.mp4')], { stdio: ['ignore', 'pipe', 'pipe'] })
const videoDone = completed(video)
const videoLog = createWriteStream(join(out, 'video.log'))
video.stdout.pipe(videoLog); video.stderr.pipe(videoLog)
try {
  const flow = scenario === 'disabled' ? 'celebration-disabled.yaml' : scenario === 'reduced-motion' ? 'celebration-reduced-motion.yaml' : 'celebration.yaml'
  const log = createWriteStream(join(out, 'maestro.log'))
  const child = spawn(process.env.MAESTRO_BIN || 'maestro', ['test', '--udid', device, '--format', 'JUNIT', '--output', join(out, 'result.xml'), '--test-output-dir', out, join(root, 'apps/mobile/tests/maestro', flow)], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, MAESTRO_CLI_NO_ANALYTICS: 'true', MAESTRO_DISABLE_UPDATE_CHECK: 'true', MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: 'true', MAESTRO_API_URL: 'http://127.0.0.1:54389' },
  })
  child.stdout.pipe(log); child.stderr.pipe(log)
  report.exitCode = await completed(child)
  assert.equal(report.exitCode, 0, 'Inspect the local Maestro artifacts')
  const container = exec('xcrun', ['simctl', 'get_app_container', device, 'app.goalloom.mobile', 'data'])
  const db = new DatabaseSync(join(container, 'Documents/SQLite/goalloom-demo.db'), { readOnly: true })
  try {
    report.savedTask = db.prepare("SELECT status, (SELECT count(*) FROM item_events WHERE itemId=items.id AND type='status_changed') AS changes FROM items WHERE title='周三 10km 节奏跑'").get()
    assert.equal(report.savedTask?.status, scenario === 'disabled' ? 'done' : 'todo')
    assert.equal(report.savedTask?.changes, scenario === 'disabled' ? 1 : 18)
  } finally { db.close() }
  report.ok = true
} finally {
  video.kill('SIGINT')
  await videoDone
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2))
}
