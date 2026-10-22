/**
 * [INPUT]: Isolated production repositories, native SQLite and an injected clock.
 * [OUTPUT]: Hidden local-group placement, anchor, atomic undo/rollback and scope regression checks.
 * [POS]: Ordering E2E transaction fixture; no renderer or packaged acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 *
 * Failure cases recorded before implementation:
 * - Archived/cancelled roots with visible local children fail to move after linking/unlinking.
 * - New tasks insert before a hidden same-parent root's visible local children.
 * - Remote or hidden children incorrectly make an invisible root eligible or an insertion anchor.
 * - Placement changes unrelated rows, separates relation undo, or partially commits on failure.
 * - Future local groups are skipped, or expired groups are automatically moved.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { localParentSql } from '@goalloom/store-core'
import { validateImport } from '../../src/domain/import-validation'
import { openDatabase, verifyDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import { exportDataset } from '../../src/main/workspace/transfer/dataset'

function workspace(startDate = '2026-10-01') {
  const db = openDatabase(':memory:'); migrate(db)
  const clock = { now: '2026-10-15T12:00:00Z' }, repo = new Repository(db, { now: () => clock.now })
  const run = (action: Record<string, unknown>) => repo.execute({ generation: repo.store.workspace().generation, operationId: randomUUID(), ...action })
  run({ type: 'confirmSetup', timezone: 'UTC', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-01-01' }, confirmed: true })
  const item = (id: string) => repo.store.item(id)
  const create = (title: string, parentId?: string, extra = {}) => run({ type: 'create', title, horizon: 'month', period: { kind: 'date', startDate },
    ...(parentId ? { parentId, expectedParentVersion: item(parentId).version } : {}), ...extra }).itemId!
  const a = run({ type: 'create', title: 'Goal A', horizon: 'cycle', flowColor: 0 }).itemId!
  const b = run({ type: 'create', title: 'Goal B', horizon: 'cycle', flowColor: 1 }).itemId!
  const nest = (childId: string, parentId: string) => run({ type: 'nest', itemId: childId, parentId, expectedVersion: item(childId).version,
    expectedPlacementVersion: item(childId).placement.version, expectedParentVersion: item(parentId).version, expectedParentPlacementVersion: item(parentId).placement.version })
  const hide = (id: string, lifecycle: 'archived' | 'cancelled') => run({ itemId: id, expectedVersion: item(id).version,
    ...(lifecycle === 'archived' ? { type: 'archive', archived: true } : { type: 'status', status: 'cancelled' }) })
  const link = (parentId: string, childId: string) => run({ type: 'link', parentId, childId, autoPlace: true,
    expectedParentVersion: item(parentId).version, expectedChildVersion: item(childId).version })
  const unlink = (parentId: string, childId: string) => run({ type: 'unlink', autoPlace: true,
    relationId: repo.store.relations().find(edge => edge.parentId === parentId && edge.childId === childId)!.id,
    expectedParentVersion: item(parentId).version, expectedChildVersion: item(childId).version })
  const roots = () => repo.store.summaries(`i.deletedAt IS NULL AND p.periodId IN (SELECT id FROM planning_periods WHERE horizon='month' AND startDate=?) AND ${localParentSql()} IS NULL`, [startDate]).map(row => row.title)
  const placements = (ids: string[]) => ids.map(id => item(id).placement)
  const data = () => exportDataset(repo.store, clock.now)
  const close = () => { validateImport(data(), clock.now); verifyDatabase(db); db.close() }
  return { db, repo, clock, run, item, create, nest, hide, link, unlink, roots, placements, data, close, a, b }
}

export function hiddenGroupPlacement(): string[] {
  const checks: string[] = []
  for (const lifecycle of ['archived', 'cancelled'] as const) for (const period of ['2026-10-01', '2026-11-01']) {
    const w = workspace(period)
    const a1 = w.create('A1', w.a), b1 = w.create('B1', w.b), root = w.create('Hidden root'), child = w.create('Visible child')
    w.nest(child, root); w.hide(root, lifecycle)
    const original = w.roots(), stable = w.placements([a1, b1, child]), lifecycleBefore = { status: w.item(root).status, archivedAt: w.item(root).archivedAt }
    const linked = w.link(w.a, root)
    assert.deepEqual(w.roots(), ['A1', 'Hidden root', 'B1'])
    assert.deepEqual(w.placements([a1, b1, child]), stable)
    assert.deepEqual(w.repo.store.operation(linked.operationId)!.effects.map(effect => effect.kind), ['relations', 'position'])
    w.run({ type: 'edit', itemId: root, expectedVersion: w.item(root).version, title: 'Hidden root', description: 'Keep later text', dueDate: null })
    assert.equal(w.run({ type: 'undo', originalOperationId: linked.operationId }).outcome, 'committed')
    assert.deepEqual(w.roots(), original)
    assert.equal(w.item(root).description, 'Keep later text')
    assert(!w.repo.store.relations().some(edge => edge.childId === root))
    w.link(w.a, root)
    const linkedPosition = w.item(root).placement
    w.link(w.b, root)
    assert.deepEqual(w.item(root).placement, linkedPosition)
    const unlinked = w.unlink(w.a, root)
    assert.deepEqual(w.roots(), ['A1', 'B1', 'Hidden root'])
    assert.deepEqual(w.placements([a1, b1, child]), stable)
    assert.equal(w.run({ type: 'undo', originalOperationId: unlinked.operationId }).outcome, 'committed')
    assert.deepEqual(w.roots(), ['A1', 'Hidden root', 'B1'])
    w.unlink(w.b, root)
    const last = w.unlink(w.a, root)
    assert.deepEqual(w.roots(), original)
    assert.equal(w.run({ type: 'undo', originalOperationId: last.operationId }).outcome, 'committed')
    assert.deepEqual(w.roots(), ['A1', 'Hidden root', 'B1'])
    assert.deepEqual({ status: w.item(root).status, archivedAt: w.item(root).archivedAt }, lifecycleBefore)
    w.unlink(w.a, root)
    const beforeFailure = w.data()
    w.db.exec(`CREATE TEMP TRIGGER reject_hidden_group_place BEFORE UPDATE OF sortKey ON item_placements WHEN NEW.itemId='${root}' BEGIN SELECT RAISE(ABORT, 'Injected placement failure'); END`)
    assert.throws(() => w.link(w.a, root))
    assert.deepEqual(w.data(), beforeFailure)
    w.db.exec('DROP TRIGGER reject_hidden_group_place')
    w.close()
    checks.push(`${lifecycle} root with a visible local child in ${period}: effective-parent link/unlink, secondary-parent stability, one-step undo and rollback preserve other placements and lifecycle`)
  }
  for (const lifecycle of ['archived', 'cancelled'] as const) {
    const w = workspace(), a1 = w.create('A1', w.a), root = w.create('Hidden A', w.a), child = w.create('Visible child')
    w.nest(child, root)
    const b1 = w.create('B1', w.b); w.hide(root, lifecycle)
    const stable = w.placements([a1, root, child, b1])
    w.create('New A', w.a, { autoPlace: true })
    assert.deepEqual(w.roots(), ['A1', 'Hidden A', 'New A', 'B1'])
    assert.deepEqual(w.placements([a1, root, child, b1]), stable)
    w.close()
    checks.push(`${lifecycle} local groups remain complete insertion anchors for newly created peers`)
  }
  for (const visibility of ['remote', 'archived', 'cancelled', 'deleted'] as const) {
    const w = workspace(), a1 = w.create('A1', w.a), root = w.create('Hidden A', w.a), child = w.create('Child')
    w.nest(child, root)
    const b1 = w.create('B1', w.b)
    if (visibility === 'remote') w.run({ type: 'move', itemId: child, horizon: 'month', period: { kind: 'date', startDate: '2026-11-01' }, expectedVersion: w.item(child).version, expectedPlacementVersion: w.item(child).placement.version })
    else if (visibility === 'deleted') w.run({ type: 'delete', itemId: child, expectedVersion: w.item(child).version })
    else w.hide(child, visibility)
    w.hide(root, 'archived')
    const stable = w.placements([a1, root, child, b1])
    w.create('New A', w.a, { autoPlace: true })
    assert.deepEqual(w.roots(), ['A1', 'New A', 'Hidden A', 'B1'])
    assert.deepEqual(w.placements([a1, root, child, b1]), stable)
    w.unlink(w.a, root); w.link(w.b, root)
    assert.deepEqual(w.item(root).placement, stable[1])
    w.close()
    checks.push(`${visibility} children do not make an invisible root eligible for placement or insertion anchoring`)
  }
  {
    const w = workspace(), a1 = w.create('A1', w.a), b1 = w.create('B1', w.b), root = w.create('Past hidden root'), child = w.create('Visible child')
    w.nest(child, root); w.hide(root, 'archived')
    const before = w.placements([a1, b1, root, child])
    w.clock.now = '2026-11-15T12:00:00Z'
    w.link(w.a, root)
    assert.deepEqual(w.placements([a1, b1, root, child]), before)
    w.close()
    checks.push('Expired hidden groups retain stored order when their goal parent changes')
  }
  return checks
}
