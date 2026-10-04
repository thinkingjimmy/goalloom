#!/usr/bin/env node
/**
 * Isolated Goalloom window harness.
 *
 * Starts one built Electron with its own user-data directory, drives the real
 * window through Playwright, and writes proof under output/tests/verify-goalloom/evidence.
 * Cleanup removes only the run it started. It never signals a process by name.
 */
import { spawn, execFileSync } from 'node:child_process'
import { connect, createServer } from 'node:net'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { openSync, readFileSync } from 'node:fs'
import { homedir, cpus, platform, release, arch } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptPath = fileURLToPath(import.meta.url)
const horizons = ['year', 'half', 'cycle', 'month', 'week', 'day', 'later']

function repoRoot() {
  let dir = dirname(scriptPath)
  for (let i = 0; i < 6; i += 1) {
    dir = dirname(dir)
    try {
      if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === 'goalloom') return dir
    } catch { /* keep walking */ }
  }
  throw new Error('Goalloom repository root not found from the harness script')
}

function parseArgs(argv) {
  const out = { _: [], run: process.env.GOALLOOM_VERIFY_RUN || 'default' }
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (!token.startsWith('--')) { out._.push(token); continue }
    const key = token.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[key] = true
    else { out[key] = next; i += 1 }
  }
  return out
}

function pathsFor(repo, run) {
  if (!/^[a-z][a-z0-9-]{0,31}$/.test(run)) throw new Error(`run id must match ^[a-z][a-z0-9-]{0,31}$, got ${run}`)
  const root = join(repo, 'output', 'tests', 'verify-goalloom')
  const runDir = join(root, 'runs', run)
  const socket = join(runDir, 'control.sock')
  if (socket.length > 100) throw new Error(`socket path is too long for macOS: ${socket}`)
  return {
    root,
    evidence: join(root, 'evidence'),
    runDir,
    profile: join(runDir, 'profile'),
    session: join(runDir, 'session.json'),
    socket,
    log: join(runDir, 'daemon.log'),
  }
}

function defaultUserData() {
  if (process.platform === 'darwin') return join(homedir(), 'Library', 'Application Support', 'Goalloom')
  if (process.platform === 'win32') return join(process.env.APPDATA ?? '', 'Goalloom')
  return join(homedir(), '.config', 'Goalloom')
}

function assertIsolated(profile) {
  const resolved = resolve(profile)
  const real = resolve(defaultUserData())
  if (resolved === real) throw new Error('refusing to drive the real Goalloom user-data directory')
  const runs = resolve(repoRoot(), 'output', 'tests', 'verify-goalloom', 'runs')
  if (resolved !== runs && !resolved.startsWith(runs + sep)) throw new Error(`profile is outside the verification runs directory: ${resolved}`)
}

function assertEvidence(repo, file) {
  const resolved = resolve(repo, file)
  const root = resolve(repo, 'output', 'tests', 'verify-goalloom', 'evidence')
  if (resolved !== root && !resolved.startsWith(root + sep)) throw new Error(`proof must stay under ${root}`)
  return resolved
}

function sleep(ms) { return new Promise(done => setTimeout(done, ms)) }
function alive(pid) { try { process.kill(pid, 0); return true } catch { return false } }
function commandOf(pid) {
  try { return execFileSync('ps', ['-ww', '-p', String(pid), '-o', 'command='], { encoding: 'utf8' }).trim() }
  catch { return '' }
}
async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return null }
}
async function writeJson(file, value) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(value, null, 2))
}

function shortcut(key) {
  if (!/^Mod\+/i.test(key)) return key
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  return `${mod}+${key.slice(4)}`
}

function locator(page, message) {
  let root = page
  if (message.withinDialog) root = page.getByRole('dialog', { name: message.withinDialog, exact: true })
  if (message.horizon) {
    if (!horizons.includes(message.horizon)) throw new Error(`unknown horizon ${message.horizon}`)
    return root.locator(`[data-horizon="${message.horizon}"] .column-content`)
  }
  if (!message.role) throw new Error('missing --role')
  const options = {}
  if (message.namePattern) options.name = new RegExp(message.namePattern)
  else if (message.name !== undefined) { options.name = message.name; options.exact = message.exact !== 'false' }
  return root.getByRole(message.role, options)
}

async function request(socketPath, message, timeoutMs = 30_000) {
  return new Promise((done, reject) => {
    const socket = connect(socketPath)
    let buffer = ''
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('harness timed out')) }, timeoutMs)
    socket.on('connect', () => socket.write(`${JSON.stringify(message)}\n`))
    socket.on('data', chunk => {
      buffer += chunk
      const index = buffer.indexOf('\n')
      if (index < 0) return
      clearTimeout(timer)
      socket.end()
      try { done(JSON.parse(buffer.slice(0, index))) }
      catch (error) { reject(error) }
    })
    socket.on('error', error => { clearTimeout(timer); reject(error) })
  })
}

