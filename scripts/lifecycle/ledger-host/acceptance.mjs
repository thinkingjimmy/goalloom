/**
 * [INPUT]: Frozen failure cases, real local workerd/SQLite and synthetic lifecycle Auth/RPC ports.
 * [OUTPUT]: Repeatable concurrency, restart, immutable-ledger, bigint and route-auth evidence.
 * [POS]: Local integration acceptance. No Cloudflare account, Supabase credentials or remote calls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { build } from 'esbuild'
const require = createRequire('/private/tmp/goalloom-ledger-runtime/package.json')
const { Miniflare } = require('miniflare')
const directory = resolve('output/tests/billing/desktop/bill29-execution/ledger-host', randomUUID())
await mkdir(directory, { recursive: true, mode: 0o700 })
const bundle = async (contents, file, external = []) => {
  const result = await build({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'es2022', external: ['node:*', ...external], logLevel: 'silent', metafile: true })
  await writeFile(file, result.outputFiles[0].text, { mode: 0o600 })
  return result.metafile.inputs
}
const workerPath = `${directory}/worker.mjs`
const workerInputs = await bundle("export {default,DeletionLedgerObject} from './scripts/lifecycle/ledger-host/worker.ts'", workerPath, ['cloudflare:workers'])
const runtimePath = `${directory}/runtime.mjs`
const runtimeInputs = await bundle("export * from './supabase/functions/lifecycle/ledger.ts'; export * from './supabase/functions/lifecycle/handler.ts'", runtimePath)
const { httpLedger, eventDigest, createLifecycleHandler } = await import(pathToFileURL(runtimePath))
const sources = [...new Set([...Object.keys(workerInputs), ...Object.keys(runtimeInputs), 'scripts/lifecycle/ledger-host/acceptance.mjs', 'scripts/lifecycle/ledger-host/wrangler.jsonc'])].filter(file => file !== '<stdin>')
const hashes = async () => Object.fromEntries(await Promise.all(sources.map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex') ])))
const before = await hashes()
await writeFile(`${directory}/inputs-before.json`, JSON.stringify(before, null, 2))
const token = randomBytes(32).toString('hex'), storeId = randomUUID()
const persist = `${directory}/state`
let mf
const start = async (bindings = {}) => {
  mf = new Miniflare({ modules: true, scriptPath: workerPath, compatibilityDate: '2026-07-01', compatibilityFlags: ['nodejs_compat'],
    bindings: { LEDGER_TOKEN: token, STORE_ID: storeId, ENVIRONMENT: 'production', ...bindings },
    durableObjects: { LEDGER: { className: 'DeletionLedgerObject', useSQLite: true } }, durableObjectsPersist: persist })
  await mf.ready
}
const request = (action, value, headers = {}, method = 'POST') => mf.dispatchFetch(`http://localhost/${action}`, {
  method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers },
  ...(method === 'POST' ? { body: typeof value === 'string' ? value : JSON.stringify(value) } : {}),
})
const client = () => httpLedger({ url: 'https://ledger.invalid', token, storeId, environment: 'production',
  fetch: (url, init) => mf.dispatchFetch(String(url).replace('https://ledger.invalid', 'http://localhost'), init) })
const cases = []
const check = async (name, run) => { await run(); cases.push({ name, ok: true }) }
const event = async () => {
  const record = { version: 1, eventId: randomUUID(), environment: 'production', projectRef: 'keqprrgvcefqdwnxaafv', subjectId: randomUUID(),
    ownerTag: randomBytes(32).toString('hex'), requestId: null, target: { workspaceId: randomUUID(), generation: randomUUID() },
    lifecycleVersion: 1, reason: 'ordinary_expiry', kind: 'intent', closedAt: '2026-10-25T00:00:00.000000Z',
    retrieveUntil: '2026-11-24T00:00:00.000000Z', onlineDeleteBy: '2026-12-01T00:00:00.000000Z', onlineDeletedAt: null,
    accessEndedAt: '2026-10-25T00:00:00.000000Z', scheduledAccessEnd: '2026-10-25T00:00:00.000000Z', deletionReceipt: null }
  return { eventId: record.eventId, digest: await eventDigest(record), record }
}
const database = async () => {
  const files = (await readdir(persist, { recursive: true })).filter(file => file.endsWith('.sqlite'))
  for (const file of files) {
    const db = new DatabaseSync(resolve(persist, file))
    if (db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='events'").get().n) return db
    db.close()
  }
  throw Error('Actual Durable Object SQLite file not found')
}
let report
try {
  await start()
  await check('authentication, route and body refusal before mutation', async () => {
    for (const headers of [{ authorization: '' }, { authorization: `Bearer ${'0'.repeat(64)}` }, { origin: 'https://example.test' }])
      assert.equal((await request('head', { version: 1 }, headers)).status, 401)
    for (const action of ['delete', 'reset', 'head?extra=1', 'head/']) assert.equal((await request(action, { version: 1 })).status, 400)
    assert.equal((await request('head', {}, {}, 'GET')).status, 401)
    for (const value of [{ version: 2 }, { version: 1, extra: true }, '{}', '{', 'x'.repeat(13000)]) assert.notEqual((await request('head', value)).status, 200)
    assert.deepEqual(await client().head(), { storeId, cursor: '0' })
  })
  const first = await event()
  await check('concurrent duplicate writes and conflicting identity', async () => {
    const replies = await Promise.all(Array.from({ length: 20 }, () => client().append(first)))
    assert(replies.every(value => value.cursor === '1' && value.digest === first.digest))
    const conflict = structuredClone(first); conflict.record.lifecycleVersion = 2; conflict.digest = await eventDigest(conflict.record)
    assert.equal((await request('append', { version: 1, event: conflict })).status, 409)
    const foreign = await event(); foreign.record.environment = 'development'; foreign.record.projectRef = 'asqyvcnxdltzzfutbbqy'; foreign.digest = await eventDigest(foreign.record)
    await assert.rejects(client().append(foreign))
    const corrupt = await event(); corrupt.digest = '0'.repeat(64); await assert.rejects(client().append(corrupt))
    assert.equal((await client().head()).cursor, '1')
  })
  await check('unique concurrent writes form a bounded contiguous prefix', async () => {
    await Promise.all((await Promise.all(Array.from({ length: 12 }, event))).map(value => client().append(value)))
    const head = await client().head(); assert.equal(head.cursor, '13')
    let after = null, count = 0
    for (;;) { const page = await client().read(after, head.cursor, 3); count += page.entries.length; after = page.nextAfter; if (page.done) break }
    assert.equal(count, 13)
    assert.equal((await client().get(first.eventId)).digest, first.digest)
    assert.equal(await client().get(randomUUID()), null)
    await assert.rejects(client().read(null, '14', 100))
    for (const [after, through, limit] of [['-1', '13', 1], [null, '9223372036854775808', 1], ['2', '1', 1], [null, '13', 101]])
      await assert.rejects(client().read(after, through, limit))
  })
  await mf.dispose()
  await start()
  await check('restart and lost-acknowledgement replay preserve the original cursor', async () => {
    assert.equal((await client().head()).cursor, '13')
    assert.equal((await client().append(first)).cursor, '1')
  })
  await mf.dispose()
  await start({ STORE_ID: randomUUID() })
  await check('changed store identity fails closed against the permanent object', async () => {
    assert.equal((await request('head', { version: 1 })).status, 503)
  })
  await mf.dispose()
  await start({ ENVIRONMENT: 'development' })
  await check('changed environment fails closed against the permanent object', async () => {
    assert.equal((await request('head', { version: 1 })).status, 503)
  })
  await mf.dispose()
  const db = await database()
  await check('actual SQLite triggers reject event and identity mutation', async () => {
    assert.throws(() => db.exec('DELETE FROM events'))
    assert.throws(() => db.exec("UPDATE events SET digest='changed'"))
    assert.throws(() => db.exec('DELETE FROM identity'))
    assert.throws(() => db.exec("UPDATE identity SET store_id='changed'"))
    assert.equal(db.prepare('SELECT count(*) n FROM events').get().n, 13)
  })
  db.exec("CREATE TRIGGER inject_full BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT,'SQLITE_FULL'); END;"); db.close()
  await start()
  await check('storage failure cannot produce a durable acknowledgement', async () => {
    await assert.rejects(client().append(await event()))
    assert.equal((await client().head()).cursor, '13')
  })
  await mf.dispose()
  const fixtureDb = await database(); fixtureDb.exec('DROP TRIGGER inject_full')
  const large = await event()
  fixtureDb.prepare('INSERT INTO events VALUES(?,?,?,?)').run(9007199254740993n, large.eventId, large.digest, JSON.stringify(large.record)); fixtureDb.close()
  await start()
  await check('64-bit cursors remain exact and missing prefixes fail closed', async () => {
    assert.equal((await client().head()).cursor, '9007199254740993')
    assert.equal((await client().get(large.eventId)).cursor, '9007199254740993')
    assert.equal((await client().append(await event())).cursor, '9007199254740994')
    await assert.rejects(client().read('13', '9007199254740994', 100))
  })
  await check('gateway JWT disabled retains authentication on every lifecycle user route', async () => {
    const owner = randomUUID(), session = randomUUID(), workerSecret = randomBytes(32).toString('hex')
    let calls = 0, workers = 0
    const config = { environment: 'production', url: 'https://keqprrgvcefqdwnxaafv.supabase.co', serviceKey: 'synthetic-only', workerSecret,
      fetch: async () => new Response(JSON.stringify({ id: owner }), { status: 401 }) }
    const handler = createLifecycleHandler(config, { rpc: () => async () => { calls++; return { ok: true } }, worker: async () => { workers++; return { ok: true } } })
    for (const route of ['status', 'prepare', 'confirm', 'finish-initialization', 'unknown']) {
      for (const authorization of ['', 'Bearer wrong', `Bearer ${workerSecret}`, 'Bearer synthetic-service-role']) {
        const result = await handler(new Request(`${config.url}/functions/v1/lifecycle/${route}`, { method: 'POST', headers: { authorization }, body: '{}' }))
        assert.equal(result.status, 401)
      }
      const jwt = `synthetic.${Buffer.from(JSON.stringify({ iss: `${config.url}/auth/v1`, role: 'authenticated', sub: owner, session_id: session, exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url')}.forged`
      assert.equal((await handler(new Request(`${config.url}/functions/v1/lifecycle/${route}`, { method: 'POST', headers: { authorization: `Bearer ${jwt}` }, body: '{}' }))).status, 401)
    }
    assert.equal(calls, 0)
    assert.equal((await handler(new Request(`${config.url}/functions/v1/lifecycle/worker`, { method: 'POST', headers: { authorization: 'Bearer wrong' } }))).status, 401)
    assert.equal((await handler(new Request(`${config.url}/functions/v1/lifecycle/worker`, { method: 'POST', headers: { authorization: `Bearer ${workerSecret}` } }))).status, 200)
    assert.equal(workers, 1)
  })
  assert.deepEqual(await hashes(), before, 'Source changed during acceptance')
  report = { ok: true, scope: 'Local actual workerd/SQLite; synthetic lifecycle Auth/RPC; no hosted or packaged acceptance', cases,
    versions: { node: process.version, miniflare: require('miniflare/package.json').version, os: process.platform, cpu: process.arch }, sourceHashes: before }
} catch (error) {
  report = { ok: false, cases, failure: { name: error.name, message: error.message }, scope: 'local only' }; process.exitCode = 1
} finally {
  await mf?.dispose().catch(() => undefined)
  await writeFile(`${directory}/result.json`, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  console.log(JSON.stringify({ ok: report?.ok, passed: cases.length, report: `${directory}/result.json` }))
}
