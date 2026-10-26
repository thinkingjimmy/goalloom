/**
 * [INPUT]: Production client/server retrieval APIs and synthetic complete encrypted operation logs.
 * [OUTPUT]: Reusable client journey, controlled HTTP interoperability and finite SDK failure evidence.
 * [POS]: D2 transport integration; live Auth/RPC composition remains with the leased lifecycle harness.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { canonicalJson, parseSyncOp, type CloudTarget, type SyncOp } from '@goalloom/contracts'
import { openRecoveryLock, unhex, unwrap, wipe, wipeRecovery } from '@goalloom/crypto'
import { createCloudRemote } from '../../packages/sync/src/cloud-remote'
import { retrieveRetained, type RetrievalCredentials, type RetrievalIdentity } from '../../packages/sync/src/retrieval'
import { sealOpWire } from '../../packages/sync/src/codec'
import { config, createFixture, createRetrievalHandler, identity, jwt } from './d2-retrieval-fixture.ts'
import type { RetrievalConfig } from '../../supabase/functions/retained-retrieval/handler.ts'
import type { Rpc } from '../../supabase/functions/retained-retrieval/protocol.ts'

export async function runRetrievalClientJourney(input: {
  url: string; anonKey: string; accessToken: () => Promise<string>; target: CloudTarget
  identity: RetrievalIdentity; credentials: RetrievalCredentials; expected: SyncOp[]; signal?: AbortSignal
}) {
  const remote = createCloudRemote({ url: input.url, anonKey: input.anonKey, accessToken: input.accessToken })
  const opened: SyncOp[] = [], pageSizes: number[] = []
  const result = await retrieveRetained({ remote, target: input.target, identity: input.identity, credentials: input.credentials,
    options: { signal: input.signal }, append: async rows => { pageSizes.push(rows.length); opened.push(...rows.map(row => row.op)) } })
  assert.equal(canonicalJson(opened), canonicalJson(input.expected), 'Client plaintext differs from the synthetic original log')
  return { operationCount: opened.length, pageSizes, headSeq: result.manifest.headSeq, headHash: result.manifest.headHash,
    manifestHash: result.manifestHash, verifiedAt: result.verifiedAt }
}

/** Omit overrides to use actual fixed-project Auth and RPC; the caller owns the live lease. */
export async function withRetrievalLoopback<T>(input: { config: RetrievalConfig; rpc?: Rpc; fetch?: typeof fetch },
  run: (url: string, paths: string[]) => Promise<T>): Promise<T> {
  const handler = createRetrievalHandler(input.config, { rpc: input.rpc, fetch: input.fetch })
  const paths: string[] = []
  const server = createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []; let size = 0
      for await (const part of request) { const chunk = Buffer.from(part); size += chunk.length; assert(size <= 2048); chunks.push(chunk) }
      assert(request.url && /^\/functions\/v1\/retained-retrieval\/(bootstrap|authorize|read)$/.test(request.url))
      paths.push(request.url)
      const reply = await handler(new Request(`http://127.0.0.1${request.url}`, { method: request.method,
        headers: request.headers as HeadersInit, body: Buffer.concat(chunks) }))
      response.writeHead(reply.status, Object.fromEntries(reply.headers)); response.end(Buffer.from(await reply.arrayBuffer()))
    } catch { response.writeHead(500, { 'content-type': 'application/json' }); response.end('{"error":"interop_transport_failed"}') }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  try { return await run(url, paths) }
  finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}

