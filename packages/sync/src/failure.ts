/** Stable codes the desktop maps into localized copy. They are not user-facing sentences. */
export class SyncFailure extends Error {
  constructor(readonly code: 'auth' | 'network' | 'password' | 'key' | 'version' | 'storage' | 'rejected' | 'mismatch', message: string = code) {
    super(message)
    this.name = 'SyncFailure'
  }
}
