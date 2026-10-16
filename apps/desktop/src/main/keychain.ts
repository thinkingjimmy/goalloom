/**
 * [INPUT]: The packaged macOS native interaction policy; other platforms need no native policy.
 * [OUTPUT]: protectKeychainAccess(): whether credential operations can run without system dialogs.
 * [POS]: Main-process guard. Missing native code disables credential access while the local workspace stays available.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

interface KeychainPolicy { disableInteraction(): boolean }
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
