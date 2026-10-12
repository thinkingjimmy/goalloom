import { randomUUID } from 'expo-crypto'
import { parseSyncOp, syncOpPayload } from '@goalloom/contracts'
import { parityDigest, parityTranscript, sha256Hex } from '@goalloom/crypto'
import { mergeRemoteOps, rebuildVisibleFull } from '@goalloom/store-core'
import { runLocalPrototype } from '@goalloom/sync'
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
  const lines = new Set(parityTranscript().split('\n'))
  assert(lines.has('ed25519.pub d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'), 'ed25519 public')
  assert(lines.has('ed25519.sig e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b'), 'ed25519 sign')
  assert(lines.has('x25519.shared 4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742'), 'x25519')
  assert(lines.has('hkdf.okm 3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865'), 'hkdf')
  assert(lines.has(`xchacha.ct ${vectors.xchacha.ct}`), 'xchacha')
  assert(lines.has(`c1.pt ${vectors.c1.pt}`), 'c1')
  assert(lines.has(`op.pt ${vectors.op.pt}`), 'op')
  assert(lines.has(`snap.pt ${vectors.snap.pt}`), 'snap')
  assert(lines.has(`uuidv5 ${vectors.uuid}`), 'uuidv5')
  assert([...lines].some(line => line.startsWith('canon ') && line.includes('"title":"offline"')), 'canonical sync op')
  assert([...lines].some(line => line.startsWith('hash ') && line.length === 69), 'payload hash')
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

let protoDb = 0

function openProto() {
  protoDb += 1
  const db = openFresh(`phase0-proto-${protoDb}.db`)
  installV9(db, 'phone', at)
  return { driver: expoDriver(db), host, close() { db.closeSync() } }
}

export function runPhase0() {
  let digest = ''
  try {
    digest = parityDigest()
    console.log(`digest ${digest}`)
  } catch (error) {
    digest = error instanceof Error ? error.message : String(error)
  }
  const rows = [
    { name: 'parity digest', ok: /^[0-9a-f]{64}$/.test(digest), ms: 0, detail: digest },
    timed('pinned vectors', vectorsChecks),
    timed('reference rebuild', rebuildChecks),
    ...runLocalPrototype(openProto),
  ]
  for (const row of rows) console.log(`${row.ok ? 'pass' : 'fail'}  ${row.name}  ${row.ms}ms${row.detail ? `  ${row.detail}` : ''}`)
  return rows
}
