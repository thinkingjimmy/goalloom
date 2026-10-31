/**
 * [INPUT]: Explicit lifecycle/retrieval DTOs, configured project and a main-owned Auth token supplier.
 * [OUTPUT]: Bounded HTTP, strict replies and finite retrieval failure diagnostics; receipt reads work without Auth.
 * [POS]: Independent metadata/privacy/retrieval port. It never registers a device or starts normal sync.
 */
import {
  cloudServiceHeaders, confirmDeleteSchema, deletionProgressSchema, finishInitializationSchema, initializationReceiptSchema,
  lifecycleStatusReplySchema, lifecycleStatusRequestSchema, prepareDeleteSchema, preparedDeleteSchema, readDeleteReceiptSchema,
  retrievalAuthorizeSchema, retrievalAuthorizedSchema, retrievalBootstrapSchema, retrievalChallengeSchema, retrievalControlSchema,
  retrievalLimits, retrievalOperationsSchema, retrievalReadSchema,
  type ConfirmDelete, type DeletionProgress, type FinishInitialization, type InitializationReceipt, type LifecycleStatusReply,
  type LifecycleStatusRequest, type PrepareDelete, type PreparedDelete, type ReadDeleteReceipt, type RetrievalAuthorize,
  type RetrievalAuthorized, type RetrievalBootstrap, type RetrievalChallenge, type RetrievalControl, type RetrievalOperations, type RetrievalRead,
} from '@goalloom/contracts'
import { boundedRequest, requestLimits, syncClock, type RequestOptions, type SyncClock } from './request'
import { SyncFailure } from './failure'

export const cloudFailureCodes = [
  'authentication_failed', 'upgrade_required', 'invalid_request', 'too_large', 'workspace_unavailable', 'lifecycle_conflict',
  'initialization_pending', 'initialization_conflict', 'service_not_started', 'service_expired', 'service_revoked',
  'deletion_request_conflict', 'deletion_prepare_expired', 'deletion_receipt_unavailable', 'rate_limited', 'lifecycle_unavailable',
  'retrieval_proof_invalid', 'retrieval_boundary_changed', 'retrieval_capability_expired', 'retrieval_closed',
  'retrieval_data_unavailable', 'retrieval_rate_limited', 'retrieval_configuration', 'retrieval_unavailable',
] as const
export type CloudFailureCode = typeof cloudFailureCodes[number]
export type RetrievalDataFailure = 'unsupported_profile' | 'incomplete_history' | 'integrity_failure'
export class CloudFailure extends Error {
  constructor(readonly code: CloudFailureCode, readonly reason?: RetrievalDataFailure) { super(code); this.name = 'CloudFailure' }
}
export interface CloudRemote {
  status(input: LifecycleStatusRequest, options?: RequestOptions): Promise<LifecycleStatusReply>
  prepareDelete(input: PrepareDelete, options?: RequestOptions): Promise<PreparedDelete>
  confirmDelete(input: ConfirmDelete, options?: RequestOptions): Promise<DeletionProgress>
  deletionReceipt(input: ReadDeleteReceipt, options?: RequestOptions): Promise<DeletionProgress>
  finishInitialization(input: FinishInitialization, options?: RequestOptions): Promise<InitializationReceipt>
  retrievalBootstrap(input: RetrievalBootstrap, options?: RequestOptions): Promise<RetrievalChallenge | RetrievalControl>
  retrievalAuthorize(input: RetrievalAuthorize, options?: RequestOptions): Promise<RetrievalAuthorized>
  retrievalRead(input: RetrievalRead, options?: RequestOptions): Promise<RetrievalOperations>
}
interface Parser<T> { parse(value: unknown): T }

/** Count actual uncompressed bytes before decoding or parsing; Content-Length is advisory only. */
export async function readBoundedJson(response: Response, maximum: number, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new SyncFailure('configuration')
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      signal.throwIfAborted()
      if (done) break
      length += value.byteLength
      if (length > maximum) throw new CloudFailure('too_large')
      chunks.push(value)
    }
    const bytes = new Uint8Array(length)
    let offset = 0
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) }
    catch { throw new SyncFailure('configuration') }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock() }
}

