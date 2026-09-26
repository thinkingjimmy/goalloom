/**
 * [INPUT]: A device-local directory and public URL preview metadata.
 * [OUTPUT]: Bounded cached previews with atomic writes; cache failures never escape to workspace operations.
 * [POS]: Disposable preview cache outside the workspace database, exports and history.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { LinkPreview } from '../../shared/contracts/link-preview'

export interface CachedPreview { version: 1; fetchedAt: number; preview: LinkPreview }
const fileLimit = 1_500_000
const diskLimit = 64 * 1024 * 1024
const entryLimit = 128

function valid(value: unknown, url: string): value is CachedPreview {
  if (!value || typeof value !== 'object') return false
  const record = value as CachedPreview
  const preview = record.preview
  return record.version === 1 && Number.isFinite(record.fetchedAt) && record.fetchedAt > 0
    && !!preview && preview.url === url && preview.status === 'ready'
    && typeof preview.title === 'string' && preview.title.length > 0 && preview.title.length <= 1000
    && typeof preview.siteName === 'string' && preview.siteName.length <= 200
    && typeof preview.description === 'string' && preview.description.length <= 2000
    && (preview.image === null || typeof preview.image === 'string' && preview.image.length <= 1_400_000 && /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(preview.image))
}

export class PreviewCache {
  private writes: Promise<unknown> = Promise.resolve()
  constructor(private readonly directory: string) {}

  private path(url: string): string { return join(this.directory, `${createHash('sha256').update(url).digest('hex')}.json`) }

  async read(url: string): Promise<CachedPreview | null> {
    try {
      const path = this.path(url)
      if ((await stat(path)).size > fileLimit) return null
      const record: unknown = JSON.parse(await readFile(path, 'utf8'))
      return valid(record, url) ? record : null
    } catch { return null }
  }

  write(record: CachedPreview, current: () => boolean): Promise<void> {
    const pending = this.writes.then(async () => {
      if (!current() || !valid(record, record.preview.url)) return
      let temporary: string | null = null
      try {
        const serialized = JSON.stringify(record)
        if (Buffer.byteLength(serialized) > fileLimit) return
        await mkdir(this.directory, { recursive: true, mode: 0o700 })
        if (!current()) return
        const path = this.path(record.preview.url)
        temporary = `${path}.${randomUUID()}.tmp`
        await writeFile(temporary, serialized, { mode: 0o600, flag: 'wx' })
        if (!current()) return
        await rename(temporary, path)
        temporary = null
        await this.prune()
      } catch { /* Cache permission and disk failures must never break task rendering. */ }
      finally { if (temporary) await unlink(temporary).catch(() => undefined) }
    })
    this.writes = pending.catch(() => undefined)
    return pending
  }

  private async prune(): Promise<void> {
    const entries: { path: string; size: number; time: number }[] = []
    for (const name of await readdir(this.directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue
      const path = join(this.directory, name)
      const info = await stat(path).catch(() => null)
      if (info?.isFile()) entries.push({ path, size: info.size, time: info.mtimeMs })
    }
    entries.sort((left, right) => right.time - left.time)
    let bytes = 0
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]!
      bytes += entry.size
      if (index >= entryLimit || bytes > diskLimit) await unlink(entry.path).catch(() => undefined)
    }
  }
}
