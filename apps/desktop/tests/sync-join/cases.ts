/**
 * [INPUT]: Real production service/SDK/SQLite peers with a controlled encrypted HTTP cloud.
 * [OUTPUT]: Repeatable first-join, relogin, tombstone and failure reports.
 * [POS]: Feature E2E; the declared failure cases precede the implementation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, cp, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir, cpus, release, arch } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createCloud } from '../sync-cost/cloud'
import { calendar, closePeer, command, openPeer, password, seedLocal, settle, sql, tasks } from './peer'

async function main() {
const out = resolve('output/tests/sync-join'); await mkdir(out, { recursive: true })
const temporary = await mkdtemp(join(tmpdir(), 'goalloom-sync-join-'))
const cloud = await createCloud(), peers: any[] = []
const report: any = { ok: false, checks: [], runtime: process.versions, host: { os: release(), arch: arch(), cpu: cpus()[0]?.model },
  scope: 'Source Electron Node runtime, production SyncService/SDK/storage/SQLite, synthetic OS cipher and encrypted HTTP cloud; no live Google, hosted SQL, packaged or Windows acceptance.' }
const check = (label: string) => { report.checks.push(label); console.log(label) }
async function open(name: string, count = 0, aged = false) {
  const profile = join(temporary, name); await seedLocal(profile, name, count, cloud, aged)
  const peer = await openPeer(profile, name); peers.push(peer); return peer
}
async function signIn(peer: any) { await peer.service.handle({ type: 'sign-in' }); assert.equal(peer.status.error, null) }
try {
  const a = await open('alpha', 24, true), b = await open('beta')
  const row = (title: string) => sql(a.profile, `SELECT id,version FROM items WHERE title='${title}'`)[0]!
  const root = row('alpha task 0')
  await command(a, { type: 'flowColor', itemId: root.id, expectedVersion: Number(root.version), flowColor: 0 })
  const parent = row('alpha task 0'), child = row('alpha task 1')
  await command(a, { type: 'link', parentId: parent.id, childId: child.id, expectedParentVersion: Number(parent.version), expectedChildVersion: Number(child.version) })
  const done = row('alpha task 2')
  await command(a, { type: 'status', itemId: done.id, expectedVersion: Number(done.version), status: 'done' })
  const archived = row('alpha task 3')
  await command(a, { type: 'archive', itemId: archived.id, expectedVersion: Number(archived.version), archived: true })
  const removed = row('alpha task 4')
  await command(a, { type: 'delete', itemId: removed.id, expectedVersion: Number(removed.version) })
  const reordered = row('alpha task 5'), target = row('alpha task 8')
  const placementVersion = sql(a.profile, `SELECT version FROM item_placements WHERE itemId='${reordered.id}'`)[0]!.version
  await command(a, { type: 'move', itemId: reordered.id, expectedVersion: Number(reordered.version), expectedPlacementVersion: Number(placementVersion), horizon: 'day', beforeId: target.id })
  const order = sql(a.profile, 'SELECT itemId FROM item_placements ORDER BY horizon,periodId,sortKey,itemId')
  const edges = sql(a.profile, 'SELECT id,parentId,childId FROM item_relations WHERE invalidatedAt IS NULL ORDER BY id')
  const before = tasks(a.profile), sourceCalendar = calendar(a.profile)
  const placement = sql(a.profile, 'SELECT itemId,horizon,periodId,nestingParentId FROM item_placements ORDER BY itemId')
  await signIn(b); assert.equal(b.status.phase, 'setup')
  await b.service.handle({ type: 'create', password }); await settle(b)
  assert.equal(b.status.phase, 'ready'); assert.equal(tasks(b.profile).length, 0); assert.equal(b.status.awaitingTasks, true)
  const secretKey = 'ai.key.openrouter', secretValue = 'sk-synthetic-first-join'
  b.keys.set(secretKey, secretValue)
  await b.storage.call('sync', { type: 'emit-settings', mode: 'change', opId: randomUUID(), at: new Date().toISOString(), entries: [{ key: secretKey, value: secretValue }] })
  await settle(b)
  await signIn(a); assert.equal(a.status.phase, 'enter-key')
  await a.service.handle({ type: 'submit-password', password: 'incorrect-password' })
  assert.equal(a.status.error, 'password'); assert.deepEqual(tasks(a.profile), before)
  cloud.controls.fault = 'missing:pull_ops'; cloud.controls.session = 'alpha'
  await a.service.handle({ type: 'submit-password', password })
  assert(a.status.error); assert.deepEqual(tasks(a.profile), before)
  cloud.controls.fault = ''; cloud.controls.session = ''
  const storageCall = a.storage.call.bind(a.storage)
  a.storage.call = async (method: string, action: any) => {
    if (method === 'sync' && action?.type === 'protect') throw Error('Injected backup failure')
    return storageCall(method, action)
  }
  await a.service.handle({ type: 'submit-password', password })
  assert(a.status.error); assert.deepEqual(tasks(a.profile), before)
  a.storage.call = storageCall
  const { DatabaseSync } = await import('node:sqlite')
  const failingDb = new DatabaseSync(join(a.profile, 'workspace.sqlite'))
  failingDb.exec("CREATE TRIGGER fail_join BEFORE DELETE ON items BEGIN SELECT RAISE(ABORT, 'injected storage failure'); END")
  await a.service.handle({ type: 'submit-password', password })
  assert(a.status.error); assert.deepEqual(tasks(a.profile), before); assert.deepEqual(calendar(a.profile), sourceCalendar)
  assert.equal(sql(a.profile, 'SELECT workspaceId FROM sync_state')[0]!.workspaceId, null)
  failingDb.exec('DROP TRIGGER fail_join'); failingDb.close()
  assert.equal(a.keys.has(secretKey), false)
  check('Download, protective-backup and mid-install SQLite failures preserve local tasks, calendar and unbound state')
  await a.service.handle({ type: 'submit-password', password })
  assert.equal(a.status.phase, 'ready', `Case 1 must be ready: ${JSON.stringify(a.status)}`)
  await settle(a, b)
  assert.deepEqual(tasks(a.profile), before); assert.deepEqual(tasks(b.profile), before)
  assert.equal(a.keys.get(secretKey), secretValue)
  assert.deepEqual(sql(b.profile, 'SELECT id,parentId,childId FROM item_relations WHERE invalidatedAt IS NULL ORDER BY id'), edges)
  assert(sql(b.profile, 'SELECT archivedAt FROM items WHERE archivedAt IS NOT NULL').length === 1)
  assert.deepEqual(sql(a.profile, 'SELECT itemId FROM item_placements ORDER BY horizon,periodId,sortKey,itemId'), order)
  assert.deepEqual(calendar(a.profile), sourceCalendar); assert.deepEqual(calendar(b.profile), sourceCalendar)
  assert.deepEqual(sql(a.profile, 'SELECT itemId,horizon,periodId,nestingParentId FROM item_placements ORDER BY itemId'), placement)
  assert((await readdir(join(a.profile, 'backups'))).some(name => name.endsWith('.sqlite')))
  check('Case 1: B registers empty, A automatically uploads 24 tasks with identical IDs, offline-rollover placements, manual order, local tombstones and calendar; B converges; wrong password is nonmutating')

  const head = cloud.world.workspace!.headSeq
  await a.service.handle({ type: 'join', choice: 'merge', acknowledged: true }); await settle(a, b)
  assert.equal(cloud.world.workspace!.headSeq, head)
  await a.service.handle({ type: 'sign-out' }); await signIn(a); await settle(a, b)
  assert.equal(a.status.phase, 'ready'); assert.deepEqual(tasks(a.profile), before)
  assert.equal(cloud.world.workspace!.headSeq, head)
  check('Repeated join and logout/login do not import again, change IDs or append duplicate task operations')

  await a.service.handle({ type: 'sign-out' })
  const edited = sql(a.profile, 'SELECT id,version FROM items WHERE deletedAt IS NULL LIMIT 1')[0]!
  await command(a, { type: 'edit', itemId: edited.id, expectedVersion: Number(edited.version), title: 'Offline edit before cloud deletion', description: '', dueDate: null })
  await closePeer(a); peers.splice(peers.indexOf(a), 1)
  const stale = join(temporary, 'stale-copy'); await cp(a.profile, stale, { recursive: true })
  for (const item of tasks(b.profile).filter(row => !row.deletedAt)) {
    const row = sql(b.profile, `SELECT version FROM items WHERE id='${item.id}'`)[0]!
    await command(b, { type: 'delete', itemId: item.id, expectedVersion: Number(row.version) })
  }
  await settle(b)
  assert(tasks(b.profile).every(row => row.deletedAt)); assert.equal(b.status.awaitingTasks, undefined)
  const returning = await openPeer(a.profile, 'alpha'); peers.push(returning)
  assert.equal(returning.status.phase, 'signed-out'); await signIn(returning); await settle(returning, b)
  assert.equal(tasks(returning.profile).length, before.length)
  assert(tasks(returning.profile).every(row => row.deletedAt))
  check('Restart after logout resumes the existing binding and receives all cloud deletions without resurrecting tasks')

  // Simulate an old local copy without a saved device binding; identities still match cloud tombstones.
  const detached = new DatabaseSync(join(stale, 'workspace.sqlite'))
  detached.exec('UPDATE sync_state SET workspaceId=NULL, deviceId=NULL, keyEpoch=NULL, lastAppliedSeq=0, lastUploadedSeq=0')
  detached.close()
  const copy = await openPeer(stale, 'alpha'); peers.push(copy)
  await signIn(copy)
  if (copy.status.phase === 'enter-key') await copy.service.handle({ type: 'submit-password', password })
  assert.equal(copy.status.phase, 'ready'); await settle(copy, b)
  assert.equal(tasks(copy.profile).length, before.length); assert(tasks(copy.profile).every(row => row.deletedAt))
  check('A detached stale copy recognizes cloud tombstones by task identity and does not reimport them under new IDs')

  const c = await open('gamma', 2), cloudCalendar = calendar(b.profile)
  await signIn(c); await c.service.handle({ type: 'submit-password', password })
  assert.equal(c.status.phase, 'choose', 'An emptied cloud still has task history')
  assert.equal(tasks(c.profile).length, 2)
  await c.service.handle({ type: 'join', choice: 'merge', acknowledged: true }); await settle(c, b, returning)
  assert.deepEqual(calendar(c.profile), cloudCalendar)
  assert.equal(tasks(b.profile).filter(row => !row.deletedAt).length, 2)
  assert.equal(tasks(b.profile).filter(row => row.deletedAt).length, before.length)
  check('A cloud emptied by deletion remains established: independent tasks require merge and do not replace the calendar or deleted items')
  await concurrentJoin(temporary, check)
  await creatorFirst(temporary, check)
  report.ok = true
} catch (error) {
  report.error = error instanceof Error ? error.stack : String(error)
  report.diagnostics = peers.map(peer => ({ status: peer.status, conflicts: sql(peer.profile, 'SELECT seq,code FROM sync_conflicts'), policies: sql(peer.profile, 'SELECT horizon,mode FROM rollover_policies'), rollovers: sql(peer.profile, "SELECT seq,errorCode,json_extract(payload,'$.actions[0]') AS action,json_extract(payload,'$.importedCalendar.id') AS calendar FROM sync_ops WHERE json_extract(payload,'$.actions[0].t')='item.rollover' LIMIT 2"), predecessors: sql(peer.profile, "SELECT seq,json_extract(payload,'$.importedCalendar.id') AS calendar FROM sync_ops WHERE json_extract(payload,'$.actions[0].t')='item.create' LIMIT 2") }))
  throw error
}
finally {
  await writeFile(join(out, 'cases.json'), JSON.stringify(report, null, 2))
  for (const peer of peers) await closePeer(peer).catch(() => {})
  await cloud.close(); await rm(temporary, { recursive: true, force: true })
}

}
async function concurrentJoin(root: string, check: (label: string) => void) {
  const cloud = await createCloud(), peers: any[] = []
  try {
    for (const [name, count] of [['beta', 0], ['alpha', 3], ['delta', 3]] as const) {
      const profile = join(root, 'concurrent', name); await seedLocal(profile, name, count, cloud, name === 'alpha' ? 'baseline' : false)
      const peer = await openPeer(profile, name); peers.push(peer)
      await peer.service.handle({ type: 'sign-in' })
      if (name === 'beta') { await peer.service.handle({ type: 'create', password }); await settle(peer) }
    }
    const [empty, first, second] = peers
    const ids = [...tasks(first.profile), ...tasks(second.profile)].map(row => row.id).sort()
    cloud.controls.blocked = 'push_ops'; cloud.controls.retryAt = Date.now() + 1_000
    for (const peer of [first, second]) {
      await peer.service.handle({ type: 'submit-password', password })
      assert.equal(peer.status.phase, 'ready')
    }
    cloud.controls.blocked = ''
    for (const peer of peers) await peer.clock.advance(90_000)
    await settle(first, second, empty)
    for (const peer of peers) {
      assert.deepEqual(tasks(peer.profile).map(row => row.id).sort(), ids)
      assert.deepEqual(calendar(peer.profile), calendar(first.profile))
      assert.equal(peer.status.conflicts, 0)
    }
    check('Concurrent first joins retain both sets of task IDs and converge on one established calendar without conflicts')
  } finally {
    for (const peer of peers) await closePeer(peer).catch(() => {})
    await cloud.close()
  }
}
async function creatorFirst(root: string, check: (label: string) => void) {
  const cloud = await createCloud(), peers: any[] = []
  try {
    for (const [name, count] of [['alpha', 4], ['beta', 0]] as const) {
      const profile = join(root, 'creator-first', name)
      await seedLocal(profile, name, count, cloud, name === 'alpha')
      peers.push(await openPeer(profile, name))
    }
    const [a, b] = peers
    const rollover = sql(a.profile, "SELECT id FROM operations WHERE kind='rollover' ORDER BY rowid DESC LIMIT 1")[0]!
    await command(a, { type: 'undoBatch', originalOperationId: rollover.id })
    for (const item of sql(a.profile, "SELECT i.id,i.version FROM items i JOIN item_placements p ON p.itemId=i.id WHERE p.horizon='day'")) {
      await command(a, { type: 'delete', itemId: item.id, expectedVersion: Number(item.version) })
    }
    const before = tasks(a.profile)
    const placements = sql(a.profile, 'SELECT itemId,horizon,periodId FROM item_placements ORDER BY itemId')
    await a.service.handle({ type: 'sign-in' }); await a.service.handle({ type: 'create', password }); await settle(a)
    assert.equal(a.status.phase, 'ready'); assert.equal(a.status.error, null)
    await b.service.handle({ type: 'sign-in' }); await b.service.handle({ type: 'submit-password', password }); await settle(a, b)
    for (const peer of peers) {
      assert.deepEqual(tasks(peer.profile), before)
      assert.deepEqual(sql(peer.profile, 'SELECT itemId,horizon,periodId FROM item_placements ORDER BY itemId'), placements)
      assert.equal(sql(peer.profile, 'SELECT horizon FROM rollover_policies').length, 6)
      assert.equal(peer.status.conflicts, 0)
    }
    check('A registers with an existing offline board; B downloads automatically with all policies, undone rollover and deleted tasks preserved')
  } finally {
    for (const peer of peers) await closePeer(peer).catch(() => {})
    await cloud.close()
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1 })