async function verifyRequestDiagnostics() {
  type Diagnostic = { kind: string; operation: string; method: string; path: string; status: number | null; code: string | null }
  type Failure = Error & { requestDiagnostic?: Diagnostic }
  let mode: 'typed' | 'not-modified' | 'malformed' | 'close' = 'typed'
  const requests: string[] = [], observations: Diagnostic[] = []
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`); request.resume()
    if (mode === 'close') { request.socket.destroy(); return }
    response.writeHead(mode === 'not-modified' ? 304 : mode === 'malformed' ? 200 : 400, { 'content-type': 'application/json' })
    response.end(mode === 'malformed' ? 'invalid JSON' : '{"version":1,"error":"invalid_request"}')
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const options = { url, anonKey: 'controlled-loopback', accessToken: async () => jwt() }
  const remote = createCloudRemote(options)
  const bootstrap = { version: 1 as const, workspaceId: identity.workspaceId, generation: identity.generation, proof: { kind: 'recovery' as const } }
  const authorize = { version: 1 as const, challengeId: randomUUID(), signature: '1'.repeat(128) }
  const read = { version: 1 as const, capability: '1'.repeat(64), afterSeq: 0 }
  const rejected = async (run: () => Promise<unknown>) => {
    let captured: unknown
    await assert.rejects(run, error => { captured = error; return error instanceof Error })
    return captured as Failure
  }
  try {
    for (const [route, run] of [
      ['bootstrap', () => remote.retrievalBootstrap(bootstrap)],
      ['authorize', () => remote.retrievalAuthorize(authorize)],
      ['read', () => remote.retrievalRead(read)],
    ] as const) {
      const error = await rejected(run)
      assert.deepEqual(error.requestDiagnostic, { kind: 'http_response', operation: `retrieval:${route}`, method: 'POST',
        path: `/functions/v1/retained-retrieval/${route}`, status: 400, code: 'invalid_request' })
      observations.push(error.requestDiagnostic)
    }
    mode = 'not-modified'
    const notModified = await rejected(() => remote.retrievalRead(read))
    assert.equal(notModified.requestDiagnostic?.kind, 'http_response'); assert.equal(notModified.requestDiagnostic.status, 304)
    observations.push(notModified.requestDiagnostic)
    mode = 'malformed'
    const malformed = await rejected(() => remote.retrievalRead(read))
    assert.equal(malformed.requestDiagnostic?.kind, 'sdk_failure'); assert.equal(malformed.requestDiagnostic.status, 200)
    observations.push(malformed.requestDiagnostic)
    mode = 'close'
    const disconnected = await rejected(() => remote.retrievalBootstrap(bootstrap))
    assert.equal(disconnected.requestDiagnostic?.kind, 'transport_failure'); assert.equal(disconnected.requestDiagnostic.status, null)
    observations.push(disconnected.requestDiagnostic)
    mode = 'typed'
    const before = requests.length, original = Object.freeze(new Error('Controlled token rejection'))
    const tokenRejected = createCloudRemote({ ...options, accessToken: async () => { throw original } })
    assert.equal(await rejected(() => tokenRejected.retrievalBootstrap(bootstrap)), original)
    assert(!Object.hasOwn(original, 'requestDiagnostic'))
    const cancelled = new AbortController(); cancelled.abort()
    assert(!Object.hasOwn(await rejected(() => remote.retrievalBootstrap(bootstrap, { signal: cancelled.signal })), 'requestDiagnostic'))
    const duringToken = new AbortController()
    const tokenCancelled = createCloudRemote({ ...options, accessToken: async () => { duringToken.abort(); return jwt() } })
    assert(!Object.hasOwn(await rejected(() => tokenCancelled.retrievalBootstrap(bootstrap, { signal: duringToken.signal })), 'requestDiagnostic'))
    let expire: () => void = () => {}
    const tokenTimeout = createCloudRemote({ ...options, clock: { now: () => performance.now(), after: (_ms, callback) => { expire = callback; return () => {} } },
      accessToken: () => { expire(); return new Promise<string>(() => {}) } })
    assert(!Object.hasOwn(await rejected(() => tokenTimeout.retrievalBootstrap(bootstrap)), 'requestDiagnostic'))
    const preDispatchHttpRequests = requests.length - before
    assert.equal(preDispatchHttpRequests, 0, 'Pre-dispatch failures sent HTTP')
    const readonlyDiagnostic = { original: true }
    const readonlyError = Object.defineProperty(new Error('Controlled readonly diagnostic'), 'requestDiagnostic', { value: readonlyDiagnostic }) as Error & { requestDiagnostic: typeof readonlyDiagnostic }
    for (const originalError of [Object.freeze(new Error('Controlled frozen error')), Object.preventExtensions(new Error('Controlled sealed error')), readonlyError]) {
      // The existing clock seam injects cleanup failure after a real HTTP response.
      const clock = { now: () => performance.now(), after: () => () => { throw originalError } }
      const interrupted = createCloudRemote({ ...options, clock })
      assert.equal(await rejected(() => interrupted.retrievalBootstrap(bootstrap)), originalError)
    }
    assert.equal(readonlyError.requestDiagnostic, readonlyDiagnostic)
    const unknown = Object.assign(new Error('Controlled unknown code'), { code: 'unapproved_value' })
    const unknownCode = createCloudRemote({ ...options, clock: { now: () => performance.now(), after: () => () => { throw unknown } } })
    const unknownFailure = await rejected(() => unknownCode.retrievalBootstrap(bootstrap))
    assert.equal(unknownFailure.requestDiagnostic?.code, null); assert.equal(unknownFailure, unknown)
    assert(requests.every(path => /^POST \/functions\/v1\/retained-retrieval\/(bootstrap|authorize|read)$/.test(path)))
    return { observations, preDispatchHttpRequests, originalErrorIdentitiesPreserved: 5,
      requestCount: requests.length, bodyAndHeadersRecorded: false }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}

/** Uses the existing controlled fixture; no second RPC or lifecycle implementation. */
export async function runControlledClientInterop() {
  const fixture = await createFixture(202, 'legacy'), password = '测试 Password 2026'
  const envelope = fixture.state.recoveryEnvelope
  const descriptor = JSON.parse(new TextDecoder().decode(unhex(envelope.ciphertext)))
  const recovery = await openRecoveryLock({ password, workspaceId: identity.workspaceId, lock: { kdf: descriptor.kdf, lock: descriptor.lock } })
  let workspaceKey: Uint8Array | undefined
  const expected: SyncOp[] = []
  try {
    workspaceKey = unwrap(descriptor.wrap, { expectedCtx: `wk|${identity.workspaceId}|1`, recipientId: 'recovery',
      boxSk: recovery.boxSk, senderSignPub: unhex(fixture.state.rosters[0]!.roster.devices[0]!.signPub) })
    for (let index = 0; index < 202; index++) expected.push(parseSyncOp({ v: 1, opId: randomUUID(),
      deviceId: fixture.state.rosters[0]!.roster.devices[0]!.id, at: '2026-10-23T18:00:00.123Z',
      actions: [{ t: 'item.create', id: randomUUID(), title: `Synthetic retained item ${index + 1}`, description: '',
        dueDate: null, horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: null } }] }))
    fixture.state.operations = expected.map((op, index) => ({ ...sealOpWire({ op, workspaceKey: workspaceKey!,
      workspaceId: identity.workspaceId, epoch: 1 }), seq: index + 1 }))
  } finally { if (workspaceKey) wipe(workspaceKey); wipeRecovery(recovery) }
  return withRetrievalLoopback({ config, rpc: fixture.rpc, fetch: fixture.authFetch }, async (url, paths) => {
  const target = { workspaceId: identity.workspaceId, generation: identity.generation }
  const scope = { environment: 'development' as const, projectRef: config.projectRef, accountId: identity.ownerId, authSessionId: identity.sessionId }
  const remote = createCloudRemote({ url, anonKey: 'controlled-local-fixture', accessToken: async () => jwt() })
  const checks: string[] = []
    const result = await runRetrievalClientJourney({ url, anonKey: 'controlled-local-fixture', accessToken: async () => jwt(),
      identity: scope, target, credentials: { kind: 'recovery', password }, expected })
    assert.deepEqual(result.pageSizes, [200, 2]); assert.equal(result.headSeq, 202)
    checks.push('Production client/server complete 202 valid operations through real HTTP, recovery crypto, proof and two operation pages')
    const authorized = () => fixture.state.calls.filter(name => name === 'service_retrieval_authorize').length
    const before = authorized()
    await assert.rejects(retrieveRetained({ remote, target, identity: scope, credentials: { kind: 'recovery', password: 'incorrect' }, append: async () => {} }),
      error => (error as { code?: string }).code === 'password')
    assert.equal(authorized(), before)
    checks.push('Wrong password fails locally before authorization')
    fixture.state.consumed = false
    const original = fixture.state.operations[0]!.ciphertext
    fixture.state.operations[0]!.ciphertext = (Number.parseInt(original.slice(0, 2), 16) ^ 1).toString(16).padStart(2, '0') + original.slice(2)
    await assert.rejects(retrieveRetained({ remote, target, identity: scope, credentials: { kind: 'recovery', password }, append: async () => {} }),
      error => (error as { code?: string; reason?: string }).code === 'retrieval_data_unavailable' && (error as { reason?: string }).reason === 'integrity_failure')
    fixture.state.operations[0]!.ciphertext = original
    checks.push('Actual ciphertext corruption fails AEAD validation without complete-copy success')
    fixture.state.consumed = false
    const abort = new AbortController()
    await assert.rejects(retrieveRetained({ remote, target, identity: scope, credentials: { kind: 'recovery', password },
      options: { signal: abort.signal }, append: async () => { abort.abort() } }))
    checks.push('Append cancellation prevents verified completion')
    const requestDiagnostics = await verifyRequestDiagnostics()
    checks.push('Actual CloudRemote HTTP failures identify all three routes, non-2xx, parse and transport boundaries')
    checks.push('Token/pre-cancel/timeout failures send no HTTP; immutable errors retain identity and finite diagnostics omit unknown codes')
    assert(paths.every(path => path.startsWith('/functions/v1/retained-retrieval/')))
    return { ok: true, checks, ...result, requestCount: paths.length, requestDiagnostics,
      scope: 'Production CloudRemote/retrieveRetained and actual server handler over loopback HTTP; controlled Auth/RPC, real recovery/AEAD. No remote, SQLite, native install, provider, model or packaged acceptance.' }
  })
}
