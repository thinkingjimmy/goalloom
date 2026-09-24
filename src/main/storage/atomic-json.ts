/**
 * [INPUT]: Main-owned destination path and serializable data or an async FileHandle writer.
 * [OUTPUT]: Private temporary files, fsync, atomic replacement and failure cleanup.
 * [POS]: Shared file primitive for preferences, streaming exports and backup receipts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import { open, rename, rm, type FileHandle } from 'node:fs/promises'

export async function atomicJson(path: string, value: unknown): Promise<void> {
  return atomicFile(path, file => file.writeFile(JSON.stringify(value)))
}

export async function atomicFile(path: string, write: (file: FileHandle) => Promise<void>): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    const file = await open(temporary, 'wx', 0o600)
    try { await write(file); await file.sync() } finally { await file.close() }
    await rename(temporary, path)
  } finally { await rm(temporary, { force: true }).catch(() => undefined) }
}
