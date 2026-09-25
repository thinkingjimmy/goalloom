/**
 * [INPUT]: Main-owned worker/database paths, locale and finite RPC methods.
 * [OUTPUT]: Correlated replies and pending-request rejection on failure.
 * [POS]: Internal main/worker channel, inaccessible to renderer code.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Worker } from 'node:worker_threads'
import { DomainError } from '../../shared/contracts/commands'
import type { Locale } from '../../shared/i18n/locale'
import { serverText } from '../../shared/i18n/server'

export class StorageClient {
  private worker: Worker
  private sequence = 0
  private stopped = false
  private closing = false
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  constructor(workerPath: string, databasePath: string, backupDirectory: string, locale: Locale) {
    this.worker = new Worker(workerPath, { workerData: { databasePath, backupDirectory, locale } })
    this.worker.on('message', message => {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.ok) pending.resolve(message.value)
      else pending.reject(new DomainError(message.code ?? 'storage', message.message ?? serverText().storage.failed))
    })
    this.worker.on('error', () => this.fail())
    this.worker.on('exit', () => this.fail())
  }
  call<T>(method: 'candidate' | 'metadata' | 'startup' | 'locale' | 'query' | 'command' | 'runtime' | 'export' | 'close' | 'data' | 'previewImport' | 'reconcile' | 'releaseTransfer', argument?: unknown): Promise<T> {
    if (this.stopped || this.closing) return Promise.reject(new DomainError('storage', serverText().storage.closing))
    const id = ++this.sequence
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject })
      this.worker.postMessage({ id, method, argument })
    })
  }
  private fail(): void {
    this.stopped = true
    for (const pending of this.pending.values()) pending.reject(new DomainError('storage', serverText().storage.unknownOutcome))
    this.pending.clear()
  }
  async close(): Promise<void> {
    if (this.stopped || this.closing) return
    const drained = this.call('close')
    this.closing = true
    await drained
    this.stopped = true
  }
}
