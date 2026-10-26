// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Project-authenticated finite lifecycle/privacy/initialization actions.
 * [OUTPUT]: Authoritative metadata and immutable privacy progress, never body/credential logging.
 * [POS]: User-JWT lifecycle facade. The no-Auth receipt route is a separate function.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { secretMatches } from '../billing/http.ts'
import { authenticate, body, configure, failure, hex32, LifecycleError, object, result, revision, rpc, target, uuid, type LifecycleConfig } from './http.ts'
import type { Rpc } from './contract.ts'

export function validateAction(action: string, value: unknown): Record<string, unknown> {
  let row: Record<string, unknown>
  if (action === 'status') {
    row = object(value, ['version','query'])
    const query = row.query as Record<string, unknown>
    if (query?.kind === 'generation') { object(query, ['kind','target']); target(query.target) }
    else if (query?.kind === 'discover') {
      object(query, ['kind','after'])
      if (query.after !== null) {
        const cursor = object(query.after, ['workspaceId','generation','accountRevision'])
        target({ workspaceId: cursor.workspaceId, generation: cursor.generation })
        if (!revision(cursor.accountRevision)) throw new LifecycleError('invalid_request', 400)
      }
    } else throw new LifecycleError('invalid_request', 400)
  } else if (action === 'prepare') {
    row = object(value, ['version','requestId','scope','target','expectedRevision','receiptDigest'])
    if (!uuid.test(String(row.requestId)) || !hex32.test(String(row.receiptDigest)) || !revision(row.expectedRevision)) throw new LifecycleError('invalid_request', 400)
    if (row.scope === 'cloud') target(row.target)
    else if (row.scope !== 'account' || row.target !== null) throw new LifecycleError('invalid_request', 400)
  } else if (action === 'confirm') {
    row = object(value, ['version','requestId','expectedRevision','acknowledge'])
    if (!uuid.test(String(row.requestId)) || !revision(row.expectedRevision) || row.acknowledge !== true) throw new LifecycleError('invalid_request', 400)
  } else if (action === 'finish-initialization') {
    row = object(value, ['version','requestId','target','creatorDeviceId','finalOpId','finalPayloadHash','finalSeq'])
    target(row.target)
    if (!uuid.test(String(row.requestId)) || !uuid.test(String(row.creatorDeviceId)) || !uuid.test(String(row.finalOpId))
      || !hex32.test(String(row.finalPayloadHash)) || !revision(row.finalSeq) || Number(row.finalSeq) < 1) throw new LifecycleError('invalid_request', 400)
  } else throw new LifecycleError('invalid_request', 400)
  if (row.version !== 1) throw new LifecycleError('upgrade_required', 409)
  return row
}
export function createLifecycleHandler(config: LifecycleConfig, dependencies: { rpc?: (authorization: string, version?: string) => Rpc; worker?: () => Promise<Record<string, unknown>> } = {}): (request: Request) => Promise<Response> {
  return async request => {
    try {
      configure(config)
      if (request.method !== 'POST' || request.headers.has('origin')) throw new LifecycleError('invalid_request', 400)
      const action = new URL(request.url).pathname.split('/').filter(Boolean).at(-1) ?? ''
      if (action === 'worker') {
        if (!config.workerSecret || config.workerSecret.length < 32 || !await secretMatches(request.headers.get('authorization'), `Bearer ${config.workerSecret}`)) throw new LifecycleError('authentication_failed', 401)
        if (!dependencies.worker) throw new LifecycleError('lifecycle_unavailable')
        return result(await dependencies.worker())
      }
      const identity = await authenticate(config, request)
      const value = validateAction(action, await body(request))
      const version = request.headers.get('x-goalloom-service-version') ?? undefined
      if (action === 'finish-initialization' && version !== '2') throw new LifecycleError('upgrade_required', 409)
      const names: Record<string, string> = { status: 'lifecycle_status', prepare: 'lifecycle_prepare_delete', confirm: 'lifecycle_confirm_delete', 'finish-initialization': 'lifecycle_finish_initialization' }
      const call = dependencies.rpc?.(identity.authorization, version) ?? rpc(config, identity.authorization, version)
      return result(await call(names[action], { p_request: value }))
    } catch (error) { return failure(error) }
  }
}
