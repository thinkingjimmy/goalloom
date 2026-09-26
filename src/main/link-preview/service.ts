/**
 * [INPUT]: Public URL-only requests and a device cache directory outside the workspace.
 * [OUTPUT]: Bounded metadata replies, offline cache reuse and session-scoped cancellation.
 * [POS]: Main preview service; independent of storage transactions, task text and business history.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { LinkPreview } from '../../shared/contracts/link-preview'
import { PreviewCache, type CachedPreview } from './cache'
import { loadMetadata, unavailable } from './metadata'
import { publicUrl } from './transport'

const freshDuration = 7 * 24 * 60 * 60 * 1000
const textOnlyDuration = 15 * 60 * 1000
const failureDuration = 30 * 1000
const memoryLimit = 16 * 1024 * 1024
const concurrency = 3
const queueLimit = 48
interface Job { url: string; generation: number; resolve: (value: LinkPreview) => void }

export class LinkPreviewService {
  private readonly cache: PreviewCache
  private readonly memory = new Map<string, { preview: LinkPreview; expiresAt: number; bytes: number }>()
  private readonly inflight = new Map<string, Promise<LinkPreview>>()
  private readonly refreshes = new Set<string>()
  private readonly controllers = new Set<AbortController>()
  private readonly queue: Job[] = []
  private generation = 0
  private memoryBytes = 0
  private active = 0

  constructor(cacheDirectory: string) { this.cache = new PreviewCache(cacheDirectory) }

  async get(input: string): Promise<LinkPreview> {
    let original: URL
    try { original = publicUrl(input) } catch { return unavailable(input.slice(0, 4096)) }
    const url = new URL(original.href)
    url.hash = ''
    const key = url.href
    const remembered = this.memory.get(key)
    if (remembered) {
      if (remembered.expiresAt > Date.now()) {
        this.memory.delete(key); this.memory.set(key, remembered)
        return { ...remembered.preview, url: original.href }
      }
      this.memory.delete(key); this.memoryBytes -= remembered.bytes
    }
    let pending = this.inflight.get(key)
    if (!pending) {
      if (this.inflight.size >= queueLimit + concurrency) return unavailable(original.href)
      const generation = this.generation
      pending = this.resolve(key, generation)
      this.inflight.set(key, pending)
      const owned = pending
      void pending.finally(() => { if (this.inflight.get(key) === owned) this.inflight.delete(key) })
    }
    return { ...await pending, url: original.href }
  }

  private async resolve(url: string, generation: number): Promise<LinkPreview> {
    const cached = await this.cache.read(url)
    if (generation !== this.generation) return unavailable(url)
    if (cached) {
      const freshness = cached.preview.image ? freshDuration : textOnlyDuration
      const expiresAt = cached.fetchedAt + freshness
      this.remember(cached.preview, expiresAt > Date.now() ? expiresAt : Date.now() + failureDuration)
      if (cached.fetchedAt + freshness < Date.now() && !this.refreshes.has(url)) {
        this.refreshes.add(url)
        void this.enqueue(url, generation).finally(() => { if (generation === this.generation) this.refreshes.delete(url) })
      }
      return cached.preview
    }
    return this.enqueue(url, generation)
  }

  private enqueue(url: string, generation: number): Promise<LinkPreview> {
    if (generation !== this.generation || this.queue.length >= queueLimit) return Promise.resolve(unavailable(url))
    const pending = new Promise<LinkPreview>(resolve => this.queue.push({ url, generation, resolve }))
    this.drain()
    return pending
  }

  private drain(): void {
    while (this.active < concurrency && this.queue.length) {
      const job = this.queue.shift()!
      if (job.generation !== this.generation) { job.resolve(unavailable(job.url)); continue }
      this.active++
      void this.run(job).finally(() => { this.active--; this.drain() })
    }
  }

  private async run(job: Job): Promise<void> {
    const controller = new AbortController()
    this.controllers.add(controller)
    const timeout = setTimeout(() => controller.abort(), 18_000)
    const current = () => job.generation === this.generation
    try {
      const preview = await loadMetadata(job.url, controller.signal).catch(() => unavailable(job.url))
      if (!current()) { job.resolve(unavailable(job.url)); return }
      // A transient refresh failure must not replace a usable offline preview.
      if (preview.status === 'ready' || !this.memory.has(job.url)) {
        this.remember(preview, Date.now() + (preview.status === 'ready' ? preview.image ? freshDuration : textOnlyDuration : failureDuration))
      }
      if (preview.status === 'ready') {
        const record: CachedPreview = { version: 1, fetchedAt: Date.now(), preview }
        await this.cache.write(record, current)
      }
      job.resolve(current() ? preview : unavailable(job.url))
    } catch { job.resolve(unavailable(job.url)) }
    finally { clearTimeout(timeout); this.controllers.delete(controller) }
  }

  private remember(preview: LinkPreview, expiresAt: number): void {
    const previous = this.memory.get(preview.url)
    if (previous) { this.memoryBytes -= previous.bytes; this.memory.delete(preview.url) }
    const bytes = Buffer.byteLength(JSON.stringify(preview))
    this.memory.set(preview.url, { preview, expiresAt, bytes }); this.memoryBytes += bytes
    while (this.memory.size > 64 || this.memoryBytes > memoryLimit) {
      const first = this.memory.keys().next().value
      if (!first) break
      this.memoryBytes -= this.memory.get(first)!.bytes
      this.memory.delete(first)
    }
  }

  releaseSession(): void {
    this.generation++
    for (const controller of this.controllers) controller.abort()
    for (const job of this.queue.splice(0)) job.resolve(unavailable(job.url))
    this.memory.clear(); this.memoryBytes = 0
    this.inflight.clear(); this.refreshes.clear()
  }
}
