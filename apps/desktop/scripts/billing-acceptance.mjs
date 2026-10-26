/**
 * [INPUT]: Current built desktop and explicit billing-owned feature selectors.
 * [OUTPUT]: Serial commands, retained attempt logs and build-bound affected-feature acceptance evidence.
 * [POS]: D1 feature runner. No verify, performance, stress, provider mutation or real inference.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, open, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { cpus, release } from 'node:os'

const out = resolve('../../output/tests/billing/desktop/d1-client/features')
await mkdir(out, { recursive: true })
const node = (file, ...args) => [process.execPath, [`tests/${file}.mjs`, ...args]]
const pnpm = name => ['pnpm', ['run', name]]
const scenarios = [
  ['native', node('billing-native')], ['browser-return', node('billing-browser-return')],
  ['hosted-cache', node('hosted-ai-cache')], ['hosted', node('hosted-ai')],
  ['ui', node('workspace')], ['composer', node('composer')], ['language', node('language')], ['calendar', node('calendar-modes')],
  ['apple-login', node('apple-login')], ['credentials', node('credentials')],
  ['sync-join', pnpm('test:sync-join')], ['sync-replay', node('sync-replay')],
  ['sync-security', pnpm('test:sync-security')], ['sync-scheduling', pnpm('test:sync-scheduling')], ['recovery', node('recovery')],
  ['insight', node('insight')], ['insight-generation', node('insight-generation')], ['assistance', node('assistance/run')],
  ['month-review', node('month-review')], ['combined-review', node('month-review', '--combined')],
]
const selected = process.argv.slice(2)
if (selected.some(name => !scenarios.some(([id]) => id === name))) throw Error('Unknown billing-owned feature selector')
const digest = createHash('sha256')
for (const file of ['out/main/index.js', 'out/preload/index.cjs', 'out/renderer/index.html']) digest.update(await readFile(file))
const buildFingerprint = digest.digest('hex')
let attempts = []
try { attempts = JSON.parse(await readFile(join(out, 'report.json'), 'utf8')).attempts ?? [] } catch {}
const report = { ok: false, buildFingerprint, scope: 'Full affected D1 billing, account/Onboarding, sync/security and hosted transport ownership. Source Electron and controlled fixtures; provider, packaged/Windows and production acceptance remain separate.',
  host: { os: release(), arch: process.arch, cpu: cpus()[0]?.model }, attempts }
for (const [name, [command, args]] of scenarios.filter(([name]) => !selected.length || selected.includes(name))) {
  const startedAt = new Date().toISOString(), logPath = join(out, `${Date.now()}-${name}.log`), log = await open(logPath, 'w')
  console.log(`Running ${name}: ${command} ${args.join(' ')}`)
  const code = await new Promise(resolve => {
    const child = spawn(command, args, { env: process.env, stdio: ['ignore', log.fd, log.fd] })
    child.once('error', () => resolve(-1)); child.once('exit', code => resolve(code ?? -1))
  })
  await log.close()
  report.attempts.push({ name, command: `${command} ${args.join(' ')}`, code, buildFingerprint, startedAt, finishedAt: new Date().toISOString(), log: logPath })
  await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`${name}: ${code === 0 ? 'passed' : 'failed'} (${logPath})`)
  if (code !== 0) { process.exitCode = 1; break }
}
report.pending = scenarios.filter(([name]) => report.attempts.filter(row => row.name === name && row.buildFingerprint === buildFingerprint).at(-1)?.code !== 0).map(([name]) => name)
report.ok = report.pending.length === 0
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n')
