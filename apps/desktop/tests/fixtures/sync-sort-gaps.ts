/**
 * [INPUT]: Two isolated production repositories, pending rebuild and encrypted exchange callbacks.
 * [OUTPUT]: Root/sibling gap exhaustion, normalization scope and semantic undo evidence on both peers.
 * [POS]: Sync replay regression fixture. Failure cases are declared before the scenario implementation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 *
 * Failure cases:
 * - Repeated creation or parent linking exhausts a midpoint and changes order during pending/canonical replay.
 * - Sibling insertion normalizes unrelated roots, other child groups or another period.
 * - Normalization changes old receipts, emits unrelated placement effects or rolls versions back.
 * - Undo restores an obsolete numeric key after another gap is normalized, or loses unrelated text.
 * - A non-finite/boundary key escapes the shared allocator and produces duplicate persisted keys.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { localParentSql } from '@goalloom/store-core'
import type { Repository } from '../../src/main/workspace/repository'
import type { CommandInput } from '../../src/shared/contracts/commands'
import { Temporal } from '../../src/domain/temporal'

type LocalCommand<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never
export interface SortGapObservation { name: string; phase: string; expected: string[]; actual: string[]; uniqueKeys: boolean }
interface Options {
  first: Repository; second: Repository; rebuild: () => void; sync: () => Promise<void>
  checks: string[]; observations: SortGapObservation[]
}

export async function syncSortGaps({ first, second, rebuild, sync, checks, observations }: Options): Promise<void> {
  const run = (command: LocalCommand<CommandInput>) => first.execute({ ...command, operationId: randomUUID(), generation: first.store.workspace().generation })
  const day = first.snapshot().periods.find(period => period.horizon === 'day')!
  const start = (offset: number) => Temporal.PlainDate.from(day.startDate).add({ days: offset }).toString()
  const create = (title: string, date: string, extra: Record<string, unknown> = {}) => run({
    type: 'create', title, horizon: 'day', period: { kind: 'date', startDate: date }, ...extra,
  })
  const nested = (title: string, parentId: string, date: string) => {
    const parent = first.store.item(parentId)
    return create(title, date, { nesting: { parentId, expectedParentVersion: parent.version, expectedParentPlacementVersion: parent.placement.version } })
  }
  const rows = (repo: Repository, periodId: string, parentId: string | null = null) => repo.db.prepare(`SELECT p.itemId,p.sortKey,p.version FROM item_placements p
    JOIN items i ON i.id=p.itemId WHERE i.deletedAt IS NULL AND p.horizon='day' AND p.periodId=? AND ${localParentSql()} IS ? ORDER BY p.sortKey,p.itemId`).all(periodId, parentId)
  const observe = (name: string, phase: string, expected: string[], repo: Repository, periodId: string, parentId: string | null = null) => {
    const current = rows(repo, periodId, parentId), actual = current.map(row => String(row.itemId))
    const uniqueKeys = new Set(current.map(row => Number(row.sortKey))).size === current.length
    observations.push({ name, phase, expected, actual, uniqueKeys })
    assert.deepEqual(actual, expected, `${name}: ${phase} preserves committed order`)
    assert(uniqueKeys, `${name}: ${phase} keeps distinct sibling keys`)
    assert(current.every(row => Number.isFinite(Number(row.sortKey)) && Math.abs(Number(row.sortKey)) <= 1e15))
  }
  const verify = async (name: string, expected: string[], periodId: string, parentId: string | null = null) => {
    observe(name, 'local', expected, first, periodId, parentId)
    rebuild()
    observe(name, 'pending replay', expected, first, periodId, parentId)
    await sync()
    observe(name, 'canonical writer', expected, first, periodId, parentId)
    observe(name, 'canonical peer', expected, second, periodId, parentId)
  }
  const versionRows = (repo: Repository, ids: string[]) => repo.db.prepare(`SELECT i.id,i.version AS itemVersion,p.version AS placementVersion,p.sortKey,p.nestingParentId
    FROM items i JOIN item_placements p ON p.itemId=i.id WHERE i.id IN (SELECT value FROM json_each(?)) ORDER BY i.id`).all(JSON.stringify(ids))
  const usedColors = new Set(first.store.items('i.deletedAt IS NULL AND i.flowColor IS NOT NULL').map(item => item.flowColor))
  const flowColor = [0, 1, 2, 3, 4, 5, 6, 7].find(color => !usedColors.has(color))!
  const goal = run({ type: 'create', title: 'Gap-safe parent placement goal', horizon: 'month', flowColor }).itemId!
  const linked = (title: string, date: string, autoPlace = false) => create(title, date, { parentId: goal, expectedParentVersion: first.store.item(goal).version, autoPlace })

  for (const [offset, mode] of [[11, 'create'], [12, 'link']] as const) {
    const date = start(offset), sibling = linked(`Gap ${mode} existing sibling`, date).itemId!
    const tail = create(`Gap ${mode} independent tail`, date).itemId!
    const untouchedChild = nested(`Gap ${mode} untouched local child`, tail, date).itemId!
    const untouchedPeriod = create(`Gap ${mode} other period`, start(offset + 20)).itemId!
    const candidates = mode === 'link' ? Array.from({ length: 60 }, (_, index) => create(`Gap link candidate ${index}`, date).itemId!) : []
    await sync()
    const untouched = [untouchedChild, untouchedPeriod], before = versionRows(first, untouched), peerBefore = versionRows(second, untouched)
    const canonicalBefore = Number(first.db.prepare('SELECT coalesce(max(seq),0) AS seq FROM canon_ops').get()!.seq)
    const periodId = first.store.item(sibling).placement.periodId!, expected = [sibling]
    for (let index = 0; index < 60; index++) {
      if (mode === 'create') expected.push(linked(`Gap created ${index}`, date, true).itemId!)
      else {
        const childId = candidates[index]!
        run({ type: 'link', parentId: goal, childId, autoPlace: true,
          expectedParentVersion: first.store.item(goal).version, expectedChildVersion: first.store.item(childId).version })
        expected.push(childId)
      }
    }
    expected.push(tail)
    assert.deepEqual(versionRows(first, untouched), before, `${mode}: local normalization leaves other groups and periods unchanged`)
    await verify(`Repeated automatic ${mode}`, expected, periodId)
    assert.deepEqual(versionRows(second, untouched), peerBefore, `${mode}: canonical normalization leaves other groups and periods unchanged`)
    for (const repo of [first, second]) assert.equal(Number(repo.db.prepare(`SELECT count(*) AS n FROM canon_changes WHERE seq>? AND dim='placement'
      AND itemId IN (SELECT value FROM json_each(?))`).get(canonicalBefore, JSON.stringify([sibling, tail, ...untouched]))!.n), 0,
    `${mode}: numeric normalization must not claim semantic placement effects for older tasks`)
    checks.push(`Sixty automatic ${mode} insertions preserve order and distinct keys through pending replay and both encrypted peers without touching other groups or periods`)
  }

  const date = start(13), owner = create('Gap sibling owner', date).itemId!, otherOwner = create('Gap independent sibling owner', date).itemId!
  const firstChild = nested('Gap first child', owner, date).itemId!, lastChild = nested('Gap last child', owner, date).itemId!
  const otherChild = nested('Gap independent child', otherOwner, date).itemId!
  const candidates = Array.from({ length: 60 }, (_, index) => create(`Gap nested candidate ${index}`, date).itemId!)
  await sync()
  const untouched = [owner, otherOwner, otherChild], before = versionRows(first, untouched), peerBefore = versionRows(second, untouched)
  const periodId = first.store.item(owner).placement.periodId!, expected = [firstChild]
  for (const childId of candidates) {
    const child = first.store.item(childId), parent = first.store.item(owner)
    run({ type: 'nest', itemId: childId, parentId: owner, beforeId: lastChild,
      expectedVersion: child.version, expectedPlacementVersion: child.placement.version,
      expectedParentVersion: parent.version, expectedParentPlacementVersion: parent.placement.version })
    expected.push(childId)
  }
  expected.push(lastChild)
  assert.deepEqual(versionRows(first, untouched), before, 'Sibling normalization must not change roots or another sibling group')
  await verify('Repeated sibling insertion', expected, periodId, owner)
  assert.deepEqual(versionRows(second, untouched), peerBefore)
  checks.push('Sixty ordered nesting operations normalize only the destination siblings, retaining root/other-group versions and order on both encrypted peers')

  const undoDate = start(14)
  const [left, moved, right, tail, gapLeft, gapRight] = ['left', 'moved', 'right', 'tail', 'gap left', 'gap right']
    .map(name => create(`Gap undo ${name}`, undoDate).itemId!)
  await sync()
  const target = first.store.item(moved!)
  const movedReceipt = run({ type: 'move', itemId: moved!, horizon: 'day', period: { kind: 'date', startDate: undoDate }, beforeId: tail!,
    expectedVersion: target.version, expectedPlacementVersion: target.placement.version })
  await sync()
  const oldReceipt = first.db.prepare('SELECT effects,result FROM operations WHERE id=?').get(movedReceipt.operationId)
  const inserted = Array.from({ length: 60 }, (_, index) => create(`Gap undo insertion ${index}`, undoDate, { beforeId: gapRight }).itemId!)
  const undoPeriod = first.store.item(moved!).placement.periodId!
  await verify('Gap normalization before old undo', [left!, right!, moved!, tail!, gapLeft!, ...inserted, gapRight!], undoPeriod)
  const edited = first.store.item(moved!)
  run({ type: 'edit', itemId: moved!, title: 'Retained text after normalization', description: 'Unrelated notes remain', dueDate: null, expectedVersion: edited.version })
  await sync()
  assert.deepEqual(first.db.prepare('SELECT effects,result FROM operations WHERE id=?').get(movedReceipt.operationId), oldReceipt)
  const undo = run({ type: 'undo', originalOperationId: movedReceipt.operationId })
  assert.equal(undo.outcome, 'committed')
  await verify('Semantic undo after normalization', [left!, moved!, right!, tail!, gapLeft!, ...inserted, gapRight!], undoPeriod)
  for (const repo of [first, second]) assert.equal(repo.store.item(moved!).description, 'Unrelated notes remain')
  checks.push('Undo after another gap normalizes restores semantic neighbors on both peers, keeps unrelated text and does not rewrite the original receipt')
}
