/**
 * [INPUT]: Registration CLI/SDK source, synthetic CLI subprocesses and real Stripe SDK loopback HTTP.
 * [OUTPUT]: Repeatable isolated registration/custody and failure-diagnostic E2E evidence, without provider access.
 * [POS]: Operator tooling acceptance; no actual Stripe/RC delivery or desktop acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, copyFile, stat, chmod, unlink } from 'node:fs/promises'
import { createServer } from 'node:http'
import { resolve, dirname } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomUUID } from 'node:crypto'
import { NOTIFICATIONS, OWNER, API_VERSION, TARGET } from '../policy.mjs'
const exec = promisify(execFile)
const HASH = 'cf1e1aa7dd001be9fad4f80a8eeec8214798976177c4a063b4c7536a44316110'
const evidence = resolve(`output/tests/billing/desktop/bill29-execution/notification-cli-acceptance-${randomUUID()}`)
await mkdir(evidence, { recursive: true })
const report = { ok: false, scope: 'Isolated child-process registration CLI plus real Stripe22.6.0 SDK on loopback HTTP, synthetic setup/RC credentials; no external network/provider/desktop access',
  runtime: { node: process.version, stripe: '22.6.0', os: process.platform, arch: process.arch, electron: 'not used', sqlite: 'not used', physicalOrVm: 'not independently verified' }, cases: [] }
const fake = `#!${process.execPath}
import fs from 'node:fs';
const p=process.env.FAKE_STATE,s=JSON.parse(fs.readFileSync(p,'utf8')),a=process.argv.slice(2),method=a[0],path=a[1];
s.calls.push({method,path,args:a});const persist=()=>fs.writeFileSync(p,JSON.stringify(s));
let value;
if(method==='get'&&path==='/v1/account')value={id:s.mode==='wrong-account'?'acct_other':s.account};
else if(method==='get'&&path.includes('?'))value={object:'list',has_more:s.mode==='incomplete',data:s.mode==='nonempty'?[{id:'existing'}]:[]};
else if(method==='post'&&path==='/v1/webhook_endpoints'){
 const i=s.hooks.length;value={...s.bodies[i],id:'we_synthetic'+i,livemode:true,status:'enabled',secret:'whsec_synthetic_private_'+i};s.hooks.push(value);persist();
 if(s.mode==='lost-create'){process.stderr.write(value.secret);process.exit(1)}
 if(s.mode==='capture-failure')fs.writeFileSync(process.env.FAKE_PRIVATE,'BILLING_RC_WEBHOOK_SECRET=preserve_me\\n',{mode:0o644});
 if(s.mode==='bad-fields')value.url='https://wrong.example.invalid';
}else if(method==='post'){
 value=s.hooks.find(v=>path.endsWith('/'+v.id));
 if(s.mode!=='disable-failure')value.status='disabled';
 persist();if(['disable-failure','lost-disable'].includes(s.mode)){process.stderr.write(value.secret);process.exit(1)}
}else value=s.hooks.find(v=>path.endsWith('/'+v.id));
persist();process.stdout.write(JSON.stringify(value));`
const contexts = new Map()
let endpoint
const rcOriginal = "# Preserve this representation.\nBILLING_RC_WEBHOOK_SECRET='rc +/=:-# value with spaces \\ literal'"
const sdkDriver = `import {main} from './register-stripe-notifications-sdk.mjs';
import {createRequire} from 'node:module';import {oneShotHttpClient} from './adapters.mjs';
const url=new URL(process.env.BILL29_ACCEPTANCE_URL);if(url.hostname!=='127.0.0.1'||url.protocol!=='http:')throw Error('loopback_required');
const require=createRequire('/private/tmp/goalloom-billing-runtime/package.json'),Stripe=require('stripe');
await main(process.argv.slice(2),{createClient:key=>new Stripe(key,{apiVersion:'2026-08-26.dahlia',host:'127.0.0.1',port:Number(url.port),protocol:'http',maxNetworkRetries:0,timeout:2000,httpClient:oneShotHttpClient(Stripe)})});`
async function setup(name, mode = name, sdk = false) {
  const cwd = `${evidence}/${name}`, module = `${cwd}/scripts/billing/live`, bin = `${cwd}/bin`
  await mkdir(`${module}/private`, { recursive: true, mode: 0o700 }); await mkdir(bin)
  for (const file of ['register-stripe-notifications.mjs', 'adapters.mjs', 'policy.mjs']) await copyFile(`scripts/billing/live/${file}`, `${module}/${file}`)
  if (sdk) {
    await copyFile('scripts/billing/live/register-stripe-notifications-sdk.mjs', `${module}/register-stripe-notifications-sdk.mjs`)
    await writeFile(`${module}/notification-sdk-driver.mjs`, sdkDriver)
    for (const name of ['notifications-stripe-registration-v1/dispatch.jsonl', 'stripe-original-post-workbench-diagnosis-v1.json', 'notification-outcome-cli-readonly-v1.json',
      'notifications-stripe-sdk-registration-v2/plan.json', 'notifications-stripe-sdk-registration-v2/dispatch.jsonl', 'webhook-setup-sdk-connection-readonly-v1.json']) {
      const target = `${cwd}/output/tests/billing/desktop/bill29-execution/${name}`
      await mkdir(dirname(target), { recursive: true }); await copyFile(`output/tests/billing/desktop/bill29-execution/${name}`, target)
    }
  }
  const plan = `${cwd}/output/tests/billing/desktop/bill29-execution/notifications-v3-approval-only/plan.json`
  await mkdir(dirname(plan), { recursive: true })
  await copyFile('output/tests/billing/desktop/bill29-execution/notifications-v3-approval-only/plan.json', plan)
  await writeFile(`${bin}/stripe`, fake, { mode: 0o700 })
  const statePath = `${cwd}/state.json`, privatePath = `${module}/private/.env.notifications.local`
  await writeFile(statePath, JSON.stringify({ mode, account: TARGET.account, calls: [], hooks: [], bodies: NOTIFICATIONS.slice(0, 2).map(v => ({ url: v.url, enabled_events: v.events, api_version: API_VERSION, description: v.name, metadata: OWNER })) }))
  const setupPath = `${module}/private/.env.webhook-setup.local`, key = `rk_live_synthetic_${randomUUID().replaceAll('-', '')}`
  if (sdk) {
    await writeFile(setupPath, `BILL29_STRIPE_WEBHOOK_SETUP_KEY=${key}\n`, { mode: 0o600 })
    await writeFile(privatePath, rcOriginal, { mode: 0o600 })
    contexts.set(key, { statePath, privatePath })
  }
  let reviewed = HASH
  const run = async (args = ['--reviewed-set', reviewed]) => {
    let result
    try { result = await exec(process.execPath, [sdk ? 'scripts/billing/live/notification-sdk-driver.mjs' : 'scripts/billing/live/register-stripe-notifications.mjs', ...args], {
      cwd, encoding: 'utf8', timeout: 15000, env: { PATH: `${bin}:${process.env.PATH}`, HOME: cwd, BILL29_NOTIFICATION_WINDOW: 'registration', FAKE_STATE: statePath, FAKE_PRIVATE: privatePath, ...(sdk ? { BILL29_ACCEPTANCE_URL: endpoint } : {}) } }) }
    catch (error) { result = { stdout: error.stdout, stderr: error.stderr } }
    assert(!/whsec_|rk_live_|rc \+\/=/.test(`${result.stdout}${result.stderr}`), 'Secret escaped child process')
    const value = JSON.parse(result.stdout.trim()); if (value.reviewedSet) reviewed = value.reviewedSet; return value
  }
  const state = async () => JSON.parse(await readFile(statePath, 'utf8'))
  return { cwd, run, state, statePath, privatePath, setupPath }
}
async function scenario(name, callback) {
  const env = await setup(name)
  await callback(env)
  report.cases.push({ name, ok: true, evidencePath: `${evidence}/${name}` })
}
const posts = s => s.calls.filter(v => v.method === 'post')
function decode(body) {
  const value = {}, events = []
  for (const [name, item] of new URLSearchParams(body)) {
    if (/^enabled_events\[\d+\]$/.test(name)) events.push(item)
    else if (name.startsWith('metadata[')) (value.metadata ??= {})[name.slice(9, -1)] = item
    else value[name] = item === 'true' ? true : item === 'false' ? false : item
  }
  if (events.length) value.enabled_events = events
  return value
}
const server = createServer(async (req, res) => {
  try {
    const context = contexts.get(req.headers.authorization?.replace('Bearer ', '')); assert(context)
    const s = JSON.parse(await readFile(context.statePath, 'utf8')), path = req.url.split('?')[0]
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = decode(raw); s.calls.push({ method: req.method.toLowerCase(), path, body, idempotency: req.headers['idempotency-key'] ?? null })
    const persist = () => writeFile(context.statePath, JSON.stringify(s))
    const fail = async () => { await persist(); res.writeHead(403, { 'content-type': 'application/json', 'request-id': 'req_syntheticDenied' }); res.end(JSON.stringify({ error: { code: 'more_permissions_required', type: 'invalid_request_error', message: 'webhook_write missing; whsec_never_print rk_live_never_print_read' } })) }
    let value
    if (path.startsWith('/v1/accounts/')) {
      if (s.mode === 'sdk-account-connection-failure') { await persist(); req.socket.destroy(); return }
      value = { id: s.mode === 'sdk-wrong-account' ? 'acct_other' : TARGET.account }
    }
    else if (req.method === 'GET' && path === '/v1/webhook_endpoints') value = { object: 'list', has_more: false, data: s.hooks }
    else if (req.method === 'POST' && path === '/v1/webhook_endpoints') {
      if (s.mode === 'sdk-denied-create') { await fail(); return }
      assert.deepEqual(body, s.bodies[s.hooks.length]); assert.equal(req.headers['stripe-version'], API_VERSION)
      value = { ...body, id: `we_synthetic${s.hooks.length}`, livemode: true, status: 'enabled', secret: `whsec_synthetic_private_${s.hooks.length}` }; s.hooks.push({ ...value }); await persist()
      if (s.mode === 'sdk-lost-create') { req.socket.destroy(); return }
      if (s.mode === 'sdk-capture-failure') await chmod(context.privatePath, 0o644)
      if (s.mode === 'sdk-bad-fields') value.url = 'https://wrong.example.invalid'
    } else if (req.method === 'POST') {
      value = s.hooks.find(v => path.endsWith(`/${v.id}`)); assert(value); assert.deepEqual(body, { disabled: true })
      if (s.mode === 'sdk-disable-failure') { await fail(); return }
      value.status = 'disabled'; await persist()
      if (s.mode === 'sdk-lost-disable') { req.socket.destroy(); return }
    } else value = s.hooks.find(v => path.endsWith(`/${v.id}`))
    assert(value); await persist(); res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(value))
  } catch { res.writeHead(500); res.end('{}') }
})
try {
  await scenario('success', async c => {
    assert.equal((await c.run()).ok, true)
    const s = await c.state(); assert.equal(s.hooks.length, 2); assert(s.hooks.every(v => v.status === 'disabled'))
    const text = await readFile(c.privatePath, 'utf8'); assert(text.includes('BILLING_RC_STRIPE_WEBHOOK_SECRET=')); assert(text.includes('BILLING_STRIPE_WEBHOOK_SECRET='))
    assert.equal((await stat(c.privatePath)).mode & 0o777, 0o600)
    assert.equal((await stat(dirname(c.privatePath))).mode & 0o777, 0o700)
    assert.equal(posts(s).length, 4); assert(posts(s).every(v => v.args.includes('--idempotency')))
    assert.equal((await c.run()).ok, false); assert.equal(posts(await c.state()).length, 4)
  })
  await scenario('wrong-review', async c => { assert.equal((await c.run(['--reviewed-set', 'wrong'])).ok, false); assert.equal((await c.state()).calls.length, 0) })
  await scenario('offline-check', async c => { assert.equal((await c.run(['--check'])).localOnly, true); assert.equal((await c.state()).calls.length, 0) })
  for (const name of ['wrong-account', 'nonempty', 'incomplete']) await scenario(name, async c => { assert.equal((await c.run()).ok, false); assert.equal(posts(await c.state()).length, 0) })
  await scenario('lost-create', async c => {
    assert.equal((await c.run()).ok, false); assert.equal(posts(await c.state()).length, 1)
    assert.equal((await c.run()).ok, false); assert.equal(posts(await c.state()).length, 1)
  })
  for (const name of ['capture-failure', 'bad-fields']) await scenario(name, async c => {
    assert.equal((await c.run()).ok, false); const s = await c.state()
    assert.equal(s.hooks.length, 1); assert.equal(s.hooks[0].status, 'disabled'); assert.equal(posts(s).length, 2)
    if (name === 'capture-failure') assert.equal(await readFile(c.privatePath, 'utf8'), 'BILLING_RC_WEBHOOK_SECRET=preserve_me\n')
  })
  await scenario('disable-failure', async c => {
    assert.equal((await c.run()).ok, false); const s = await c.state(); assert.equal(s.hooks.length, 1); assert.equal(s.hooks[0].status, 'enabled')
    assert(s.calls.some(v => v.method === 'get' && v.path.endsWith('/we_synthetic0')))
  })
  await scenario('lost-disable', async c => { assert.equal((await c.run()).ok, true); assert((await c.state()).hooks.every(v => v.status === 'disabled')) })
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) }); endpoint = `http://127.0.0.1:${server.address().port}`
  const sdkScenario = async (name, callback, mode = name) => {
    const c = await setup(name, mode, true); assert.equal((await c.run(['--prepare'])).ok, true)
    await callback(c); report.cases.push({ name, ok: true, evidencePath: `${evidence}/${name}` })
  }
  await sdkScenario('sdk-success', async c => {
    assert.equal((await c.run()).ok, true); const s = await c.state(); assert.equal(s.hooks.length, 2); assert(s.hooks.every(v => v.status === 'disabled'))
    assert((await readFile(c.privatePath, 'utf8')).startsWith(rcOriginal)); assert.equal((await stat(c.privatePath)).mode & 0o777, 0o600)
    assert.equal(posts(s).length, 4); assert(posts(s).every(v => v.idempotency)); assert.equal((await c.run()).ok, false); assert.equal(posts(await c.state()).length, 4)
    assert.equal((await stat(c.setupPath)).mode & 0o777, 0o600)
  })
  for (const name of ['sdk-wrong-account', 'sdk-source-drift', 'sdk-missing-key', 'sdk-nonempty-cli']) await sdkScenario(name, async c => {
    if (name === 'sdk-source-drift') await writeFile(`${c.cwd}/scripts/billing/live/policy.mjs`, '\n// Changed after review.\n', { flag: 'a' })
    if (name === 'sdk-missing-key') await unlink(c.setupPath)
    assert.equal((await c.run()).ok, false); assert.equal(posts(await c.state()).length, 0)
  }, name === 'sdk-nonempty-cli' ? 'nonempty' : name)
  await sdkScenario('sdk-lost-create', async c => { const v = await c.run(); assert.equal(v.ok, false); assert.deepEqual(v.diagnostic.transportCodes, ['ECONNRESET']); assert.equal(posts(await c.state()).length, 1); assert.equal((await c.run()).ok, false); assert.equal(posts(await c.state()).length, 1) })
  await sdkScenario('sdk-account-connection-failure', async c => {
    const v = await c.run(); assert.equal(v.ok, false); assert.deepEqual(v.diagnostic.transportCodes, ['ECONNRESET']); assert.equal((await c.state()).calls.length, 1); assert.equal(posts(await c.state()).length, 0)
    const records = (await readFile(`${c.cwd}/output/tests/billing/desktop/bill29-execution/notifications-stripe-sdk-registration-v3/dispatch.jsonl`, 'utf8')).trim().split('\n').map(JSON.parse)
    assert.deepEqual(records.map(v => v.state), ['started', 'unresolved']); assert.deepEqual(records[1].diagnostic.transportCodes, ['ECONNRESET'])
  })
  await sdkScenario('sdk-previous-write-dispatched', async c => {
    await writeFile(`${c.cwd}/output/tests/billing/desktop/bill29-execution/notifications-stripe-sdk-registration-v2/dispatch.jsonl`, JSON.stringify({ state: 'create_dispatched' }) + '\n', { flag: 'a' })
    assert.equal((await c.run()).ok, false); assert.equal((await c.state()).calls.length, 0)
  })
  for (const name of ['sdk-capture-failure', 'sdk-bad-fields']) await sdkScenario(name, async c => {
    assert.equal((await c.run()).ok, false); const s = await c.state(); assert.equal(s.hooks.length, 1); assert.equal(s.hooks[0].status, 'disabled'); assert.equal(posts(s).length, 2)
    assert.equal(await readFile(c.privatePath, 'utf8'), rcOriginal)
  })
  await sdkScenario('sdk-disable-failure', async c => { assert.equal((await c.run()).ok, false); const s = await c.state(); assert.equal(s.hooks.length, 1); assert.equal(s.hooks[0].status, 'enabled') })
  await sdkScenario('sdk-lost-disable', async c => { assert.equal((await c.run()).ok, true); assert((await c.state()).hooks.every(v => v.status === 'disabled')) })
  await sdkScenario('sdk-denied-create', async c => {
    const v = await c.run(); assert.equal(v.ok, false); assert.equal(v.diagnostic.httpStatus, 403); assert.equal(v.diagnostic.code, 'more_permissions_required'); assert.equal(v.diagnostic.requestId, 'req_syntheticDenied'); assert.deepEqual(v.diagnostic.missingPermissions, ['webhook_write']); assert.equal((await c.state()).hooks.length, 0)
  })
  report.ok = true
} finally {
  if (server.listening) await new Promise(resolve => server.close(resolve))
  await writeFile(`${evidence}/report.json`, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ ok: report.ok, cases: report.cases.length, evidencePath: `${evidence}/report.json` }))
}
