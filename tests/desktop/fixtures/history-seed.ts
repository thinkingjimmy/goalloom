/**
 * [INPUT]: 测试 runner 创建的隔离 profile 路径；真实今天。
 * [OUTPUT]: 使用正式 Repository 和注入时钟创建的历史业务样本。
 * [POS]: 仅测试夹具，绝不进入应用或增加生产时钟控制口。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { Temporal } from '@js-temporal/polyfill'
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
now = today.subtract({ months: 1 }).toInstant().toString()
repo.execute({ ...envelope(), type: 'status', itemId: completed.itemId, expectedVersion: 1, status: 'done' })
writeFileSync(join(path, 'fixture.json'), JSON.stringify({ waitingId: waiting.itemId, completedId: completed.itemId, sourceDate: old.with({ day: 1 }).toPlainDate().toString() }))
db.close()
