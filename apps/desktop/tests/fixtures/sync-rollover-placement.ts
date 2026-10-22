/**
 * [INPUT]: Fresh production repositories, injected boundary clocks and encrypted synthetic peer exchange.
 * [OUTPUT]: Automatic/manual/backlog placement, unchanged older order, grouped lifecycle, guarded rollback and undo evidence.
 * [POS]: Sync replay acceptance for placement captured when tasks enter another period; no native UI or user data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 *
 * Failure cases declared before implementation:
 * - Automatic/manual/backlog moves append despite enabled placement, or arrange older destination tasks.
 * - Disabled placement moves into a parent group; explicit insertion is overridden.
 * - Pending/canonical replay loses the committed position or repeated reconcile/exchange duplicates work.
 * - A batch anchors an early move to a task that has not entered the destination yet.
 * - A hidden container with a live child is rejected remotely, or inactive group members are left behind.
 * - A stale version or a child write failure leaves a partial move, history or outbox entry.
 * - Group undo loses lifecycle/text or uses transient source grouping captured after its root moved.
 * - Two offline devices reuse one rollover ID for different placement intents and receive op_id_reused.
 * - Identical rollovers duplicate writes, or interrupted/concurrent group delivery separates group members.
 * - An unrelated canonical watermark changes an identical rollover payload under the same ID.
 * - An independently scheduled target child qualifies a hidden source root after its last source todo completes remotely.
 * - A concurrent independent child move lets manual/backlog carry copy a root-scope key into its old sibling group.
 * - A carried action lacks a source guard, including when offline rollover crosses a 200-action boundary.
 * - Calendar import aligns a carried target but leaves its source guard in the old calendar, especially for Later.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { publicFromSeed } from '@goalloom/crypto'
import { parseSyncOp, type SyncOp } from '@goalloom/contracts'
import { localParentSql, rebuildVisibleFull } from '@goalloom/store-core'
import { nodeSqlDriver } from '@goalloom/store-core/node'
import { bootstrapWorkspace, createMemoryWorld, exchange, joinWorkspace, memoryRemote, newDeviceSecret, prepareFirstConnection, sealOpWire } from '@goalloom/sync'
import { openDatabase, verifyDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { reconcile } from '../../src/main/workspace/reconcile'
import { offlineRolloverOperations } from '../../src/main/workspace/sync/offline'
import { syncHost } from '../../src/main/sync/host'

export interface RolloverPlacementObservation { name: string; phase: string; expected: string[]; actual: string[]; carried: string[] }
interface Options { checks: string[]; observations: RolloverPlacementObservation[]; selected?: string[] | undefined }
type Mode = 'automatic' | 'manual-next' | 'backlog'
interface Case { mode: Mode; autoPlace: boolean; hidden?: 'archived' | 'cancelled'; rollback?: boolean; explicit?: boolean; multiple?: boolean; concurrent?: 'same' | 'switch' | 'order' | 'partial' | 'watermark' | 'root-stale' | 'child-away' }

export async function syncRolloverPlacement({ checks, observations, selected }: Options): Promise<void> {
  const cases: Case[] = [
    ...(['automatic', 'manual-next', 'backlog'] as const).flatMap(mode => [true, false].map(autoPlace => ({ mode, autoPlace }))),
    { mode: 'automatic', autoPlace: true, multiple: true },
    { mode: 'automatic', autoPlace: false, multiple: true },
    { mode: 'automatic', autoPlace: true, hidden: 'archived' },
    { mode: 'automatic', autoPlace: true, hidden: 'cancelled', rollback: true },
    { mode: 'manual-next', autoPlace: true, hidden: 'cancelled' },
    { mode: 'backlog', autoPlace: true, hidden: 'archived' },
    { mode: 'manual-next', autoPlace: true, explicit: true },
    { mode: 'automatic', autoPlace: true, concurrent: 'same' },
    { mode: 'automatic', autoPlace: true, concurrent: 'switch' },
    { mode: 'automatic', autoPlace: true, concurrent: 'order' },
    { mode: 'automatic', autoPlace: true, concurrent: 'partial', hidden: 'cancelled' },
    { mode: 'automatic', autoPlace: true, concurrent: 'watermark' },
    { mode: 'automatic', autoPlace: true, concurrent: 'root-stale', hidden: 'cancelled' },
    { mode: 'manual-next', autoPlace: true, concurrent: 'child-away', hidden: 'cancelled' },
    { mode: 'backlog', autoPlace: true, concurrent: 'child-away', hidden: 'archived' },
  ]
  for (const scenario of cases) {
    const name = `${scenario.mode}/${scenario.autoPlace ? 'on' : 'off'}${scenario.hidden ? `/${scenario.hidden}` : ''}${scenario.explicit ? '/explicit' : ''}${scenario.multiple ? '/batch' : ''}${scenario.concurrent ? `/concurrent-${scenario.concurrent}` : ''}`
    if (selected?.length && !selected.includes(name)) continue
    const temporary = mkdtempSync(join(tmpdir(), 'goalloom-rollover-placement-'))
    let now = '2026-10-21T12:00:00.000Z'
    const world = createMemoryWorld()
    const machine = (label: string) => {
      const db = openDatabase(join(temporary, `${label}.sqlite`)); migrate(db)
      const repo = new Repository(db, { now: () => now })
      const run = (command: Record<string, unknown>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation })
      run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-01-01' }, confirmed: true })
      return { db, repo, run, driver: nodeSqlDriver(db), host: syncHost(db) }
    }
    const first = machine('alpha'), second = machine('beta')
    try {
      const register = async (label: string) => {
        const remote = memoryRemote(world, label), secret = newDeviceSecret()
        const deviceId = await remote.registerDevice({ name: label, platform: 'macos', signPub: publicFromSeed('ed25519', secret.signSk), boxPub: publicFromSeed('x25519', secret.boxSk) })
        return { remote, secret, deviceId }
      }
      const alpha = await register('alpha'), beta = await register('beta')
      prepareFirstConnection(first.driver, first.host, alpha.deviceId, now)
      const bound = await bootstrapWorkspace({ ...alpha, driver: first.driver, host: first.host, password: 'rollover-placement-password', at: now })
      const joined = await joinWorkspace({ ...beta, driver: second.driver, host: second.host, password: 'rollover-placement-password', choice: 'use-remote', at: now })
      const sync = async () => {
        await exchange({ ...alpha, ...bound, driver: first.driver, host: first.host, at: now })
        await exchange({ ...beta, ...joined, driver: second.driver, host: second.host, at: now })
      }
      const create = (title: string, horizon = 'day', extra: Record<string, unknown> = {}) => first.run({ type: 'create', title, horizon, ...extra }).itemId!
      const goalA = create('Rollover goal A', 'month', { flowColor: 0 }), goalB = create('Rollover goal B', 'month', { flowColor: 1 })
      const linked = (title: string, goal: string, future = false) => create(title, 'day', {
        parentId: goal, expectedParentVersion: first.repo.store.item(goal).version,
        ...(future ? { period: { kind: 'date', startDate: '2026-10-22' } } : {}),
      })
      const root = linked('Carried A task', goalA), members = [root], incomingRoots = [root]
      const incomingParents = new Map([[root, goalA]])
      let independent: string | null = null
      if (scenario.hidden) {
        for (const status of ['todo', 'done', 'cancelled'] as const) {
          const owner = first.repo.store.item(root)
          const child = create(`Carried ${status} child`, 'day', { nesting: { parentId: root, expectedParentVersion: owner.version, expectedParentPlacementVersion: owner.placement.version } })
          if (status !== 'todo') first.run({ type: 'status', itemId: child, expectedVersion: first.repo.store.item(child).version, status })
          members.push(child)
        }
        if (scenario.concurrent === 'root-stale') {
          const owner = first.repo.store.item(root)
          independent = create('Independently scheduled target child', 'day', { nesting: { parentId: root, expectedParentVersion: owner.version, expectedParentPlacementVersion: owner.placement.version } })
          const child = first.repo.store.item(independent)
          first.run({ type: 'move', itemId: independent, horizon: 'day', period: { kind: 'date', startDate: '2026-10-22' },
            expectedVersion: child.version, expectedPlacementVersion: child.placement.version })
        }
        first.run(scenario.hidden === 'archived' ? { type: 'archive', itemId: root, expectedVersion: first.repo.store.item(root).version, archived: true }
          : { type: 'status', itemId: root, expectedVersion: first.repo.store.item(root).version, status: 'cancelled' })
      }
      if (scenario.multiple) for (const [title, parent] of [['Carried B task', goalB], ['Carried later A task', goalA]]) {
        const id = linked(title!, parent!)
        members.push(id); incomingRoots.push(id); incomingParents.set(id, parent!)
      }
      const existing = [linked('Existing A first', goalA, true), linked('Existing B first', goalB, true), linked('Existing A last', goalA, true), linked('Existing B last', goalB, true)]
      const sourceId = first.repo.store.item(root).placement.periodId!, targetId = first.repo.store.item(existing[0]!).placement.periodId!
      if (scenario.mode === 'backlog') {
        const policy = first.repo.store.policies().find(value => value.horizon === 'day')!
        first.run({ type: 'policy', horizon: 'day', mode: 'manual', expectedVersion: policy.version })
      }
      await sync()
      const rootIds = (repo: Repository, periodId: string) => repo.db.prepare(`SELECT p.itemId FROM item_placements p JOIN items i ON i.id=p.itemId
        WHERE i.deletedAt IS NULL AND p.periodId=? AND ${localParentSql()} IS NULL ORDER BY p.sortKey,p.itemId`).all(periodId).map(row => String(row.itemId))
      const lifecycle = (repo: Repository) => members.map(id => {
        const item = repo.store.item(id)
        return { id, title: item.title, description: item.description, status: item.status, archivedAt: item.archivedAt, nestingParentId: item.placement.nestingParentId ?? null }
      })
      const originalLifecycle = lifecycle(first.repo), originalRelations = first.repo.store.relations()
      const oldPositions = first.db.prepare('SELECT * FROM item_placements WHERE itemId IN (SELECT value FROM json_each(?)) ORDER BY itemId').all(JSON.stringify(existing))
      const state = () => ({
        items: first.db.prepare('SELECT * FROM items ORDER BY id').all(), placements: first.db.prepare('SELECT * FROM item_placements ORDER BY itemId').all(),
        operations: first.db.prepare('SELECT * FROM operations ORDER BY rowid').all(), sync: first.db.prepare('SELECT * FROM sync_ops ORDER BY opId').all(),
      })
      const selected = scenario.hidden ? members[1]! : root
      const guarded = () => { const item = first.repo.store.item(selected); return { itemId: selected, expectedVersion: item.version, expectedPlacementVersion: item.placement.version } }
      if (scenario.mode !== 'manual-next') now = '2026-10-22T12:00:00.000Z'
      if (scenario.concurrent === 'watermark') {
        const item = second.repo.store.item(goalB)
        second.run({ type: 'edit', itemId: item.id, expectedVersion: item.version, title: item.title, description: 'Unrelated peer note advances only its canonical watermark', dueDate: null })
        await exchange({ ...beta, ...joined, driver: second.driver, host: second.host, at: now })
      }
      const beforeFailure = state()
      if (scenario.mode === 'backlog') assert.throws(() => first.run({ type: 'arrangeBacklog', horizon: 'day', autoPlace: scenario.autoPlace,
        items: [{ ...guarded(), expectedPlacementVersion: guarded().expectedPlacementVersion + 1 }] }), /./)
      else assert.throws(() => first.run({ type: 'move', itemId: root, horizon: 'day', period: { kind: 'next' }, autoPlace: scenario.autoPlace,
        expectedVersion: first.repo.store.item(root).version, expectedPlacementVersion: first.repo.store.item(root).placement.version + 1 }), /./)
      assert.deepEqual(state(), beforeFailure, `${name}: stale placement is atomic`)
      const move = () => {
        if (scenario.mode === 'automatic') return reconcile(first.repo, now, scenario.autoPlace)!
        if (scenario.mode === 'backlog') return first.run({ type: 'arrangeBacklog', horizon: 'day', items: [guarded()], autoPlace: scenario.autoPlace })
        const item = first.repo.store.item(root)
        return first.run({ type: 'move', itemId: root, horizon: 'day', expectedVersion: item.version, expectedPlacementVersion: item.placement.version, autoPlace: scenario.autoPlace,
          period: scenario.explicit ? { kind: 'date', startDate: '2026-10-22' } : { kind: 'next' }, ...(scenario.explicit ? { beforeId: existing[0] } : {}) })
      }
      if (scenario.rollback) {
        first.db.exec(`CREATE TRIGGER rollover_child_failure BEFORE UPDATE ON item_placements WHEN NEW.itemId='${members[1]}' AND NEW.periodId IS NOT OLD.periodId
          BEGIN SELECT RAISE(ABORT,'injected rollover child failure'); END;`)
        assert.throws(move, /injected rollover child failure/)
        assert.deepEqual(state(), beforeFailure, `${name}: a child failure rolls back placements, history and outbox`)
        first.db.exec('DROP TRIGGER rollover_child_failure')
      }
      const result = move()
      assert(result?.changed, `${name}: the move commits`)
      const expected = [...existing], parentOf = new Map([...incomingParents, ...existing.map((id, index) => [id, index % 2 === 0 ? goalA : goalB] as const)])
      for (const id of incomingRoots) {
        const position = scenario.explicit ? 0 : scenario.autoPlace ? expected.findLastIndex(other => parentOf.get(other) === parentOf.get(id)) + 1 : expected.length
        expected.splice(position, 0, id)
      }
      const observe = (phase: string, repo: Repository, target = true) => {
        const actual = rootIds(repo, targetId), order = target ? expected : existing
        observations.push({ name, phase, expected: order, actual, carried: members })
        assert.deepEqual(actual, order, `${name}: ${phase} preserves the committed root order`)
        assert.deepEqual(actual.filter(id => !incomingRoots.includes(id)), existing, `${name}: ${phase} retains every older task's relative order`)
        for (const id of members) assert.equal(repo.store.item(id).placement.periodId, target ? targetId : sourceId, `${name}: ${phase} keeps the complete group`)
        assert.deepEqual(lifecycle(repo), originalLifecycle, `${name}: ${phase} retains lifecycle and ownership`)
        assert.deepEqual(repo.store.relations(), originalRelations)
      }
      observe('local', first.repo)
      assert.deepEqual(first.db.prepare('SELECT * FROM item_placements WHERE itemId IN (SELECT value FROM json_each(?)) ORDER BY itemId').all(JSON.stringify(existing)), oldPositions)
      if (scenario.concurrent) {
        const pending = (repo: Repository) => repo.db.prepare("SELECT payload FROM sync_ops WHERE state='never_sent' ORDER BY localOrder").all().map(row => parseSyncOp(JSON.parse(String(row.payload))))
        const send = async (peer: typeof alpha, ops: SyncOp[]) => {
          const results = await peer.remote.pushOps({ workspaceId: bound.workspaceId, deviceId: peer.deviceId, generation: bound.generation,
            ops: ops.map(op => sealOpWire({ op, workspaceKey: bound.workspaceKey, workspaceId: bound.workspaceId, epoch: bound.epoch })) })
          assert(results.every(receipt => receipt.error === undefined), `${name}: concurrent encrypted push must not return op_id_reused`)
          return results
        }
        if (scenario.concurrent === 'child-away') {
          const groupOp = pending(first.repo).find(op => op.opId === result.operationId)!
          const missingSource = { ...groupOp, opId: randomUUID(), actions: groupOp.actions.map(action => {
            if (action.t !== 'item.place' || !action.groupRootId) return action
            const { groupFrom: _groupFrom, ...unguarded } = action
            return unguarded
          }) }
          await send(alpha, [missingSource])
          await exchange({ ...beta, ...joined, driver: second.driver, host: second.host, at: now })
          assert.equal(second.db.prepare('SELECT errorCode FROM sync_ops WHERE opId=?').get(missingSource.opId)?.errorCode, 'outline_conflict')
          for (const id of members) assert.equal(second.repo.store.item(id).placement.periodId, sourceId, 'Missing source metadata rejects the whole encrypted op')
          const child = second.repo.store.item(members[2]!)
          second.run({ type: 'move', itemId: child.id, expectedVersion: child.version, expectedPlacementVersion: child.placement.version,
            horizon: 'day', period: { kind: 'date', startDate: '2026-10-23' } })
          const independentPlacement = second.repo.store.item(child.id).placement
          assert.equal(independentPlacement.nestingParentId, root, 'Independent planning retains ownership')
          await send(beta, pending(second.repo)); await send(alpha, [groupOp]); await sync()
          for (const [phase, repo] of [['rejected child-away writer', first.repo], ['rejected child-away peer', second.repo]] as const) {
            const actual = rootIds(repo, targetId)
            observations.push({ name, phase, expected: existing, actual, carried: members })
            assert.deepEqual(actual, existing, `${name}: a stale carried child rejects the entire group move`)
            for (const id of members) assert.equal(repo.store.item(id).placement.periodId, id === child.id ? independentPlacement.periodId : sourceId)
            assert.equal(repo.store.item(child.id).placement.sortKey, independentPlacement.sortKey)
            assert.deepEqual(lifecycle(repo), originalLifecycle)
            assert.deepEqual(repo.store.relations(), originalRelations)
            assert.equal(Number(repo.db.prepare('SELECT count(*) AS n FROM canon_changes WHERE seq=(SELECT seq FROM sync_ops WHERE opId=?)').get(groupOp.opId)!.n), 0)
          }
          assert.equal(first.db.prepare('SELECT code FROM sync_conflicts WHERE opId=?').get(groupOp.opId)?.code, 'outline_conflict')
          await sync()
          assert.deepEqual(rootIds(first.repo, targetId), existing)
          verifyDatabase(first.db); verifyDatabase(second.db)
          checks.push(`${name}: encrypted stale group carry rejects atomically and retains the independently scheduled child, lifecycle, sibling keys and older target order`)
          continue
        }
        if (scenario.concurrent === 'root-stale') {
          const liveChild = second.repo.store.item(members[1]!)
          second.run({ type: 'status', itemId: liveChild.id, expectedVersion: liveChild.version, status: 'done' })
          await send(beta, pending(second.repo)); await send(alpha, pending(first.repo)); await sync()
          const order = [independent!, ...existing]
          for (const [phase, repo] of [['rejected stale writer', first.repo], ['rejected stale peer', second.repo]] as const) {
            const actual = rootIds(repo, targetId)
            observations.push({ name, phase, expected: order, actual, carried: members })
            assert.deepEqual(actual, order)
            for (const id of members) assert.equal(repo.store.item(id).placement.periodId, sourceId)
            assert.equal(repo.store.item(independent!).placement.periodId, targetId)
            assert.equal(repo.store.item(members[1]!).status, 'done')
            assert.equal(repo.store.item(root).status, 'cancelled')
            assert.deepEqual(repo.store.relations(), originalRelations)
            assert.equal(Number(repo.db.prepare("SELECT count(*) AS n FROM sync_conflicts WHERE itemId=? AND code='rollover_stale'").get(root)!.n), 1)
          }
          verifyDatabase(first.db); verifyDatabase(second.db)
          checks.push(`${name}: a target-only child cannot qualify a stale hidden source group, and encrypted rejection keeps every source placement and the peer completion`)
          continue
        }
        if (scenario.concurrent === 'order') {
          const item = second.repo.store.item(existing[3]!)
          second.run({ type: 'move', itemId: item.id, expectedVersion: item.version, expectedPlacementVersion: item.placement.version,
            horizon: 'day', beforeId: existing[0], autoPlace: true })
        }
        const identical = scenario.concurrent === 'same' || scenario.concurrent === 'watermark'
        assert(reconcile(second.repo, now, identical || scenario.concurrent === 'order')?.changed)
        const firstOps = pending(first.repo), secondOps = pending(second.repo)
        const rootOp = (ops: SyncOp[]) => ops.find(op => op.actions.some(action => action.t === 'item.rollover' && action.id === root))!
        const firstRoot = rootOp(firstOps), secondRoot = rootOp(secondOps)
        if (identical) assert.deepEqual(firstRoot, secondRoot, 'Identical placement intents retain the same ID and payload despite unrelated canonical watermarks')
        else assert.notEqual(firstRoot.opId, secondRoot.opId, 'Different placement intents must not reuse an operation ID')
        await send(alpha, scenario.concurrent === 'partial' ? [firstRoot] : firstOps)
        const receipts = await send(beta, secondOps)
        if (identical) assert(receipts.every(receipt => receipt.duplicate === true))
        if (scenario.concurrent === 'partial') await send(alpha, firstOps.filter(op => op.opId !== firstRoot.opId))
        await sync()
        const converged = scenario.concurrent === 'order' ? [existing[3]!, ...expected.filter(id => id !== existing[3])] : expected
        for (const [phase, repo] of [['concurrent writer', first.repo], ['concurrent peer', second.repo]] as const) {
          const actual = rootIds(repo, targetId)
          observations.push({ name, phase, expected: converged, actual, carried: members })
          assert.deepEqual(actual, converged)
          for (const id of members) assert.equal(repo.store.item(id).placement.periodId, targetId)
          assert.deepEqual(lifecycle(repo), originalLifecycle)
          assert.deepEqual(repo.store.relations(), originalRelations)
          assert.equal(Number(repo.db.prepare("SELECT count(*) AS n FROM sync_ops WHERE state IN ('never_sent','send_unknown','accepted')").get()!.n), 0)
          if (!identical) assert.equal(repo.db.prepare('SELECT code FROM sync_conflicts WHERE opId=?').get(secondRoot.opId)?.code, 'rollover_stale')
        }
        await sync()
        assert.deepEqual(rootIds(first.repo, targetId), converged)
        verifyDatabase(first.db); verifyDatabase(second.db)
        checks.push(`${name}: encrypted competing placements converge without op_id_reused; identical intent deduplicates and partial group delivery retains every member`)
        continue
      }
      const payloads = first.db.prepare("SELECT opId,payload FROM sync_ops WHERE state='never_sent' ORDER BY opId").all()
      first.driver.transaction(() => rebuildVisibleFull(first.driver, first.host))
      observe('pending replay', first.repo)
      await sync()
      observe('canonical writer', first.repo); observe('canonical peer', second.repo)
      const operationCount = first.db.prepare('SELECT count(*) AS n FROM sync_ops').get()!.n
      if (scenario.mode === 'automatic') assert.equal(reconcile(first.repo, now, scenario.autoPlace), null)
      await sync()
      observe('repeated exchange', first.repo)
      assert.equal(first.db.prepare('SELECT count(*) AS n FROM sync_ops').get()!.n, operationCount)
      for (const payload of payloads) assert.equal(first.db.prepare('SELECT payload FROM sync_ops WHERE opId=?').get(String(payload.opId))?.payload, payload.payload)
      first.run({ type: scenario.mode === 'automatic' ? 'undoBatch' : 'undo', originalOperationId: result.operationId })
      observe('local undo', first.repo, false)
      first.driver.transaction(() => rebuildVisibleFull(first.driver, first.host))
      observe('pending undo', first.repo, false)
      await sync()
      observe('canonical undo writer', first.repo, false); observe('canonical undo peer', second.repo, false)
      verifyDatabase(first.db); verifyDatabase(second.db)
      checks.push(`${name}: committed placement survives encrypted replay/idempotence/undo; older tasks, lifecycle, relations and guarded failure atomicity are preserved`)
    } finally {
      first.db.close(); second.db.close(); rmSync(temporary, { recursive: true, force: true })
    }
  }
  await syncOfflineGroupSources({ checks, observations, selected })
}

async function syncOfflineGroupSources({ checks, observations, selected }: Options): Promise<void> {
  for (const name of ['offline-chunks', 'offline-chunks-child-away', 'imported-source-later']) {
    if (selected?.length && !selected.includes(name)) continue
    const temporary = mkdtempSync(join(tmpdir(), 'goalloom-group-source-'))
    const imported = name === 'imported-source-later', stale = name === 'offline-chunks-child-away'
    let now = '2026-10-21T12:00:00.000Z'
    const world = createMemoryWorld()
    const machine = (label: string) => {
      const db = openDatabase(join(temporary, `${label}.sqlite`)); migrate(db)
      const repo = new Repository(db, { now: () => now })
      const run = (command: Record<string, unknown>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation })
      run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling',
        anchor: { kind: 'date', date: imported && label === 'beta' ? '2026-09-21' : '2026-01-01' }, confirmed: true })
      return { db, repo, run, driver: nodeSqlDriver(db), host: syncHost(db) }
    }
    const first = machine('alpha'), second = machine('beta')
    try {
      const register = async (label: string) => {
        const remote = memoryRemote(world, label), secret = newDeviceSecret()
        const deviceId = await remote.registerDevice({ name: label, platform: 'macos', signPub: publicFromSeed('ed25519', secret.signSk), boxPub: publicFromSeed('x25519', secret.boxSk) })
        return { remote, secret, deviceId }
      }
      const alpha = await register('alpha'), beta = await register('beta')
      const horizon = imported ? 'cycle' : 'day'
      const root = first.run({ type: 'create', title: 'Offline carried group', horizon }).itemId!
      const children: string[] = []
      for (let index = 0; index < (imported ? 2 : 201); index += 1) {
        const owner = first.repo.store.item(root)
        children.push(first.run({ type: 'create', title: `Offline child ${index}`, horizon,
          nesting: { parentId: root, expectedParentVersion: owner.version, expectedParentPlacementVersion: owner.placement.version } }).itemId!)
      }
      const sourceId = first.repo.store.item(root).placement.periodId!
      const sourceKey = { horizon, startDate: imported ? '2026-10-01' : '2026-10-21' }
      let operationId: string
      if (imported) {
        const owner = first.repo.store.item(root)
        operationId = first.run({ type: 'move', itemId: root, horizon: 'later', expectedVersion: owner.version, expectedPlacementVersion: owner.placement.version }).operationId
      } else {
        now = '2026-10-22T12:00:00.000Z'
        operationId = reconcile(first.repo, now, true)!.operationId
      }
      const receipt = first.db.prepare('SELECT effects FROM operations WHERE id=?').get(operationId)!.effects
      const offline = imported ? [] : offlineRolloverOperations(first.db).map(value => value.op)
      if (!imported) {
        assert.deepEqual(offline.map(op => op.actions.length), [200, 2], 'Offline source guards survive the action chunk boundary')
        for (const op of offline) for (const action of op.actions) if (action.t === 'item.place' && action.groupRootId) {
          assert.deepEqual(action.groupFrom, { horizon, periodKey: sourceKey })
        }
      }
      prepareFirstConnection(first.driver, first.host, alpha.deviceId, now)
      const prepared = first.db.prepare("SELECT payload FROM sync_ops WHERE state='never_sent' ORDER BY localOrder").all().map(row => parseSyncOp(JSON.parse(String(row.payload))))
      const bound = imported ? await (async () => {
        second.run({ type: 'create', title: 'Established remote calendar', horizon: 'day' })
        prepareFirstConnection(second.driver, second.host, beta.deviceId, now)
        const workspace = await bootstrapWorkspace({ ...beta, driver: second.driver, host: second.host, password: 'group-source-password', at: now })
        await exchange({ ...beta, ...workspace, driver: second.driver, host: second.host, at: now })
        await joinWorkspace({ ...alpha, driver: first.driver, host: first.host, password: 'group-source-password', choice: 'use-remote', at: now })
        return workspace
      })() : await bootstrapWorkspace({ ...alpha, driver: first.driver, host: first.host, password: 'group-source-password', at: now })
      const send = async (ops: SyncOp[]) => {
        for (let index = 0; index < ops.length; index += 200) {
          const result = await alpha.remote.pushOps({ workspaceId: bound.workspaceId, deviceId: alpha.deviceId, generation: bound.generation,
            ops: ops.slice(index, index + 200).map(op => sealOpWire({ op, workspaceKey: bound.workspaceKey, workspaceId: bound.workspaceId, epoch: bound.epoch })) })
          assert(result.every(value => value.error === undefined))
        }
      }
      const finalChunk = offline.at(-1)
      const held = finalChunk?.actions.flatMap(action => action.t === 'item.place' ? [action.id] : []) ?? []
      await send(prepared.filter(op => op.opId !== finalChunk?.opId))
      if (!imported) await joinWorkspace({ ...beta, driver: second.driver, host: second.host, password: 'group-source-password', choice: 'use-remote', at: now })
      let independentPeriodId: string | null = null
      if (stale) {
        const child = second.repo.store.item(held.at(-1)!)
        second.run({ type: 'move', itemId: child.id, horizon: 'day', period: { kind: 'date', startDate: '2026-10-23' },
          expectedVersion: child.version, expectedPlacementVersion: child.placement.version })
        independentPeriodId = second.repo.store.item(child.id).placement.periodId
        await exchange({ ...beta, ...bound, driver: second.driver, host: second.host, at: now })
      }
      if (finalChunk) await send([prepared.find(op => op.opId === finalChunk.opId)!])
      await exchange({ ...alpha, ...bound, driver: first.driver, host: first.host, at: now })
      await exchange({ ...beta, ...bound, driver: second.driver, host: second.host, at: now })
      const expected = stale ? children.filter(id => !held.includes(id)) : children
      for (const [phase, repo] of [['canonical writer', first.repo], ['canonical peer', second.repo]] as const) {
        const owner = repo.store.item(root)
        assert.equal(owner.placement.horizon, imported ? 'later' : 'day')
        if (!imported) assert.equal(repo.db.prepare('SELECT startDate FROM planning_periods WHERE id=?').get(owner.placement.periodId!)!.startDate, '2026-10-22')
        const actual = repo.db.prepare('SELECT itemId FROM item_placements WHERE nestingParentId=? AND horizon=? AND periodId IS ? ORDER BY sortKey,itemId')
          .all(root, owner.placement.horizon, owner.placement.periodId).map(row => String(row.itemId))
        observations.push({ name, phase, expected, actual, carried: children })
        assert.deepEqual(actual, expected, `${name}: encrypted replay preserves the guarded sibling scope and order`)
        for (const id of children) assert.equal(repo.store.item(id).placement.nestingParentId, root)
        if (stale) {
          assert.equal(repo.store.item(held[0]!).placement.periodId, sourceId, 'A later child failure rolls back the entire final chunk')
          assert.equal(repo.store.item(held.at(-1)!).placement.periodId, independentPeriodId)
          assert.equal(repo.db.prepare('SELECT errorCode FROM sync_ops WHERE opId=?').get(finalChunk!.opId)?.errorCode, 'outline_conflict')
          assert.equal(Number(repo.db.prepare('SELECT count(*) AS n FROM canon_changes WHERE seq=(SELECT seq FROM canon_ops WHERE opId=?)').get(finalChunk!.opId)!.n), 0)
        } else assert.equal(Number(repo.db.prepare("SELECT count(*) AS n FROM sync_ops WHERE outcome='rejected'").get()!.n), 0)
        if (imported) {
          assert.equal(repo.store.workspace().calendar!.cycleAnchor, '2026-09-21')
          const changes = repo.db.prepare("SELECT before FROM canon_changes WHERE itemId=? AND dim='placement' ORDER BY seq,idx").all(children[0]!)
          assert(changes.some(row => {
            const before = JSON.parse(String(row.before))
            return before?.periodId && repo.db.prepare('SELECT startDate FROM planning_periods WHERE id=?').get(before.periodId)?.startDate === '2026-09-21'
          }), 'Imported group source resolves against the established calendar even when the target is Later')
        }
      }
      assert.equal(first.db.prepare('SELECT effects FROM operations WHERE id=?').get(operationId)!.effects, receipt)
      verifyDatabase(first.db); verifyDatabase(second.db)
      checks.push(`${name}: encrypted carried actions preserve source guards across offline chunks/calendar import; stale chunks reject atomically and receipts stay immutable`)
    } finally {
      first.db.close(); second.db.close(); rmSync(temporary, { recursive: true, force: true })
    }
  }
}
