/**
 * [INPUT]: Real SQLite worker, isolated legacy profiles and the production transition boundary.
 * [OUTPUT]: Repeatable environment-migration evidence without user data or live credentials.
 * [POS]: Production environment E2E; OAuth and signed installers have separate acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir, release, arch } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { createCloud } from '../sync-cost/cloud'
import { seedLocal, sql, tasks, calendar, command } from '../sync-join/peer'
import { worker } from '../sync-cost/peer'
import { prepareProductionProfile } from '../../src/main/sync/environment'

async function main() {
const out = resolve('output/tests/sync-security')
await mkdir(out, { recursive: true })
const profile = await mkdtemp(join(tmpdir(), 'goalloom-environment-'))
const cloud = await createCloud()
const report: any = { ok: false, checks: [], runtime: { ...process.versions }, host: { os: release(), arch: arch() }, scope: 'Real SQLite worker with synthetic legacy data; no Google or production network.' }
let storage: Awaited<ReturnType<typeof worker>> | undefined
try {
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
  report.checks.push('Production transition preserves tasks, calendar, history and legacy vault; old binding is detached')
  const baseline = sql(profile, 'SELECT opId FROM sync_ops ORDER BY opId')
  await prepareProductionProfile(profile, storage)
  assert.deepEqual(sql(profile, 'SELECT opId FROM sync_ops ORDER BY opId'), baseline)
  report.checks.push('Completed transition is stable across restart and does not regenerate pending operations')
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
