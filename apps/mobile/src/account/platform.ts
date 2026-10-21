/**
 * [INPUT]: A platform without the iOS account implementation.
 * [OUTPUT]: An unavailable account port; local Android/web behavior stays usable.
 * [POS]: Metro fallback. Native provider SDKs are imported only by platform.ios.ts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { AccountPlatform } from './types'
export const accountPlatform: AccountPlatform = {
  supported: false, config: () => null, appleAvailable: async () => false,
  authorize: async () => { throw Error('configuration') },
  read: async () => null,
  write: async () => { throw Error('storage') },
  remove: async () => { throw Error('storage') },
  retireClient: () => undefined, revoke: () => undefined,
  createClient: () => { throw Error('configuration') },
}
