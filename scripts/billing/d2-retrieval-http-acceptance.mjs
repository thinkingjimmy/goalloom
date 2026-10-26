/**
 * [INPUT]: Bundled retrieval runtime, exact deployment/loopback routes and controlled Auth/RPC with real signed crypto.
 * [OUTPUT]: Repeatable transport journeys and public canonical vectors; no remote database acceptance.
 * [POS]: D2 changed-feature E2E command. Failure cases were recorded before implementation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdir, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
const referenceSha256 = value => createHash('sha256').update(value).digest('hex')
const directory = `${process.cwd()}/output/tests/billing/desktop/d2-retrieval`
await mkdir(directory, { recursive: true })
const compiled = await build({ entryPoints: ['scripts/billing/d2-retrieval-fixture.ts'], bundle: true, write: false,
  format: 'esm', platform: 'node', target: 'es2022', external: ['node:*'], logLevel: 'silent' })
const runtime = `${directory}/http-runtime.mjs`
await writeFile(runtime, compiled.outputFiles[0].text)
const { createFixture, config, identity, jwt, createRetrievalHandler, canonicalJson, sha256 } = await import(pathToFileURL(runtime).href)
let fixture, handler, authCalls = 0
const install = async (count = 202, initialization = 'completed') => {
  fixture = await createFixture(count, initialization)
  authCalls = 0
  handler = createRetrievalHandler(config, { rpc: fixture.rpc, fetch: (...args) => { authCalls++; return fixture.authFetch(...args) } })
}
const server = createServer(async (req, res) => {
  try {
    const chunks = []; for await (const chunk of req) chunks.push(chunk)
    const response = await handler(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers, body: Buffer.concat(chunks) }))
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()))
  } catch { res.writeHead(500); res.end('{}') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${server.address().port}`
const routeCoverage = { accepted: [], rejected: [] }
const checks = [], report = { ok: false, scope: 'Real loopback HTTP, bundled runtime, real Ed25519/AEAD/KDF; controlled Auth/RPC. No remote PostgreSQL/Auth/provider, native client or complete plaintext seed acceptance.',
  remoteCalls: 0, checks, routeCoverage, runtime: { node: process.version, os: process.platform, arch: process.arch }, failureMatrix: 'failure-cases.md' }
const mark = name => checks.push(name)
const call = async (route, body, options = {}) => {
  const response = await fetch(`${base}/${route}`, { method: 'POST', headers: { authorization: `Bearer ${jwt()}`,
    'content-type': 'application/json', 'x-goalloom-service-version': '2', ...options.headers },
  body: options.raw ?? JSON.stringify(body) })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const raw = await response.text(); assert(Buffer.byteLength(raw) <= 4_194_304)
  return { status: response.status, body: JSON.parse(raw), bytes: Buffer.byteLength(raw) }
}
const bootstrap = async (proof = { kind: 'recovery' }) => {
  const result = await call('bootstrap', { ...fixture.initial, proof })
  assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body
}
const authorize = async (challenge, device = false) => {
  const input = { version: 1, challengeId: challenge.proofBody.challengeId, signature: fixture.sign(challenge.proofBody, device) }
  const result = await call('authorize', input); assert.equal(result.status, 200, JSON.stringify(result.body))
  return { ...result.body, input }
}
try {
  const prefixes = ['', 'retained-retrieval/', 'functions/v1/retained-retrieval/']
  for (const prefix of prefixes) {
    await install(2, 'completed')
    const challenge = await call(`${prefix}bootstrap`, fixture.initial)
    assert.equal(challenge.status, 200, `${prefix}bootstrap`)
    const control = await call(`${prefix}bootstrap`, { version: 1, challengeId: challenge.body.proofBody.challengeId, afterRosterVersion: 2 })
    assert.equal(control.status, 200); assert(control.body.rosterPage.done)
    const grant = await call(`${prefix}authorize`, { version: 1, challengeId: challenge.body.proofBody.challengeId,
      signature: fixture.sign(challenge.body.proofBody) })
    assert.equal(grant.status, 200, `${prefix}authorize`)
    const page = await call(`${prefix}read`, { version: 1, capability: grant.body.capability, afterSeq: 0 })
    assert.equal(page.status, 200, `${prefix}read`)
    assert.equal(page.body.manifestHash, challenge.body.manifestHash)
    assert.equal(page.body.operations.length, 2); assert(page.body.done)
    for (const row of page.body.operations) assert.equal(referenceSha256(fixture.open(row)), row.payloadHash)
    assert.equal(authCalls, 4)
    routeCoverage.accepted.push({ prefix: `/${prefix}`, actions: ['bootstrap', 'bootstrap continuation', 'authorize', 'read'] })
  }
  await install(2, 'completed')
  const invalidRoutes = [
    ...['bootstrap', 'authorize', 'read'].flatMap(action => [
      `other/${action}`, `functions/v1/other/${action}`, `functions/v1/${action}`, `extra/retained-retrieval/${action}`,
      ...prefixes.flatMap(prefix => [`${prefix}${action}/`, `${prefix}${action}/extra`]),
    ]),
    ...prefixes.map(prefix => `${prefix}unknown`),
  ]
  for (const route of invalidRoutes) {
    const result = await call(route, fixture.initial)
    assert.equal(result.status, 400, route); assert.equal(result.body.error, 'invalid_request', route)
    routeCoverage.rejected.push(`/${route}`)
  }
  assert.equal(authCalls, 0); assert.equal(fixture.state.calls.length, 0)
  mark('Three exact route prefixes complete signed bootstrap/continuation/authorize/read; unknown prefixes/actions and trailing segments fail before Auth/RPC')
  await install()
  for (const header of ['', '1', '3']) assert.equal((await call('bootstrap', fixture.initial, { headers: { 'x-goalloom-service-version': header } })).body.error, 'upgrade_required')
  for (const body of [{ ...fixture.initial, ownerId: identity.ownerId }, { ...fixture.initial, generation: null },
    { ...fixture.initial, proof: { kind: 'recovery', deviceId: fixture.deviceId } }]) assert.equal((await call('bootstrap', body)).status, 400)
  for (const afterSeq of [-1, 0.5, null, 9007199254740992]) assert.equal((await call('read', { version: 1, capability: 'cd'.repeat(32), afterSeq })).status, 400)
  assert.equal((await call('read', null, { raw: '{"version":1,"capability":"' + 'cd'.repeat(32) + '","afterSeq":-0}' })).status, 400)
  assert.equal((await call('bootstrap', null, { raw: '中'.repeat(1000) })).status, 413)
  assert.equal((await call('bootstrap?capability=hidden', fixture.initial)).status, 400)
  assert.equal(fixture.state.calls.length, 0)
  mark('Header, exact fields/target, strict safe cursors including -0, URL credential and UTF-8 byte rejection before RPC')
  assert.equal((await call('bootstrap', fixture.initial, { headers: { authorization: `Bearer ${jwt({ session_id: null })}` } })).status, 401)
  assert.equal((await call('bootstrap', fixture.initial, { headers: { authorization: `Bearer ${jwt({ iss: 'https://wrong.invalid/auth/v1' })}` } })).status, 401)
  fixture.state.authValid = false; assert.equal((await call('bootstrap', fixture.initial)).status, 401); fixture.state.authValid = true
  mark('Live project Auth and non-null session required; no client owner/session selection')
  assert.equal((await call('read', { version: 1, capability: 'cd'.repeat(32), afterSeq: 0 })).status, 403)
  const challenge = await bootstrap()
  assert.equal(challenge.manifest.headHash, fixture.expectedHeadHash())
  assert.equal(challenge.manifest.operationCount, 202)
  assert.equal(challenge.manifest.initialization.finalSeq, 2)
  assert.equal(challenge.proofBody.challengeExpiresAt, '2026-10-23T18:05:00.123456Z')
  assert.equal(challenge.manifestHash, sha256(canonicalJson(challenge.manifest)))
  assert(!JSON.stringify(challenge).includes(fixture.state.operations[0].ciphertext))
  assert.equal(challenge.rosterPage.done, false)
  assert.equal(challenge.recoveryEnvelope.signerDevice, fixture.deviceId)
  const control = await call('bootstrap', { version: 1, challengeId: challenge.proofBody.challengeId, afterRosterVersion: 2 })
  assert.equal(control.status, 200); assert.equal(control.body.rosterPage.rosters[0].version, 3); assert(control.body.rosterPage.done)
  assert.deepEqual((await call('bootstrap', { version: 1, challengeId: challenge.proofBody.challengeId, afterRosterVersion: 2 })).body, control.body)
  mark('Complete signed multi-page roster, original envelope issuer after uploader change/removal, completed seed suffix and streamed canonical metadata hash')
  const wrong = await call('authorize', { version: 1, challengeId: challenge.proofBody.challengeId, signature: '00'.repeat(64) })
  assert.equal(wrong.status, 403); assert.equal(fixture.state.consumed, false)
  const rawDomain = await call('authorize', { version: 1, challengeId: challenge.proofBody.challengeId,
    signature: fixture.signMessage(`goalloom/recover/v1|${identity.workspaceId}|${fixture.deviceId}|${challenge.proofBody.nonce}|${challenge.manifest.rosterHash}`) })
  assert.equal(rawDomain.status, 403); assert.equal(fixture.state.consumed, false)
  const grant = await authorize(challenge)
  assert.equal((await call('authorize', grant.input)).status, 403)
  let afterSeq = 0, rows = []
  do {
    const result = await call('read', { version: 1, capability: grant.capability, afterSeq })
    assert.equal(result.status, 200); assert.equal(result.body.afterSeq, afterSeq)
    assert.equal(result.body.manifestHash, challenge.manifestHash)
    for (const row of result.body.operations) { assert.equal(referenceSha256(fixture.open(row)), row.payloadHash); rows.push(row) }
    afterSeq = result.body.nextAfterSeq
    if (result.body.done) break
  } while (true)
  assert.equal(rows.length, 202); assert.equal(afterSeq, 202)
  const terminal = await call('read', { version: 1, capability: grant.capability, afterSeq })
  assert.equal(terminal.status, 200); assert.deepEqual(terminal.body.operations, []); assert(terminal.body.done)
  const replay = await call('read', { version: 1, capability: grant.capability, afterSeq: 0 })
  assert.deepEqual(replay.body.operations, rows.slice(0, 200))
  mark('Real signature authorization, one-time consume, repeatable 200+2 ciphertext pages, independent AEAD/plaintext hash checks and exact empty terminus')
  await writeFile(`${directory}/canonical-vector.json`, JSON.stringify({ scope: 'Synthetic public control/proof data only; no private key or credential',
    manifest: challenge.manifest, manifestHash: challenge.manifestHash, proofBody: challenge.proofBody,
    canonicalProofBody: canonicalJson(challenge.proofBody), proofDigestHex: referenceSha256(`goalloom/retrieval-proof/v1|${canonicalJson(challenge.proofBody)}`),
    signature: grant.input.signature, recoverySignPub: fixture.state.rosters[0].roster.recoverySignPub }, null, 2))
  fixture.state.expireCapability = true
  assert.equal((await call('read', { version: 1, capability: grant.capability, afterSeq: 0 })).body.error, 'retrieval_capability_expired')
  fixture.state.expireCapability = false; fixture.state.closed = true
  const closed = await call('read', { version: 1, capability: grant.capability, afterSeq: 0 })
  assert.equal(closed.body.error, 'retrieval_boundary_changed'); assert.equal(closed.body.serverNow, fixture.state.serverNow)
  mark('Committed typed cutoff/boundary denial retains authoritative microsecond timestamp and returns no content')
  await install(0, 'legacy')
  const empty = await bootstrap(); assert.equal(empty.manifest.initialization, null); assert.equal(empty.manifest.headHash, fixture.expectedHeadHash())
  const emptyGrant = await authorize(empty)
  const emptyRead = await call('read', { version: 1, capability: emptyGrant.capability, afterSeq: 0 })
  assert.equal(emptyRead.status, 200); assert.deepEqual(emptyRead.body.operations, []); assert(emptyRead.body.done)
  await install(2, 'pending'); assert.equal((await bootstrap()).manifest.initialization.finalSeq, 2)
  await install(3, 'pending'); assert.equal((await call('bootstrap', fixture.initial)).body.reason, 'incomplete_history')
  mark('Verified legacy empty log, pending actual final and forbidden pending suffix distinguish initialization states')
  await install(2, 'completed')
  const deviceChallenge = await bootstrap({ kind: 'device', deviceId: fixture.deviceId }), deviceGrant = await authorize(deviceChallenge, true)
  fixture.state.revoked = true
  assert.equal((await call('read', { version: 1, capability: deviceGrant.capability, afterSeq: 0 })).body.error, 'retrieval_proof_invalid')
  mark('Device proof key comes from verified current roster and revocation defeats an issued grant')
  const cases = [
    ['roster gap', 'service_retrieval_source', r => { if (r.rows[0]?.version) r.rows[0].version = 2; return r }, 'integrity_failure'],
    ['source missing next', 'service_retrieval_source', r => ({ ...r, next: r.next + 1 }), 'incomplete_history'],
    ['wrong proof key', 'service_retrieval_prepare', r => ({ ...r, proofPublicKey: '00'.repeat(32) }), 'integrity_failure'],
    ['unsupported metadata epoch', 'service_retrieval_source', r => { if (r.rows[0]?.seq) r.rows[0].keyEpoch = 2; return r }, 'unsupported_profile'],
    ['checkpoint signature', 'service_retrieval_prepare', r => ({ ...r, checkpoint: { ...r.checkpoint, recSig: '00'.repeat(64) } }), 'integrity_failure'],
    ['manifest final CAS mismatch', 'service_retrieval_finalize', r => ({ ...r, manifestHash: '00'.repeat(32) }), 'integrity_failure'],
  ]
  for (const [name, facade, mutate, reason] of cases) {
    await install(2, 'completed')
    fixture.state.mutate = (called, result) => called === facade ? mutate(result) : result
    const result = await call('bootstrap', fixture.initial)
    assert.equal(result.body.error, 'retrieval_data_unavailable', name); assert.equal(result.body.reason, reason, name)
    assert.equal('manifest' in result.body, false)
  }
  mark('Corrupt chain/checkpoint/proof key, metadata gap/profile and changed final manifest fail without a partial challenge')
  await install(3, 'completed')
  const sized = await bootstrap(), sizedGrant = await authorize(sized)
  fixture.state.mutate = (name, result) => name === 'service_retrieval_read'
    ? { ...result, operations: result.operations.map(row => ({ ...row, ciphertext: 'ab'.repeat(1024 * 1024) })) } : result
  assert.equal((await call('read', { version: 1, capability: sizedGrant.capability, afterSeq: 0 })).status, 413)
  fixture.state.mutate = (name, result) => name === 'service_retrieval_read'
    ? { ...result, operations: result.operations.slice(1), nextAfterSeq: 2 } : result
  assert.equal((await call('read', { version: 1, capability: sizedGrant.capability, afterSeq: 0 })).status, 503)
  mark('Actual complete JSON byte cap includes ciphertext hex expansion; skipped rows cannot become a short success page')
  await install(2, 'completed')
  let reached, release
  const selected = new Promise(resolve => { reached = resolve }), held = new Promise(resolve => { release = resolve })
  fixture.state.before = async name => { if (name === 'service_retrieval_finalize') { reached(); await held } }
  const interrupted = call('bootstrap', fixture.initial)
  await selected; fixture.state.closed = true; release()
  const fenced = await interrupted
  assert.equal(fenced.body.error, 'retrieval_boundary_changed'); assert.equal('manifest' in fenced.body, false)
  mark('Boundary change after complete metadata traversal but before final CAS cannot expose a challenge')
  await install(2, 'completed')
  fixture.state.before = async () => new Promise(() => {})
  const started = performance.now(), timedOut = await call('bootstrap', fixture.initial)
  assert.equal(timedOut.status, 503); assert.equal(timedOut.body.error, 'retrieval_unavailable')
  assert(performance.now() - started < 30_000)
  mark('A non-returning source RPC is bounded by the 25-second build deadline without a partial challenge')
  report.ok = true
} catch (error) {
  report.failure = { name: error.name, message: error.message, stack: error.stack?.split('\n').slice(0, 6) }
  process.exitCode = 1
} finally {
  await new Promise(resolve => server.close(resolve))
  await writeFile(`${directory}/http-acceptance.json`, JSON.stringify(report, null, 2))
}
console.log(JSON.stringify(report, null, 2))
