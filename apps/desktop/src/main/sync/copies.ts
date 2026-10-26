/**
 * [INPUT]: Verified retrieval stream and main-owned temporary directory/native save picker.
 * [OUTPUT]: Hash-verified ready artifact grants, bounded inspection and secret-free baseline exports.
 * [POS]: Isolated copy registry. Artifact IDs resolve paths only in main; active workspace is never opened here.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Worker } from 'node:worker_threads'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { retrieveRetained, type CloudRemote, type RetrievalCredentials, type RetrievalIdentity } from '@goalloom/sync'
import type { CloudTarget } from '@goalloom/contracts'
import { copyArtifactSchema, type CopyArtifact, type CloudReply } from '../../shared/contracts/cloud'
import type { Dataset } from '../../shared/contracts/transfer'
import { atomicFile, atomicJson, guardedAtomicJson } from '../storage/atomic-json'

const recordsSchema = z.array(z.strictObject({ artifact: copyArtifactSchema, digest: z.string().regex(/^[0-9a-f]{64}$/) })).max(100)
class CopyWorker {
  private sequence = 0
  private waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private worker: Worker
  constructor(workerPath: string, data: object) {
    this.worker = new Worker(workerPath, { workerData: data })
    this.worker.on('message', (message: { id: number; ok: boolean; value?: unknown; diagnostic?: string }) => {
      const task = this.waiting.get(message.id); if (!task) return; this.waiting.delete(message.id)
      if (message.ok) task.resolve(message.value); else task.reject(new Error('retrieval_data_unavailable', { cause: message.diagnostic }))
    })
    const fail = () => { for (const row of this.waiting.values()) row.reject(Error('retrieval_data_unavailable')); this.waiting.clear() }
    this.worker.on('error', fail); this.worker.on('exit', fail)
  }
  call<T>(argument: object): Promise<T> { return new Promise((resolve, reject) => { const id = ++this.sequence; this.waiting.set(id, { resolve: value => resolve(value as T), reject }); this.worker.postMessage({ id, argument }) }) }
  async close() { await this.worker.terminate() }
}
export class RetrievedCopies {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private directory: string, private workerPath: string, private choose: (format: 'json' | 'sqlite') => Promise<string | null>) {}
  private path(id: string) { return join(this.directory, `${z.uuid().parse(id)}.sqlite`) }
  private async records() {
    try { return recordsSchema.parse(JSON.parse(await readFile(join(this.directory, 'copies.json'), 'utf8'))) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error }
  }
  async list(): Promise<CopyArtifact[]> { await this.tail; return (await this.records()).map(row => row.artifact) }
  async retrieve(input: { remote: CloudRemote; target: CloudTarget; identity: RetrievalIdentity; credentials: RetrievalCredentials; signal: AbortSignal; check: () => Promise<void>; guard: () => void }): Promise<CopyArtifact> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const artifactId = randomUUID(), path = this.path(artifactId), now = new Date().toISOString()
    const worker = new CopyWorker(this.workerPath, { path, workspaceId: input.target.workspaceId, deviceId: randomUUID(), now })
    try {
      const verified = await retrieveRetained({ ...input, options: { signal: input.signal }, append: operations => worker.call({ type: 'append', operations }) })
      input.signal.throwIfAborted(); await input.check()
      const counts = await worker.call<CopyArtifact['counts']>({ type: 'finish', manifest: verified.manifest, verifiedAt: verified.verifiedAt })
      input.signal.throwIfAborted(); await input.check()
      const artifact = copyArtifactSchema.parse({ artifactId, target: input.target, environment: input.identity.environment, projectRef: input.identity.projectRef,
        lifecycleVersion: verified.manifest.lifecycleVersion, manifestHash: verified.manifestHash, headSeq: verified.manifest.headSeq, verifiedAt: verified.verifiedAt, historyMode: 'baseline', counts })
      await worker.close()
      const digest = createHash('sha256').update(await readFile(path)).digest('hex')
      const saved = this.tail.then(async () => {
        input.signal.throwIfAborted(); await input.check()
        const records = await this.records()
        await guardedAtomicJson(join(this.directory, 'copies.json'), recordsSchema.parse([...records, { artifact, digest }]), input.check, () => { input.signal.throwIfAborted(); input.guard() })
      })
      this.tail = saved.catch(() => undefined); await saved
      return artifact
    } catch (error) {
      await worker.close(); await Promise.all([path, `${path}-wal`, `${path}-shm`].map(file => rm(file, { force: true }))); throw error
    }
  }
  private async verified(id: string) {
    await this.tail
    const row = (await this.records()).find(row => row.artifact.artifactId === id)
    if (!row || createHash('sha256').update(await readFile(this.path(id))).digest('hex') !== row.digest) throw Error('copy_not_ready')
    return row.artifact
  }
  private async dataset(id: string): Promise<Dataset> {
    const artifact = await this.verified(id)
    const worker = new CopyWorker(this.workerPath, { path: this.path(id), ready: true, now: artifact.verifiedAt })
    try { return await worker.call<Dataset>({ type: 'dataset' }) } finally { await worker.close() }
  }
  async inspect(id: string, offset: number, limit: number): Promise<CloudReply> {
    const artifact = await this.verified(id)
    const worker = new CopyWorker(this.workerPath, { path: this.path(id), ready: true, now: artifact.verifiedAt })
    try { return await worker.call<CloudReply>({ type: 'inspect', offset, limit }) } finally { await worker.close() }
  }
  async export(id: string, format: 'json' | 'sqlite'): Promise<boolean> {
    await this.verified(id)
    const path = await this.choose(format)
    if (!path) return false
    if (format === 'json') { const data = await this.dataset(id); await atomicJson(path, data) }
    else {
      const source = await readFile(this.path(id))
      await atomicFile(path, file => file.writeFile(source))
    }
    return true
  }
  async replacementPath(id: string): Promise<string> { await this.verified(id); return this.path(id) }
}
