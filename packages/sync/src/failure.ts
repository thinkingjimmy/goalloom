/** Stable codes the desktop maps into localized copy. They are not user-facing sentences. */
export class SyncFailure extends Error {
  constructor(readonly code: 'auth' | 'network' | 'password' | 'key' | 'version' | 'storage' | 'rejected' | 'mismatch' | 'timeout' | 'cancelled' | 'rate_limited' | 'configuration', message: string = code,
    readonly retryAt?: number, readonly scope?: 'upload' | 'read') {
    super(message)
    this.name = 'SyncFailure'
  }
}
