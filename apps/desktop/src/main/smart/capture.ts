/**
 * [INPUT]: Revision-bound analysis, user creation receipts and an internal completion writer.
 * [OUTPUT]: Main-owned draft-to-item handoff, immediate ready selections and at-most-once late completion.
 * [POS]: Ephemeral capture coordinator; submitted jobs survive dialog closure, never process/session replacement.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomUUID } from 'node:crypto'
import type { AnalyzeReply, AnalyzeRequest } from '../../shared/contracts/smart-input'
import { DomainError, isCaptureCommand as isCapture, type Command, type CommandOf, type CommandResult } from '../../shared/contracts/commands'
import type { CreationSelection } from '../../shared/contracts/capture'
import { plainLater } from '../../domain/smart/segments'

interface Job {
  request: AnalyzeRequest; promise: Promise<AnalyzeReply>; reply?: AnalyzeReply; active: boolean
  operationId?: string; receipt?: CommandResult; settling: boolean; completionId: string
}
interface Options {
  analyze: (request: AnalyzeRequest) => Promise<AnalyzeReply>; abort: (requestId: string) => void
  write?: (command: CommandOf<'completeCreation'>) => Promise<CommandResult>; changed?: () => void
}
export class CaptureCoordinator {
  private jobs = new Map<string, Job>()
  constructor(private readonly options: Options) {}
  analyze(request: AnalyzeRequest): Promise<AnalyzeReply> {
    const current = this.jobs.get(request.requestId)
    if (current?.active && (!current.reply || current.reply.status === 'ready')) {
      if (JSON.stringify(current.request) !== JSON.stringify(request)) throw new DomainError('invalid', 'Smart request identity was reused.')
      return current.promise
    }
    this.cancelDraft(request.draftSessionId)
    // Bound retained drafts. Claimed requests are released on completion or session replacement.
    if (this.jobs.size >= 32) {
      for (const [id, job] of this.jobs) {
        if (!job.operationId) { job.active = false; this.options.abort(id); this.jobs.delete(id); break }
      }
    }
    if (this.jobs.size >= 32) {
      const { requestId, draftSessionId, inputRevision, manualRevision, generation, providerRevision, contextRevision, referenceTime } = request
      return Promise.resolve({ status: 'cancelled', echo: { requestId, draftSessionId, inputRevision, manualRevision, generation, providerRevision, contextRevision, referenceTime } })
    }
    const job: Job = { request, promise: Promise.resolve(null as unknown as AnalyzeReply), active: true, settling: false, completionId: randomUUID() }
    this.jobs.set(request.requestId, job)
    job.promise = this.options.analyze(request).then(reply => {
      job.reply = reply
      void this.finish(job)
      return reply
    })
    return job.promise
  }
  prepare(command: Command): CreationSelection | undefined {
    if (!isCapture(command)) return undefined
    const { request } = command.smartCapture
    const item = command.type === 'create' ? command : command.items.length === 1 ? command.items[0]! : null
    const plain = plainLater(request.text)
    if (!item || request.generation !== command.generation || !plain || (request.target ? request.text.trim() !== item.title || request.target.horizon !== item.horizon
      : plain.title !== item.title || plain.description !== item.description)) throw new DomainError('invalid', 'Capture input no longer matches creation.')
    void this.analyze(request).catch(() => {})
    const job = this.jobs.get(request.requestId)
    if (!job) return undefined
    if (job.operationId && job.operationId !== command.operationId) throw new DomainError('conflict', 'Capture request already belongs to another creation.')
    job.operationId = command.operationId
    return job.reply?.status === 'ready' ? job.reply.preview.capture : undefined
  }
  created(command: Command, receipt: CommandResult): void {
    if (!isCapture(command)) return
    const job = this.jobs.get(command.smartCapture.request.requestId)
    if (!job || job.operationId !== receipt.operationId) return
    job.receipt = receipt
    if (!receipt.capture?.pending) { this.jobs.delete(job.request.requestId); return }
    void this.finish(job)
  }
  failed(command: Command): void {
    if (!isCapture(command)) return
    const job = this.jobs.get(command.smartCapture.request.requestId)
    if (job?.operationId === command.operationId && !job.receipt) delete job.operationId
  }
  observe(command: Command): void {
    if (command.type === 'create' || command.type === 'createPlan' || command.type === 'completeCreation') return
    for (const job of this.jobs.values()) {
      const id = job.receipt?.capture?.itemId
      if (!id) continue
      const undo = command.type === 'undo' && command.originalOperationId === job.operationId
      const targeted = 'itemId' in command && command.itemId === id || command.type === 'link' && (command.childId === id || command.parentId === id)
        || command.type === 'arrangeBacklog' && command.items.some(item => item.itemId === id)
      if (undo || targeted) { job.active = false; this.options.abort(job.request.requestId) }
    }
  }
  cancelDraft(sessionId: string): void {
    for (const [id, job] of this.jobs) if (!job.operationId && job.request.draftSessionId === sessionId) {
      job.active = false; this.options.abort(id); this.jobs.delete(id)
    }
  }
  clear(): void {
    for (const [id, job] of this.jobs) { job.active = false; this.options.abort(id) }
    this.jobs.clear()
  }
  private async finish(job: Job): Promise<void> {
    if (job.settling || !job.receipt || !job.reply) return
    job.settling = true
    try {
      if (!job.active || job.reply.status !== 'ready' || !job.reply.preview.capture || !this.options.write) return
      const guard = job.receipt.capture!
      const result = await this.options.write({ type: 'completeCreation', operationId: job.completionId, generation: job.request.generation,
        creationOperationId: job.receipt.operationId, requestId: job.request.requestId, itemId: guard.itemId,
        expectedVersion: guard.itemVersion, expectedPlacementVersion: guard.placementVersion, selection: job.reply.preview.capture })
      if (result.changed) this.options.changed?.()
    } catch { /* The successful creation remains usable when automatic completion is unavailable. */ }
    finally { if (this.jobs.get(job.request.requestId) === job) this.jobs.delete(job.request.requestId) }
  }
}
