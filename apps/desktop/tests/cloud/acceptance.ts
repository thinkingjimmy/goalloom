/**
 * [INPUT]: Production cloud service/SDK/Repository, real crypto, isolated HTTP/files and current built workers.
 * [OUTPUT]: Strict lifecycle status, fixed-head retrieval, protected receipts, provenance and retired-undo evidence.
 * [POS]: Headless owning integration journey. Controlled Auth/backend facts are not remote acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { verifyBusinessProvenance } from './business-provenance'
import { verifyContinuousProvenance } from './provenance'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import { arch, cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { canonicalJson, retrievalManifestSchema, type RetrievalChallenge, type RetrievalManifest, type SyncOp } from '@goalloom/contracts'
import { checkpointHash, hex, rosterHash, sha256Hex, unhex, verifyDetached } from '@goalloom/crypto'
import { createCloudRemote, createMemoryWorld, memoryRemote, createRemoteWorkspace, newDeviceSecret, retrieveRetained, retrievalProofDigest, sealOpWire, captureExactSeed, encodeExactSeed, CloudFailure } from '@goalloom/sync'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { exportDataset, replaceDataset, readBackupDataset } from '../../src/main/workspace/transfer/dataset'
import { validateDataset } from '../../src/domain/import-validation'
import { syncHost } from '../../src/main/sync/host'
import { RetrievedCopies } from '../../src/main/sync/copies'
import { CloudService } from '../../src/main/cloud/service'
import { sealLocal, openLocal } from '../../src/main/sync/sealed-file'
import type { StorageClient } from '../../src/main/storage/client'
import type { CommandInput } from '../../src/shared/contracts/commands'
import { runSyncLocal } from '../../src/main/workspace/sync/local'
import { SyncService } from '../../src/main/sync/service'
import { createCloud } from '../sync-cost/cloud'
import { seed as seedPeer, worker as storagePeer, cipher as fixtureCipher } from '../sync-cost/peer'
import { clearLocalFiles } from '../../src/main/storage/clear-local'
import { consistentBackup } from '../../src/main/storage/backup/snapshot'

async function main() {
  const root = await mkdtemp(join(tmpdir(), 'goalloom-d2-')), out = process.env.GOALLOOM_D2_EVIDENCE_ROOT!
  await mkdir(out, { recursive: true })
  const report: any = { ok: false, checks: [], runtime: { electron: process.versions.electron, node: process.versions.node }, platform: { os: release(), arch: arch(), cpu: cpus()[0]?.model, machineScope: 'Physical/VM not independently verified' }, scope: 'Production source, actual isolated HTTP, real crypto/SQLite/workers; controlled Auth/backend. No native UI, OS keychain, remote provider, model, packaged or Windows acceptance.' }
  const check = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`) }
  const now = '2026-10-24T04:00:00.123456Z', projectRef = 'abcdefghijklmnopqrst', owner = randomUUID(), session = randomUUID()
  const source = openDatabase(join(root, 'source.sqlite')); migrate(source)
  report.runtime.sqlite = String(source.prepare('SELECT sqlite_version() AS v').get()?.v)
  const repo = new Repository(source, { now: () => now })
  type Input<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
  const run = (command: Input<CommandInput>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation })
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-01' }, confirmed: true })
  const item = run({ type: 'create', title: 'Title only survives recovery', horizon: 'week' }).itemId!
  const cleared = run({ type: 'create', title: 'Null guidance provenance', horizon: 'later' }).itemId!
  const done = run({ type: 'create', title: 'Exact finished source task', horizon: 'later' }).itemId!
  run({ type: 'status', itemId: done, expectedVersion: repo.store.item(done).version, status: 'done' })
  const tombstone = run({ type: 'create', title: 'Exact intentional tombstone', horizon: 'later' }).itemId!
  run({ type: 'delete', itemId: tombstone, expectedVersion: repo.store.item(tombstone).version })
  const guidance = { formatVersion: 1 as const, kind: 'next_step' as const, nextAction: '  Draft a plan  ', contextNote: null, scopeNote: null, authorship: 'user' as const }
  repo.store.saveGuidance({ itemId: item, revision: 18, value: guidance, updatedAt: now, operationId: randomUUID() })
  repo.store.saveGuidance({ itemId: cleared, revision: 7, value: null, updatedAt: now, operationId: randomUUID() })
  const world = createMemoryWorld(), device = newDeviceSecret(), remote = memoryRemote(world, session)
  const deviceId = await remote.registerDevice({ name: 'Original', platform: 'macos', signPub: (await import('@goalloom/crypto')).publicFromSeed('ed25519', device.signSk), boxPub: (await import('@goalloom/crypto')).publicFromSeed('x25519', device.boxSk) })
  const requestId = randomUUID(), finalOpId = randomUUID(), seedId = randomUUID(), password = '取回-café-password'
  let initialWires: unknown = null
  const bound = await createRemoteWorkspace({ remote, deviceId, secret: device, password, generation: randomUUID(), initialization: { requestId, finalOpId, envelopes: null, persist: async wires => { initialWires = structuredClone(wires) } } })
  assert(initialWires)
  const seed = encodeExactSeed(captureExactSeed(nodeSqlDriver(source), syncHost(source)), { seedId, finalOpId, deviceId, at: now })
  const rows = seed.ops.map(op => sealOpWire({ op, workspaceKey: bound.workspaceKey, workspaceId: bound.workspaceId, epoch: 1 }))
  await remote.pushOps({ workspaceId: bound.workspaceId, deviceId, generation: bound.generation, ops: rows })
  const ws = world.workspace!, checkpoint = ws.checkpoint!, recoveryEnvelope = ws.envelopes.find(row => row.recipient === 'recovery')!
  const manifest: RetrievalManifest = retrievalManifestSchema.parse({ version: 1, purpose: 'retained-copy', environment: 'development', projectRef, workspaceId: bound.workspaceId, generation: bound.generation, lifecycleVersion: 3, accessEndedAt: now, retrieveUntil: '2026-11-23T04:00:00.123456Z', headSeq: rows.length, operationCount: rows.length, minRetainedSeq: 0,
    headHash: sha256Hex(canonicalJson({ workspaceId: bound.workspaceId, generation: bound.generation, headSeq: rows.length, entries: ws.ops.map(row => [row.seq, row.opId, row.payloadHash, row.formatVersion, row.keyEpoch]) })), keyEpoch: 1, checkpointVersion: 1, checkpointHash: checkpointHash(checkpoint.body), rosterVersion: 1, rosterHash: rosterHash(bound.roster), recoveryKeyId: sha256Hex(bound.recovery.signPub), envelopeSetHash: sha256Hex(canonicalJson([recoveryEnvelope])), proofKind: 'recovery', deviceId: null, initialization: { requestId, creatorDeviceId: deviceId, finalOpId, finalPayloadHash: seed.final.payloadHash, finalSeq: rows.length } })
  const manifestHash = sha256Hex(canonicalJson(manifest)), challengeId = randomUUID()
  const challenge: RetrievalChallenge = { ok: true, version: 1, serverNow: now, kind: 'challenge', manifest, manifestHash, checkpoint, recoveryEnvelope,
    proofBody: { version: 1, purpose: 'retained-copy', environment: 'development', projectRef, ownerId: owner, authSessionId: session, challengeId, nonce: 'ab'.repeat(32), manifestHash, workspaceId: bound.workspaceId, generation: bound.generation, lifecycleVersion: 3, headSeq: rows.length, headHash: manifest.headHash, checkpointHash: manifest.checkpointHash, rosterHash: manifest.rosterHash, retrieveUntil: manifest.retrieveUntil, challengeExpiresAt: '2026-10-24T04:05:00.123456Z', proofKind: 'recovery', deviceId: null },
    rosterPage: { afterRosterVersion: 0, nextAfterRosterVersion: 1, rosters: ws.rosters, done: true } }
  let lifecycleEntry: unknown = null
  let confirmDenial = ''
  let fault = '', deleted = false, renewal: 'pending' | 'stopped' = 'pending', receiptRequest: any = null, prepared: any = null
  let liveOwner: string | null = owner, authReads = 0
  const requests: { path: string; auth: boolean; version: unknown }[] = []
  const token = `a.${Buffer.from(JSON.stringify({ session_id: session })).toString('base64url')}.b`
  const server = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); const body = JSON.parse(Buffer.concat(chunks).toString())
    const path = request.url!; requests.push({ path, auth: !!request.headers.authorization, version: request.headers['x-goalloom-service-version'] })
    assert.equal(request.headers['x-goalloom-service-version'], '2')
    const send = (value: unknown, code = 200) => { response.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); response.end(JSON.stringify(value)) }
    if (path.endsWith('/status')) {
      send({ ok: true, version: 1, environment: 'development', projectRef, serverNow: now, accountRevision: 1,
        canCreateCloud: false, entries: [lifecycleEntry], nextAfter: null }); return
    }
    if (path.endsWith('/bootstrap')) {
      if (fault === 'oversize') { response.writeHead(200); response.end(' '.repeat(4_194_305)); return }
      send(fault === 'bad-envelope' ? { ...challenge, recoveryEnvelope: { ...recoveryEnvelope, signature: '00'.repeat(64) } } : challenge); return
    }
    if (path.endsWith('/authorize')) { assert(verifyDetached(retrievalProofDigest(challenge.proofBody), unhex(body.signature), bound.recovery.signPub)); send({ ok: true, version: 1, serverNow: now, capability: 'cd'.repeat(32), manifestHash, expiresAt: '2026-10-24T04:15:00.123456Z' }); return }
    if (path.endsWith('/read')) { const operations = ws.ops.filter(row => row.seq > body.afterSeq).slice(0, 2); const next = body.afterSeq + operations.length; send({ ok: true, version: 1, serverNow: now, manifestHash, afterSeq: body.afterSeq, nextAfterSeq: next, operations: fault === 'gap' ? operations.slice(1) : operations, done: next === ws.headSeq }); return }
    if (path.endsWith('/prepare')) { receiptRequest = body; prepared = { version: 1, requestId: body.requestId, scope: body.scope, preparedAt: now, prepareExpiresAt: '2026-10-25T04:00:00.123456Z', serverNow: now }; send(prepared); return }
    if (path.endsWith('/confirm')) { if (confirmDenial) { send({ version: 1, error: confirmDenial }, 409); return } deleted = true; liveOwner = null; response.destroy(); return }
    if (path.endsWith('/deletion-receipt')) {
      assert.equal(request.headers.authorization, undefined); assert.equal(sha256Hex(unhex(body.secret)), receiptRequest.receiptDigest)
      send({ version: 1, requestId: receiptRequest.requestId, scope: receiptRequest.scope, serverNow: now, accepted: deleted, confirmedAt: deleted ? now : null, onlineDeleteBy: deleted ? '2026-10-31T04:00:00.123456Z' : null, statusExpiresAt: deleted ? '2026-11-23T04:00:00.123456Z' : prepared.prepareExpiresAt, intent: deleted ? 'durable' : 'not_started', content: deleted ? 'deleted' : 'not_started', auth: deleted ? 'deleted' : 'not_started', renewal: deleted ? renewal : 'not_started' }); return
    }
    send({ version: 1, error: 'lifecycle_unavailable' }, 503)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port, url = `http://127.0.0.1:${port}`, identity = { environment: 'development' as const, projectRef, accountId: owner, authSessionId: session }, target = { workspaceId: bound.workspaceId, generation: bound.generation }
  const cloudRemote = createCloudRemote({ url, anonKey: 'controlled', accessToken: async () => token })
  try {
    const generationView = (state: 'active' | 'retained' | 'closed' | 'deleting' | 'deleted', initialization: unknown, confirmed = false) => ({
      state, target, lifecycleVersion: 3, reason: state === 'active' ? null : state === 'retained' ? 'ordinary_expiry' : 'explicit_cloud',
      scheduledAccessEnd: state === 'active' ? null : now, accessEndedAt: state === 'active' ? null : now,
      retrieveUntil: state === 'active' ? null : manifest.retrieveUntil, closedAt: ['closed', 'deleting', 'deleted'].includes(state) ? now : null,
      onlineDeleteBy: null, onlineDeletedAt: confirmed ? now : null, retrievalWindowOpen: state === 'retained',
      newCreateRequired: ['closed', 'deleting', 'deleted'].includes(state), initialization,
    })
    const readStatus = () => cloudRemote.status({ version: 1, query: { kind: 'discover', after: null } })
    const existingInitialization = [{ state: 'not_seeded' }, ...['preparing', 'final_received', 'complete'].map(state => ({ state, initializationId: requestId }))]
    for (const confirmed of [false, true]) {
      lifecycleEntry = generationView('deleted', { state: 'not_applicable' }, confirmed)
      assert.deepEqual((await readStatus()).entries[0], lifecycleEntry)
    }
    check('Lifecycle HTTP status accepts identity-free deleted initialization with or without trusted deletion timestamps')
    for (const initialization of existingInitialization) {
      lifecycleEntry = generationView('active', initialization)
      assert.deepEqual((await readStatus()).entries[0], lifecycleEntry)
      lifecycleEntry = generationView('deleted', initialization)
      await assert.rejects(readStatus(), { code: 'configuration' })
    }
    for (const state of ['active', 'retained', 'closed', 'deleting'] as const) {
      lifecycleEntry = generationView(state, { state: 'not_applicable' })
      await assert.rejects(readStatus(), { code: 'configuration' })
      lifecycleEntry = generationView(state, { state: 'complete', initializationId: requestId })
      assert.deepEqual((await readStatus()).entries[0], lifecycleEntry)
    }
    for (const extra of [{ initializationId: requestId }, { requestId }]) {
      lifecycleEntry = generationView('deleted', { state: 'not_applicable', ...extra })
      await assert.rejects(readStatus(), { code: 'configuration' })
    }
    for (const state of ['preparing', 'final_received', 'complete']) for (const fields of [{}, { initializationId: 'invalid' }]) {
      lifecycleEntry = generationView('active', { state, ...fields })
      await assert.rejects(readStatus(), { code: 'configuration' })
    }
    lifecycleEntry = generationView('active', { state: 'not_seeded', initializationId: requestId })
    await assert.rejects(readStatus(), { code: 'configuration' })
    lifecycleEntry = generationView('retained', { state: 'complete', initializationId: requestId })
    check('Lifecycle HTTP status rejects terminal/state mismatches and leaked IDs while preserving strict non-deleted initialization shapes')
    const vector = JSON.parse(await readFile(resolve('../../output/tests/billing/desktop/d2-retrieval/canonical-vector.json'), 'utf8'))
    assert.equal(canonicalJson(vector.proofBody), vector.canonicalProofBody); assert.equal(hex(retrievalProofDigest(vector.proofBody)), vector.proofDigestHex)
    assert(verifyDetached(retrievalProofDigest(vector.proofBody), unhex(vector.signature), unhex(vector.recoverySignPub)))
    check('Client canonical proof bytes match independent server vector with null device and six-digit timestamps')
    const opened: SyncOp[] = []
    await retrieveRetained({ remote: cloudRemote, target, identity, credentials: { kind: 'recovery', password }, append: async operations => { opened.push(...operations.map(row => row.op)) } })
    assert.equal(opened.length, rows.length)
    check('Actual bounded HTTP retrieves and verifies original complete seed with independent initialization/seed IDs and real recovery crypto')
    const abort = new AbortController()
    await assert.rejects(retrieveRetained({ remote: cloudRemote, target, identity, credentials: { kind: 'recovery', password }, options: { signal: abort.signal }, append: async operations => { if (operations.at(-1)?.seq === rows.length) abort.abort() } }))
    fault = 'gap'; await assert.rejects(retrieveRetained({ remote: cloudRemote, target, identity, credentials: { kind: 'recovery', password }, append: async () => {} })); fault = ''
    await assert.rejects(retrieveRetained({ remote: cloudRemote, target, identity, credentials: { kind: 'recovery', password: 'wrong-password' }, append: async () => {} }), error => (error as { code?: string }).code === 'password')
    fault = 'bad-envelope'; await assert.rejects(retrieveRetained({ remote: cloudRemote, target, identity, credentials: { kind: 'recovery', password }, append: async () => {} }), error => error instanceof CloudFailure && error.reason === 'integrity_failure'); fault = 'oversize'
    await assert.rejects(cloudRemote.retrievalBootstrap({ version: 1, ...target, proof: { kind: 'recovery' } }), error => error instanceof CloudFailure && error.code === 'too_large'); fault = ''
    check('Final-append cancellation, sequence gaps, wrong password, corrupt envelope and actual response-byte overflow fail closed')
    const copies = new RetrievedCopies(join(root, 'copies'), resolve('out/main/retrieval.js'), async format => join(out, `verified-copy.${format === 'json' ? 'json' : 'sqlite'}`))
    const artifact = await copies.retrieve({ remote: cloudRemote, target, identity, credentials: { kind: 'recovery', password }, signal: new AbortController().signal, check: async () => {}, guard: () => {} })
    const inspected = await copies.inspect(artifact.artifactId, 0, 50)
    assert.equal(inspected.type, 'items'); if (inspected.type === 'items') assert(inspected.items.some(row => row.title === 'Title only survives recovery'))
    await copies.export(artifact.artifactId, 'json'); await copies.export(artifact.artifactId, 'sqlite')
    const baseline = JSON.parse(await readFile(join(out, 'verified-copy.json'), 'utf8'))
    assert.equal(baseline.historyMode, 'baseline'); assert.equal(baseline.operations.length, 0); validateDataset(baseline, now)
    const cancelDirectory = join(root, 'cancel-publication'), cancelCopy = new RetrievedCopies(cancelDirectory, resolve('out/main/retrieval.js'), async () => null)
    const publishAbort = new AbortController()
    let checks = 0, releasePublish!: () => void, publicationPrepared!: () => void
    const preparedPublication = new Promise<void>(resolve => { publicationPrepared = resolve })
    const publication = cancelCopy.retrieve({ remote: cloudRemote, target, identity, credentials: { kind: 'recovery', password }, signal: publishAbort.signal,
      check: async () => { if (++checks === 4) { publicationPrepared(); await new Promise<void>(resolve => { releasePublish = resolve }) } }, guard: () => publishAbort.signal.throwIfAborted() })
    await preparedPublication
    assert((await readdir(cancelDirectory)).some(name => name.startsWith('copies.json.') && name.endsWith('.tmp')))
    publishAbort.abort(); releasePublish(); await assert.rejects(publication)
    assert.deepEqual(await cancelCopy.list(), [])
    assert(!(await readdir(cancelDirectory)).some(name => name.endsWith('.tmp') || name.endsWith('.sqlite')))
    check('Cancellation after registry fsync and before guarded synchronous rename creates no ready grant or surviving copy')
    check('Isolated production worker publishes ready-only title-bearing baseline copy and repeatable JSON/SQLite artifacts')
    const peerDb = openDatabase(join(root, 'seed-peer.sqlite')); migrate(peerDb)
    const peerBinding = { accountId: owner, environment: 'development' as const, projectRef, workspaceId: bound.workspaceId, generation: bound.generation, localGeneration: String(peerDb.prepare('SELECT generation FROM workspace WHERE id=1').get()!.generation), deviceId: randomUUID(), keyEpoch: 1, bindingToken: randomUUID() }
    await runSyncLocal(peerDb, { type: 'install', binding: { workspaceId: bound.workspaceId, deviceId: peerBinding.deviceId, keyEpoch: 1 }, sourceBinding: peerBinding, expectedGeneration: peerBinding.localGeneration, ops: opened.map((op, index) => ({ seq: index + 1, op })), at: now, merge: false })
    const peerRepo = new Repository(peerDb, { now: () => now }), peerDataset = exportDataset(peerRepo.store, now)
    validateDataset(peerDataset, now)
    assert.deepEqual(peerDataset.guidance, baseline.guidance)
    assert.equal(peerDataset.items.find(row => row.id === done)?.status, 'done'); assert(peerDataset.items.find(row => row.id === tombstone)?.deletedAt)
    assert(peerDataset.operations.length === 1 && peerDataset.operations[0]!.kind === 'baseline'); assert.equal(peerDataset.events.length, peerDataset.items.length); assert.equal(peerDataset.guidanceCheckpoints?.[0]?.changes.length, 2)
    for (const name of await verifyBusinessProvenance(peerDb, peerBinding, now)) check(name)
    for (const name of await verifyContinuousProvenance(peerDb, peerBinding, root, new Date(Date.parse(now) + 3 * 86400000 + 30_000).toISOString())) check(name)
    peerDb.close()
    check('Verified initial peer seed installs exact null/non-null guidance anchors and exports strict complete data without invented source history')
    const destination = openDatabase(join(root, 'destination.sqlite')); migrate(destination)
    const destinationRepo = new Repository(destination, { now: () => now })
    replaceDataset(destinationRepo.store, baseline, 'restore', now)
    let complete = exportDataset(destinationRepo.store, now); validateDataset(complete, now)
    assert.equal(complete.guidanceCheckpoints?.[0]?.changes.length, 2); assert.equal(complete.guidance[0]!.revision > 0, true)
    const original = complete.operations[0]!, oldGeneration = original.generation
    destination.prepare('UPDATE operations SET generation=? WHERE id=?').run(randomUUID(), original.id)
    const undo = destinationRepo.execute({ type: 'undo', originalOperationId: original.id, operationId: randomUUID(), generation: destinationRepo.store.workspace().generation })
    assert.equal(undo.outcome, 'conflict_skipped'); assert.equal(destination.prepare('SELECT count(*) AS n FROM undo_effects').get()?.n, 0)
    destination.prepare('UPDATE operations SET generation=? WHERE id=?').run(oldGeneration, original.id)
    const rolloverId = randomUUID(), oldRolloverGeneration = randomUUID()
    destinationRepo.store.saveOperation({ id: rolloverId, generation: oldRolloverGeneration, kind: 'rollover', source: 'system', requestHash: 'ab'.repeat(32), at: now, effectsVersion: 1, effects: [], result: { operationId: rolloverId, generation: oldRolloverGeneration, changed: false, undoable: false, outcome: 'committed', itemId: null, label: '', warnings: [], restoreSource: null, originalOperationId: null } })
    const batchSkip = destinationRepo.execute({ type: 'undoBatch', originalOperationId: rolloverId, operationId: randomUUID(), generation: destinationRepo.store.workspace().generation })
    assert.equal(batchSkip.outcome, 'conflict_skipped')
    validateDataset(exportDataset(destinationRepo.store, now), now)
    const version = destinationRepo.store.item(item).version
    const applied = destinationRepo.execute({ type: 'applyAssistance', operationId: randomUUID(), generation: destinationRepo.store.workspace().generation, itemId: item, expectedVersion: version, expectedGuidanceRevision: 18, guidance: { kind: 'set', value: { ...guidance, nextAction: 'New current step' } } })
    destinationRepo.execute({ type: 'undo', originalOperationId: applied.operationId, operationId: randomUUID(), generation: destinationRepo.store.workspace().generation })
    complete = exportDataset(destinationRepo.store, now); validateDataset(complete, now)
    check('Baseline guidance anchors survive full backup and new apply/undo; old-generation undo produces one definitive skip without original undo markers')
    destination.exec("INSERT INTO sync_binding_transitions VALUES ('private-transition','hash','{}','now'); INSERT INTO sync_retired_rows VALUES ('private-transition','sync_setting','sentinel','{\"private\":\"retired-secret-sentinel\"}')")
    destination.prepare('INSERT INTO sync_active_binding(id,identity,transitionRequestId) VALUES (1,?,?)').run(JSON.stringify({ accountId: owner, projectRef, environment: 'development', workspaceId: bound.workspaceId, generation: bound.generation, localGeneration: destinationRepo.store.workspace().generation, deviceId, keyEpoch: 1, bindingToken: randomUUID() }), 'private-transition')
    const backup = await consistentBackup(destination, join(root, 'backups')), bytes = await readFile(backup)
    assert(!bytes.includes(Buffer.from('retired-secret-sentinel')) && !bytes.includes(Buffer.from('private-transition')))
    const reopened = await readBackupDataset(backup, now)
    validateDataset(reopened.data, now)
    const restored = openDatabase(join(root, 'restored-backup.sqlite')); migrate(restored)
    const restoredRepo = new Repository(restored, { now: () => now })
    replaceDataset(restoredRepo.store, reopened.data, 'restore', now)
    validateDataset(exportDataset(restoredRepo.store, now), now)
    assert.deepEqual(restoredRepo.store.guidance(item)?.value, guidance)
    restored.close(); destination.close()
    check('Actual sanitized backup reopens, restores into a fresh database and re-exports strict guidance provenance')
    check('Portable SQLite sanitation removes raw retirement/context evidence including freelist bytes')
    const protectionKey = randomBytes(32)
    const cipher = { available: () => true, encrypt: (text: string) => sealLocal(protectionKey, 'controlled-privacy-test', Buffer.from(text)), decrypt: (bytes: Buffer) => openLocal(protectionKey, 'controlled-privacy-test', bytes).toString() }
    const privacyDirectory = join(root, 'privacy')
    const deps = { directory: privacyDirectory, workerPath: resolve('out/main/retrieval.js'), cipher, environment: 'development' as const, config: () => ({ url, anonKey: 'controlled' }), account: { id: () => liveOwner, context: () => `${liveOwner}|${session}`, session: async () => { authReads++; if (!liveOwner) throw Error('deleted'); return { userId: liveOwner, accessToken: token } } }, storage: {} as StorageClient, choose: async () => null, closed: () => {} }
    // Config project identity is derived from the actual configured host, including controlled local fixtures.
    const denied = new CloudService({ ...deps, directory: join(root, 'privacy-denied') })
    const expired = await denied.action({ type: 'prepare', expectedAccountId: owner, scope: 'account', target: null, expectedRevision: 1 })
    assert(expired.type === 'state' && expired.state.prepared)
    confirmDenial = 'deletion_prepare_expired'
    await denied.action({ type: 'confirm', expectedAccountId: owner, requestId: expired.state.prepared.requestId, acknowledge: true })
    const replacement = await denied.action({ type: 'prepare', expectedAccountId: owner, scope: 'account', target: null, expectedRevision: 2 })
    assert(replacement.type === 'state' && replacement.state.prepared)
    assert.notEqual(replacement.state.prepared.requestId, expired.state.prepared.requestId)
    confirmDenial = 'lifecycle_conflict'
    await denied.action({ type: 'confirm', expectedAccountId: owner, requestId: replacement.state.prepared.requestId, acknowledge: true })
    const nextScope = await denied.action({ type: 'prepare', expectedAccountId: owner, scope: 'cloud', target, expectedRevision: 3 })
    assert(nextScope.type === 'state' && nextScope.state.prepared && nextScope.state.prepared.requestId !== replacement.state.prepared.requestId)
    confirmDenial = ''
    check('Definitive expired/conflicting confirmations release only known nonacceptance for a fresh explicit scope; original requests remain recorded')
    const privacy = new CloudService(deps)
    const first = await privacy.action({ type: 'prepare', expectedAccountId: owner, scope: 'account', target: null, expectedRevision: 1 })
    assert.equal(first.type, 'state'); const state = first.type === 'state' ? first.state : null
    assert(state?.prepared)
    await privacy.action({ type: 'confirm', expectedAccountId: owner, requestId: state.prepared.requestId, acknowledge: true })
    const restarted = new CloudService(deps), unknown = await restarted.action({ type: 'status' })
    assert.equal(unknown.type, 'state'); if (unknown.type === 'state') assert.equal(unknown.state.pendingReceipts[0]?.confirmationSent, true)
    const before = authReads
    const recovered = await restarted.action({ type: 'receipt', requestId: state.prepared.requestId })
    assert.equal(authReads, before); assert.equal(recovered.type, 'state')
    if (recovered.type === 'state') assert.equal(recovered.state.progress[0]?.renewal, 'pending')
    await restarted.action({ type: 'acknowledge', requestId: state.prepared.requestId })
    const protectedBefore = JSON.parse(cipher.decrypt(await readFile(join(privacyDirectory, 'privacy-receipts.bin'))))
    assert(protectedBefore.value.receipts[0].secret)
    renewal = 'stopped'; await restarted.action({ type: 'receipt', requestId: state.prepared.requestId }); await restarted.action({ type: 'acknowledge', requestId: state.prepared.requestId })
    const protectedAfter = JSON.parse(cipher.decrypt(await readFile(join(privacyDirectory, 'privacy-receipts.bin'))))
    assert.equal(protectedAfter.value.receipts[0].secret, null)
    check('Lost accepted confirmation survives restart/Auth removal; status uses original protected secret without Auth and retains it through pending renewal')
    const controlled = await createCloud(), durableProfile = join(root, 'durable-journal')
    await seedPeer(durableProfile, 'alpha', controlled.world, controlled.url)
    let failedSave = false, failNewKey = true, service: SyncService | null = null
    let storage = await storagePeer(durableProfile)
    const openService = () => new SyncService({ userData: durableProfile, storage, cipher: fixtureCipher, openExternal: async () => {}, notify: () => {}, onApplied: () => {}, clipboard: () => {}, now: () => new Date().toISOString(), beginSignIn: async client => { const value = await client.auth.refreshSession({ refresh_token: 'alpha' }); assert(value.data.session); return value.data.session } })
    try {
      service = openService()
      const vault = service['vault'], save = vault.save.bind(vault)
      let entered!: () => void, releaseSave!: () => void
      const enteredSave = new Promise<void>(resolve => { entered = resolve })
      vault.save = async secrets => {
        if (failNewKey && Object.keys(secrets.bindingJournalKeys ?? {}).length) {
          failedSave = true; entered()
          await new Promise<void>(resolve => { releaseSave = resolve })
          throw Error('synthetic protected-save failure')
        }
        await save(secrets)
      }
      const starting = service.start()
      await enteredSave
      assert(failedSave)
      await assert.rejects(readFile(service!['bindingJournal'].path), { code: 'ENOENT' })
      let queuedSecond!: () => void
      const secondQueued = new Promise<void>(resolve => { queuedSecond = resolve })
      const ensureBinding = service['ensureActiveBinding'].bind(service)
      service['ensureActiveBinding'] = view => { const queued = ensureBinding(view); queuedSecond(); return queued }
      const overlapping = service.handle({ type: 'generation-preview', expectedAccountId: service.accountId() })
      await secondQueued
      await assert.rejects(readFile(service!['bindingJournal'].path), { code: 'ENOENT' })
      failNewKey = false
      releaseSave(); await starting
      assert((await overlapping).generationPreview)
      const retry = await service.handle({ type: 'sign-in', provider: 'google' })
      assert.equal(retry.status.phase, 'ready', JSON.stringify(retry))
      assert.equal(retry.status.error, null)
      service.stop(); await service['schedule'].settle(); await storage.close()
      storage = await storagePeer(durableProfile); service = openService(); await service.start()
      assert.equal((await service.handle({ type: 'status' })).status.phase, 'ready')
      await service.local({ type: 'settings' })
      check('Failed/overlapping journal-key save writes no premature journal; explicit retry persists a usable key and a fresh service/worker restart reopens it')
    } finally { service?.stop(); if (service) await service['schedule'].settle(); await storage.close(); await controlled.close() }
    const clearDirectory = join(root, 'clear-profile'), clearPath = join(clearDirectory, 'workspace.sqlite')
    await mkdir(join(clearDirectory, 'cloud', 'retrieved-copies'), { recursive: true })
    await writeFile(join(clearDirectory, 'cloud', 'retrieved-copies', 'managed-copy.sqlite'), await readFile(join(out, 'verified-copy.sqlite')))
    const receiptBytes = await readFile(join(privacyDirectory, 'privacy-receipts.bin'))
    await writeFile(join(clearDirectory, 'cloud', 'privacy-receipts.bin'), receiptBytes)
    await writeFile(join(clearDirectory, 'sync-bindings.bin'), 'synthetic-retired-key-and-task-context')
    let clearDb = openDatabase(clearPath); migrate(clearDb)
    await clearLocalFiles({ databasePath: clearPath, backupDirectory: join(clearDirectory, 'backups'), close: () => clearDb.close(), reopen: () => { clearDb = openDatabase(clearPath); migrate(clearDb) } })
    assert.equal(clearDb.prepare('SELECT count(*) AS n FROM items').get()?.n, 0)
    await assert.rejects(readFile(join(clearDirectory, 'sync-bindings.bin')), { code: 'ENOENT' })
    await assert.rejects(readdir(join(clearDirectory, 'cloud', 'retrieved-copies')), { code: 'ENOENT' })
    assert.deepEqual(await readFile(join(clearDirectory, 'cloud', 'privacy-receipts.bin')), receiptBytes)
    clearDb.close()
    check('Actual atomic local-clear path removes managed copies/retired key contexts and preserves independent privacy receipt bytes')
    report.sourceBuild = join(out, 'source-build.json'); report.requests = requests; report.ok = true
  } catch (error) { report.error = error instanceof Error ? `${error.stack}\nCause: ${String(error.cause)}` : String(error); throw error }
  finally { source.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await writeFile(resolve('../../output/tests/billing/desktop/d2-client/latest.json'), JSON.stringify({ reportPath: join(out, 'report.json'), ok: report.ok }, null, 2)); await rm(root, { recursive: true, force: true }) }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
