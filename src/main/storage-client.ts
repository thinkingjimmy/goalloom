/**
 * [INPUT]: main 控制的 worker/数据库路径；固定方法与结构化参数。
 * [OUTPUT]: 带请求 ID 的存储 RPC；崩溃拒绝所有待决请求。
 * [POS]: main/worker 内部通道，renderer 不可直接访问。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import { Worker } from 'node:worker_threads'
import { DomainError } from '../shared/contracts/commands'

export class StorageClient {
  private worker: Worker
  private sequence = 0
  private stopped = false
  private closing = false
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  constructor(workerPath: string, databasePath: string, backupDirectory: string) {
    this.worker = new Worker(workerPath, { workerData: { databasePath, backupDirectory } })
    this.worker.on('message', message => {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      if (message.ok) pending.resolve(message.value)
      else pending.reject(new DomainError(message.code ?? 'storage', message.message ?? '本地存储操作失败'))
    })
    this.worker.on('error', () => this.fail())
    this.worker.on('exit', () => this.fail())
  }
  call<T>(method: 'query' | 'command' | 'runtime' | 'export' | 'close', argument?: unknown): Promise<T> {
    if (this.stopped || this.closing) return Promise.reject(new DomainError('storage', '本地存储服务正在关闭，请重新打开应用'))
    const id = ++this.sequence
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: value => resolve(value as T), reject })
      this.worker.postMessage({ id, method, argument })
    })
  }
  private fail(): void {
    this.stopped = true
    for (const pending of this.pending.values()) pending.reject(new DomainError('storage', '存储结果未知，请重新打开应用后核对'))
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
