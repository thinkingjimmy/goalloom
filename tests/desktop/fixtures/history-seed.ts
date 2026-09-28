/**
 * [INPUT]: Isolated profile path and the real workspace date.
 * [OUTPUT]: Live past-period tasks, independent end-state history, moved/archived/cancelled exclusions and 55-row pagination.
 * [POS]: Desktop-only injected-clock fixture; no production clock override.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Temporal } from '../../../src/domain/temporal'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { openDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
const today = Temporal.Now.zonedDateTimeISO('Asia/Shanghai')
const old = today.subtract({ months: 2 }).with({ day: 10 })
let now = old.toInstant().toString()
const path = process.argv[2]!
const db = openDatabase(join(path, 'workspace.sqlite')); migrate(db)
const repo = new Repository(db, { now: () => now }), generation = repo.store.workspace().generation
const envelope = () => ({ generation, operationId: randomUUID() })
repo.execute({ ...envelope(), type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: old.subtract({ months: 3 }).toPlainDate().toString(), confirmed: true })
const waiting = repo.execute({ ...envelope(), type: 'create', title: '往期待办样本', horizon: 'month' })
const completed = repo.execute({ ...envelope(), type: 'create', title: '后来完成样本', horizon: 'month' })
const finished = repo.execute({ ...envelope(), type: 'create', title: '当期完成样本', horizon: 'month' })
repo.execute({ ...envelope(), type: 'status', itemId: finished.itemId, expectedVersion: 1, status: 'done' })
const moved = repo.execute({ ...envelope(), type: 'create', title: '当期移出样本', horizon: 'month' })
repo.execute({ ...envelope(), type: 'move', itemId: moved.itemId, expectedVersion: 1, expectedPlacementVersion: 1, horizon: 'later' })
const cancelled = repo.execute({ ...envelope(), type: 'create', title: '当期取消样本', horizon: 'month' })
repo.execute({ ...envelope(), type: 'status', itemId: cancelled.itemId, expectedVersion: 1, status: 'cancelled' })
const deleted = repo.execute({ ...envelope(), type: 'create', title: '当期删除样本', horizon: 'month' })
repo.execute({ ...envelope(), type: 'delete', itemId: deleted.itemId, expectedVersion: 1 })
const laterDeleted = repo.execute({ ...envelope(), type: 'create', title: '后来删除样本', horizon: 'month' })
const rolled = repo.execute({ ...envelope(), type: 'create', title: '已经顺延样本', horizon: 'month' })
const laterMoved = repo.execute({ ...envelope(), type: 'create', title: '完成后移走样本', horizon: 'month' })
repo.execute({ ...envelope(), type: 'status', itemId: laterMoved.itemId, expectedVersion: 1, status: 'done' })
const archived = repo.execute({ ...envelope(), type: 'create', title: '已归档样本', horizon: 'month' })
repo.execute({ ...envelope(), type: 'status', itemId: archived.itemId, expectedVersion: 1, status: 'done' })
now = today.subtract({ months: 1 }).toInstant().toString()
repo.execute({ ...envelope(), type: 'status', itemId: completed.itemId, expectedVersion: 1, status: 'done' })
repo.execute({ ...envelope(), type: 'delete', itemId: laterDeleted.itemId, expectedVersion: 1 })
now = today.subtract({ days: 1 }).toInstant().toString()
const rolledDays: string[] = []
for (let index = 1; index <= 55; index++) {
  const result = repo.execute({ ...envelope(), type: 'create', title: `Past completed row ${index}`, horizon: 'day' })
  repo.execute({ ...envelope(), type: 'status', itemId: result.itemId, expectedVersion: 1, status: 'done' })
  rolledDays.push(repo.execute({ ...envelope(), type: 'create', title: `Rolled day row ${index}`, horizon: 'day' }).itemId!)
}
now = today.toInstant().toString()
repo.execute({ ...envelope(), type: 'move', itemId: laterMoved.itemId, expectedVersion: 2, expectedPlacementVersion: 1, horizon: 'later' })
repo.execute({ ...envelope(), type: 'archive', itemId: archived.itemId, expectedVersion: 2, archived: true })
for (const itemId of [rolled.itemId!, ...rolledDays]) {
  const item = repo.store.item(itemId)
  repo.execute({ ...envelope(), type: 'move', itemId, expectedVersion: item.version, expectedPlacementVersion: item.placement.version, horizon: item.placement.horizon })
}
// Current placement stays authoritative even when a rollover is outside the history detail tail.
for (let index = 0; index < 6; index++) repo.execute({ ...envelope(), type: 'status', itemId: rolled.itemId, expectedVersion: repo.store.item(rolled.itemId!).version, status: index % 2 === 0 ? 'done' : 'todo' })
writeFileSync(join(path, 'fixture.json'), JSON.stringify({ waitingId: waiting.itemId, completedId: completed.itemId, finishedId: finished.itemId, deletedId: deleted.itemId, laterMovedId: laterMoved.itemId, archivedId: archived.itemId, sourceDate: old.with({ day: 1 }).toPlainDate().toString() }))
db.close()
