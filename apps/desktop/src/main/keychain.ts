/**
 * [INPUT]: The packaged macOS native policy and application-private Data Protection session keys.
 * [OUTPUT]: protectKeychainAccess() and protectedSessionKey(); other platforms retain their existing cipher.
 * [POS]: Main-process guard. Missing native code disables credential access while the local workspace stays available.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

interface KeychainPolicy { disableInteraction(): boolean; sessionKey(scope: string, create: boolean): Buffer | null }
let policy: KeychainPolicy | null | undefined

export function protectKeychainAccess(): boolean {
  if (process.platform !== 'darwin') return true
  try {
    if (policy === undefined) policy = createRequire(import.meta.url)(fileURLToPath(new URL('./keychain-policy.node', import.meta.url))) as KeychainPolicy
    return policy?.disableInteraction() === true
  } catch {
    policy = null
    return false
  }
}

export function protectedSessionKey(scope: string, create: boolean): Buffer | null {
  if (process.platform !== 'darwin' || !protectKeychainAccess() || !policy) throw Error('Protected session storage is unavailable')
  return policy.sessionKey(scope, create)
}
