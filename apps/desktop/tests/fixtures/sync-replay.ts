/**
 * [INPUT]: Production repository, encrypted sync exchange and two isolated SQLite workspaces.
 * [OUTPUT]: Relationship/group nesting convergence, atomic rejection and storage-failure retry evidence.
 * [POS]: Sync replay E2E fixture; the remote is synthetic and never receives plaintext.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { arch, cpus, platform, release, tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { type Action, type SyncOp } from '@goalloom/contracts'
import { publicFromSeed, unhex, utf8 } from '@goalloom/crypto'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import {
  absorbOpened, bootstrapWorkspace, createMemoryWorld, exchange, joinWorkspace, memoryCiphertext, memoryRemote,
  newDeviceSecret, pullOpened, sealOpWire, syncCursor, type BoundWorkspace, type MemoryWorld,
} from '@goalloom/sync'
import { openDatabase, verifyDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { syncHost } from '../../src/main/sync/host'
import type { CommandInput } from '../../src/shared/contracts/commands'

const at = '2026-10-15T02:00:00.000Z'
const evidence = process.argv[2]!
const temporary = mkdtempSync(join(tmpdir(), 'goalloom-sync-replay-'))
mkdirSync(evidence, { recursive: true })
type LocalCommand<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
const checks: string[] = []
const report = {
  passed: false, checks,
  scope: 'Two isolated desktop repositories, real Electron SQLite and encrypted protocol; synthetic remote, no native UI, live provider or packaged acceptance.',
  runtime: { electron: process.versions.electron, node: process.versions.node, sqlite: '' },
  environment: {
    platform: platform(), release: release(), arch: arch(), cpu: cpus()[0]?.model,
    macOS: platform() === 'darwin' ? spawnSync('sw_vers', ['-productVersion'], { encoding: 'utf8' }).stdout.trim() : null,
    machineScope: 'Physical/VM status not independently verified',
  },
  failure: null as string | null,
}

function machine(name: string) {
  const db = openDatabase(join(temporary, `${name}.sqlite`))
  migrate(db)
  const repo = new Repository(db, { now: () => at })
  const run = (command: LocalCommand<CommandInput>) => repo.execute({
    ...command, operationId: randomUUID(), generation: repo.store.workspace().generation,
  } as CommandInput)
  run({ type: 'confirmSetup', timezone: 'Asia/Singapore', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-21' }, confirmed: true })
  return { db, repo, run, driver: nodeSqlDriver(db), host: syncHost(db) }
}

async function register(world: MemoryWorld, name: string) {
  const remote = memoryRemote(world, name)
  const secret = newDeviceSecret()
  const deviceId = await remote.registerDevice({
    name, platform: 'macos', signPub: publicFromSeed('ed25519', secret.signSk), boxPub: publicFromSeed('x25519', secret.boxSk),
  })
  return { remote, secret, deviceId }
}

const first = machine('alpha'), second = machine('beta')
type Machine = typeof first
type Peer = Awaited<ReturnType<typeof register>>
function push(machine: Machine, peer: Peer, bound: BoundWorkspace) {
  return exchange({
    ...peer, driver: machine.driver, host: machine.host, workspaceId: bound.workspaceId,
    generation: bound.generation, epoch: bound.epoch, workspaceKey: bound.workspaceKey, at,
  })
}

function board(machine: Machine) {
  return {
    items: machine.db.prepare(`SELECT i.id,i.title,i.description,i.status,p.horizon,p.periodId,p.nestingParentId,p.sortKey
      FROM items i JOIN item_placements p ON p.itemId=i.id ORDER BY i.id`).all(),
    edges: machine.db.prepare('SELECT id,parentId,childId FROM item_relations WHERE invalidatedAt IS NULL ORDER BY id').all(),
  }
}

async function run(): Promise<void> {
  report.runtime.sqlite = String(first.db.prepare('SELECT sqlite_version() AS version').get()?.version)
  const world = createMemoryWorld()
  const alpha = await register(world, 'alpha'), beta = await register(world, 'beta')
  const bound = await bootstrapWorkspace({ ...alpha, driver: first.driver, host: first.host, password: 'replay-password', at })
  const parent = first.run({ type: 'create', title: 'Shared monthly goal', horizon: 'month', flowColor: 0 }).itemId!
  const child = first.run({ type: 'create', title: 'Shared daily task', horizon: 'day' }).itemId!
  const other = first.run({ type: 'create', title: 'Independent task', horizon: 'day' }).itemId!
  await push(first, alpha, bound)
  const joined = await joinWorkspace({ ...beta, driver: second.driver, host: second.host, password: 'replay-password', choice: 'use-remote', at })
  const link = (machine: Machine) => machine.run({
    type: 'link', parentId: parent, childId: child,
    expectedParentVersion: machine.repo.store.item(parent).version, expectedChildVersion: machine.repo.store.item(child).version,
  })
  link(first)
  const duplicate = link(second)
  const text = second.repo.store.item(other)
  second.run({ type: 'edit', itemId: other, expectedVersion: text.version, title: 'Kept independent edit', description: 'Saved notes', dueDate: null })
  await push(first, alpha, bound)
  const incoming = await pullOpened({ ...beta, workspaceId: joined.workspaceId, workspaceKey: joined.workspaceKey, after: syncCursor(second.driver) })
  absorbOpened(second.driver, second.host, incoming, at)
  assert.equal(second.db.prepare('SELECT state FROM sync_ops WHERE opId=?').get(duplicate.operationId)?.state, 'never_sent')
  assert.equal(second.repo.store.item(other).title, 'Kept independent edit')
  assert.equal(board(second).edges.length, 1)
  checks.push('Pending duplicate replay keeps its receipt, the existing edge and later local edits')

  await push(second, beta, joined)
  await push(first, alpha, bound)
  assert.deepEqual(board(first), board(second))
  for (const machine of [first, second]) {
    assert.equal(machine.db.prepare('SELECT code FROM sync_conflicts WHERE opId=?').get(duplicate.operationId)?.code, 'relation_exists')
    assert.equal(machine.db.prepare('SELECT count(*) AS n FROM sync_ops WHERE state IN (\'never_sent\',\'send_unknown\',\'accepted\')').get()?.n, 0)
    assert.equal(machine.repo.store.item(other).description, 'Saved notes')
  }
  checks.push('Concurrent offline links converge, reject one duplicate and keep the following edit')

  async function inject(actions: Action[]): Promise<SyncOp> {
    const op: SyncOp = { v: 1, opId: randomUUID(), deviceId: alpha.deviceId, at, actions }
    const wire = sealOpWire({ op, workspaceKey: bound.workspaceKey, workspaceId: bound.workspaceId, epoch: bound.epoch })
    const receipts = await alpha.remote.pushOps({ workspaceId: bound.workspaceId, deviceId: alpha.deviceId, generation: bound.generation, ops: [wire] })
    assert.equal(receipts[0]?.error, undefined)
    return op
  }
  const compound = await inject([
    { t: 'item.set', id: other, fields: { title: 'Must roll back' } },
    { t: 'rel.link', id: randomUUID(), parentId: parent, childId: child },
    { t: 'item.set', id: other, fields: { description: 'Must also roll back' } },
  ])
  const existing = board(first).edges[0]!
  const reused = await inject([{ t: 'rel.link', id: String(existing.id), parentId: parent, childId: other }])
  await inject([{ t: 'item.set', id: child, fields: { title: 'A later valid edit' } }])
  await push(first, alpha, bound); await push(second, beta, joined)
  for (const machine of [first, second]) {
    assert.equal(machine.repo.store.item(other).title, 'Kept independent edit')
    assert.equal(machine.repo.store.item(other).description, 'Saved notes')
    assert.equal(machine.repo.store.item(child).title, 'A later valid edit')
    for (const op of [compound, reused]) {
      assert.equal(machine.db.prepare('SELECT code FROM sync_conflicts WHERE opId=?').get(op.opId)?.code, 'relation_exists')
      assert.equal(machine.db.prepare('SELECT count(*) AS n FROM canon_changes WHERE seq=(SELECT seq FROM canon_ops WHERE opId=?)').get(op.opId)?.n, 0)
    }
    assert.deepEqual(board(machine).edges, [existing])
  }
  checks.push('Compound duplicates roll back all their fields; edge-id collisions preserve the original edge')

  const cursor = syncCursor(first.driver)
  const before = board(first)
  const beforeConflicts = first.db.prepare('SELECT count(*) AS n FROM sync_conflicts').get()?.n
  await inject([{ t: 'item.set', id: other, fields: { title: 'Retry after storage recovery' } }])
  await inject([{ t: 'item.set', id: child, fields: { title: 'Injected storage failure' } }])
  first.db.exec(`CREATE TRIGGER replay_storage_failure BEFORE UPDATE ON base_items WHEN NEW.title='Injected storage failure'
    BEGIN SELECT RAISE(ABORT,'injected storage failure'); END;`)
  await assert.rejects(push(first, alpha, bound), /injected storage failure/)
  assert.equal(syncCursor(first.driver), cursor)
  assert.deepEqual(board(first), before)
  assert.equal(first.db.prepare('SELECT count(*) AS n FROM sync_conflicts').get()?.n, beforeConflicts)
  first.db.exec('DROP TRIGGER replay_storage_failure')
  await push(first, alpha, bound); await push(second, beta, joined)
  assert.equal(first.repo.store.item(other).title, 'Retry after storage recovery')
  assert.deepEqual(board(first), board(second))
  checks.push('Unknown storage errors roll back the entire batch and cursor; a later retry succeeds')

  const capture = (title: string) => {
    const generation = first.repo.store.workspace().generation
    const request = { requestId: randomUUID(), draftSessionId: randomUUID(), inputRevision: 1, manualRevision: 0, generation, providerRevision: 1,
      contextRevision: first.repo.store.workspace().revision, referenceTime: at, text: title, parentHints: [] }
    const receipt = first.run({ type: 'create', title, horizon: 'later', smartCapture: { request, allowPlacement: true, allowParents: true } })
    return { request, receipt }
  }
  const complete = (value: ReturnType<typeof capture>) => first.repo.execute({ type: 'completeCreation', operationId: randomUUID(), generation: first.repo.store.workspace().generation,
    creationOperationId: value.receipt.operationId, requestId: value.request.requestId, itemId: value.receipt.itemId,
    expectedVersion: value.receipt.capture!.itemVersion, expectedPlacementVersion: value.receipt.capture!.placementVersion,
    selection: { horizon: 'day', previewPeriodId: first.repo.snapshot().periods.find(period => period.horizon === 'day')!.id,
      parents: [{ itemId: parent, title: 'Shared monthly goal', horizon: 'month', parentIds: [] }] } })
  const saved = capture('Async bilingual delivery 中文 URL https://example.test/delivery')
  await push(first, alpha, bound); await push(second, beta, joined)
  const completed = complete(saved)
  assert(completed.changed && !completed.undoable)
  await push(first, alpha, bound); await push(second, beta, joined)
  assert.equal(second.repo.store.item(saved.receipt.itemId!).placement.horizon, 'day')
  assert(second.repo.store.relations().some(edge => edge.childId === saved.receipt.itemId && edge.parentId === parent))
  const peerEdit = second.repo.store.item(saved.receipt.itemId!)
  second.run({ type: 'edit', itemId: peerEdit.id, expectedVersion: peerEdit.version, title: 'Peer text survives grouped undo', description: 'Peer notes', dueDate: null })
  await push(second, beta, joined); await push(first, alpha, bound)
  const undone = first.run({ type: 'undo', originalOperationId: saved.receipt.operationId })
  assert.equal(undone.outcome, 'committed')
  await push(first, alpha, bound); await push(second, beta, joined)
  for (const machine of [first, second]) {
    const item = machine.repo.store.item(saved.receipt.itemId!)
    assert(item.deletedAt)
    assert.equal(item.title, 'Peer text survives grouped undo')
    assert.equal(item.placement.horizon, 'day')
    assert(!machine.repo.store.relations().some(edge => edge.childId === item.id))
  }
  first.run({ type: 'restoreItem', itemId: saved.receipt.itemId!, expectedVersion: first.repo.store.item(saved.receipt.itemId!).version, deletionSource: undone.operationId })
  await push(first, alpha, bound); await push(second, beta, joined)
  assert(second.repo.store.relations().some(edge => edge.childId === saved.receipt.itemId && edge.parentId === parent))
  assert.equal(second.repo.store.item(saved.receipt.itemId!).description, 'Peer notes')
  checks.push('Encrypted late completion, grouped creation undo and scoped restore converge while preserving a later peer text edit')

  const race = capture('Pending capture before a peer edit')
  await push(first, alpha, bound); await push(second, beta, joined)
  for (const title of ['Peer changed this', 'Pending capture before a peer edit']) {
    const item = second.repo.store.item(race.receipt.itemId!)
    second.run({ type: 'edit', itemId: item.id, expectedVersion: item.version, title, description: 'Manual notes win', dueDate: null })
  }
  await push(second, beta, joined)
  const staleCompletion = complete(race)
  assert(staleCompletion.changed, 'The offline writer has not seen the peer edit yet')
  await push(first, alpha, bound); await push(second, beta, joined)
  for (const machine of [first, second]) {
    assert.equal(machine.repo.store.item(race.receipt.itemId!).placement.horizon, 'later')
    assert.equal(machine.repo.store.item(race.receipt.itemId!).description, 'Manual notes win')
    assert(!machine.repo.store.relations().some(edge => edge.childId === race.receipt.itemId))
    assert.equal(machine.db.prepare('SELECT code FROM sync_conflicts WHERE opId=?').get(staleCompletion.operationId)?.code, 'revert_superseded')
  }
  checks.push('A remote edit and edit-back atomically reject stale automatic placement and parents')
  const groupTarget = first.run({ type: 'create', title: 'A synced destination', horizon: 'week' }).itemId!
  const groupRoot = first.run({ type: 'create', title: 'B synced group', horizon: 'day' }).itemId!
  const groupChildren = ['C synced child', 'D synced child'].map(title => first.run({ type: 'create', title, horizon: 'day' }).itemId!)
  const nest = (id: string, parentId: string) => {
    const item = first.repo.store.item(id), target = first.repo.store.item(parentId)
    return first.run({ type: 'nest', itemId: id, parentId, expectedVersion: item.version, expectedPlacementVersion: item.placement.version,
      expectedParentVersion: target.version, expectedParentPlacementVersion: target.placement.version })
  }
  for (const id of groupChildren) nest(id, groupRoot)
  await push(first, alpha, bound); await push(second, beta, joined)
  const flattened = nest(groupRoot, groupTarget)
  await push(first, alpha, bound); await push(second, beta, joined)
  for (const machine of [first, second]) assert.deepEqual(machine.repo.store.nestedItems(groupTarget).map(item => item.id), [groupRoot, ...groupChildren])
  assert.equal(first.run({ type: 'undo', originalOperationId: flattened.operationId }).outcome, 'committed')
  await push(first, alpha, bound); await push(second, beta, joined)
  for (const machine of [first, second]) {
    assert.equal(machine.repo.store.item(groupRoot).placement.nestingParentId, null)
    assert.equal(machine.repo.store.item(groupRoot).placement.horizon, 'day')
    assert.deepEqual(machine.repo.store.nestedItems(groupRoot).map(item => item.id), groupChildren)
  }
  checks.push('Encrypted group nesting flattens B/C/D under A in order and one undo restores the original group on both peers')
  for (const machine of [first, second]) verifyDatabase(machine.db)
  assert.equal(Buffer.from(unhex(memoryCiphertext(world))).includes(Buffer.from(utf8('Shared monthly goal'))), false)
  checks.push('Both workspaces pass integrity/foreign-key checks; remote ciphertext does not contain task text')
  report.passed = true
}

run().catch(error => {
  report.failure = error instanceof Error ? error.stack ?? error.message : String(error)
  process.exitCode = 1
}).finally(() => {
  first.db.close(); second.db.close()
  rmSync(temporary, { recursive: true, force: true })
  writeFileSync(join(evidence, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report, null, 2))
})
