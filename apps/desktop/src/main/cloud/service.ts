/**
 * [INPUT]: Verified account/session, fixed project, explicit privacy/retrieval actions and protected device storage.
 * [OUTPUT]: Trusted lifecycle dates, independent deletion progress and ready-only retained copies.
 * [POS]: Main cloud coordinator. Privacy actions never clear local tasks, reset sync or create Auth.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { z } from 'zod'
import { canonicalJson, deletionProgressSchema, preparedDeleteSchema, prepareDeleteSchema, type GenerationView, type LifecycleStatusReply } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import { CloudFailure, createCloudRemote, SyncFailure, type CloudRemote } from '@goalloom/sync'
import { cloudActionSchema, cloudStateSchema, type CloudReply, type CloudState } from '../../shared/contracts/cloud'
import type { StorageClient } from '../storage/client'
import type { Cipher } from '../smart/credentials'
import { ProtectedRecords } from '../sync/protected-records'
import { RetrievedCopies } from '../sync/copies'

const recordSchema = z.strictObject({
  accountId: z.uuid(), authSessionId: z.uuid(), projectRef: z.string(), environment: z.enum(['development', 'production']),
  request: prepareDeleteSchema, secret: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  confirmationSent: z.boolean().default(false), superseded: z.boolean().default(false), prepared: preparedDeleteSchema.nullable(), progress: deletionProgressSchema.nullable(),
})
const recordsSchema = z.strictObject({ receipts: z.array(recordSchema).max(100), dismissed: z.array(z.string().max(256)).max(4096) })
type Receipt = z.infer<typeof recordSchema>
function sessionId(token: string): string {
  try { return z.uuid().parse(JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()).session_id) }
  catch { throw new SyncFailure('auth') }
}
export class CloudService {
  private records: ProtectedRecords<z.infer<typeof recordsSchema>>
  private copies: RetrievedCopies
  private account: string | null = null
  private status: LifecycleStatusReply | null = null
  private error: string | null = null
  private abort = new AbortController()
  private copyClearing = false
  private retrievals = new Set<AbortController>()
  private copyJobs = new Set<Promise<unknown>>()
  constructor(private deps: {
    directory: string; workerPath: string; cipher: Cipher; environment: 'development' | 'production'
    config: () => { url: string; anonKey: string | null }
    account: { id: () => string | null; context: () => string; session: () => Promise<{ userId: string; accessToken: string }> }
    storage: StorageClient; choose: (format: 'json' | 'sqlite') => Promise<string | null>
    closed: (target: { workspaceId: string; generation: string } | null) => void
  }) {
    this.records = new ProtectedRecords(join(deps.directory, 'privacy-receipts.bin'), 'privacy-receipts/v1', deps.cipher, value => recordsSchema.parse(value))
    this.copies = new RetrievedCopies(join(deps.directory, 'retrieved-copies'), deps.workerPath, deps.choose)
  }
  async beforeLocalClear(): Promise<void> { this.copyClearing = true; this.abort.abort(); await Promise.allSettled([...this.copyJobs]) }
  afterLocalClearAttempt(): void { this.copyClearing = false; this.abort = new AbortController() }
  private async copyWork<T>(run: () => Promise<T>): Promise<T> {
    if (this.copyClearing) throw new SyncFailure('cancelled')
    const work = run(); this.copyJobs.add(work)
    try { return await work } finally { this.copyJobs.delete(work) }
  }
  private resetAccount() {
    const current = this.deps.account.id()
    if (this.account !== current) { this.abort.abort(); this.abort = new AbortController(); this.account = current; this.status = null; this.error = null }
  }
  private async authenticated(expected: string) {
    this.resetAccount()
    if (this.account !== expected) throw new SyncFailure('auth')
    const auth = await this.deps.account.session(), config = this.deps.config(), authSessionId = sessionId(auth.accessToken)
    if (auth.userId !== expected || !config.anonKey) throw new SyncFailure('auth')
    const projectRef = new URL(config.url).hostname.split('.')[0]!
    const context = this.deps.account.context(), signal = this.abort.signal
    const guard = () => { signal.throwIfAborted(); if (this.deps.account.id() !== expected || this.deps.account.context() !== context) throw new SyncFailure('cancelled') }
    const check = async () => {
      this.resetAccount()
      const current = await this.deps.account.session()
      guard()
      if (this.account !== expected || sessionId(current.accessToken) !== authSessionId) throw new SyncFailure('cancelled')
    }
    const remote = createCloudRemote({ ...config, anonKey: config.anonKey, accessToken: async () => { await check(); return auth.accessToken }, signal: () => this.abort.signal })
    return { remote, check, guard, identity: { accountId: expected, authSessionId, projectRef, environment: this.deps.environment } }
  }
  private async data() { return await this.records.load() ?? { receipts: [], dismissed: [] } }
  private async save(record: Receipt) {
    await this.records.update(current => {
      const data = current ?? { receipts: [], dismissed: [] }
      return { ...data, receipts: [...data.receipts.filter(row => row.request.requestId !== record.request.requestId), record] }
    })
  }
  private async state(): Promise<CloudState> {
    this.resetAccount()
    const data = await this.data(), status = this.status
    const entries = status?.entries.filter((row): row is GenerationView => row.state !== 'none') ?? []
    const notices: CloudState['notices'] = []
    if (status) for (const row of entries) {
      let stage: CloudState['notices'][number]['stage'] | null = null
      if (row.onlineDeletedAt) stage = 'deleted'
      else if (row.retrieveUntil && status.serverNow >= row.retrieveUntil || ['closed', 'deleting', 'deleted'].includes(row.state)) stage = 'cutoff'
      else if (row.state === 'retained' && row.retrieveUntil) stage = Date.parse(row.retrieveUntil) - Date.parse(status.serverNow) <= 7 * 86400000 ? 'week' : 'ended'
      if (stage && !data.dismissed.includes(`${status.projectRef}|${this.account}|${row.target.workspaceId}|${row.target.generation}|${stage}`)) notices.push({ target: row.target, stage, retrieveUntil: row.retrieveUntil })
    }
    const prepared = data.receipts.find(row => row.accountId === this.account && row.prepared && !row.superseded && !row.progress?.accepted)?.prepared ?? null
    return cloudStateSchema.parse({ accountId: this.account, accountRevision: status?.accountRevision ?? 0, serverNow: status?.serverNow ?? null,
      entries, canCreateCloud: status?.canCreateCloud ?? false, prepared, progress: data.receipts.flatMap(row => row.progress ? [row.progress] : []), pendingReceipts: data.receipts.filter(row => row.secret && !row.superseded && !row.progress).map(row => ({ requestId: row.request.requestId, confirmationSent: row.confirmationSent })), copies: await this.copies.list(), notices, error: this.error })
  }
  async action(input: unknown): Promise<CloudReply> {
    const action = cloudActionSchema.parse(input)
    this.resetAccount(); this.error = null
    try {
      if (action.type === 'status') return { type: 'state', state: await this.state() }
      if (action.type === 'inspect') return this.copyWork(() => this.copies.inspect(action.artifactId, action.offset, action.limit))
      if (action.type === 'export') return { type: 'saved', saved: await this.copyWork(() => this.copies.export(action.artifactId, action.format)) }
      if (action.type === 'replace') return { type: 'preview', reply: await this.deps.storage.call('previewRetrieved', { path: await this.copies.replacementPath(action.artifactId), generation: action.generation }) }
      if (action.type === 'receipt' || action.type === 'acknowledge') {
        const record = (await this.data()).receipts.find(row => row.request.requestId === action.requestId)
        if (!record) throw new CloudFailure('deletion_receipt_unavailable')
        if (action.type === 'acknowledge') {
          const p = record.progress
          if (!p || p.content !== 'deleted' || !['deleted', 'not_applicable'].includes(p.auth) || !['stopped', 'not_applicable'].includes(p.renewal)) throw new CloudFailure('lifecycle_conflict')
          await this.save({ ...record, secret: null })
        } else if (record.secret) {
          const config = this.deps.config()
          if (!config.anonKey || new URL(config.url).hostname.split('.')[0] !== record.projectRef || record.environment !== this.deps.environment) throw new CloudFailure('deletion_receipt_unavailable')
          const remote = createCloudRemote({ ...config, anonKey: config.anonKey, accessToken: async () => { throw Error('receipt_does_not_use_auth') } })
          const progress = await remote.deletionReceipt({ version: 1, environment: record.environment, requestId: action.requestId, secret: record.secret })
          this.matchProgress(record, progress)
          await this.save({ ...record, progress })
        }
        return { type: 'state', state: await this.state() }
      }
      if (action.type === 'cancel-retrieval') {
        if (this.account !== action.expectedAccountId) throw new SyncFailure('auth')
        for (const job of this.retrievals) job.abort()
        return { type: 'state', state: await this.state() }
      }
      const auth = await this.authenticated(action.expectedAccountId)
      if (action.type === 'cancel-preparation') {
        const record = (await this.data()).receipts.find(row => row.request.requestId === action.requestId && row.accountId === action.expectedAccountId && row.authSessionId === auth.identity.authSessionId)
        if (!record || record.confirmationSent || record.progress?.accepted) throw new CloudFailure('deletion_request_conflict')
        await this.save({ ...record, superseded: true })
      }
      if (action.type === 'refresh') await this.refresh(auth.remote, auth.check, auth.identity)
      if (action.type === 'dismiss') {
        const key = `${auth.identity.projectRef}|${action.expectedAccountId}|${action.target.workspaceId}|${action.target.generation}|${action.stage}`
        await this.records.update(value => ({ receipts: value?.receipts ?? [], dismissed: [...new Set([...(value?.dismissed ?? []), key])] }))
      }
      if (action.type === 'retrieve') {
        const job = new AbortController(), signal = AbortSignal.any([this.abort.signal, job.signal])
        this.retrievals.add(job)
        try {
          const check = async () => { signal.throwIfAborted(); await auth.check(); signal.throwIfAborted() }
          const guard = () => { signal.throwIfAborted(); auth.guard() }
          const artifact = await this.copyWork(() => this.copies.retrieve({ remote: auth.remote, identity: auth.identity, target: action.target, credentials: { kind: 'recovery', password: action.password }, signal, check, guard }))
          await check()
          return { type: 'copy', artifact }
        } catch (error) { if (!job.signal.aborted) throw error }
        finally { this.retrievals.delete(job) }
      }
      if (action.type === 'prepare') {
        let record = (await this.data()).receipts.find(row => row.accountId === action.expectedAccountId && row.authSessionId === auth.identity.authSessionId && row.projectRef === auth.identity.projectRef && row.secret && !row.superseded && !row.progress?.accepted)
        if (record && !record.confirmationSent && record.prepared && this.status?.serverNow && this.status.serverNow >= record.prepared.prepareExpiresAt) { await this.save({ ...record, superseded: true, secret: null }); record = undefined }
        if (record && (record.request.scope !== action.scope || canonicalJson(record.request.target) !== canonicalJson(action.target) || record.request.expectedRevision !== action.expectedRevision)) throw new CloudFailure('deletion_request_conflict')
        if (!record) {
          const secret = randomBytes(32), requestId = randomUUID()
          record = { ...auth.identity, request: { version: 1, requestId, scope: action.scope, target: action.target, expectedRevision: action.expectedRevision, receiptDigest: sha256Hex(secret) }, secret: secret.toString('hex'), confirmationSent: false, superseded: false, prepared: null, progress: null }
          secret.fill(0); await this.save(record)
        }
        let prepared
        try { prepared = await auth.remote.prepareDelete(record.request) }
        catch (error) { if (error instanceof CloudFailure && ['deletion_prepare_expired', 'lifecycle_conflict'].includes(error.code) && !record.confirmationSent) await this.save({ ...record, superseded: true }); throw error }
        await auth.check()
        if (prepared.requestId !== record.request.requestId || prepared.scope !== record.request.scope) throw new CloudFailure('deletion_request_conflict')
        await this.save({ ...record, prepared })
      }
      if (action.type === 'confirm') {
        const record = (await this.data()).receipts.find(row => row.request.requestId === action.requestId && row.accountId === action.expectedAccountId && row.authSessionId === auth.identity.authSessionId && row.projectRef === auth.identity.projectRef)
        if (!record?.secret || !record.prepared) throw new CloudFailure('deletion_request_conflict')
        await this.save({ ...record, confirmationSent: true })
        let progress
        try { progress = await auth.remote.confirmDelete({ version: 1, requestId: action.requestId, expectedRevision: record.request.expectedRevision, acknowledge: true }) }
        catch (error) {
          if (error instanceof CloudFailure && ['deletion_prepare_expired', 'lifecycle_conflict'].includes(error.code)) await this.save({ ...record, confirmationSent: false, superseded: true })
          throw error
        }
        this.matchProgress(record, progress)
        // Preserve an accepted response even if account deletion invalidated Auth while it returned.
        await this.save({ ...record, progress })
        if (progress.accepted) this.deps.closed(record.request.target)
        await auth.check()
      }
      return { type: 'state', state: await this.state() }
    } catch (error) {
      this.error = error instanceof CloudFailure || error instanceof SyncFailure ? error.code : 'lifecycle_unavailable'
      return { type: 'state', state: await this.state() }
    }
  }
  private matchProgress(record: Receipt, progress: Receipt['progress']) {
    if (!progress || progress.requestId !== record.request.requestId || progress.scope !== record.request.scope
      || record.progress?.confirmedAt && record.progress.confirmedAt !== progress.confirmedAt
      || record.progress?.accepted && (!progress.accepted || record.progress.statusExpiresAt !== progress.statusExpiresAt || record.progress.onlineDeleteBy !== progress.onlineDeleteBy)) throw new CloudFailure('deletion_request_conflict')
  }
  private async refresh(remote: CloudRemote, check: () => Promise<void>, identity: { environment: string; projectRef: string }) {
    let cursor: LifecycleStatusReply['nextAfter'] = null, result: LifecycleStatusReply | null = null
    const entries: LifecycleStatusReply['entries'] = []
    do {
      const page = await remote.status({ version: 1, query: { kind: 'discover', after: cursor } })
      await check()
      if (page.environment !== identity.environment || page.projectRef !== identity.projectRef || result && page.accountRevision !== result.accountRevision
        || page.nextAfter && page.entries.length === 0 || entries.length + page.entries.length > 1024) throw new CloudFailure('lifecycle_conflict')
      for (const row of page.entries) {
        const previous = entries.at(-1)
        if (row.state === 'none' && (entries.length || page.entries.length !== 1 || page.nextAfter)
          || previous?.state !== undefined && previous.state !== 'none' && row.state !== 'none' && `${previous.target.workspaceId}|${previous.target.generation}` >= `${row.target.workspaceId}|${row.target.generation}`) throw new CloudFailure('lifecycle_conflict')
        entries.push(row)
      }
      if (page.nextAfter && (page.nextAfter.accountRevision !== page.accountRevision || canonicalJson(page.nextAfter) === canonicalJson(cursor))) throw new CloudFailure('lifecycle_conflict')
      result = page; cursor = page.nextAfter
    } while (cursor)
    this.status = { ...result!, entries }
  }
}
