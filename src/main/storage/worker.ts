/**
 * [INPUT]: Main-owned file paths, locale, injected clock and narrow internal RPC.
 * [OUTPUT]: Serialized SQLite work, worker-local transfer and typed failures.
 * [POS]: Storage composition root; protected migrations finish before requests and cloud work stays outside the queue.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { parentPort, workerData } from 'node:worker_threads'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { z, ZodError } from 'zod'
import { locales } from '../../shared/i18n/locale'
import { DomainError } from '../../shared/contracts/commands'
import { querySchema } from '../../shared/contracts/queries'
import type { DatabaseSync } from 'node:sqlite'
import { openWorkspace, StartupError } from './startup'
import { Repository } from '../workspace/repository'
import { activitySummary, batchPage, batchSummaries, itemCounts } from '../workspace/queries'
import { readActivity, readHistory, readHistoryIndex } from '../workspace/history'
import { WorkspaceService } from '../workspace/transfer/service'
import { readJson, writeDataset } from '../workspace/transfer/files'
import { serverText, setServerLocale } from '../../shared/i18n/server'

if (!parentPort) throw new Error('存储服务只能由主进程启动')
const port = parentPort
setServerLocale(workerData.locale)
mkdirSync(dirname(workerData.databasePath), { recursive: true })
const clock = { now: () => new Date().toISOString() }
let db: DatabaseSync, repository: Repository, service: WorkspaceService
let startup: { ok: true; protectivePath: string | null } | { ok: false; message: string; backupPath: string | null; backupDirectory: string }
const initialized = openWorkspace(workerData.databasePath, workerData.backupDirectory, clock.now).then(opened => {
  db = opened.db
  repository = new Repository(db, clock)
  service = new WorkspaceService(repository, workerData.backupDirectory)
  startup = { ok: true, protectivePath: opened.protective ? service.backups.path(opened.protective.id) : null }
}, error => {
  startup = { ok: false, message: error instanceof StartupError ? error.message : serverText().storage.openFailed, backupPath: error instanceof StartupError ? error.backupPath : null, backupDirectory: workerData.backupDirectory }
})

function handle(method: string, argument: unknown): unknown {
  if (method === 'startup') return startup
  if (method === 'locale') { setServerLocale(z.enum(locales).parse(argument)); return null }
  if (!startup.ok) { if (method === 'close') return null; throw new DomainError('startup', startup.message) }
  if (method === 'close') { db.close(); return null }
  if (method === 'candidate') return repository.store.summaries('i.id=?', [z.string().max(180).parse(argument)])[0] ?? null
  if (method === 'metadata') return { ...repository.metadata(), backupError: service.backups.lastError }
  if (method === 'runtime') return { sqlite: String(db.prepare('SELECT sqlite_version() AS version').get()!.version) }
  if (method === 'command') return repository.execute(argument)
  if (method === 'export') return writeDataset(repository.store, z.string().min(1).parse(argument), repository.clock.now())
  if (method === 'data') return service.action(argument)
  if (method === 'releaseTransfer') { service.release(); return null }
  if (method === 'reconcile') return service.reconcile()
  if (method === 'previewImport') {
    const source = z.strictObject({ generation: z.string(), format: z.enum(['json', 'sqlite']), path: z.string().min(1) }).parse(argument)
    if (source.format === 'sqlite') return service.previewSqlite(source.path!, source.generation)
    return readJson(source.path).then(content => service.previewImport(content, source.generation))
  }
  if (method !== 'query') throw new DomainError('invalid', serverText().storage.unknownMethod)
  const query = querySchema.parse(argument)
  switch (query.type) {
    case 'snapshot': return { ...repository.snapshot(), backupError: service.backups.lastError }
    case 'item': return repository.detail(query.itemId)
    case 'list': return repository.list(query)
    case 'history': return readHistory(repository.store, query, repository.clock.now())
    case 'historyIndex': return readHistoryIndex(repository.store, query, repository.clock.now())
    case 'activity': return readActivity(repository.store, query)
    case 'batches': return batchSummaries(repository.store)
    case 'batchItems': return batchPage(repository.store, query.operationId, query.offset, query.limit)
    case 'backupSummary': return service.backups.records().then(records => ({ latest: records[0]?.createdAt ?? null, total: records.length }))
    case 'counts': return itemCounts(repository.store)
    case 'activitySummary': return activitySummary(repository.store, query.itemId)
    case 'receipt': {
      if (repository.store.workspace().generation !== query.generation) throw new DomainError('generation', serverText().errors.workspaceReplacedShort)
      return repository.store.operation(query.operationId)?.result ?? null
    }
  }
}
let queue: Promise<void> = initialized
port.on('message', (request: { id: number; method: string; argument: unknown }) => {
  queue = queue.then(async () => {
    try {
      const value = await handle(request.method, request.argument)
      port.postMessage({ id: request.id, ok: true, value })
      if (request.method === 'close') port.close()
    }
    catch (error) {
      const known = error instanceof DomainError
      const dataType = request.method === 'data' ? (request.argument as { type?: string } | null)?.type : null
      const fallback = request.method === 'previewImport' || dataType === 'previewBackup' ? { code: 'import', message: serverText().errors.fileCheckFailed }
        : dataType === 'prepare' || dataType === 'createBackup' || request.method === 'reconcile' ? { code: 'backup', message: serverText().storage.backupFailed }
        : dataType === 'commit' ? { code: 'restore', message: serverText().storage.failed }
        : request.method === 'query' || request.method === 'export' ? { code: 'read', message: serverText().storage.failed }
        : { code: 'storage', message: serverText().storage.saveFailed }
      port.postMessage({ id: request.id, ok: false, code: known ? error.code : error instanceof ZodError ? 'invalid' : fallback.code, message: known ? error.message : error instanceof ZodError ? serverText().storage.invalidRequest : fallback.message })
    }
  })
})
