/**
 * [INPUT]: Existing credential-native harness, synthetic Auth session and current production crypto/seed helpers.
 * [OUTPUT]: Deterministic lifecycle terminal metadata, retained-log/privacy/notice boundaries and protected-copy evidence.
 * [POS]: Test transport only; production cloud service, IPC, worker, renderer and transfer flow remain intact.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { app, dialog } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { canonicalJson, retrievalManifestSchema } from '@goalloom/contracts'
import { checkpointHash, publicFromSeed, rosterHash, sha256Hex, unhex, verifyDetached } from '@goalloom/crypto'
import { createMemoryWorld, memoryRemote, newDeviceSecret, createRemoteWorkspace, captureExactSeed, encodeExactSeed, sealOpWire, retrievalProofDigest } from '@goalloom/sync'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { syncHost } from '../../src/main/sync/host'
import { Store } from '../../src/main/storage/store'
import { exportDataset, readSqliteDataset } from '../../src/main/workspace/transfer/dataset'
import { validateDataset } from '../../src/domain/import-validation'
import type { Dataset } from '../../src/shared/contracts/transfer'

const fixture = (globalThis as any).credentialFixture, profile = app.getPath('userData'), path = join(profile, 'cloud-native-transport.json')
const owner = '11111111-1111-4111-8111-111111111111', projectRef = 'abcdefghijklmnopqrst', password = 'Synthetic-cloud-copy-password'
const instant = (date: number) => new Date(date).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z')
let data: any
try { data = JSON.parse(await readFile(path, 'utf8')) }
catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  const at = instant(Date.now()), db = openDatabase(join(profile, 'cloud-native-source.sqlite')); migrate(db)
  const repo = new Repository(db, { now: () => at }), run = (command: any) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation })
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: `${at.slice(0, 4)}-01-01` }, confirmed: true })
  const task = run({ type: 'create', title: 'Retained title without a description', horizon: 'week' }).itemId!
  const done = run({ type: 'create', title: 'Finished retained task', horizon: 'later' }).itemId!
  run({ type: 'status', itemId: done, expectedVersion: repo.store.item(done).version, status: 'done' })
  const deleted = run({ type: 'create', title: 'Intentional retained tombstone', horizon: 'later' }).itemId!
  run({ type: 'delete', itemId: deleted, expectedVersion: repo.store.item(deleted).version })
  repo.store.saveGuidance({ itemId: task, revision: 9, value: { formatVersion: 1, kind: 'next_step', nextAction: 'Keep the verified source', contextNote: null, scopeNote: null, authorship: 'user' }, updatedAt: at, operationId: randomUUID() })
  const world = createMemoryWorld(), remote = memoryRemote(world, owner), secret = newDeviceSecret()
  const deviceId = await remote.registerDevice({ name: 'Synthetic source', platform: 'macos', signPub: publicFromSeed('ed25519', secret.signSk), boxPub: publicFromSeed('x25519', secret.boxSk) })
  const requestId = randomUUID(), finalOpId = randomUUID(), bound = await createRemoteWorkspace({ remote, deviceId, secret, password, generation: randomUUID(), initialization: { requestId, finalOpId, envelopes: null, persist: async () => {} } })
  const seed = encodeExactSeed(captureExactSeed(nodeSqlDriver(db), syncHost(db)), { seedId: randomUUID(), finalOpId, deviceId, at })
  await remote.pushOps({ workspaceId: bound.workspaceId, deviceId, generation: bound.generation, ops: seed.ops.map(op => sealOpWire({ op, workspaceKey: bound.workspaceKey, workspaceId: bound.workspaceId, epoch: 1 })) })
  const ws = world.workspace!, checkpoint = ws.checkpoint!, recoveryEnvelope = ws.envelopes.find(row => row.recipient === 'recovery')!, retrieveUntil = instant(Date.parse(at) + 30 * 86400000)
  const manifest = retrievalManifestSchema.parse({ version: 1, purpose: 'retained-copy', environment: 'development', projectRef, workspaceId: bound.workspaceId, generation: bound.generation, lifecycleVersion: 3, accessEndedAt: at, retrieveUntil,
    headSeq: ws.headSeq, operationCount: ws.headSeq, minRetainedSeq: 0, headHash: sha256Hex(canonicalJson({ workspaceId: bound.workspaceId, generation: bound.generation, headSeq: ws.headSeq, entries: ws.ops.map(row => [row.seq, row.opId, row.payloadHash, row.formatVersion, row.keyEpoch]) })), keyEpoch: 1, checkpointVersion: 1, checkpointHash: checkpointHash(checkpoint.body), rosterVersion: 1, rosterHash: rosterHash(bound.roster), recoveryKeyId: sha256Hex(bound.recovery.signPub), envelopeSetHash: sha256Hex(canonicalJson([recoveryEnvelope])), proofKind: 'recovery', deviceId: null,
    initialization: { requestId, creatorDeviceId: deviceId, finalOpId, finalPayloadHash: seed.final.payloadHash, finalSeq: ws.headSeq } })
  const expected = JSON.parse(JSON.stringify({ items: db.prepare('SELECT * FROM items ORDER BY id').all(), placements: db.prepare('SELECT * FROM item_placements ORDER BY itemId').all(), guidance: [repo.store.guidance(task)] }))
  data = { expected, at, manifest, manifestHash: sha256Hex(canonicalJson(manifest)), checkpoint, recoveryEnvelope, rosters: ws.rosters, ops: ws.ops, recoverySignPub: Buffer.from(bound.recovery.signPub).toString('hex'), sessionId: fixture.cloudSessionId, receipts: {}, deleted: false }
  db.close(); await writeFile(path, JSON.stringify(data))
}
fixture.cloudSessionId = data.sessionId
function retainedState(copy: Dataset) {
  assert.deepEqual([...copy.items].sort((a, b) => a.id.localeCompare(b.id)), data.expected.items)
  assert.deepEqual([...copy.placements].sort((a, b) => a.itemId.localeCompare(b.itemId)), data.expected.placements)
  assert.deepEqual(copy.guidance, data.expected.guidance)
  return { generation: copy.workspace.generation, historyMode: copy.historyMode, items: copy.items, guidance: copy.guidance, operations: copy.operations.map(row => ({ id: row.id, kind: row.kind, source: row.source })), events: copy.events.map(row => ({ itemId: row.itemId, type: row.type })), guidanceCheckpoints: copy.guidanceCheckpoints?.length ?? 0 }
}
function localEvidenceDetails() {
  const db = new DatabaseSync(join(profile, 'workspace.sqlite'), { readOnly: true })
  try {
    const { lastObservedAt, ...workspace } = db.prepare('SELECT * FROM workspace WHERE id=1').get()!
    const tables = Object.fromEntries(['items', 'item_placements', 'item_guidance', 'operations', 'item_events', 'undo_effects', 'sync_ops'].map(table => [table, sha256Hex(canonicalJson(db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()))]))
    return { workspace, tables, lastObservedAt }
  } finally { db.close() }
}
const control = fixture.cloud = { stage: 'ended', remainingDays: null as number | null, canCreateCloud: false, holdRead: false, readStarted: false, wrongIntegrity: false, expired: false, loseConfirm: false, renewal: 'pending', actions: [] as any[], exports: [] as string[], savePath: null as string | null,
  allowNewCloud: false,
  target: { workspaceId: data.manifest.workspaceId, generation: data.manifest.generation },
  retrieveUntil: data.manifest.retrieveUntil,
  verifyCopy: async (file: string, format: 'json' | 'sqlite') => {
    const bytes = await readFile(file), now = new Date().toISOString()
    const copy = format === 'json' ? validateDataset(JSON.parse(bytes.toString()), now) : await readSqliteDataset(file, now, 'backup')
    assert.equal(copy.historyMode, 'baseline'); assert.equal(copy.operations.length, 0); assert.equal(copy.events.length, 0)
    return { ...retainedState(copy), bytes: bytes.length, sha256: sha256Hex(bytes) }
  },
  verifyReplacement: () => {
    const db = new DatabaseSync(join(profile, 'workspace.sqlite'), { readOnly: true })
    try {
      const copy = exportDataset(new Store(db), new Date().toISOString()); validateDataset(copy, new Date().toISOString())
      assert.equal(copy.historyMode, 'complete'); assert(copy.operations.length > 0 && copy.operations.every(row => row.kind === 'baseline' && row.source === 'system'))
      assert.equal(copy.events.length, copy.items.length); assert(copy.events.every(row => row.type === 'baseline'))
      assert((copy.guidanceCheckpoints?.length ?? 0) > 0)
      return retainedState(copy)
    } finally { db.close() }
  },
  verifyProtectiveBackup: async (file: string, itemId: string) => {
    const bytes = await readFile(file), copy = await readSqliteDataset(file, new Date().toISOString(), 'backup')
    assert.equal(copy.historyMode, 'complete'); assert(copy.items.some(row => row.id === itemId && row.title === 'Local task kept during cloud retrieval'))
    const creation = copy.events.find(row => row.itemId === itemId && row.type === 'created'); assert(creation)
    assert(copy.operations.some(row => row.id === creation.operationId && row.kind === 'create'))
    return { bytes: bytes.length, sha256: sha256Hex(bytes), generation: copy.workspace.generation, itemId, operations: copy.operations.length, events: copy.events.length }
  },
  localEvidenceDetails,
  outboxEvidence: () => {
    const db = new DatabaseSync(join(profile, 'workspace.sqlite'), { readOnly: true })
    try { return db.prepare('SELECT * FROM sync_ops ORDER BY localOrder').all().map(row => ({
      opId: row.opId, origin: row.origin, state: row.state, outcome: row.outcome, deviceId: row.deviceId, at: row.at, updatedAt: row.updatedAt,
      actions: JSON.parse(String(row.payload)).actions.map((action: any) => ({ type: action.t, ...(action.key ? { key: action.key } : {}) })),
      columns: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, sha256Hex(canonicalJson(value))])),
    })) } finally { db.close() }
  },
  localEvidence: () => { const { lastObservedAt: _clock, ...state } = localEvidenceDetails(); return sha256Hex(canonicalJson(state)) },
  businessEvidence: () => { const db = new DatabaseSync(join(profile, 'workspace.sqlite'), { readOnly: true }); try { return sha256Hex(canonicalJson([db.prepare('SELECT generation,calendar,setupConfirmedAt FROM workspace WHERE id=1').get(), ...['items', 'item_placements', 'item_guidance', 'operations', 'item_events', 'undo_effects'].map(table => [table, db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()])])) } finally { db.close() } },
  creationEvidence: () => ({ target: liveWorld.workspace ? { workspaceId: liveWorld.workspace.id, generation: liveWorld.workspace.generation } : null, receipt: liveWorld.workspace?.initialization?.receipt ?? null, headSeq: liveWorld.workspace?.headSeq ?? 0 }),
  retiredUnknown: () => { const db = new DatabaseSync(join(profile, 'workspace.sqlite')); try { db.exec("INSERT INTO sync_binding_transitions VALUES ('synthetic-retired','hash','{}','now'); INSERT INTO sync_retired_rows VALUES ('synthetic-retired','sync_op','synthetic-unknown','{\"state\":\"send_unknown\"}')") } finally { db.close() } },
  settleLocalOutbox: () => { const db = new DatabaseSync(join(profile, 'workspace.sqlite')); try { db.exec("UPDATE sync_ops SET state='applied',outcome='applied' WHERE origin='local'") } finally { db.close() } },
}
const liveWorld = createMemoryWorld(), liveRemote = memoryRemote(liveWorld, owner)
dialog.showSaveDialog = async () => { if (control.savePath) control.exports.push(control.savePath); return { canceled: !control.savePath, filePath: control.savePath ?? '' } }
const baseFetch = globalThis.fetch
const response = (value: any, status = 200) => Response.json(value, { status, headers: { 'cache-control': 'no-store' } })
globalThis.fetch = async (input: any, init: any = {}) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input.toString()), body = init.body ? JSON.parse(init.body) : null
  const rpc = url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.split('/').at(-1)! : null
  if (control.allowNewCloud && (rpc || url.pathname.endsWith('/lifecycle/finish-initialization'))) {
    const headers = new Headers(init.headers), token = headers.get('authorization')?.split(' ')[1]
    assert(token); assert.equal(JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()).sub, owner)
    assert.equal(headers.get('x-goalloom-service-version'), '2')
    control.actions.push({ path: url.pathname, auth: true, workspaceId: body?.p_workspace ?? body?.target?.workspaceId ?? null })
    const wire = (value: string) => unhex(value.replace(/^\\x/, ''))
    const handlers: Record<string, () => Promise<unknown>> = {
      list_account: () => liveRemote.account(body.p_workspace ? { workspaceId: body.p_workspace } : undefined),
      register_device: () => liveRemote.registerDevice({ name: body.p_name, platform: body.p_platform, signPub: wire(body.p_sign_pub), boxPub: wire(body.p_box_pub) }),
      rebind_device: () => liveRemote.rebindDevice(body.p_device, wire(body.p_message), wire(body.p_signature)),
      create_new_workspace: () => liveRemote.bootstrap({ deviceId: body.p_device, workspaceId: body.p_workspace, generation: body.p_generation, createNew: true, roster: body.p_roster, rosterHash: body.p_roster_hash, rosterSig: wire(body.p_roster_sig), checkpoint: body.p_checkpoint, recSig: wire(body.p_rec_sig), devSig: wire(body.p_dev_sig), ...(body.p_initialization ? { initialization: body.p_initialization } : {}) }),
      put_key_envelopes: () => liveRemote.putEnvelopes(body.p_workspace, body.p_device, body.p_envelopes),
      get_roster: () => liveRemote.getRoster(body.p_workspace, body.p_device),
      get_key_envelopes: () => liveRemote.getEnvelopes(body.p_workspace, body.p_device),
      get_latest_checkpoint: () => liveRemote.getCheckpoint(body.p_workspace, body.p_device),
      get_sync_status: () => liveRemote.getSyncStatus(body.p_workspace, body.p_device),
      receipts_for: () => liveRemote.receiptsFor(body.p_workspace, body.p_device, body.p_op_ids.map((opId: string, index: number) => ({ opId, payloadHash: body.p_payload_hashes[index] }))),
      push_ops: () => liveRemote.pushOps({ workspaceId: body.p_workspace, deviceId: body.p_device, generation: body.p_generation, ops: body.p_ops.map((op: any) => ({ opId: op.op_id, payloadHash: op.payload_hash, formatVersion: op.format_version, keyEpoch: op.key_epoch, ciphertext: op.ciphertext })) }),
      pull_ops: () => liveRemote.pullOps({ workspaceId: body.p_workspace, deviceId: body.p_device, after: body.p_after, limit: body.p_limit }),
      'finish-initialization': () => liveRemote.finishInitialization(body),
    }
    const handler = handlers[rpc ?? 'finish-initialization']; assert(handler, `Unsupported explicit new-cloud RPC: ${rpc}`)
    return response(await handler() ?? null)
  }
  if (!['/functions/v1/lifecycle/', '/functions/v1/retained-retrieval/', '/functions/v1/deletion-receipt'].some(prefix => url.pathname.startsWith(prefix))) return baseFetch(input, init)
  const headers = new Headers(init.headers); assert.equal(headers.get('x-goalloom-service-version'), '2')
  control.actions.push({ path: url.pathname, requestId: body?.requestId, scope: body?.scope ?? data.receipts[body?.requestId]?.request.scope ?? null, target: body?.target ?? data.receipts[body?.requestId]?.request.target ?? null, auth: headers.has('authorization') })
  const m = data.manifest, target = { workspaceId: m.workspaceId, generation: m.generation }, now = data.at
  if (url.pathname.endsWith('/status')) {
    if (fixture.activeUserId && fixture.activeUserId !== owner) return response({ ok: true, version: 1, environment: 'development', projectRef, serverNow: now, accountRevision: 0, canCreateCloud: false, entries: [{ state: 'none', newCreateRequired: true }], nextAfter: null })
    const stage = control.stage, deleted = stage === 'deleted' || data.deleted, active = stage === 'active'
    const closed = deleted || ['cutoff', 'deleting', 'deleted-unconfirmed'].includes(stage)
    const generationState = active ? 'active' : deleted || stage === 'deleted-unconfirmed' ? 'deleted' : stage === 'deleting' ? 'deleting' : closed ? 'closed' : 'retained'
    const serverNow = control.remainingDays !== null ? instant(Date.parse(m.retrieveUntil) - control.remainingDays * 86400000) : stage === 'week' ? instant(Date.parse(m.retrieveUntil) - 6 * 86400000) : closed ? m.retrieveUntil : now
    const entries: any[] = stage === 'none' ? [] : [{ target, state: generationState, lifecycleVersion: 3, reason: active ? null : 'ordinary_expiry', scheduledAccessEnd: active ? null : now, accessEndedAt: active ? null : now, retrieveUntil: active ? null : m.retrieveUntil, closedAt: closed ? serverNow : null, onlineDeleteBy: null, onlineDeletedAt: deleted ? serverNow : null, retrievalWindowOpen: !active && !closed, newCreateRequired: closed, initialization: generationState === 'deleted' ? { state: 'not_applicable' } : { state: 'complete', initializationId: m.initialization.requestId } }]
    const created = liveWorld.workspace
    if (created) entries.push({ target: { workspaceId: created.id, generation: created.generation }, state: 'active', lifecycleVersion: created.initialization?.receipt ? 2 : 1, reason: null, scheduledAccessEnd: null, accessEndedAt: null, retrieveUntil: null, closedAt: null, onlineDeleteBy: null, onlineDeletedAt: null, retrievalWindowOpen: false, newCreateRequired: false, initialization: created.initialization ? { state: created.initialization.receipt ? 'complete' : created.initialization.finalSeq ? 'final_received' : 'preparing', initializationId: created.initialization.requestId } : { state: 'not_seeded' } })
    entries.sort((a, b) => { const left = `${a.target.workspaceId}|${a.target.generation}`, right = `${b.target.workspaceId}|${b.target.generation}`; return left < right ? -1 : left > right ? 1 : 0 })
    return response({ ok: true, version: 1, environment: 'development', projectRef, serverNow, accountRevision: created ? 4 : 3, canCreateCloud: control.canCreateCloud && !created, entries: stage === 'none' ? [{ state: 'none', newCreateRequired: true }] : body?.query?.kind === 'generation' ? entries.filter(row => row.target.workspaceId === body.query.target.workspaceId && row.target.generation === body.query.target.generation) : entries, nextAfter: null })
  }
  if (url.pathname.endsWith('/bootstrap')) {
    const challengeId = randomUUID()
    const proofBody = { version: 1, purpose: 'retained-copy', environment: 'development', projectRef, ownerId: owner, authSessionId: fixture.cloudSessionId, challengeId, nonce: 'ab'.repeat(32), manifestHash: data.manifestHash, workspaceId: m.workspaceId, generation: m.generation, lifecycleVersion: 3, headSeq: m.headSeq, headHash: m.headHash, checkpointHash: m.checkpointHash, rosterHash: m.rosterHash, retrieveUntil: m.retrieveUntil, challengeExpiresAt: instant(Date.parse(now) + 300000), proofKind: 'recovery', deviceId: null }
    fixture.cloudProof = proofBody
    return response({ ok: true, version: 1, serverNow: now, kind: 'challenge', manifest: m, manifestHash: data.manifestHash, checkpoint: data.checkpoint, recoveryEnvelope: control.wrongIntegrity ? { ...data.recoveryEnvelope, signature: '00'.repeat(64) } : data.recoveryEnvelope, proofBody, rosterPage: { afterRosterVersion: 0, nextAfterRosterVersion: 1, rosters: data.rosters, done: true } })
  }
  if (url.pathname.endsWith('/authorize')) {
    assert(verifyDetached(retrievalProofDigest(fixture.cloudProof), unhex(body.signature), unhex(data.recoverySignPub)))
    return response({ ok: true, version: 1, serverNow: now, capability: 'cd'.repeat(32), manifestHash: data.manifestHash, expiresAt: instant(Date.parse(now) + 900000) })
  }
  if (url.pathname.endsWith('/read')) {
    control.readStarted = true
    if (control.holdRead) await new Promise<void>((_resolve, reject) => { const abort = () => reject(init.signal.reason); if (init.signal.aborted) abort(); else init.signal.addEventListener('abort', abort, { once: true }) })
    const operations = data.ops.filter((row: any) => row.seq > body.afterSeq).slice(0, 2), nextAfterSeq = body.afterSeq + operations.length
    return response({ ok: true, version: 1, serverNow: now, manifestHash: data.manifestHash, afterSeq: body.afterSeq, nextAfterSeq, operations, done: nextAfterSeq === m.headSeq })
  }
  if (url.pathname.endsWith('/prepare')) {
    data.receipts[body.requestId] = { request: body, accepted: false }; await writeFile(path, JSON.stringify(data))
    return response({ version: 1, requestId: body.requestId, scope: body.scope, preparedAt: now, prepareExpiresAt: instant(Date.parse(now) + 86400000), serverNow: now })
  }
  if (url.pathname.endsWith('/confirm')) {
    const receipt = data.receipts[body.requestId]; assert(receipt)
    if (control.expired) return response({ version: 1, error: 'deletion_prepare_expired' }, 409)
    receipt.accepted = true; data.deleted = true; await writeFile(path, JSON.stringify(data))
    if (control.loseConfirm) throw Error('Synthetic lost accepted confirm response')
    return response(progress(receipt))
  }
  assert(url.pathname.endsWith('/deletion-receipt')); assert(!headers.has('authorization'))
  const receipt = data.receipts[body.requestId]; assert(receipt); assert.equal(sha256Hex(unhex(body.secret)), receipt.request.receiptDigest)
  return response(progress(receipt))
}
function progress(receipt: any) {
  return { version: 1, requestId: receipt.request.requestId, scope: receipt.request.scope, serverNow: data.at, accepted: receipt.accepted, confirmedAt: receipt.accepted ? data.at : null, onlineDeleteBy: receipt.accepted ? instant(Date.parse(data.at) + 7 * 86400000) : null, statusExpiresAt: instant(Date.parse(data.at) + 30 * 86400000), intent: receipt.accepted ? 'durable' : 'not_started', content: receipt.accepted ? 'deleted' : 'not_started', auth: receipt.request.scope === 'cloud' ? 'not_applicable' : receipt.accepted ? 'deleted' : 'not_started', renewal: receipt.request.scope === 'cloud' ? 'not_applicable' : receipt.accepted ? control.renewal : 'not_started' }
}
