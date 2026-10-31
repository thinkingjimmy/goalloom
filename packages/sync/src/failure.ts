/**
 * [INPUT]: Transport and authoritative service admission failures.
 * [OUTPUT]: Stable typed codes, including service refusal distinct from authentication.
 * [POS]: Shared client failure boundary; a service error never invalidates account identity or local data.
 */
import type { ServiceFailureCode } from '@goalloom/contracts'
export { serviceFailureCodes, isServiceFailureCode, type ServiceFailureCode } from '@goalloom/contracts'
export class SyncFailure extends Error {
  constructor(readonly code: ServiceFailureCode | 'initialization_pending' | 'initialization_conflict' | 'auth' | 'network' | 'password' | 'key' | 'version' | 'storage' | 'rejected' | 'mismatch' | 'timeout' | 'cancelled' | 'rate_limited' | 'configuration', message: string = code,
    readonly retryAt?: number, readonly scope?: 'upload' | 'read') {
    super(message)
    this.name = 'SyncFailure'
  }
}
