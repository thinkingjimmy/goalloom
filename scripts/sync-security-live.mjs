/**
 * [INPUT]: Explicitly authorized development API keys, current desktop build and scoped deployment config.
 * [OUTPUT]: Real Auth/HTTP/Realtime/SQLite acceptance and verified cleanup of this run's disposable users.
 * [POS]: Hosted feature runner. Credentials stay in memory; no project settings or real accounts change.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'
import { createClient } from '@supabase/supabase-js'
import { build } from 'vite'
import electron from 'electron'
import { deleteUserData } from './supabase-reset.mjs'

try { loadEnvFile('.env.deploy.local') } catch (error) { if (error.code !== 'ENOENT') throw error }
const ref = 'asqyvcnxdltzzfutbbqy'
assert(!process.env.SUPABASE_PROJECT_REF || process.env.SUPABASE_PROJECT_REF === ref, 'Only the configured development project is allowed')
const url = `https://${ref}.supabase.co`
const out = resolve('apps/desktop/output/tests/sync-security/live')
await mkdir(out, { recursive: true })
const startedAt = new Date().toISOString()
const users = []
const cleanup = []
let service, failure, clientReport
let secrets = []
const redact = value => String(value).replace(/eyJ[A-Za-z0-9_.-]+/g, '[redacted token]').replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[redacted key]')
  .split(/\r?\n/).map(line => secrets.reduce((text, secret) => secret ? text.split(secret).join('[redacted]') : text, line)).join('\n')

async function browserKeys() {
  const path = `/${randomBytes(24).toString('hex')}`
  let timer, server
  const keys = new Promise((resolveKeys, reject) => {
    server = createServer(async (request, response) => {
      response.setHeader('cache-control', 'no-store')
      response.setHeader('content-type', 'text/html; charset=utf-8')
      response.setHeader('content-security-policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'")
      if (request.url !== path) { response.writeHead(404); response.end(); return }
      if (request.method === 'GET') {
        response.end('<!doctype html><title>Goalloom live test credentials</title><h1>Development sync acceptance</h1><p>One-use memory-only transfer to the local test process. No keys are saved.</p><form method="post" autocomplete="off"><label>Anon key <input type="password" name="anon" required autocomplete="off"></label><label>Service role key <input type="password" name="service" required autocomplete="off"></label><button>Run live acceptance</button></form>')
        return
      }
      if (request.method !== 'POST' || request.headers.origin !== `http://127.0.0.1:${server.address().port}`) { response.writeHead(403); response.end(); return }
      let body = ''
      for await (const part of request) {
        body += part
        if (body.length > 16000) { response.writeHead(413); response.end(); return }
      }
      const form = new URLSearchParams(body)
      const anonKey = form.get('anon'), serviceKey = form.get('service')
      if (!anonKey || !serviceKey) { response.writeHead(400); response.end('Both keys are required'); return }
      response.end('<!doctype html><title>Credentials received</title><h1>Credentials received in memory</h1><p>The local runner is starting. This page contains no keys.</p>')
      resolveKeys({ anonKey, serviceKey })
    })
    server.on('error', reject)
    timer = setTimeout(() => reject(Error('The one-use credential form timed out')), 300000)
  })
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done) })
  console.log(`Credential form: http://127.0.0.1:${server.address().port}${path}`)
  try { return await keys } finally { clearTimeout(timer); server.close() }
}

async function apiKeys() {
  if (process.argv.includes('--browser-keys')) return browserKeys()
  if (process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { anonKey: process.env.SUPABASE_ANON_KEY, serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY }
  }
  assert(process.env.SUPABASE_ACCESS_TOKEN, 'Authorized API keys or a scoped management token are required')
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, {
    headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, signal: AbortSignal.timeout(20000),
  })
  assert(response.ok, `API-key read returned HTTP ${response.status}; use --browser-keys with an authorized dashboard session if needed`)
  const keys = await response.json()
  return { anonKey: keys.find(key => key.name === 'anon')?.api_key, serviceKey: keys.find(key => key.name === 'service_role')?.api_key }
}

try {
  // Do not bake credentials into the generated probe.
  await build({ configFile: false, root: resolve('apps/desktop'), build: { target: 'node24', minify: false,
    outDir: 'output/tests/build/sync-security-live', emptyOutDir: true,
    lib: { entry: 'tests/sync-security/live.ts', formats: ['cjs'], fileName: () => 'probe.cjs' },
    rollupOptions: { external: [/^node:/, 'electron'] } } })
  const { anonKey, serviceKey } = await apiKeys()
  assert(anonKey && serviceKey, 'The development anon and service_role keys are required')
  secrets = [anonKey, serviceKey, process.env.SUPABASE_ACCESS_TOKEN]
  for (const [key, role] of [[anonKey, 'anon'], [serviceKey, 'service_role']]) {
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString())
    assert(claims.ref === ref && claims.role === role, 'API key does not match the expected development project and role')
  }
  service = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  for (const name of ['primary', 'other']) {
    const email = `security-${name}-${randomUUID()}@goalloom.test`, password = randomBytes(32).toString('base64url')
    secrets.push(password)
    const created = await service.auth.admin.createUser({ email, password, email_confirm: true })
    assert(!created.error && created.data.user, `Disposable ${name} account creation failed: ${created.error?.message ?? 'No user'}`)
    users.push({ id: created.data.user.id, email, password })
  }
  console.log('Created two disposable development users; starting real client journeys')
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', GOALLOOM_SUPABASE_URL: url, GOALLOOM_SUPABASE_ANON_KEY: anonKey,
    SYNC_SECURITY_LIVE_USERS: JSON.stringify(users), SYNC_SECURITY_LIVE_SERVICE_KEY: serviceKey }
  delete env.SUPABASE_ACCESS_TOKEN
  let log = ''
  const status = await new Promise((done, reject) => {
    const child = spawn(electron, ['output/tests/build/sync-security-live/probe.cjs'], { cwd: resolve('apps/desktop'), env, stdio: ['ignore', 'pipe', 'pipe'] })
    const timer = setTimeout(() => { child.kill('SIGTERM'); reject(Error('Live client acceptance exceeded five minutes')) }, 300000)
    for (const [stream, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
      let pending = ''
      stream.on('data', bytes => {
        const text = bytes.toString(); log += text; pending += text
        const lines = pending.split('\n'); pending = lines.pop() ?? ''
        for (const line of lines) output.write(`${redact(line)}\n`)
      })
      stream.on('end', () => { if (pending) output.write(redact(pending)) })
    }
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('exit', code => { clearTimeout(timer); done(code) })
  }).finally(async () => { await writeFile(resolve(out, 'client.log'), redact(log)) })
  clientReport = JSON.parse(await readFile(resolve(out, 'client.json'), 'utf8'))
  assert.equal(status, 0, 'Live client journeys failed; inspect the report')
  assert.equal(clientReport.ok, true)
} catch (error) { failure = redact(error.message) }
finally {
  for (const user of users) {
    try {
      await deleteUserData(service, user.id)
      const deleted = await service.auth.admin.deleteUser(user.id)
      assert(!deleted.error, 'Disposable auth user deletion failed')
      const gone = await service.auth.admin.getUserById(user.id)
      assert.equal(gone.error?.status, 404, 'Disposable auth user still exists')
      const workspaces = await service.from('workspaces').select('id').eq('user_id', user.id)
      const devices = await service.from('devices').select('id').eq('user_id', user.id)
      assert(!workspaces.error && !devices.error && !workspaces.data.length && !devices.data.length, 'Disposable rows remain')
      cleanup.push({ userId: user.id, ok: true, remainingWorkspaces: 0, remainingDevices: 0 })
    } catch (error) { cleanup.push({ userId: user.id, ok: false, error: redact(error.message) }); failure ??= 'Disposable test cleanup failed' }
  }
  const report = {
    project: ref, startedAt, completedAt: new Date().toISOString(), command: 'pnpm test:sync-security:live',
    keySource: process.argv.includes('--browser-keys') ? 'Authorized dashboard via one-use loopback form; memory only' : 'Authorized environment/management API; memory only',
    ...clientReport, cleanup, ok: !failure && clientReport?.ok === true && cleanup.length === 2 && cleanup.every(row => row.ok),
    ...(failure ? { error: failure } : {}) }
  await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`Live acceptance ${report.ok ? 'passed' : 'failed'}; cleanup ${cleanup.filter(row => row.ok).length}/${users.length}; report: ${resolve(out, 'report.json')}`)
  if (!report.ok) process.exitCode = 1
}
