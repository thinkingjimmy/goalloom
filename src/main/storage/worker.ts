/**
 * [INPUT]: main 注入的数据路径与受限 RPC，系统时钟由组合根注入。
 * [OUTPUT]: 串行 SQLite 命令/查询、完整导出；错误不泄露任务正文或路径。
 * [POS]: 存储线程组合根；装配 storage 适配器与 workspace 服务，不承载业务规则。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { parentPort, workerData } from 'node:worker_threads'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { ZodError } from 'zod'
import { DomainError } from '../../shared/contracts/commands'
import { querySchema } from '../../shared/contracts/queries'
import { openDatabase } from './database'
import { migrate } from './schema'
import { Repository } from '../workspace/repository'
import { readActivity, readHistory } from '../workspace/history'
import { WorkspaceService } from '../workspace/transfer/service'
import { exportDataset, readSqliteDataset } from '../workspace/transfer/dataset'

if (!parentPort) throw new Error('存储服务只能由主进程启动')
const port = parentPort
mkdirSync(dirname(workerData.databasePath), { recursive: true })
const db = openDatabase(workerData.databasePath)
migrate(db)
const repository = new Repository(db, { now: () => new Date().toISOString() })
const service = new WorkspaceService(repository, workerData.backupDirectory)

function handle(method: string, argument: unknown): unknown {
  if (method === 'close') { db.close(); return null }
  if (method === 'runtime') return { sqlite: String(db.prepare('SELECT sqlite_version() AS version').get()!.version) }
  if (method === 'command') return repository.execute(argument)
  if (method === 'export') return exportDataset(repository.store, repository.clock.now())
  if (method === 'data') return service.action(argument)
  if (method === 'reconcile') return service.reconcile()
  if (method === 'previewImport') {
    const source = argument as { generation: string; format: 'json' | 'sqlite'; content?: unknown; path?: string }
    if (source.format === 'sqlite') return readSqliteDataset(source.path!, repository.clock.now()).then(data => service.previewImport(data, source.generation))
    return service.previewImport(source.content, source.generation)
  }
  if (method !== 'query') throw new DomainError('invalid', '未知存储操作')
  const query = querySchema.parse(argument)
  switch (query.type) {
    case 'snapshot': return { ...repository.snapshot(), backupError: service.backups.lastError }
    case 'item': return repository.detail(query.itemId)
    case 'list': return repository.list(query)
    case 'history': return readHistory(repository.store, query, repository.clock.now())
    case 'activity': return readActivity(repository.store, query)
    case 'batches': return db.prepare("SELECT id FROM operations WHERE kind='rollover' AND source='system' ORDER BY rowid DESC LIMIT 50").all().map(row => {
      const operation = repository.store.operation(String(row.id))!
      const undone = Number(db.prepare('SELECT count(*) AS n FROM undo_effects WHERE originalId=?').get(operation.id)!.n)
      return { id: operation.id, at: operation.at, total: operation.effects.length, undone, items: operation.effects.filter(effect => effect.kind === 'position').map(effect => ({ id: effect.itemId, title: repository.store.item(effect.itemId).title, from: effect.before.periodId ? repository.store.period(effect.before.periodId).startDate : 'Later', to: effect.after.periodId ? repository.store.period(effect.after.periodId).startDate : 'Later' })) }
    })
    case 'receipt': {
      if (repository.store.workspace().generation !== query.generation) throw new DomainError('generation', '工作区已更换')
      return repository.store.operation(query.operationId)?.result ?? null
    }
  }
}
let queue = Promise.resolve()
port.on('message', (request: { id: number; method: string; argument: unknown }) => {
  queue = queue.then(async () => {
    try {
      port.postMessage({ id: request.id, ok: true, value: await handle(request.method, request.argument) })
      if (request.method === 'close') port.close()
    }
    catch (error) {
      const known = error instanceof DomainError
      port.postMessage({ id: request.id, ok: false, code: known ? error.code : error instanceof ZodError ? 'invalid' : 'storage', message: known ? error.message : error instanceof ZodError ? '请求参数无效' : '本地保存失败，请核对结果后重试' })
    }
  })
})
