/**
 * [INPUT]: Main-owned account session, fixed environment URL and existing validated feature inputs.
 * [OUTPUT]: Abortable consent-scope-bound hosted Jev/chat POSTs, receipt-only recovery and account ownership checks.
 * [POS]: Transport only. Local feature, manual-intent, generation and transaction guards remain authoritative.
 */
import { randomUUID } from 'node:crypto'
import { isServiceFailureCode, hostedAiServiceHeaders } from '@goalloom/contracts'
import { HostedAttempts } from './attempts'
import { hostedProtocolVersion, hostedScopeVersion, type HostedInput, type HostedReply } from '../../shared/contracts/hosted-ai'
import type { Adapter, EvaluateOutput } from './providers'
import type { ChatAdapter } from './insight'
import { Aborted, failure, ProviderFailure } from './providers'

export interface HostedAccount {
  id(): string | null
  session(): Promise<{ userId: string; accessToken: string }>
  config(): { url: string; anonKey: string | null }
}
export function hostedAdapters(account: HostedAccount, attempts = new HostedAttempts()): { evaluate: Adapter; chat: ChatAdapter } {
  const call = async (request: HostedInput, signal: AbortSignal, identity?: string): Promise<unknown> => {
    const owner = account.id(), attemptId = identity ?? (request.capability === 'evaluate' ? randomUUID()
      : request.capability === 'assistance' ? request.input.request.requestId : request.input.requestId)
    const current = () => { if (signal.aborted || !owner || account.id() !== owner) throw new Aborted() }
    current()
    let session
    try { session = await account.session() } catch { throw new ProviderFailure(failure('authentication_failed', 'hosted')) }
    current()
    if (session.userId !== owner) throw new Aborted()
    const config = account.config()
    if (!config.anonKey) throw new ProviderFailure(failure('unavailable', 'hosted'))
    let reserved
    try { reserved = await attempts.reserve(['transport', config.url, owner, request.capability, attemptId]) }
    catch { throw new ProviderFailure(failure('unavailable', 'hosted')) }
    current()
    const actionId = reserved.actionId
    const endpoint = `${config.url}/functions/v1/hosted-ai`
    const headers = { authorization: `Bearer ${session.accessToken}`, apikey: config.anonKey, 'content-type': 'application/json', ...hostedAiServiceHeaders }
    const send = (retrieve: boolean) => fetch(retrieve ? `${endpoint}?actionId=${actionId}` : endpoint, {
      method: retrieve ? 'GET' : 'POST', headers, ...(retrieve ? {} : { body: JSON.stringify({ version: hostedProtocolVersion, consentScopeVersion: hostedScopeVersion, actionId, request }) }), signal: AbortSignal.any([signal, AbortSignal.timeout(retrieve ? 8_000 : 35_000)]), redirect: 'error',
    })
    let response: Response, original = reserved.fresh
    try { response = await send(!original) }
    catch {
      current()
      // Never issue a second POST after an unknown outcome.
      try { original = false; response = await send(true) } catch { current(); throw new ProviderFailure(failure('result_not_delivered', 'hosted')) }
    }
    current()
    const data = await response.json().catch(() => null) as HostedReply | null
    current()
    if (original && response.ok && data?.status === 'ready' && data.result !== undefined) return data.result
    if (isServiceFailureCode(data?.error) && data.error !== 'retrieval_closed') throw new ProviderFailure(failure(data.error, 'hosted', response.status))
    const kind = response.status === 401 ? 'authentication_failed' : response.status === 429 ? 'rate_limited'
      : response.status === 402 ? 'quota_exhausted' : response.status === 403 ? 'permission_denied'
      : response.status === 413 ? 'too_large' : data?.error === 'malformed_response' ? 'malformed_response' : ['result_not_delivered','outcome_pending','outcome_unknown','not_found','action_expired'].includes(data?.error ?? '') || !original ? 'result_not_delivered' : 'unavailable'
    throw new ProviderFailure(failure(kind, 'hosted', response.status, kind === 'rate_limited' ? data?.retryAt ?? new Date(Date.now() + 60_000).toISOString() : null))
  }
  return {
    evaluate: async (_key, { state, questions, signal, actionId }) => await call({ capability: 'evaluate', input: { state, questions } }, signal, actionId) as EvaluateOutput,
    chat: async (_key, _prompt, signal, request) => {
      if (!request) throw new ProviderFailure(failure('permission_denied', 'hosted'))
      const result = await call(request, signal)
      if (typeof result !== 'string' || Buffer.byteLength(result) > 256 * 1024) throw new ProviderFailure(failure('malformed_response', 'hosted'))
      return result
    },
  }
}

/** No model call, task context or sync dependency. Unknown eligibility stays unknown. */
export async function hostedEligibility(account: HostedAccount): Promise<boolean | null> {
  const owner = account.id()
  if (!owner) return null
  try {
    const session = await account.session(), config = account.config()
    if (!config.anonKey || session.userId !== owner || account.id() !== owner) return null
    const response = await fetch(`${config.url}/functions/v1/hosted-ai?status=1`, { headers: { authorization: `Bearer ${session.accessToken}`, apikey: config.anonKey, ...hostedAiServiceHeaders }, signal: AbortSignal.timeout(3000), redirect: 'error' })
    const data = await response.json() as { eligible?: unknown }
    return account.id() === owner && response.ok && typeof data.eligible === 'boolean' ? data.eligible : null
  } catch { return null }
}
