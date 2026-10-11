import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { randomUUID } from 'expo-crypto'
import { parseSyncOp, syncOpPayload } from '@goalloom/contracts'
import { hex, openOp, openSnapshot, sha256Hex, unhex, unwrap, uuidv5 } from '@goalloom/crypto'
import { mergeRemoteOps, rebuildVisibleFull } from '@goalloom/store-core'
import vectors from '../../../packages/crypto/test/vectors.json'
import { expoDriver, host, installV9, openFresh } from './db'

const at = '2026-09-23T02:00:00.000Z'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function timed(name, fn) {
  const start = Date.now()
  try {
    fn()
    return { name, ok: true, ms: Date.now() - start, detail: '' }
  } catch (error) {
    return { name, ok: false, ms: Date.now() - start, detail: error instanceof Error ? error.message : String(error) }
  }
}

function vectorsChecks() {
  const secret = unhex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
  assert(hex(ed25519.getPublicKey(secret)) === 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a', 'ed25519 public')
  assert(hex(ed25519.sign(new Uint8Array(), secret)) === 'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b', 'ed25519 sign')
  const alice = unhex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a')
  const bobPub = unhex('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f')
  assert(hex(x25519.getSharedSecret(alice, bobPub)) === '4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742', 'x25519')
  const okm = hkdf(sha256, unhex('0b'.repeat(22)), unhex('000102030405060708090a0b0c'), unhex('f0f1f2f3f4f5f6f7f8f9'), 42)
  assert(hex(okm) === '3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865', 'hkdf')
  const x = vectors.xchacha
  assert(hex(xchacha20poly1305(unhex(x.key), unhex(x.nonce), unhex(x.aad)).encrypt(unhex(x.pt))) === x.ct, 'xchacha')
  const c1 = vectors.c1
  assert(hex(unwrap(c1.envelope, { expectedCtx: c1.ctx, recipientId: c1.recipientId, boxSk: unhex(c1.boxSk), senderSignPub: unhex(c1.signPub) })) === c1.pt, 'c1')
  assert(hex(openOp({ workspaceKey: unhex(vectors.op.key), workspaceId: vectors.op.workspaceId, opId: vectors.op.opId, epoch: vectors.op.epoch, ciphertext: unhex(vectors.op.ct) })) === vectors.op.pt, 'op')
  assert(hex(openSnapshot({ workspaceKey: unhex(vectors.snap.key), workspaceId: vectors.snap.workspaceId, uptoSeq: vectors.snap.uptoSeq, epoch: vectors.snap.epoch, ciphertext: unhex(vectors.snap.ct) })) === vectors.snap.pt, 'snap')
  assert(uuidv5('rollover:item:week:2026-09-21@0:week:2026-09-28', '11111111-1111-4111-8111-111111111111') === vectors.uuid, 'uuidv5')
}

function seed(driver, id, title) {
  driver.prepare(`INSERT INTO base_items (id,title,description,dueDate,status,completedAt,cancelledAt,archivedAt,deletedAt,deletedBy,createdAt,updatedAt,version,flowColor)
    VALUES (?,?, '', NULL, 'todo', NULL, NULL, NULL, NULL, NULL, ?, ?, 1, NULL)`).run(id, title, at, at)
  driver.prepare(`INSERT INTO base_item_placements (itemId,horizon,periodId,sortKey,version,holdPeriodId) VALUES (?, 'later', NULL, 0, 1, NULL)`).run(id)
  driver.prepare(`INSERT INTO items (id,title,description,dueDate,status,completedAt,cancelledAt,archivedAt,deletedAt,deletedBy,createdAt,updatedAt,version,flowColor)
    VALUES (?,?, '', NULL, 'todo', NULL, NULL, NULL, NULL, NULL, ?, ?, 1, NULL)`).run(id, title, at, at)
  driver.prepare(`INSERT INTO item_placements (itemId,horizon,periodId,sortKey,version,holdPeriodId) VALUES (?, 'later', NULL, 0, 1, NULL)`).run(id)
}

function pending(driver, op) {
  const payload = syncOpPayload(op)
  const order = Number(driver.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()?.n ?? 0) + 1
  driver.prepare(`INSERT INTO sync_ops (opId,localOrder,origin,formatVersion,payload,payloadHash,deviceId,at,state,createdAt,updatedAt)
    VALUES (?,?,'local',1,?,?,?,?, 'never_sent', ?, ?)`).run(op.opId, order, payload, sha256Hex(payload), op.deviceId, op.at, at, at)
}

function rebuildChecks() {
  const db = openFresh('phase0-checks.db')
  installV9(db, 'device-hermes', at)
  const driver = expoDriver(db)
  seed(driver, 'X', 'X')
  const remote = parseSyncOp({ v: 1, opId: randomUUID(), deviceId: 'other', at, actions: [{ t: 'item.set', id: 'X', fields: { title: 'B' } }] })
  mergeRemoteOps(driver, [{ seq: 1, op: remote }], host, at)
  assert(driver.prepare('SELECT title FROM base_items WHERE id=?').get('X')?.title === 'B', 'base title')
  const localId = randomUUID()
  const local = parseSyncOp({ v: 1, opId: localId, deviceId: 'device-hermes', at, actions: [{ t: 'item.set', id: 'X', fields: { title: 'local' } }] })
  pending(driver, local)
  rebuildVisibleFull(driver, host)
  assert(driver.prepare('SELECT title FROM items WHERE id=?').get('X')?.title === 'local', 'pending title replayed')
  assert(driver.prepare('SELECT title FROM base_items WHERE id=?').get('X')?.title === 'B', 'base kept canonical title')
  const rejected = parseSyncOp({ v: 1, opId: randomUUID(), deviceId: 'other', at, actions: [{ t: 'item.set', id: 'missing', fields: { title: 'nope' } }] })
  mergeRemoteOps(driver, [{ seq: 2, op: rejected }], host, at)
  assert(driver.prepare('SELECT outcome FROM canon_ops WHERE seq=2').get()?.outcome === 'rejected', 'rejected remote op')
  assert(driver.prepare('SELECT title FROM items WHERE id=?').get('X')?.title === 'local', 'rejected op left the local title')
  db.closeSync()
}

export function runPhase0() {
  const rows = [
    timed('pinned vectors', vectorsChecks),
    timed('reference rebuild', rebuildChecks),
  ]
  for (const row of rows) console.log(`${row.ok ? 'pass' : 'fail'}  ${row.name}  ${row.ms}ms${row.detail ? `  ${row.detail}` : ''}`)
  return rows
}
