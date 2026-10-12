/**
 * [INPUT]: A factory that opens a fresh v9 database. No network and no clock.
 * [OUTPUT]: Six scenario rows. Snapshot join also seals the body (C4) and checks adversarial cases 7 and 8.
 * [POS]: The local half of the phase 0 prototype. Electron and Hermes call this with their own drivers.
 */
import { parseSyncOp, syncOpPayload, type SyncOp } from '@goalloom/contracts'
import { counterRandom, hex, openOp, openSnapshot, publicFromSeed, sealOp, sealSnapshot, sha256Hex, unhex, unwrap, utf8, wrap } from '@goalloom/crypto'
import {
  applySyncOp, exportCanonicalSnapshot, installCanonicalSnapshot, markAccepted, markSendUnknown,
  mergeRemoteOps, projectionHash, rebuildVisibleFull, type ApplyHost, type SqlDriver,
} from '@goalloom/store-core'
import { applyPushReceipts } from './receipts'
import { rejectMissingKey, rejectUnknownFormat } from './pause'

const at = '2026-09-23T02:00:00.000Z'
const itemA = 'item-a'
const itemB = 'item-b'
const workspaceId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const generation = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const workspaceKey = unhex('44'.repeat(32))

export interface ProtoBox {
  driver: SqlDriver
  host: ApplyHost
  close(): void
}

export interface PrototypeRow {
  name: string
  ok: boolean
  ms: number
  detail: string
}

export function rejectStaleEpoch(opEpoch: number, currentEpoch: number): void {
  if (opEpoch !== currentEpoch) throw new Error('stale_epoch')
}