async function stopPid(pid, markers) {
  const required = Array.isArray(markers) ? markers : [markers]
  if (!pid) return { stopped: false, reason: 'no pid' }
  const command = commandOf(pid)
  if (!command || required.some(marker => !command.includes(marker))) return { stopped: false, reason: 'pid is not the verification process', command }
  process.kill(pid, 'SIGTERM')
  for (let i = 0; i < 20; i += 1) {
    if (!alive(pid)) return { stopped: true, signal: 'SIGTERM' }
    await sleep(150)
  }
  const again = commandOf(pid)
  if (again && required.every(marker => again.includes(marker))) {
    try { process.kill(pid, 'SIGKILL') } catch { /* already gone */ }
    return { stopped: true, signal: 'SIGKILL' }
  }
  return { stopped: false, reason: 'pid changed before kill' }
}

async function cleanup(repo, run) {
  const paths = pathsFor(repo, run)
  const session = await readJson(paths.session)
  let shutdown = null
  if (session?.socket) {
    try { shutdown = await request(session.socket, { command: 'shutdown' }, 10_000) }
    catch (error) { shutdown = { ok: false, error: error.message } }
  }
  const daemon = await stopPid(session?.daemonPid, ['goalloom-verify.mjs', `--run ${run}`])
  const electronStopped = await stopPid(session?.electronPid, paths.profile)
  await rm(paths.runDir, { recursive: true, force: true })
  let evidenceKept = false
  try { await stat(paths.evidence); evidenceKept = true } catch { /* no proof yet */ }
  return { ok: true, removed: paths.runDir, evidence: paths.evidence, evidenceKept, shutdown, daemon, electron: electronStopped }
}

async function launch(repo, run) {
  const paths = pathsFor(repo, run)
  assertIsolated(paths.profile)
  const built = join(repo, 'out', 'main', 'index.js')
  try { await stat(built) }
  catch { throw new Error('out/main/index.js is missing. From the repository root run: pnpm build') }
  const existing = await readJson(paths.session)
  if (existing?.daemonPid && alive(existing.daemonPid) && commandOf(existing.daemonPid).includes('goalloom-verify.mjs')) {
    throw new Error(`run ${run} is already up (pid ${existing.daemonPid}). Cleanup it or pass --run with another id.`)
  }
  await rm(paths.runDir, { recursive: true, force: true })
  await mkdir(paths.profile, { recursive: true })
  await mkdir(paths.evidence, { recursive: true })
  await writeFile(join(paths.profile, 'preferences.json'), JSON.stringify({ language: 'zh' }))
  await writeFile(join(paths.profile, 'window.json'), JSON.stringify({ x: 80, y: 60, width: 1440, height: 900, maximized: false }))
  const logFd = openSync(paths.log, 'a')
  const child = spawn(process.execPath, [scriptPath, 'serve', '--run', run], {
    cwd: repo,
    detached: true,
    stdio: ['ignore', logFd, logFd],
    env: process.env,
  })
  child.unref()
  await writeJson(paths.session, { run, daemonPid: child.pid, profile: paths.profile, socket: paths.socket, ready: false, phase: 'starting' })
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    const session = await readJson(paths.session)
    if (session?.ready) return session
    if (session?.error) throw new Error(session.error)
    if (!alive(child.pid)) {
      const log = await readFile(paths.log, 'utf8').catch(() => '')
      throw new Error(`verification daemon exited early\n${log.slice(-2000)}`)
    }
    await sleep(250)
  }
  throw new Error('timed out waiting for the Goalloom window')
}

function target(message) {
  if (message.namePattern) return `${message.role} /${message.namePattern}/`
  if (message.horizon) return `column ${message.horizon}`
  return `${message.role ?? ''} ${message.name ?? message.text ?? ''}`.trim()
}

