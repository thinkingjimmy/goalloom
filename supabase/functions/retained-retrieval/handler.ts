// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Bounded POST JSON on exact short, function-name or full platform routes, project-verified Auth and fixed service credentials.
 * [OUTPUT]: Typed no-store retrieval responses after strict wire and actual byte checks.
 * [POS]: Isolated D2 Edge boundary; no ordinary device registration or Storage credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { buildManifest } from './manifest.ts'
import { authorizedSchema, authorizeSchema, bootstrapSchema, BUILD_TIMEOUT_MS, byteLength, CommittedFailure,
  continuationSchema, controlSchema, failureSchema, initialSchema, operationsSchema, readSchema, REQUEST_BYTES,
  RESPONSE_BYTES, RetrievalFailure, rpcResult, uuid, type Rpc } from './protocol.ts'
export type RetrievalConfig = { url: string; serviceKey: string; environment: 'development' | 'production'; projectRef: string }
const projects = { development: 'asqyvcnxdltzzfutbbqy', production: 'keqprrgvcefqdwnxaafv' } as const
export async function boundedBytes(source: Request | Response, maximum: number): Promise<Uint8Array> {
  const declared = source.headers.get('content-length')
  if (declared !== null && (!/^(0|[1-9][0-9]*)$/.test(declared) || Number(declared) > maximum)) throw new RetrievalFailure('too_large')
  if (!source.body) return new Uint8Array()
  const reader = source.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > maximum) throw new RetrievalFailure('too_large')
      chunks.push(part.value)
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error }
  finally { reader.releaseLock() }
  const result = new Uint8Array(size)
  let offset = 0
  for (const part of chunks) { result.set(part, offset); offset += part.length }
  return result
}
const statusFor = (error: string) => error === 'authentication_failed' ? 401 : error === 'invalid_request' ? 400
  : error === 'too_large' ? 413 : error === 'retrieval_rate_limited' ? 429
    : ['retrieval_configuration', 'retrieval_unavailable'].includes(error) ? 503 : error === 'retrieval_proof_invalid' ? 403 : 409
