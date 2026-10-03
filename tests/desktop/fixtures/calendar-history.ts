/**
 * [INPUT]: Fresh isolated profile and the host's UTC date under Electron Node/SQLite.
 * [OUTPUT]: Completed historical year/half/cycle records and reversed current half/cycle parent groups.
 * [POS]: Production Repository fixture for period counts, live past pages and native order restart acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { openDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
import { parseDate } from '../../../src/domain/calendar'

const profile = process.argv[2]!
const today = parseDate(new Date().toISOString().slice(0, 10))
const anchor = today.subtract({ months: 24 }).toString()
let now = `${anchor}T00:00:00Z`
const db = openDatabase(join(profile, 'workspace.sqlite')); migrate(db)
const repo = new Repository(db, { now: () => now })
const run = (action: Record<string, unknown>) => repo.execute({ generation: repo.store.workspace().generation, operationId: randomUUID(), ...action })
run({ type: 'confirmSetup', mode: 'rolling', timezone: 'UTC', weekStart: 1, anchor: { kind: 'date', date: anchor }, confirmed: true })
for (const months of [24, 12, 6]) {
  now = `${today.subtract({ months }).toString()}T00:00:00Z`
  for (const horizon of ['year', 'half', 'cycle']) {
    const id = run({ type: 'create', title: `Recorded ${horizon} ${months}`, horizon }).itemId!
    run({ type: 'status', itemId: id, expectedVersion: 1, status: 'done' })
  }
}
now = new Date().toISOString()
const a = run({ type: 'create', title: 'Annual A', horizon: 'year' }).itemId!
const b = run({ type: 'create', title: 'Annual B', horizon: 'year' }).itemId!
for (const horizon of ['half', 'cycle']) {
  run({ type: 'create', title: `${horizon} B`, horizon, parentId: b, expectedParentVersion: repo.store.item(b).version })
  run({ type: 'create', title: `${horizon} A`, horizon, parentId: a, expectedParentVersion: repo.store.item(a).version })
}
db.exec('PRAGMA wal_checkpoint(TRUNCATE)'); db.close()
