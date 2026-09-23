/**
 * [INPUT]: worker_threads 的内部父端口；内建 node:sqlite。
 * [OUTPUT]: SQLite 的实际运行版本或启动失败；不打开业务数据库。
 * [POS]: 权威存储 worker 的启动入口，大查询/迁移不占用 Electron UI 线程。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { parentPort } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'

if (!parentPort) throw new Error('存储服务只能由主进程启动')
const db = new DatabaseSync(':memory:')
try {
  const row = db.prepare('SELECT sqlite_version() AS version').get()
  parentPort.postMessage({ sqlite: row?.version })
} finally {
  db.close()
}
