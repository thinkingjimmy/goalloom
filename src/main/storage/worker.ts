/**
 * [INPUT]: main 注入的数据路径与受限 RPC，系统时钟由组合根注入。
 * [OUTPUT]: 串行 SQLite 命令/查询、完整导出；错误不泄露任务正文或路径。
 * [POS]: 权威存储线程；数据库操作不占用 Electron 主线程。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { parentPort, workerData } from 'node:worker_threads'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { ZodError } from 'zod'
import { DomainError } from '../../shared/contracts/commands'
import { querySchema } from '../../shared/contracts/queries'
import { openDatabase } from './database'
import { migrate, schemaVersion } from './schema'
import { Repository } from './repository'

if (!parentPort) throw new Error('存储服务只能由主进程启动')
const port = parentPort
mkdirSync(dirname(workerData.databasePath), { recursive: true })
const db = openDatabase(workerData.databasePath)
migrate(db)
const repository = new Repository(db, { now: () => new Date().toISOString() })

function handle(method: string, argument: unknown): unknown {
  if (method === 'close') { db.close(); return null }
  if (method === 'runtime') return { sqlite: String(db.prepare('SELECT sqlite_version() AS version').get()!.version) }
  if (method === 'command') return repository.execute(argument)
  if (method === 'export') return exportWorkspace()
  if (method !== 'query') throw new DomainError('invalid', '未知存储操作')
  const query = querySchema.parse(argument)
  switch (query.type) {
    case 'snapshot': return repository.snapshot()
    case 'item': return repository.detail(query.itemId)
    case 'list': return repository.list(query)
    case 'receipt': {
      if (repository.store.workspace().generation !== query.generation) throw new DomainError('generation', '工作区已更换')
      return repository.store.operation(query.operationId)?.result ?? null
    }
  }
}
function exportWorkspace(): unknown {
  const items = repository.store.items('1=1')
  return { schemaVersion, exportedAt: new Date().toISOString(), workspace: repository.store.workspace(),
    items: items.map(({ placement: _placement, ...item }) => item), placements: items.map(item => item.placement),
    periods: repository.store.periods(), relations: repository.store.relations(false), policies: repository.store.policies(),
    events: items.flatMap(item => repository.store.events(item.id)).sort((a, b) => a.seq - b.seq),
    operations: db.prepare('SELECT id FROM operations ORDER BY rowid').all().map(row => repository.store.operation(String(row.id))),
    undoEffects: db.prepare('SELECT * FROM undo_effects').all() }
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
