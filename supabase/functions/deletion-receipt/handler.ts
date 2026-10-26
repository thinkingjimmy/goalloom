// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Bounded original status receipt, configured project and service-only SQL transport.
 * [OUTPUT]: Only that request's finite progress; unavailable is uniform for missing/invalid/expired tokens.
 * [POS]: No-Auth status facade, isolated from authenticated lifecycle actions.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { body, configure, failure, hex32, LifecycleError, object, result, rpc, uuid, type LifecycleConfig } from '../lifecycle/http.ts'
import type { Rpc } from '../lifecycle/contract.ts'
export function createDeletionReceiptHandler(config: LifecycleConfig, call?: Rpc): (request: Request) => Promise<Response> {
  return async request => {
    try {
      configure(config)
      if (request.method !== 'POST' || request.headers.has('origin') || new URL(request.url).search) throw new LifecycleError('deletion_receipt_unavailable', 404)
      let value: Record<string, unknown>
      try {
        value = object(await body(request, 2048), ['version','environment','requestId','secret'])
        if (value.version !== 1 || value.environment !== config.environment || !uuid.test(String(value.requestId)) || !hex32.test(String(value.secret))) throw new Error()
      } catch (error) {
        if (error instanceof LifecycleError && error.code === 'too_large') throw error
        throw new LifecycleError('deletion_receipt_unavailable', 404)
      }
      const bytes = Uint8Array.from(String(value.secret).match(/../g)!, part => Number.parseInt(part, 16))
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('')
      return result(await (call ?? rpc(config))('lifecycle_receipt_status', { p_environment: config.environment, p_request: value.requestId, p_digest: digest }))
    } catch (error) { return failure(error) }
  }
}
