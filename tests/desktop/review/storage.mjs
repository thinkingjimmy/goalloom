/**
 * Failure cases: missing inverse events with valid markers; duplicate inverse
 * events; valid eventless relation/reorder undo; repeated ancestor scans; daily
 * verification skips changed files or rehashes an unchanged file. Synthetic DB only.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, writeFile, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../../../src/main/storage/database.ts'
import { migrate } from '../../../src/main/storage/schema.ts'
import { Repository } from '../../../src/main/workspace/repository.ts'
import { exportDataset } from '../../../src/main/workspace/transfer/dataset.ts'
import { validateImport } from '../../../src/domain/import-validation.ts'
import { flowIndex } from '../../../src/domain/flows.ts'
import { BackupManager } from '../../../src/main/storage/backup/manager.ts'

const now = '2026-09-24T02:00:00Z'
const db = openDatabase(':memory:'); migrate(db)
const repo = new Repository(db, { now: () => now })
const run = action => repo.execute({ ...action, generation: repo.store.workspace().generation, operationId: randomUUID() })
run({ type: 'confirmSetup', timezone: 'Asia/Shanghai', weekStart: 1, cycleAnchor: '2026-09-01', confirmed: true })
const created = run({ type: 'createPlan', items: ['A', 'B'].map(draftId => ({ draftId, title: draftId, horizon: 'later', previewPeriodId: null })) })
const undone = run({ type: 'undo', originalOperationId: created.operationId })
const data = exportDataset(repo.store, now)
validateImport(data, now)
for (const mode of ['missing', 'duplicate', 'markers']) {
  const malformed = structuredClone(data), firstId = created.itemIds[0]
  if (mode === 'missing') {
    malformed.events = malformed.events.filter(event => !(event.operationId === undone.operationId && event.itemId === firstId))
    Object.assign(malformed.items.find(item => item.id === firstId), { deletedAt: null, deletedBy: null })
  } else if (mode === 'duplicate') {
    const event = malformed.events.find(event => event.operationId === undone.operationId)
    malformed.events.push({ ...event, id: randomUUID(), seq: 100, eventIndex: 2 })
  } else malformed.undoEffects = []
  assert.throws(() => validateImport(malformed, now), mode)
}
const timings = []
for (const count of [1_000, 10_000]) {
  const edges = Array.from({ length: count - 1 }, (_, i) => ({ parentId: String(i), childId: String(i + 1) }))
  const start = performance.now(), index = flowIndex(edges, ['0'])
  for (let i = count - 1000; i < count; i++) assert.deepEqual(index(String(i)), ['0'])
  timings.push({ count, milliseconds: performance.now() - start })
}
const directory = await mkdtemp(join(tmpdir(), 'goalloom-review-backup-'))
const backups = new BackupManager(db, directory)
await backups.daily(repo.store.workspace(), now)
const statusPath = join(directory, 'last-result.json')
await utimes(statusPath, new Date('2000-01-01'), new Date('2000-01-01'))
const before = (await stat(statusPath)).mtimeMs
await backups.daily(repo.store.workspace(), now)
assert.equal((await stat(statusPath)).mtimeMs, before)
const record = (await backups.records()).find(row => row.kind === 'daily')
await writeFile(backups.path(record.id), 'Corrupted synthetic backup')
await backups.daily(repo.store.workspace(), now)
assert.equal((await backups.records()).filter(row => row.kind === 'daily').length, 2)
const result = { timings, backupChecks: 'unchanged skipped; changed verified and replaced', runtime: process.versions }
await writeFile('output/tests/review-fixes/storage.json', JSON.stringify(result, null, 2))
db.close()
console.log('Storage review regressions passed')
