/**
 * [INPUT]: 主进程控制的目标路径与可序列化数据；目标目录须已存在。
 * [OUTPUT]: 私有权限临时文件经 fsync 后原子替换；失败清理临时文件。
 * [POS]: storage 的文件写入原语，供窗口偏好、导出与备份回执共用。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { randomUUID } from 'node:crypto'
import { open, rename, rm } from 'node:fs/promises'

export async function atomicJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx', 0o600)
    try { await file.writeFile(JSON.stringify(value)); await file.sync() } finally { await file.close() }
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }).catch(() => undefined) }
}
