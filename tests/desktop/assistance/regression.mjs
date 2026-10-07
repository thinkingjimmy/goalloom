/**
 * [INPUT]: The changed feature's documented, deduplicated legacy acceptance commands.
 * [OUTPUT]: Sequential isolated runs, per-command logs and actual pass/failure evidence.
 * [POS]: Assistance delivery runner; excludes unrelated features, live providers and release-wide verify.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { cpus, release } from 'node:os'
import { resolve } from 'node:path'
const output = resolve('output/tests/assistance/regression')
await mkdir(output, { recursive: true })
const suites = ['electron', 'ui', 'task-focus', 'autosave', 'descriptions', 'links', 'composer', 'due-dates', 'language', 'history', 'feedback', 'periods', 'later', 'relations', 'recovery', 'calendar', 'insight', 'insight-generation', 'startup']
const commands = suites.map(name => ({ name, command: 'pnpm', args: [`test:${name}`] }))
commands.push({ name: 'month-review', command: process.execPath, args: ['tests/desktop/month-review.mjs'] }, { name: 'combined-review', command: process.execPath, args: ['tests/desktop/month-review.mjs', '--combined'] }, { name: 'review-consumers', command: process.execPath, args: ['tests/desktop/review/run.mjs', 'renderer', 'lifecycle', 'wire', 'virtual'] })
const requested = process.argv.slice(2)
if (requested.some(name => !commands.some(command => command.name === name))) throw Error('Unknown regression selector')
let previous = []
if (requested.length) { try { previous = JSON.parse(await readFile(`${output}/report.json`, 'utf8')).results ?? [] } catch {} }
const results = previous.filter(result => !requested.includes(result.name)), report = { scope: 'Affected feature coverage only; no release-wide verify, unrelated feature suites, packaged or Windows acceptance', baseline: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), workingTree: true, host: { platform: process.platform, arch: process.arch, osKernel: release(), cpu: cpus()[0]?.model, physicalOrVm: 'unverified' }, results }
for (const test of requested.length ? commands.filter(test => requested.includes(test.name)) : commands) {
  const path = `${output}/${test.name}.log`, log = createWriteStream(path), startedAt = new Date().toISOString()
  console.log(`Running ${test.command} ${test.args.join(' ')}`)
  const code = await new Promise((resolve, reject) => {
    const child = spawn(test.command, test.args, { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false })
    child.on('error', reject); child.on('exit', code => resolve(code ?? 1))
  }).catch(error => { log.write(error.message); return 1 })
  await new Promise(resolve => log.end(resolve))
  results.push({ name: test.name, command: `${test.command} ${test.args.join(' ')}`, exitCode: code, startedAt, endedAt: new Date().toISOString(), log: path })
  await writeFile(`${output}/report.json`, JSON.stringify({ ...report, ok: results.every(result => result.exitCode === 0) }, null, 2))
  console.log(`${test.name}: ${code === 0 ? 'passed' : 'failed'}`)
  if (code !== 0) console.log((await readFile(path, 'utf8')).slice(-3500))
}
if (results.some(result => result.exitCode !== 0)) process.exitCode = 1