export function snapshotPlaintext(body: unknown): string {
  return JSON.stringify(body, (_key, value) => typeof value === 'bigint' ? Number(value) : value)
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function createOp(opId: string, id: string, title: string, afterId: string | null): SyncOp {
  return parseSyncOp({
    v: 1, opId, deviceId: 'device-a', at,
    actions: [{ t: 'item.create', id, title, description: '', dueDate: null, horizon: 'later', periodKey: null, sortHint: { afterId, beforeId: null } }],
  })
}

function remember(driver: SqlDriver, op: SyncOp): void {
  const payload = syncOpPayload(op)
  const order = Number(driver.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()?.n ?? 0) + 1
  driver.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
    VALUES (?,?,'local',1,?,?,?,?, 'never_sent', ?, ?)`).run(op.opId, order, payload, sha256Hex(payload), op.deviceId, op.at, at, at)
}

function titles(driver: SqlDriver): string[] {
  return driver.prepare(`SELECT i.title AS title FROM items i JOIN item_placements p ON p.itemId=i.id
    WHERE i.deletedAt IS NULL ORDER BY p.sortKey, i.id`).all().map(row => String(row.title))
}

function withBoxes(open: () => ProtoBox, count: number, fn: (boxes: ProtoBox[]) => void): void {
  const boxes: ProtoBox[] = []
  try {
    for (let index = 0; index < count; index += 1) boxes.push(open())
    fn(boxes)
  } finally {
    for (const box of boxes) box.close()
  }
}

function scenario(name: string, fn: () => void): PrototypeRow {
  const start = Date.now()
  try {
    fn()
    return { name, ok: true, ms: Date.now() - start, detail: '' }
  } catch (error) {
    return { name, ok: false, ms: Date.now() - start, detail: error instanceof Error ? error.message : String(error) }
  }
}

function offlineEdit(open: () => ProtoBox): void {
  withBoxes(open, 2, ([a, b]) => {
    assert(a && b, 'two clients')
    const op = createOp('11111111-1111-4111-8111-111111111111', itemA, 'offline', null)
    applySyncOp(a.driver, op, 'visible', a.host)
    remember(a.driver, op)
    assert(titles(a.driver).join(',') === 'offline', 'offline title is visible before push')
    assert(!a.driver.prepare('SELECT title FROM base_items WHERE id=?').get(itemA), 'base stays empty while offline')
    assert(titles(b.driver).length === 0, 'peer has not pulled')
    mergeRemoteOps(a.driver, [{ seq: 1, op }], a.host, at)
    mergeRemoteOps(b.driver, [{ seq: 1, op }], b.host, at)
    assert(a.driver.prepare('SELECT title FROM base_items WHERE id=?').get(itemA)?.title === 'offline', 'author base caught up')
    assert(b.driver.prepare('SELECT title FROM base_items WHERE id=?').get(itemA)?.title === 'offline', 'peer applied the edit')
    assert(String(a.driver.prepare('SELECT state FROM sync_ops WHERE opId=?').get(op.opId)?.state) === 'applied', 'local row became applied')
  })
}

function pinGeneration(box: ProtoBox): void {
  box.driver.prepare('UPDATE workspace SET generation=? WHERE id=1').run(generation)
  box.driver.prepare('UPDATE base_workspace SET generation=? WHERE id=1').run(generation)
}

function reorder(open: () => ProtoBox): void {
  withBoxes(open, 2, ([a, b]) => {
    assert(a && b, 'two clients')
    pinGeneration(a)
    pinGeneration(b)
    const first = createOp('22222222-2222-4222-8222-222222222222', itemA, 'A', null)
    const second = createOp('33333333-3333-4333-8333-333333333333', itemB, 'B', itemA)
    const place = parseSyncOp({
      v: 1, opId: '44444444-4444-4444-8444-444444444444', deviceId: 'device-a', at,
      actions: [{ t: 'item.place', id: itemB, horizon: 'later', periodKey: null, sortHint: { afterId: null, beforeId: itemA }, reason: 'arrange' }],
    })
    applySyncOp(a.driver, first, 'visible', a.host)
    applySyncOp(a.driver, second, 'visible', a.host)
    applySyncOp(a.driver, place, 'visible', a.host)
    assert(titles(a.driver).join(',') === 'B,A', 'local order before push')
    assert(titles(b.driver).length === 0, 'peer order is still empty')
    const batch = [{ seq: 1, op: first }, { seq: 2, op: second }, { seq: 3, op: place }]
    mergeRemoteOps(a.driver, batch, a.host, at)
    mergeRemoteOps(b.driver, batch, b.host, at)
    assert(titles(a.driver).join(',') === 'B,A', 'author order after sync')
    assert(titles(b.driver).join(',') === titles(a.driver).join(','), 'peer order matches')
    assert(projectionHash(a.driver, 'base') === projectionHash(b.driver, 'base'), 'base hash matches')
  })
}

function conflictReject(open: () => ProtoBox): void {
  withBoxes(open, 1, ([box]) => {
    assert(box, 'client')
    const created = createOp('55555555-5555-4555-8555-555555555555', itemA, 'kept', null)
    mergeRemoteOps(box.driver, [{ seq: 1, op: created }], box.host, at)
    const rejected = parseSyncOp({
      v: 1, opId: '66666666-6666-4666-8666-666666666666', deviceId: 'device-b', at,
      actions: [{ t: 'item.set', id: 'missing', fields: { title: 'nope' } }],
    })
    mergeRemoteOps(box.driver, [{ seq: 2, op: rejected }], box.host, at)
    assert(box.driver.prepare('SELECT outcome FROM canon_ops WHERE seq=2').get()?.outcome === 'rejected', 'canon outcome rejected')
    assert(box.driver.prepare('SELECT code FROM sync_conflicts WHERE seq=2').get()?.code === 'item_deleted', 'conflict code')
    assert(box.driver.prepare('SELECT title FROM items WHERE id=?').get(itemA)?.title === 'kept', 'existing title unchanged')
  })
}

function crashRecovery(open: () => ProtoBox): void {
  withBoxes(open, 1, ([box]) => {
    assert(box, 'client')
    const op = createOp('77777777-7777-4777-8777-777777777777', itemA, 'recovered', null)
    applySyncOp(box.driver, op, 'visible', box.host)
    remember(box.driver, op)
    markSendUnknown(box.driver, [op.opId], 'attempt-1', at)
    rebuildVisibleFull(box.driver, box.host)
    assert(titles(box.driver).join(',') === 'recovered', 'title survives the lost response')
    assert(String(box.driver.prepare('SELECT state FROM sync_ops WHERE opId=?').get(op.opId)?.state) === 'send_unknown', 'state stays send_unknown')
    const pending = [{ opId: op.opId, payloadHash: sha256Hex(syncOpPayload(op)) }]
    const receipt = { opId: op.opId, payloadHash: pending[0]!.payloadHash, seq: 1, duplicate: true }
    assert(applyPushReceipts(pending, [receipt])[0]?.seq === 1, 'first receipt seq')
    assert(applyPushReceipts(pending, [receipt])[0]?.seq === 1, 'retry keeps the same seq')
    markAccepted(box.driver, op.opId, 1, at)
    assert(Number(box.driver.prepare('SELECT count(*) AS n FROM sync_ops WHERE opId=?').get(op.opId)?.n) === 1, 'one local row')
    mergeRemoteOps(box.driver, [{ seq: 1, op }], box.host, at)
    assert(box.driver.prepare('SELECT title FROM base_items WHERE id=?').get(itemA)?.title === 'recovered', 'base has the recovered item')
    assert(String(box.driver.prepare('SELECT state FROM sync_ops WHERE opId=?').get(op.opId)?.state) === 'applied', 'row is applied once')
  })
}

function keyRotation(): void {
  const op = parseSyncOp({
    v: 1, opId: '88888888-8888-4888-8888-888888888888', deviceId: 'device-a', at,
    actions: [{ t: 'item.set', id: itemA, fields: { title: 'rotated' } }],
  })
  const payload = syncOpPayload(op)
  const hash = sha256Hex(payload)
  const plain = utf8(payload)
  const epoch1 = sealOp({ workspaceKey, workspaceId, opId: op.opId, epoch: 1, plaintext: plain, random: counterRandom(unhex('11'.repeat(32))) })
  const epoch2 = sealOp({ workspaceKey, workspaceId, opId: op.opId, epoch: 2, plaintext: plain, random: counterRandom(unhex('11'.repeat(32))) })
  assert(hex(epoch1) !== hex(epoch2), 'epochs produce different ciphertext')
  assert(sha256Hex(payload) === hash, 'payload hash is unchanged by encryption')
  const opened1 = new TextDecoder().decode(openOpCipher(epoch1, 1, op.opId))
  const opened2 = new TextDecoder().decode(openOpCipher(epoch2, 2, op.opId))
  assert(opened1 === payload && opened2 === payload, 'each epoch opens to the same payload')
  assert(throws(() => openOpCipher(epoch2, 1, op.opId)), 'epoch 1 cannot open epoch 2')
  rejectStaleEpoch(1, 1)
  assert(throws(() => rejectStaleEpoch(1, 2)), 'stale_epoch')
  rejectStaleEpoch(2, 2)
  const signSk = unhex('33'.repeat(32))
  const boxSk = unhex('22'.repeat(32))
  const envelope = wrap({
    senderId: 'device-a', signSk, recipientId: 'device-b', recipientBoxPub: publicFromSeed('x25519', boxSk),
    ctx: `wk|${workspaceId}|2`, plaintext: workspaceKey, random: counterRandom(unhex('55'.repeat(32))),
  })
  const openedKey = unwrap(envelope, {
    expectedCtx: `wk|${workspaceId}|2`, recipientId: 'device-b', boxSk, senderSignPub: publicFromSeed('ed25519', signSk),
  })
  assert(hex(openedKey) === hex(workspaceKey), 'epoch 2 envelope opens to the workspace key')
  assert(throws(() => unwrap(envelope, {
    expectedCtx: `wk|${workspaceId}|1`, recipientId: 'device-b', boxSk, senderSignPub: publicFromSeed('ed25519', signSk),
  })), 'previous epoch context is rejected')
}

function openOpCipher(ciphertext: Uint8Array, epoch: number, opId: string): Uint8Array {
  return openOp({ workspaceKey, workspaceId, opId, epoch, ciphertext })
}

function throws(fn: () => unknown): boolean {
  try { fn(); return false } catch { return true }
}

function snapshotJoin(open: () => ProtoBox): void {
  withBoxes(open, 3, ([source, target, paused]) => {
    assert(source && target && paused, 'three clients')
    source.driver.prepare('UPDATE workspace SET generation=? WHERE id=1').run(generation)
    source.driver.prepare('UPDATE base_workspace SET generation=? WHERE id=1').run(generation)
    const created = createOp('99999999-9999-4999-8999-999999999999', itemA, 'snap', null)
    mergeRemoteOps(source.driver, [{ seq: 1, op: created }], source.host, at)
    const body = exportCanonicalSnapshot(source.driver, { workspaceId, uptoSeq: 1, keyEpoch: 1 })
    const plain = snapshotPlaintext(body)
    const ct = sealSnapshot({
      workspaceKey, workspaceId, uptoSeq: 1, epoch: 1, plaintext: utf8(plain), random: counterRandom(unhex('22'.repeat(32))),
    })
    const opened = new TextDecoder().decode(openSnapshot({ workspaceKey, workspaceId, uptoSeq: 1, epoch: 1, ciphertext: ct }))
    assert(opened === plain, 'snapshot plaintext round-trips')
    assert(throws(() => openSnapshot({ workspaceKey, workspaceId, uptoSeq: 2, epoch: 1, ciphertext: ct })), 'wrong uptoSeq is rejected')
    const minted = String(target.driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation)
    installCanonicalSnapshot(target.driver, JSON.parse(opened), at)
    assert(String(target.driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation) === generation, 'generation comes from the snapshot')
    assert(minted !== generation, 'the joiner had minted a different generation')
    assert(projectionHash(target.driver, 'base') === projectionHash(source.driver, 'base'), 'base hash matches after join')
    assert(Number(target.driver.prepare('SELECT lastAppliedSeq AS seq FROM sync_state WHERE id=1').get()?.seq) === 1, 'cursor resumes at uptoSeq')
    applySyncOp(paused.driver, created, 'visible', paused.host)
    assert(throws(() => rejectUnknownFormat(paused.driver, 2, at)), 'unknown format pauses')
    assert(paused.driver.prepare('SELECT paused FROM sync_state').get()?.paused === 'unsupported_version', 'pause reason')
    assert(paused.driver.prepare('SELECT title FROM items WHERE id=?').get(itemA)?.title === 'snap', 'local row kept after pause')
    assert(throws(() => rejectMissingKey(paused.driver, false, at)), 'missing key pauses')
    assert(paused.driver.prepare('SELECT paused FROM sync_state').get()?.paused === 'key_missing', 'key pause replaces the reason')
    assert(paused.driver.prepare('SELECT title FROM items WHERE id=?').get(itemA)?.title === 'snap', 'local row kept when the key is missing')
  })
}

export function runLocalPrototype(open: () => ProtoBox): PrototypeRow[] {
  return [
    scenario('offline edit', () => offlineEdit(open)),
    scenario('reorder', () => reorder(open)),
    scenario('conflict reject', () => conflictReject(open)),
    scenario('crash recovery', () => crashRecovery(open)),
    scenario('key rotation', () => keyRotation()),
    scenario('snapshot join', () => snapshotJoin(open)),
  ]
}