async function serve(repo, run) {
  const paths = pathsFor(repo, run)
  assertIsolated(paths.profile)
  const { _electron: electron } = await import('playwright')
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  delete environment.ELECTRON_RENDERER_URL
  let application
  let page
  let shuttingDown = false
  const fail = async error => {
    const previous = await readJson(paths.session)
    await writeJson(paths.session, { ...previous, daemonPid: process.pid, ready: false, error: String(error?.stack ?? error), phase: 'failed' })
    if (application) await application.close().catch(() => undefined)
    process.exit(1)
  }
  const shutdown = async () => {
    if (shuttingDown) return
    shuttingDown = true
    if (application) await application.close().catch(() => undefined)
    process.exit(0)
  }
  process.on('SIGTERM', () => { void shutdown() })
  process.on('uncaughtException', error => { void fail(error) })
  process.on('unhandledRejection', error => { void fail(error) })
  try {
    application = await electron.launch({
      args: ['.', `--user-data-dir=${paths.profile}`],
      cwd: repo,
      env: environment,
      timeout: 30_000,
    })
    const electronPid = application.process().pid
    const previous = await readJson(paths.session)
    await writeJson(paths.session, { ...previous, daemonPid: process.pid, electronPid, phase: 'launched' })
    page = await application.firstWindow()
    page.setDefaultTimeout(15_000)
    page.on('pageerror', error => console.error(error.message))
    await page.locator('.calendar-modes, .board').first().waitFor({ timeout: 30_000 })
    const surface = await page.locator('.board').count() ? 'board' : 'onboarding'
    const runtime = await page.evaluate(() => window.goalloom.getRuntime())
    await writeJson(paths.session, {
      ...await readJson(paths.session),
      daemonPid: process.pid,
      ready: true,
      phase: 'ready',
      surface,
      title: await page.title(),
      url: page.url(),
      electron: runtime.electron,
      sqlite: runtime.sqlite,
      evidence: paths.evidence,
      profile: paths.profile,
      socket: paths.socket,
      startedAt: new Date().toISOString(),
    })
  } catch (error) { await fail(error); return }

  const server = createServer(socket => {
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', chunk => {
      buffer += chunk
      let index
      while ((index = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        void handle(JSON.parse(line)).then(result => socket.write(`${JSON.stringify(result)}\n`))
          .catch(async error => {
            const aria = await page.locator('body').ariaSnapshot().catch(() => '')
            socket.write(`${JSON.stringify({ ok: false, error: String(error), aria: aria.slice(0, 4000) })}\n`)
          })
      }
    })
  })
  server.listen(paths.socket)

  async function shot(message) {
    if (!message.shot) return
    const file = assertEvidence(repo, message.shot)
    await mkdir(dirname(file), { recursive: true })
    await page.screenshot({ path: file })
  }

  async function handle(message) {
    if (message.command === 'shutdown') {
      socketEnd(server)
      const result = { ok: true, shutdown: true }
      setTimeout(() => { void shutdown() }, 50)
      return result
    }
    if (message.command === 'doctor') return doctor(repo, paths, application, page)
    if (message.command === 'settle') {
      const content = page.locator('.onboarding-content')
      if (await content.count() === 0) return { ok: true, settled: false }
      await content.first().evaluate(node => Promise.race([
        Promise.all(node.getAnimations().map(animation => animation.finished)),
        new Promise(done => setTimeout(done, 3000)),
      ]))
      return { ok: true, settled: true }
    }
    if (message.command === 'press') {
      await page.keyboard.press(shortcut(message.key))
      await shot(message)
      return { ok: true, key: shortcut(message.key) }
    }
    if (message.command === 'dblclick') {
      const column = locator(page, message)
      await column.waitFor({ state: 'visible' })
      const box = await column.boundingBox()
      if (!box) throw new Error('column is not visible')
      await column.dblclick({ position: { x: Math.max(8, Math.floor(box.width / 2)), y: Math.max(8, Math.floor(box.height - 24)) } })
      await shot(message)
      return { ok: true, horizon: message.horizon }
    }
    if (message.command === 'wait-text') {
      const found = page.getByText(message.text, { exact: message.exact !== 'false' })
      await found.first().waitFor({ state: 'visible' })
      await shot(message)
      return { ok: true, text: message.text }
    }
    if (message.command === 'screenshot' || message.command === 'aria' || message.command === 'items') {
      const file = assertEvidence(repo, message.path)
      await mkdir(dirname(file), { recursive: true })
      if (message.command === 'screenshot') {
        await page.screenshot({ path: file })
        return { ok: true, path: file, title: await page.title(), url: page.url() }
      }
      if (message.command === 'aria') {
        const body = await page.locator('body').ariaSnapshot()
        await writeFile(file, `title: ${await page.title()}\nurl: ${page.url()}\n---\n${body}\n`)
        return { ok: true, path: file }
      }
      const report = await page.evaluate(async () => {
        const snapshot = await window.goalloom.getSnapshot()
        return {
          revision: snapshot.workspace.revision,
          generation: snapshot.workspace.generation,
          calendar: snapshot.workspace.calendar,
          items: snapshot.items.map(item => ({
            id: item.id, title: item.title, horizon: item.placement.horizon, periodId: item.placement.periodId, status: item.status,
          })),
          flows: snapshot.flows.map(flow => ({ title: flow.title, flowColor: flow.flowColor })),
        }
      })
      await writeFile(file, JSON.stringify(report, null, 2))
      return { ok: true, path: file, titles: report.items.map(item => item.title) }
    }
    const node = locator(page, message)
    try { await node.first().waitFor({ state: message.state ?? 'visible' }) }
    catch { /* the count below reports the miss with an ARIA snapshot */ }
    const count = await node.count()
    if (count !== 1) throw new Error(`expected 1 match for ${target(message)}, found ${count}`)
    if (message.command === 'click') { await node.click(); await shot(message); return { ok: true, clicked: target(message) } }
    if (message.command === 'fill') { await node.fill(message.value ?? ''); return { ok: true, filled: target(message) } }
    if (message.command === 'wait') {
      await node.waitFor({ state: message.state ?? 'visible' })
      await shot(message)
      return { ok: true, waited: target(message) }
    }
    if (message.command === 'get') {
      const value = message.attribute ? await node.getAttribute(message.attribute) : await node.innerText()
      return { ok: true, value }
    }
    throw new Error(`unknown command ${message.command}`)
  }
}