export function createCloudRemote(input: {
  url: string; anonKey: string; accessToken: () => Promise<string>; signal?: () => AbortSignal; clock?: SyncClock
}): CloudRemote {
  async function call<T>(route: string, body: unknown, schema: Parser<T>, options?: RequestOptions): Promise<T> {
    const receipt = route === 'deletion-receipt'
    const retrieval = route.startsWith('retained-retrieval/')
    const serialized = JSON.stringify(body)
    if (new TextEncoder().encode(serialized).byteLength > (receipt || retrieval ? 2048 : 4096)) throw new CloudFailure('too_large')
    let dispatched = false, status: number | null = null
    try { return await boundedRequest({ ms: retrieval ? requestLimits.pull : requestLimits.write, clock: input.clock ?? syncClock,
      signals: [options?.signal, input.signal?.()] }, async signal => {
      const headers: Record<string, string> = { apikey: input.anonKey, 'content-type': 'application/json', ...cloudServiceHeaders }
      if (!receipt) headers.authorization = `Bearer ${await input.accessToken()}`
      signal.throwIfAborted()
      let response: Response
      try { dispatched = true; response = await fetch(`${input.url.replace(/\/$/, '')}/functions/v1/${route}`, { method: 'POST', headers, body: serialized, signal, redirect: 'error', cache: 'no-store' }) }
      catch { signal.throwIfAborted(); throw new SyncFailure('network') }
      status = response.status
      const value = await readBoundedJson(response, retrieval ? retrievalLimits.responseBytes : 16384, signal)
      if (value && typeof value === 'object' && 'error' in value) {
        const failure = value as Record<string, unknown>
        if (failure.version !== 1 || typeof failure.error !== 'string' || !cloudFailureCodes.includes(failure.error as CloudFailureCode)) throw new SyncFailure('configuration')
        const allowed = failure.ok === false ? ['ok', 'version', 'serverNow', 'error', 'reason', 'minServiceVersion'] : ['version', 'error']
        if (Object.keys(failure).some(key => !allowed.includes(key))) throw new SyncFailure('configuration')
        const reason = failure.reason
        if ((failure.error === 'retrieval_data_unavailable') !== (reason !== undefined)
          || reason !== undefined && !['unsupported_profile', 'incomplete_history', 'integrity_failure'].includes(String(reason))) throw new SyncFailure('configuration')
        throw new CloudFailure(failure.error as CloudFailureCode, reason as RetrievalDataFailure | undefined)
      }
      if (!response.ok) throw new SyncFailure(response.status === 401 ? 'auth' : response.status >= 500 ? 'network' : 'configuration')
      try { return schema.parse(value) } catch { throw new SyncFailure('configuration') }
    }) } catch (error) {
      try {
        if (dispatched && ['retained-retrieval/bootstrap', 'retained-retrieval/authorize', 'retained-retrieval/read'].includes(route) && error instanceof Error) {
          const code = error instanceof CloudFailure ? error.code : error instanceof SyncFailure
            && ['network', 'timeout', 'cancelled', 'configuration'].includes(error.code) ? error.code : null
          Object.assign(error, { requestDiagnostic: {
            kind: status === null ? 'transport_failure' : status >= 200 && status < 300 ? 'sdk_failure' : 'http_response',
            operation: route.replace('retained-retrieval/', 'retrieval:'), method: 'POST',
            path: `/functions/v1/${route}`, status, code,
          } })
        }
      } catch { /* Optional metadata must never replace the original failure. */ }
      throw error
    }
  }
  return {
    status: (value, options) => call('lifecycle/status', lifecycleStatusRequestSchema.parse(value), lifecycleStatusReplySchema, options),
    prepareDelete: (value, options) => call('lifecycle/prepare', prepareDeleteSchema.parse(value), preparedDeleteSchema, options),
    confirmDelete: (value, options) => call('lifecycle/confirm', confirmDeleteSchema.parse(value), deletionProgressSchema, options),
    deletionReceipt: (value, options) => call('deletion-receipt', readDeleteReceiptSchema.parse(value), deletionProgressSchema, options),
    finishInitialization: (value, options) => call('lifecycle/finish-initialization', finishInitializationSchema.parse(value), initializationReceiptSchema, options),
    retrievalBootstrap: (value, options) => call<RetrievalChallenge | RetrievalControl>('retained-retrieval/bootstrap', retrievalBootstrapSchema.parse(value),
      'challengeId' in value ? retrievalControlSchema : retrievalChallengeSchema, options),
    retrievalAuthorize: (value, options) => call('retained-retrieval/authorize', retrievalAuthorizeSchema.parse(value), retrievalAuthorizedSchema, options),
    retrievalRead: (value, options) => call('retained-retrieval/read', retrievalReadSchema.parse(value), retrievalOperationsSchema, options),
  }
}
