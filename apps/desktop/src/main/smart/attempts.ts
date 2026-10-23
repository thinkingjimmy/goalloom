/**
 * [INPUT]: Device-only intent fingerprints and an optional private journal path.
 * [OUTPUT]: Atomic pre-dispatch tombstones and timestamped action identities, retained across service release/restart.
 * [POS]: Hosted call authorization; stores no task text, prompts, results, credentials or server content hashes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash, randomUUID } from 'node:crypto'
import { readFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { atomicJson } from '../storage/atomic-json'

export function hostedActionId(now = Date.now()): string {
  const time = now.toString(16).padStart(12, '0'), random = randomUUID()
  return `${time.slice(0, 8)}-${time.slice(8)}-7${random.slice(15, 18)}-${random.slice(19)}`
}
export class HostedAttempts {
  private entries: Record<string, string> | null = null
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly path?: string) {}
  reserve(identity: unknown): Promise<{ actionId: string; fresh: boolean }> {
    const task = this.queue.then(async () => {
      if (!this.entries) {
        let entries: Record<string, string> = {}
        if (this.path) {
          try {
            const raw = await readFile(this.path, 'utf8')
            if (raw.length > 16_000_000) throw new Error('Invalid attempt journal')
            const saved = JSON.parse(raw)
            if (saved?.version !== 1 || !saved.entries || typeof saved.entries !== 'object' || Array.isArray(saved.entries)
              || Object.entries(saved.entries).some(([key, value]) => !/^[a-f0-9]{64}$/.test(key) || typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value))) throw new Error('Invalid attempt journal')
            entries = saved.entries
          } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Attempt journal unavailable') }
        }
        this.entries = entries
      }
      const key = createHash('sha256').update(JSON.stringify(identity)).digest('hex')
      const previous = this.entries[key]
      if (previous) return { actionId: previous, fresh: false }
      if (Object.keys(this.entries).length >= 100_000) throw new Error('Attempt journal full')
      const actionId = hostedActionId(), next = { ...this.entries, [key]: actionId }
      if (this.path) { await mkdir(dirname(this.path), { recursive: true }); await atomicJson(this.path, { version: 1, entries: next }) }
      this.entries = next
      return { actionId, fresh: true }
    })
    this.queue = task.catch(() => undefined)
    return task
  }
}
