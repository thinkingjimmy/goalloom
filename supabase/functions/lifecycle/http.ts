// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Fixed project credentials, bounded HTTP bodies and verified Auth sessions.
 * [OUTPUT]: Finite RPC results or null for successful void acknowledgements; no secret/body diagnostics.
 * [POS]: Lifecycle transport shared with the separate status-only receipt handler.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { Buffer } from 'node:buffer'
import { boundedBytes, reply } from '../billing/http.ts'
import type { Environment, Rpc } from './contract.ts'

export type LifecycleConfig = {
  url: string; serviceKey: string; environment: Environment; workerSecret?: string; workerScope?: string; fetch?: typeof fetch
}
export class LifecycleError extends Error {
  constructor(readonly code: string, readonly status = 503) { super(code) }
}
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
export const hex32 = /^[0-9a-f]{64}$/
export function configure(config: LifecycleConfig): typeof fetch {
  const refs = { development: 'asqyvcnxdltzzfutbbqy', production: 'keqprrgvcefqdwnxaafv' }
  if (!config || !refs[config.environment] || config.url !== `https://${refs[config.environment]}.supabase.co` || !config.serviceKey) {
    throw new LifecycleError('lifecycle_unavailable')
  }
  return config.fetch ?? fetch
}
export async function body(request: Request | Response, maximum = 4096, allowEmpty = false): Promise<unknown> {
  try {
    if (Number(request.headers.get('content-length')) > maximum) throw Error('too_large')
    if (allowEmpty && request.body === null) return null
    const bytes = await boundedBytes(request, maximum)
    if (allowEmpty && bytes.length === 0) return null
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  }
  catch (error) { throw new LifecycleError(error instanceof Error && error.message === 'too_large' ? 'too_large' : 'invalid_request', error instanceof Error && error.message === 'too_large' ? 413 : 400) }
}
export function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new LifecycleError('invalid_request', 400)
  const row = value as Record<string, unknown>
  if (Object.keys(row).length !== fields.length || fields.some(field => !Object.hasOwn(row, field))) throw new LifecycleError('invalid_request', 400)
  return row
}
export function revision(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0 }
export function target(value: unknown): void {
  const row = object(value, ['workspaceId', 'generation'])
  if (!uuid.test(String(row.workspaceId)) || !uuid.test(String(row.generation))) throw new LifecycleError('invalid_request', 400)
}
export async function authenticate(config: LifecycleConfig, request: Request): Promise<{ owner: string; session: string; authorization: string }> {
  const http = configure(config), authorization = request.headers.get('authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) throw new LifecycleError('authentication_failed', 401)
  let claims: Record<string, unknown>
  try { claims = JSON.parse(Buffer.from(authorization.slice(7).split('.')[1] ?? '', 'base64url').toString('utf8')) }
  catch { throw new LifecycleError('authentication_failed', 401) }
  if (!claims || claims.iss !== `${config.url}/auth/v1` || claims.role !== 'authenticated' || !uuid.test(String(claims.sub))
    || !uuid.test(String(claims.session_id)) || typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) throw new LifecycleError('authentication_failed', 401)
  const response = await http(`${config.url}/auth/v1/user`, { headers: { authorization, apikey: config.serviceKey }, signal: AbortSignal.timeout(10000), redirect: 'error' })
  if (!response.ok) throw new LifecycleError([401, 403].includes(response.status) ? 'authentication_failed' : 'lifecycle_unavailable', [401, 403].includes(response.status) ? 401 : 503)
  const user = await body(response, 16384) as { id?: unknown }
  if (user.id !== claims.sub) throw new LifecycleError('authentication_failed', 401)
  return { owner: String(claims.sub), session: String(claims.session_id), authorization }
}
export function rpc(config: LifecycleConfig, authorization = `Bearer ${config.serviceKey}`, syncVersion?: string): Rpc {
  const http = configure(config)
  return async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const response = await http(`${config.url}/rest/v1/rpc/${name}`, { method: 'POST',
      headers: { authorization, apikey: config.serviceKey, 'content-type': 'application/json', ...(syncVersion ? { 'x-goalloom-service-version': syncVersion } : {}),
        ...(config.workerScope ? { 'x-goalloom-lifecycle-scope': config.workerScope } : {}) },
      body: JSON.stringify(args), signal: AbortSignal.timeout(15000), redirect: 'error' })
    const value = await body(response, 2 * 1024 * 1024, response.ok) as Record<string, unknown>
    if (!response.ok) {
      const code = typeof value.message === 'string' && errors.has(value.message) ? value.message : 'lifecycle_unavailable'
      throw new LifecycleError(code, statusFor(code))
    }
    return value as T
  }
}
const errors = new Set(['authentication_failed','upgrade_required','invalid_request','too_large','workspace_unavailable','lifecycle_conflict',
  'initialization_pending','initialization_conflict','service_not_started','service_expired','service_revoked','deletion_request_conflict',
  'deletion_prepare_expired','deletion_receipt_unavailable','rate_limited','lifecycle_unavailable','retrieval_configuration','worker_scope_required','worker_scope_invalid','worker_scope_denied'])
export function statusFor(code: string): number {
  if (code === 'authentication_failed') return 401
  if (code === 'invalid_request') return 400
  if (code === 'too_large') return 413
  if (['workspace_unavailable','deletion_receipt_unavailable'].includes(code)) return 404
  if (code === 'rate_limited') return 429
  if (['service_not_started','service_expired','service_revoked','worker_scope_denied'].includes(code)) return 403
  return ['lifecycle_unavailable','retrieval_configuration','worker_scope_required','worker_scope_invalid'].includes(code) ? 503 : 409
}
export function result(value: Record<string, unknown>, maximum = 16384): Response {
  if (new TextEncoder().encode(JSON.stringify(value)).length > maximum) throw new LifecycleError('lifecycle_unavailable')
  return reply(value, typeof value.error === 'string' ? statusFor(value.error) : 200)
}
export function failure(error: unknown): Response {
  const known = error instanceof LifecycleError ? error : new LifecycleError('lifecycle_unavailable')
  return reply({ version: 1, error: known.code }, known.status)
}