function reply(value: unknown, status = 200): Response {
  if (byteLength(value) > RESPONSE_BYTES) throw new RetrievalFailure('too_large')
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } })
}
function failure(error: unknown): Response {
  if (error instanceof CommittedFailure) return reply(error.result, statusFor(error.result.error))
  const errorValue = error instanceof RetrievalFailure ? error : new RetrievalFailure('retrieval_unavailable')
  const value = failureSchema.parse({ ok: false, version: 1, serverNow: new Date().toISOString().replace(/(\.\d{3})Z$/, '$1000Z'),
    error: errorValue.code, ...(errorValue.reason ? { reason: errorValue.reason } : {}) })
  return reply(value, statusFor(errorValue.code))
}
export function createRetrievalHandler(config: RetrievalConfig, dependencies: { fetch?: typeof fetch; rpc?: Rpc } = {}): (request: Request) => Promise<Response> {
  const http = dependencies.fetch ?? fetch
  const valid = ['development', 'production'].includes(config.environment) && typeof config.projectRef === 'string'
    && projects[config.environment] === config.projectRef && config.url === `https://${config.projectRef}.supabase.co`
    && typeof config.serviceKey === 'string' && config.serviceKey.length > 0
  return async request => {
    try {
      if (!valid) throw new RetrievalFailure('retrieval_configuration')
      const url = new URL(request.url)
      if (request.method !== 'POST' || url.search || request.headers.has('origin') || request.headers.has('content-encoding')
        || request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') throw new RetrievalFailure('invalid_request')
      if (request.headers.get('x-goalloom-service-version') !== '2') throw new RetrievalFailure('upgrade_required')
      const route = url.pathname.match(/^\/(?:(?:functions\/v1\/)?retained-retrieval\/)?(bootstrap|authorize|read)$/)?.[1]
      if (!route) throw new RetrievalFailure('invalid_request')
      const authorization = request.headers.get('authorization')
      if (!authorization?.startsWith('Bearer ') || authorization.length > 8192) throw new RetrievalFailure('authentication_failed')
      let claims
      try { claims = JSON.parse(atob(authorization.slice(7).split('.')[1].replaceAll('-', '+').replaceAll('_', '/'))) }
      catch { throw new RetrievalFailure('authentication_failed') }
      if (!claims || claims.iss !== `${config.url}/auth/v1` || claims.role !== 'authenticated'
        || !uuid.safeParse(claims.sub).success || !uuid.safeParse(claims.session_id).success
        || !Number.isSafeInteger(claims.exp) || claims.exp * 1000 <= Date.now()) throw new RetrievalFailure('authentication_failed')
      const auth = await http(`${config.url}/auth/v1/user`, { headers: { authorization, apikey: config.serviceKey },
        signal: AbortSignal.timeout(10_000), redirect: 'error' })
      if (!auth.ok) throw new RetrievalFailure([401, 403].includes(auth.status) ? 'authentication_failed' : 'retrieval_unavailable')
      let user
      try { user = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(auth, 16_384))) }
      catch { throw new RetrievalFailure('retrieval_unavailable') }
      if (user?.id !== claims.sub) throw new RetrievalFailure('authentication_failed')
      let value: unknown
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(request, REQUEST_BYTES))) }
      catch (error) { if (error instanceof RetrievalFailure) throw error; throw new RetrievalFailure('invalid_request') }
      const schema = route === 'bootstrap' ? bootstrapSchema : route === 'authorize' ? authorizeSchema : readSchema
      if (!schema.safeParse(value).success) throw new RetrievalFailure('invalid_request')
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(BUILD_TIMEOUT_MS)])
      const rpc: Rpc = dependencies.rpc ?? (async (name, args) => {
        const response = await http(`${config.url}/rest/v1/rpc/${name}`, { method: 'POST', redirect: 'error', signal,
          headers: { authorization: `Bearer ${config.serviceKey}`, apikey: config.serviceKey, 'content-type': 'application/json' }, body: JSON.stringify(args) })
        let parsed
        try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await boundedBytes(response, RESPONSE_BYTES))) }
        catch { throw new RetrievalFailure('retrieval_unavailable') }
        if (!response.ok) throw new RetrievalFailure('retrieval_unavailable')
        return parsed
      })
      const args = (body: unknown) => ({ p_owner: user.id, p_session: claims.session_id, p_environment: config.environment, p_request: body })
      if (route === 'bootstrap' && initialSchema.safeParse(value).success) {
        return reply(await buildManifest(initialSchema.parse(value), { ownerId: user.id, sessionId: claims.session_id,
          environment: config.environment, projectRef: config.projectRef }, rpc))
      }
      const name = route === 'bootstrap' ? 'service_retrieval_continue' : route === 'authorize' ? 'service_retrieval_authorize' : 'service_retrieval_read'
      const response = await rpcResult(rpc, name, args(value))
      const result = (route === 'bootstrap' ? controlSchema : route === 'authorize' ? authorizedSchema : operationsSchema).safeParse(response)
      if (!result.success) throw new RetrievalFailure('retrieval_unavailable')
      if (route === 'bootstrap') {
        const page = controlSchema.parse(result.data), input = continuationSchema.parse(value)
        if (page.challengeId !== input.challengeId || page.rosterPage.afterRosterVersion !== input.afterRosterVersion
          || page.rosterPage.nextAfterRosterVersion !== input.afterRosterVersion + page.rosterPage.rosters.length
          || (!page.rosterPage.done && !page.rosterPage.rosters.length)
          || page.rosterPage.rosters.some((row, index) => row.version !== input.afterRosterVersion + index + 1 || row.roster.version !== row.version)) throw new RetrievalFailure('retrieval_unavailable')
      }
      if (route === 'read') {
        const page = operationsSchema.parse(result.data), input = readSchema.parse(value)
        if (page.afterSeq !== input.afterSeq || page.nextAfterSeq !== input.afterSeq + page.operations.length
          || (!page.done && !page.operations.length) || page.operations.some((row, index) => row.seq !== input.afterSeq + index + 1)) throw new RetrievalFailure('retrieval_unavailable')
      }
      return reply(result.data)
    } catch (error) { return failure(error) }
  }
}
