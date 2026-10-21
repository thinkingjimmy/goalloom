/**
 * [INPUT]: Local-only E2E Auth server and the production iOS encrypted storage adapter.
 * [OUTPUT]: Synthetic provider outcomes with real Supabase SDK and native credential persistence.
 * [POS]: Test build replacement selected by Metro only under GOALLOOM_MOBILE_E2E.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { accountPlatform as native } from '../src/account/platform.ios'
import * as SecureStore from 'expo-secure-store'
import type { AccountPlatform } from '../src/account/types'
const url = 'http://127.0.0.1:54389'
export const accountPlatform: AccountPlatform = {
  ...native,
  config: () => ({ target: 'development', url, anonKey: 'synthetic-anon', iosClientId: 'synthetic.apps.googleusercontent.com', webClientId: 'synthetic-web.apps.googleusercontent.com' }),
  appleAvailable: async () => true,
  async authorize(provider) {
    const response = await fetch(`${url}/fixture/authorize?provider=${provider}`)
    const value = await response.json() as { mode: string }
    if (value.mode === 'cancel') return null
    if (value.mode === 'failure') throw Error('auth')
    if (value.mode === 'storage-failure') {
      await native.write('e2e-retained-ciphertext', 'synthetic-private-value')
      await SecureStore.deleteItemAsync('goalloom.credentials.development')
    }
    return { token: `synthetic-${provider}` }
  },
}
