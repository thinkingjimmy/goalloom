import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { parseSyncOp } from '@goalloom/contracts'
import { openDatabase } from '../../src/main/storage/database'
import { migrate } from '../../src/main/storage/schema'
import { Repository } from '../../src/main/workspace/repository'
import type { CommandInput } from '../../src/shared/contracts/commands'

const now = '2026-09-23T02:00:00.000Z'
type WithoutEnvelope<T> = T extends unknown ? Omit<T, 'operationId' | 'generation'> : never

function harness() {
  const db = openDatabase(':memory:')
  migrate(db)
  const repo = new Repository(db, { now: () => now })
  const run = (command: WithoutEnvelope<CommandInput>) => repo.execute({ ...command, operationId: randomUUID(), generation: repo.store.workspace().generation } as CommandInput)
  run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, mode: 'rolling', anchor: { kind: 'date', date: '2026-09-21' }, confirmed: true })
  return { db, repo, run }
}

it('emits a field diff for edit and skips device-local commands', () => {
  const { db, run } = harness()
  const created = run({ type: 'create', title: '原来的标题', description: '正文', dueDate: null, horizon: 'later' })
  const item = db.prepare('SELECT version FROM items WHERE id=?').get(created.itemId)!
  run({ type: 'edit', itemId: created.itemId!, expectedVersion: Number(item.version), title: '新标题', description: '正文', dueDate: null })
  run({ type: 'preferences', theme: 'dark' })
  const rows = db.prepare("SELECT payload FROM sync_ops WHERE json_extract(payload,'$.actions[0].t')!='calendar.setup' ORDER BY localOrder").all()
  const create = parseSyncOp(JSON.parse(String(rows[0]!.payload)))
  const edit = parseSyncOp(JSON.parse(String(rows[1]!.payload)))
  expect(create.actions[0]).toMatchObject({ t: 'item.create', title: '原来的标题' })
  expect(edit.actions).toEqual([{ t: 'item.set', id: created.itemId, fields: { title: '新标题' } }])
  expect(db.prepare("SELECT count(*) AS n FROM sync_ops WHERE payload LIKE '%preferences%'").get()!.n).toBe(0)
  db.close()
})

it('maps status, archive, delete and link into one payload each', () => {
  const { db, repo, run } = harness()
  const created = run({ type: 'create', title: '任务', horizon: 'week' })
  const id = created.itemId!
  const version = () => repo.store.item(id).version
  run({ type: 'status', itemId: id, expectedVersion: version(), status: 'done' })
  run({ type: 'status', itemId: id, expectedVersion: version(), status: 'todo' })
  const other = run({ type: 'create', title: '上级', horizon: 'cycle', flowColor: 1 })
  run({ type: 'link', parentId: other.itemId!, childId: id, expectedParentVersion: repo.store.item(other.itemId!).version, expectedChildVersion: version() })
  run({ type: 'archive', itemId: id, expectedVersion: version(), archived: true })
  const kinds = db.prepare("SELECT json_extract(payload,'$.actions[0].t') AS t FROM sync_ops ORDER BY localOrder").all().map(row => row.t)
  expect(kinds).toContain('item.status')
  expect(kinds).toContain('item.archive')
  expect(kinds).toContain('rel.link')
  db.close()
})

it('maps move, colour, policy, delete, restore and unlink, and skips device-local commands', () => {
  const { db, repo, run } = harness()
  const created = run({ type: 'create', title: '要移动', horizon: 'later' })
  const id = created.itemId!
  const version = () => repo.store.item(id).version
  const placement = () => repo.store.item(id).placement.version
  run({ type: 'move', itemId: id, expectedVersion: version(), expectedPlacementVersion: placement(), horizon: 'week' })
  run({ type: 'flowColor', itemId: id, expectedVersion: version(), flowColor: 2 })
  run({ type: 'policy', horizon: 'week', mode: 'auto', expectedVersion: 1 })
  const child = run({ type: 'create', title: '下级', horizon: 'day' })
  run({ type: 'link', parentId: id, childId: child.itemId!, expectedParentVersion: version(), expectedChildVersion: repo.store.item(child.itemId!).version })
  const relationId = String(db.prepare('SELECT id FROM item_relations WHERE invalidatedAt IS NULL AND childId=?').get(child.itemId!)!.id)
  run({ type: 'unlink', relationId, expectedParentVersion: version(), expectedChildVersion: repo.store.item(child.itemId!).version })
  const deleted = run({ type: 'delete', itemId: id, expectedVersion: version() })
  run({ type: 'restoreItem', itemId: id, expectedVersion: version(), deletionSource: deleted.operationId ?? null })
  const before = Number(db.prepare('SELECT count(*) AS n FROM sync_ops').get()!.n)
  run({ type: 'backupPreferences', enabled: false, retention: 3 })
  run({ type: 'confirmClock', confirmed: true })
  expect(Number(db.prepare('SELECT count(*) AS n FROM sync_ops').get()!.n)).toBe(before)
  const kinds = db.prepare("SELECT json_extract(payload,'$.actions[0].t') AS t FROM sync_ops").all().map(row => String(row.t))
  for (const kind of ['item.place', 'item.set', 'policy.set', 'rel.unlink', 'item.delete', 'item.restore']) expect(kinds).toContain(kind)
  const never = run({ type: 'create', title: '未发送', horizon: 'later' })
  run({ type: 'undo', originalOperationId: never.operationId! })
  expect(String(db.prepare('SELECT state FROM sync_ops WHERE opId=?').get(never.operationId!)!.state)).toBe('reverted_local')
  db.close()
})
