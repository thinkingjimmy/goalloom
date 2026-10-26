// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Fixed billing configuration, existing worker credential and a finite request-local development scope.
 * [OUTPUT]: Original billing handler with request-scoped worker RPCs and guarded read-only identity resolution.
 * [POS]: D3 composition boundary. SQL remains authoritative for target, expiry, claim and write fences.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { type BillingConfig, uuid } from './config.ts'
import { createBillingHandler } from './handler.ts'
import { reply, secretMatches } from './http.ts'
import type { BillingProviders } from './providers.ts'
import type { Rpc } from './service.ts'
import { LifecycleError, rpc } from '../lifecycle/http.ts'
import { workerScopeGuard } from '../lifecycle/worker.ts'

type Dependencies = { fetch?: typeof fetch; providers?: BillingProviders }
const scopePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.[0-9a-f]{64}$/
const workerPaths = new Set(['/billing/worker', '/functions/v1/billing/worker'])

export function createBillingEndpoint(config: BillingConfig, dependencies: Dependencies = {}): (request: Request) => Promise<Response> {
  const original = createBillingHandler(config, dependencies)
  return async request => {
    const path = new URL(request.url).pathname
    if (config.environment !== 'development' || path.split('/').filter(Boolean).at(-1) !== 'worker') return original(request)
    if (!workerPaths.has(path)) return reply({ error: 'route_not_found' }, 404)
    if (request.method !== 'POST' || !await secretMatches(request.headers.get('authorization'), `Bearer ${config.workerSecret}`)) {
      return reply({ error: 'authentication_failed' }, 401)
    }
    const scope = request.headers.get('x-goalloom-lifecycle-scope')
    if (!scope) return reply({ error: 'worker_scope_required' }, 503)
    if (scope.length !== 101 || !scopePattern.test(scope)) return reply({ error: 'worker_scope_invalid' }, 503)
    try {
      const call = rpc({ url: config.url, serviceKey: config.serviceKey, environment: config.environment,
        workerScope: scope, fetch: dependencies.fetch })
      const guard = workerScopeGuard(call, config.environment)
      await guard()
      const scoped: Rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
        if (name === 'lifecycle_identity') {
          if (args.p_create !== false || typeof args.p_owner !== 'string' || !uuid.test(args.p_owner)) throw new LifecycleError('worker_scope_denied', 403)
          await guard()
          const result = await call<T>(name, args), identity = result as { subjectId?: unknown } | null
          if (!identity || typeof identity.subjectId !== 'string' || !uuid.test(identity.subjectId)) throw new LifecycleError('worker_scope_denied', 403)
          await guard({ subjectId: identity.subjectId, ...(args.p_owner !== identity.subjectId ? { ownerId: args.p_owner } : {}) })
          return result
        }
        await guard({
          ...(typeof args.p_user === 'string' ? { subjectId: args.p_user } : {}),
          ...(typeof args.p_subject === 'string' ? { subjectId: args.p_subject } : {}),
          ...(typeof args.p_owner === 'string' ? { ownerId: args.p_owner } : {}),
        })
        return call<T>(name, args)
      }
      return createBillingHandler(config, { ...dependencies, rpc: scoped })(request)
    } catch (error) {
      const code = error instanceof LifecycleError && ['worker_scope_required','worker_scope_invalid','worker_scope_denied'].includes(error.code)
        ? error.code : 'billing_unavailable'
      return reply({ error: code }, code === 'worker_scope_denied' ? 403 : 503)
    }
  }
}
