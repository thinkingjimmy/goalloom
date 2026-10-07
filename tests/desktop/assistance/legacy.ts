/**
 * [INPUT]: An isolated profile path.
 * [OUTPUT]: Synthetic v7 source with real setup, task, events and receipts; no guidance data.
 * [POS]: Startup-upgrade fixture only; never reads or changes the owner's workspace.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { openDatabase } from '../../../src/main/storage/database'
import { migrate } from '../../../src/main/storage/schema'
import { Repository } from '../../../src/main/workspace/repository'
const db = openDatabase(join(process.argv[2]!, 'workspace.sqlite')); migrate(db)
try {
  const repo = new Repository(db, { now: () => '2026-10-01T12:00:00Z' }), generation = repo.store.workspace().generation
  repo.execute({ type: 'confirmSetup', generation, operationId: randomUUID(), mode: 'rolling', timezone: 'UTC', weekStart: 1, anchor: { kind: 'date', date: '2026-09-01' }, confirmed: true })
  repo.execute({ type: 'create', generation, operationId: randomUUID(), title: 'Synthetic legacy v7 task', description: 'Preserve this saved text', horizon: 'week' })
  repo.execute({ type: 'preferences', generation, operationId: randomUUID(), theme: 'dark', style: 'minimal', checkStyle: 'tint' })
  db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE; DROP TABLE item_guidance; PRAGMA user_version=7')
} finally { db.close() }