function socketEnd(server) { server.close() }

async function doctor(repo, paths, application, page) {
  const session = await readJson(paths.session)
  const electronPid = application?.process().pid ?? session?.electronPid
  const command = commandOf(electronPid)
  const runtime = await page.evaluate(() => window.goalloom.getRuntime())
  const title = await page.title()
  const url = page.url()
  const lang = await page.evaluate(() => document.documentElement.lang)
  const surface = await page.locator('.board').count() ? 'board' : await page.locator('.calendar-modes').count() ? 'onboarding' : 'unknown'
  const packageElectron = JSON.parse(await readFile(join(repo, 'node_modules', 'electron', 'package.json'), 'utf8')).version
  let sqliteFile = false
  try { await stat(join(paths.profile, 'workspace.sqlite')); sqliteFile = true } catch { /* not created */ }
  const checks = {
    daemonAlive: !!(session?.daemonPid && alive(session.daemonPid)),
    electronAlive: !!(electronPid && alive(electronPid)),
    commandOwnsProfile: command.includes(paths.profile),
    profileIsolated: resolve(paths.profile) !== resolve(defaultUserData()),
    titleIsGoalloom: title === 'Goalloom',
    builtProtocol: url.startsWith('goalloom:'),
    electronMatchesBuild: runtime.electron === packageElectron,
    sqlitePresent: /^3\./.test(runtime.sqlite) && sqliteFile,
    chineseUi: lang.toLowerCase().startsWith('zh') && (surface === 'onboarding' || surface === 'board'),
    surfaceKnown: surface === 'onboarding' || surface === 'board',
  }
  const worthDriving = Object.values(checks).every(Boolean)
  return {
    ok: worthDriving,
    worthDriving,
    checks,
    surface,
    title,
    url,
    lang,
    runtime,
    profile: paths.profile,
    evidence: paths.evidence,
    electronPid,
    host: { platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model, node: process.version },
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const command = args._[0]
  const repo = repoRoot()
  const run = String(args.run)
  if (!command || command === 'help') {
    console.log('usage: node .cursor/skills/verify-goalloom/scripts/goalloom-verify.mjs <launch|doctor|settle|click|fill|press|wait|wait-text|get|dblclick|screenshot|aria|items|cleanup> [--run id]')
    process.exit(command ? 0 : 1)
  }
  if (command === 'cleanup') {
    console.log(JSON.stringify(await cleanup(repo, run)))
    return
  }
  if (command === 'launch') {
    try {
      const session = await launch(repo, run)
      console.log(JSON.stringify({ ok: true, ...session }))
    } catch (error) {
      await cleanup(repo, run).catch(() => undefined)
      console.error(error.message)
      process.exit(1)
    }
    return
  }
  if (command === 'serve') { await serve(repo, run); return }
  const paths = pathsFor(repo, run)
  const session = await readJson(paths.session)
  if (!session?.ready || !session.socket) {
    console.log(JSON.stringify({ ok: false, worthDriving: false, error: `run ${run} is not ready` }))
    process.exit(1)
  }
  const message = {
    command,
    role: args.role,
    name: args.name,
    namePattern: args['name-pattern'],
    exact: args.exact,
    value: args.value,
    key: args.key,
    text: args.text,
    attribute: args.attribute,
    horizon: args.horizon,
    withinDialog: args['within-dialog'],
    state: args.state,
    path: args.path,
    shot: args.shot,
  }
  if (['screenshot', 'aria', 'items'].includes(command) && !message.path) throw new Error(`${command} requires --path under output/tests/verify-goalloom/evidence`)
  if (command === 'doctor' && args.path) assertEvidence(repo, args.path)
  const result = await request(session.socket, message, command === 'doctor' ? 20_000 : 30_000)
  if (command === 'doctor' && args.path) {
    const file = assertEvidence(repo, args.path)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, JSON.stringify(result, null, 2))
  }
  console.log(JSON.stringify(result))
  if (!result.ok) process.exit(1)
}

main().catch(error => { console.error(error.stack ?? error.message); process.exit(1) })
