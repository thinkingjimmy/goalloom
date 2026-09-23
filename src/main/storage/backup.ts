/**
 * [INPUT]: 权威 SQLite 连接与 main 决定的备份目录；不接受导入路径指令。
 * [OUTPUT]: 包含已提交 WAL 的已校验一致副本；失败仅清理本次临时文件。
 * [POS]: 存储基础库；保护备份和日常轮换将共用此原语。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { randomUUID } from 'node:crypto'
import { mkdir, rename, rm, open } from 'node:fs/promises'
import { join } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'
import { verifyDatabase } from './database'

export async function consistentBackup(db: DatabaseSync, directory: string): Promise<string> {
  await mkdir(directory, { recursive: true })
  const destination = join(directory, `${randomUUID()}.sqlite`)
  const temporary = `${destination}.tmp`
  try {
    await backup(db, temporary)
    const copy = new DatabaseSync(temporary)
    try {
      // --- 导出的独立副本不依赖任何 WAL/SHM 配套文件。 ---
      copy.exec('PRAGMA journal_mode = DELETE')
      verifyDatabase(copy)
    } finally { copy.close() }
    const handle = await open(temporary, 'r+')
    try { await handle.sync() } finally { await handle.close() }
    await rename(temporary, destination)
    return destination
  } catch (error) {
    await Promise.all([temporary, `${temporary}-wal`, `${temporary}-shm`].map(path => rm(path, { force: true }).catch(() => undefined)))
    throw error
  }
}
