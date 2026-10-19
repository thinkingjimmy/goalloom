/**
 * [INPUT]: Real SQLite worker, isolated legacy profiles and the production transition boundary.
 * [OUTPUT]: Repeatable environment-migration evidence without user data or live credentials.
 * [POS]: Production environment E2E; OAuth and signed installers have separate acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir, release, arch } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { createCloud } from '../sync-cost/cloud'
import { seedLocal, sql, tasks, calendar, command } from '../sync-join/peer'
import { worker } from '../sync-cost/peer'
import { prepareProductionProfile } from '../../src/main/sync/environment'
import { verifySqliteDataset, readBackupDataset } from '../../src/main/workspace/transfer/dataset'

async function main() {
const out = resolve('output/tests/sync-security')
await mkdir(out, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'goalloom-environment-'))
const cloud = await createCloud()
const report: any = { ok: false, checks: [], runtime: { ...process.versions }, host: { os: release(), arch: arch() }, scope: 'Real SQLite worker with synthetic legacy data; no Google or production network.' }
let storage: Awaited<ReturnType<typeof worker>> | undefined
try {
  const freshProfile = await mkdtemp(join(tmpdir(), 'goalloom-unbound-environment-'))
  await seedLocal(freshProfile, 'alpha', 3, cloud)
  const fresh = await worker(freshProfile)
  try {
    const originalOps = sql(freshProfile, 'SELECT opId,payload FROM sync_ops ORDER BY localOrder')
    await prepareProductionProfile(freshProfile, fresh)
    assert.deepEqual(sql(freshProfile, 'SELECT opId,payload FROM sync_ops ORDER BY localOrder'), originalOps)
    const view = await fresh.call<any>('sync', { type: 'view' })
    const saved = await fresh.call<any>('data', { type: 'createBackup', generation: view.generation })
    const path = join(freshProfile, 'backups', `${saved.status.records.find((row: any) => row.kind === 'manual').id}.sqlite`)
    assert.equal((await readBackupDataset(path, new Date().toISOString())).historyRecovered, false)
    const damaged = join(freshProfile, 'invalid-current.sqlite')
    await copyFile(path, damaged)
    const broken = new DatabaseSync(damaged)
    try { broken.prepare('UPDATE items SET dueDate=? WHERE id=(SELECT id FROM items LIMIT 1)').run('2026-99-99') }
    finally { broken.close() }
    await assert.rejects(readBackupDataset(damaged, new Date().toISOString()))
    report.checks.push('Unbound history/outbox remains unchanged; valid history stays complete and damaged current data is rejected')
  } finally { await fresh.close() }
  await seedLocal(profile, 'alpha', 6, cloud)
  const legacy = Buffer.from('synthetic legacy ciphertext')
  await writeFile(join(profile, 'sync-session.bin'), legacy)
  storage = await worker(profile)
  const day = sql(profile, "SELECT p.itemId FROM item_placements p WHERE p.horizon='day' ORDER BY p.sortKey")
  const parentId = String(day[3]!.itemId)
  for (const child of [day[1]!, day[0]!]) {
    const item = sql(profile, `SELECT i.version,p.version AS placementVersion FROM items i JOIN item_placements p ON p.itemId=i.id WHERE i.id='${child.itemId}'`)[0]!
    const parent = sql(profile, `SELECT i.version,p.version AS placementVersion FROM items i JOIN item_placements p ON p.itemId=i.id WHERE i.id='${parentId}'`)[0]!
    await command({ storage }, { type: 'nest', itemId: child.itemId, parentId, expectedVersion: item.version,
      expectedPlacementVersion: item.placementVersion, expectedParentVersion: parent.version, expectedParentPlacementVersion: parent.placementVersion })
  }
  const goal = sql(profile, "SELECT id,version FROM items WHERE id IN (SELECT itemId FROM item_placements WHERE horizon='year')")[0]!
  await command({ storage }, { type: 'flowColor', itemId: goal.id, expectedVersion: goal.version, flowColor: 0 })
  const goalVersion = sql(profile, `SELECT version FROM items WHERE id='${goal.id}'`)[0]!.version
  const linked = sql(profile, `SELECT id,version FROM items WHERE id='${day[2]!.itemId}'`)[0]!
  await command({ storage }, { type: 'link', parentId: goal.id, childId: linked.id, expectedParentVersion: goalVersion, expectedChildVersion: linked.version, adoptParentFlow: true })
  await storage.call('sync', { type: 'bind', binding: { workspaceId: randomUUID(), deviceId: randomUUID(), keyEpoch: 1 }, at: new Date().toISOString() })
  const before = { tasks: tasks(profile), calendar: calendar(profile), history: sql(profile, 'SELECT * FROM operations ORDER BY id') }
  const order = () => sql(profile, `SELECT p.itemId,p.nestingParentId FROM item_placements p JOIN items i ON i.id=p.itemId
    WHERE i.deletedAt IS NULL ORDER BY p.horizon,p.periodId,p.nestingParentId,p.sortKey,p.itemId`)
  const originalOrder = order()
  const failed = { call: async () => { throw Error('Synthetic backup failure') } } as any
  await assert.rejects(prepareProductionProfile(profile, failed))
  assert(sql(profile, 'SELECT workspaceId FROM sync_state')[0]!.workspaceId)
  report.checks.push('Failed protection leaves the legacy binding unchanged')
  const directory = await prepareProductionProfile(profile, storage)
  assert.equal(directory, join(profile, 'sync', 'keqprrgvcefqdwnxaafv'))
  assert.deepEqual(tasks(profile), before.tasks)
  assert.deepEqual(calendar(profile), before.calendar)
  assert.deepEqual(sql(profile, 'SELECT * FROM operations ORDER BY id'), before.history)
  assert.deepEqual(order(), originalOrder)
  assert.equal(sql(profile, 'SELECT workspaceId FROM sync_state')[0]!.workspaceId, null)
  assert.deepEqual(await readFile(join(profile, 'sync-session.bin')), legacy)
  assert(sql(profile, "SELECT state FROM sync_ops").every(row => row.state === 'never_sent'))
  const generation = String((await storage.call<any>('sync', { type: 'view' })).generation)
  const backup = await storage.call<any>('data', { type: 'createBackup', generation })
  const manual = backup.status.records.find((row: any) => row.kind === 'manual')
  const backupPath = join(profile, 'backups', `${manual.id}.sqlite`)
  const recovered = await readBackupDataset(backupPath, new Date().toISOString())
  assert.equal(recovered.historyRecovered, true)
  assert.equal(recovered.data.historyMode, 'baseline')
  assert.equal(recovered.data.items.length, before.tasks.length)
  await assert.rejects(verifySqliteDataset(backupPath, new Date().toISOString()))
  const preview = await storage.call<any>('data', { type: 'previewBackup', backupId: manual.id, generation })
  assert.equal(preview.preview.warnings.length, 1)
  assert(preview.preview.warnings[0].includes('history'))
  await storage.call('data', { type: 'cancel', token: preview.preview.token, generation })
  assert.deepEqual(tasks(profile), before.tasks)
  report.checks.push('Only verified application backup recovery offers a warned current-data baseline; strict validation still rejects inconsistent history')
  report.checks.push('Production transition preserves tasks, calendar, history and legacy vault; old binding is detached')
  const baseline = sql(profile, 'SELECT opId FROM sync_ops ORDER BY opId')
  await prepareProductionProfile(profile, storage)
  assert.deepEqual(sql(profile, 'SELECT opId FROM sync_ops ORDER BY opId'), baseline)
  report.checks.push('Completed transition is stable across restart and does not regenerate pending operations')
  const restore = await storage.call<any>('data', { type: 'previewBackup', backupId: manual.id, generation })
  await storage.call('data', { type: 'prepare', token: restore.preview.token, generation })
  await assert.rejects(storage.call('data', { type: 'commit', token: restore.preview.token, generation }))
  assert.deepEqual(tasks(profile), before.tasks)
  const replaced = await storage.call<any>('data', { type: 'commit', token: restore.preview.token, generation, acknowledged: true })
  assert.deepEqual(tasks(profile), before.tasks)
  const next = await storage.call<any>('data', { type: 'createBackup', generation: replaced.generation })
  const latest = next.status.records.find((row: any) => row.kind === 'manual' && row.generation === replaced.generation)
  await verifySqliteDataset(join(profile, 'backups', `${latest.id}.sqlite`), new Date().toISOString())
  report.checks.push('Confirmed current-data recovery preserves tasks and produces a fully valid backup for the new history baseline')
  const cleared = await storage.call<{ cleanupPending: boolean }>('clearLocal')
  assert.equal(cleared.cleanupPending, false)
  await assert.rejects(readFile(join(directory, 'transition.json')))
  await prepareProductionProfile(profile, storage)
  assert.equal(tasks(profile).length, 0)
  report.checks.push('Explicit local cleanup removes project credentials and a fresh unconfigured board transitions safely')
  report.ok = true
} catch (error) { report.error = String(error); throw error }
finally {
  await storage?.close()
  await cloud.close()
  await writeFile(join(out, 'environment.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(`Environment acceptance: ${report.checks.length} checks; ${report.ok ? 'passed' : 'failed'}`)
}

}
void main().catch(error => { console.error(error); process.exitCode = 1 })
