/**
 * [INPUT]: Production SyncService, repository and SQLite worker with two encrypted HTTP peers.
 * [OUTPUT]: Repeatable causal review, guarded resolution and restart evidence.
 * [POS]: Sync review E2E; failure cases are declared in docs/sync/desktop.md.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { arch, cpus, release, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { createCloud } from '../sync-cost/cloud'
import { closePeer, command, openPeer, password, seedLocal, settle, tasks } from '../sync-join/peer'
import type { ItemDetail } from '../../src/shared/contracts/queries'
import type { SyncReviewPage } from '../../src/shared/contracts/sync-review'

async function run(): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'goalloom-sync-review-')), out = resolve('output/tests/sync-review')
  await mkdir(out, { recursive: true })
  const cloud = await createCloud(), peers: any[] = []
  const report: any = { passed: false, checks: [], runtime: { electron: process.versions.electron, node: process.versions.node },
    host: { os: release(), arch: arch(), cpu: cpus()[0]?.model, machine: 'Physical/VM status not independently verified' },
    scope: 'Production service/SDK/SQLite, encrypted controlled HTTP, synthetic OS cipher/OAuth; native UI has a separate report.' }
  const check = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`) }
  const item = async (peer: any, itemId: string) => (await peer.storage.call('query', { type: 'item', itemId }) as ItemDetail).item
  async function pause(...values: any[]) { for (const peer of values) { peer.service.suspend(); await peer.service.schedule.settle() } }
  async function resume(peer: any) { await peer.service.resume(); await settle(peer) }
  async function edit(peer: any, itemId: string, fields: { title?: string; description?: string }) {
    const before = await item(peer, itemId)
    return command(peer, { type: 'edit', itemId, expectedVersion: before.version, title: fields.title ?? before.title, description: fields.description ?? before.description, dueDate: before.dueDate })
  }
  async function reviews(peer: any): Promise<SyncReviewPage> {
    const view = await peer.storage.call('sync', { type: 'view' })
    const reply = await peer.service.handle({ type: 'reviews', generation: view.generation })
    return reply.reviews
  }
  async function resolveReview(peer: any, choice: 'local' | 'current', preview?: SyncReviewPage) {
    const page = preview ?? await reviews(peer)
    assert(page.review)
    const input = { type: 'resolveSyncReview', operationId: randomUUID(), generation: page.generation, itemId: page.review.itemId, token: page.review.token, choice }
    return { input, result: await peer.storage.call('command', input) }
  }
  async function concurrent(a: any, b: any, id: string, title: string) {
    await pause(a, b)
    await edit(a, id, { title: `Local ${title}` }); await edit(b, id, { title: `Remote ${title}` })
    await resume(a); await pause(a); await resume(b); await pause(b); await resume(a)
  }
  try {
    const alpha = join(root, 'alpha'), beta = join(root, 'beta')
    await seedLocal(alpha, 'alpha', 3, cloud); await seedLocal(beta, 'beta', 0, cloud)
    let a = await openPeer(alpha, 'alpha'); peers.push(a)
    await a.service.handle({ type: 'sign-in', provider: 'google' }); await a.service.handle({ type: 'create', password }); await settle(a)
    const b = await openPeer(beta, 'beta'); peers.push(b)
    await b.service.handle({ type: 'sign-in', provider: 'google' }); await b.service.handle({ type: 'submit-password', password }); await settle(a, b)
    report.runtime.sqlite = (await a.storage.call('runtime')).sqlite
    const ids = tasks(alpha).map(row => String(row.id)), first = ids[0]!, second = ids[1]!, third = ids[2]!
    await concurrent(a, b, first, 'title')
    let page = await reviews(a)
    assert.equal(page.remaining, 1); assert.equal(page.review?.local.title, 'Local title'); assert.equal(page.review?.current.title, 'Remote title'); assert(page.review?.canUseLocal)
    assert.equal((await reviews(b)).remaining, 0)
    check('Concurrent text edits produce one local task review, while the canonical winner gets no lost-edit warning')

    await pause(a); await resume(b); await edit(b, first, { description: 'New unrelated remote notes' }); await settle(b); await pause(b); await resume(a)
    const resolved = await resolveReview(a, 'local', page)
    assert.equal((await item(a, first)).title, 'Local title'); assert.equal((await item(a, first)).description, 'New unrelated remote notes')
    assert.equal((await reviews(a)).remaining, 0)
    assert.deepEqual(await a.storage.call('command', resolved.input), resolved.result)
    await settle(a); await resume(b); await settle(a, b)
    assert.equal((await item(b, first)).title, 'Local title'); assert.equal((await item(b, first)).description, 'New unrelated remote notes')
    check('Applying only lost fields preserves later unrelated edits, converges, and returns a durable receipt on repeated submission')

    await edit(b, first, { title: 'Causally later title' }); await settle(b, a)
    assert.equal((await reviews(a)).remaining, 0)
    check('An edit made after reading the prior result is ordinary sync and produces no concurrent warning')

    await concurrent(a, b, second, 'stale preview'); page = await reviews(a)
    await pause(a); await resume(b); await edit(b, second, { title: 'Newer owned remote title' }); await settle(b); await pause(b); await resume(a)
    await assert.rejects(resolveReview(a, 'local', page), /changed|变化|修改|变更/i)
    assert.equal((await item(a, second)).title, 'Newer owned remote title'); assert.equal((await reviews(a)).remaining, 1)
    const currentResult = await resolveReview(a, 'current')
    assert.equal(currentResult.result.changed, false)
    check('A stale owned-value preview cannot overwrite new data; choosing the current result only acknowledges it')

    await resume(b); await settle(a, b); await pause(a, b)
    await edit(a, third, { title: 'Local task to recover', description: 'Local notes to retain' })
    const remoteThird = await item(b, third)
    await command(b, { type: 'delete', itemId: third, expectedVersion: remoteThird.version })
    await resume(b); await pause(b); await resume(a)
    page = await reviews(a)
    assert.equal(page.review?.itemId, third); assert(page.review?.current.deleted); assert(!page.review?.local.deleted); assert.equal(page.review?.local.title, 'Local task to recover')
    const beforeFailure = tasks(alpha)
    const raw = new DatabaseSync(join(alpha, 'workspace.sqlite'))
    raw.exec("CREATE TRIGGER fail_sync_review BEFORE UPDATE OF seenAt ON sync_conflicts BEGIN SELECT RAISE(ABORT,'injected resolution failure'); END")
    await assert.rejects(resolveReview(a, 'local', page), (error: any) => error.code === 'storage')
    assert.deepEqual(tasks(alpha), beforeFailure); assert.equal((await reviews(a)).remaining, 1)
    raw.exec('DROP TRIGGER fail_sync_review'); raw.close()
    const unrelated = (await item(a, second)).title
    await resolveReview(a, 'local', page); assert.equal((await item(a, third)).deletedAt, null)
    assert.equal((await item(a, third)).description, 'Local notes to retain'); assert.equal((await item(a, second)).title, unrelated)
    await settle(a); await resume(b); await settle(a, b)
    assert.equal((await item(b, third)).deletedAt, null)
    check('Delete/edit recovery is explicit, restores only the selected task, and acknowledgement/write faults roll back together')

    await pause(a, b); await edit(a, third, { title: 'Do not restore this draft' })
    const again = await item(b, third); await command(b, { type: 'delete', itemId: third, expectedVersion: again.version })
    await resume(b); await pause(b); await resume(a)
    page = await reviews(a); assert(page.review?.current.deleted)
    await resolveReview(a, 'current', page); assert((await item(a, third)).deletedAt)
    await a.service.handle({ type: 'sign-out' }); await a.service.handle({ type: 'sign-in', provider: 'google' }); await a.service.handle({ type: 'submit-password', password }); await settle(a)
    assert.equal((await reviews(a)).remaining, 0); assert((await item(a, third)).deletedAt)
    await closePeer(a); peers.splice(peers.indexOf(a), 1); a = await openPeer(alpha, 'alpha'); peers.push(a)
    if (a.status.phase !== 'ready') { await a.service.handle({ type: 'sign-in', provider: 'google' }); await a.service.handle({ type: 'submit-password', password }) }
    await settle(a); assert.equal((await reviews(a)).remaining, 0); assert((await item(a, third)).deletedAt)
    check('Default acknowledgement survives logout/login and process reconstruction without repeating a review or restoring deleted tasks')

    const parent = (await command(a, { type: 'create', title: 'Parent for link rejection', horizon: 'year', flowColor: 0 })).itemId
    const child = (await command(a, { type: 'create', title: 'Child for link rejection', horizon: 'day' })).itemId
    await settle(a); await resume(b); await settle(a, b); await pause(a, b)
    await command(a, { type: 'link', parentId: parent, childId: child, expectedParentVersion: (await item(a, parent)).version, expectedChildVersion: (await item(a, child)).version })
    await command(b, { type: 'delete', itemId: parent, expectedVersion: (await item(b, parent)).version })
    await resume(b); await pause(b); await resume(a)
    page = await reviews(a); assert.equal(page.review?.itemId, child); assert.equal(page.review?.canUseLocal, false)
    await assert.rejects(resolveReview(a, 'local', page))
    await resolveReview(a, 'current', page); assert((await item(a, parent)).deletedAt)
    assert(!(await item(a, child)).deletedAt)
    check('An invalid parent link stays unavailable, and confirming the current result never restores its deleted endpoint')

  const newParent = (await command(a, { type: 'create', title: 'Parent deleted during offline creation', horizon: 'year', flowColor: 1 })).itemId
  await settle(a); await resume(b); await settle(a, b); await pause(a, b)
  const newTask = await command(a, { type: 'create', title: 'Offline new task survives', description: 'Retain this unsynced task body', horizon: 'day', parentId: newParent, expectedParentVersion: (await item(a, newParent)).version })
  await edit(a, newTask.itemId, { title: 'Latest offline task title', description: 'Retain the edited unsynced body' })
  await command(b, { type: 'delete', itemId: newParent, expectedVersion: (await item(b, newParent)).version })
  await resume(b); await pause(b); await resume(a)
  page = await reviews(a); assert.equal(page.review?.itemId, newTask.itemId); assert(page.review?.current.missing); assert(page.review?.canUseLocal)
  assert.equal(page.review?.local.missing, false); assert.deepEqual(page.review?.local.parents, [])
  await resolveReview(a, 'local', page); await settle(a); await resume(b); await settle(a, b)
  assert.equal((await item(a, newTask.itemId)).description, 'Retain the edited unsynced body')
  assert.equal((await item(b, newTask.itemId)).title, 'Latest offline task title')
  assert.equal((await item(b, newTask.itemId)).id, newTask.itemId); assert((await item(a, newParent)).deletedAt)
  check('An offline creation rejected after parent deletion can be kept as the same independent task, without restoring the parent or duplicating IDs')

    report.passed = true
  } catch (error) { report.failure = error instanceof Error ? error.stack : String(error); throw error }
  finally {
    await writeFile(join(out, 'cases.json'), JSON.stringify(report, null, 2))
    for (const peer of peers) await closePeer(peer).catch(() => undefined)
    await cloud.close(); await rm(root, { recursive: true, force: true })
  }
}
void run().catch(error => { console.error(error); process.exitCode = 1 })
