/**
 * [INPUT]: Native provider SDKs, build-time public client config, Keychain and a separate credential database.
 * [OUTPUT]: Nonce-bound ID tokens and authenticated encrypted credential persistence.
 * [POS]: iOS adapter. Large sessions stay encrypted outside the task workspace; Keychain holds only a wrapping key.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import 'react-native-url-polyfill/auto'
import Constants from 'expo-constants'
import * as Apple from 'expo-apple-authentication'
import * as SecureStore from 'expo-secure-store'
import { openDatabaseSync } from 'expo-sqlite'
import { getRandomValues, randomUUID } from 'expo-crypto'
import { GoogleSignin, isCancelledResponse, statusCodes } from '@react-native-google-signin/google-signin'
import { createClient, processLock } from '@supabase/supabase-js'
import { gcm } from '@noble/ciphers/aes.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js'
import type { AccountPlatform, AuthConfig } from './types'

const config = (): AuthConfig | null => {
  const value = Constants.expoConfig?.extra?.auth as AuthConfig | undefined
  return value?.url && value.anonKey ? value : null
}
let writes: Promise<unknown> = Promise.resolve()
function protectedWrite<T>(work: () => Promise<T>): Promise<T> {
  const next = writes.then(work, work)
  writes = next.catch(() => undefined)
  return next
}
let database: ReturnType<typeof openDatabaseSync> | null = null
function vault() {
  if (!database) {
    database = openDatabaseSync('goalloom-credentials.db')
    database.execSync('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS vault (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  }
  return database
}
function scope(key: string) {
  const value = config()
  if (!value) throw Error('configuration')
  return `${new URL(value.url).hostname}:${key}`
}
async function wrappingKey(create: boolean): Promise<Uint8Array> {
  const name = `goalloom.credentials.${config()?.target || 'development'}`
  let value = await SecureStore.getItemAsync(name)
  if (!value && create) {
    if (vault().getFirstSync('SELECT 1 FROM vault WHERE key LIKE ? LIMIT 1', `${new URL(config()!.url).hostname}:%`)) throw Error('storage')
    value = bytesToHex(getRandomValues(new Uint8Array(32)))
    await SecureStore.setItemAsync(name, value, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })
  }
  if (!value || !/^[a-f0-9]{64}$/.test(value)) throw Error('storage')
  return hexToBytes(value)
}
let authEpoch = 0
const requests = new Set<AbortController>()
async function readVault(key: string): Promise<string | null> {
  await writes
  try {
    const id = scope(key)
    const row = vault().getFirstSync<{ value: string }>('SELECT value FROM vault WHERE key=?', id)
    if (!row) return null
    const secret = await wrappingKey(false)
    try {
      const bytes = hexToBytes(row.value)
      return new TextDecoder().decode(gcm(secret, bytes.slice(0, 12), utf8ToBytes(id)).decrypt(bytes.slice(12)))
    } finally { secret.fill(0) }
  } catch (cause) { throw Error('storage', { cause }) }
}
async function writeVault(key: string, value: string, allowed: () => boolean = () => true): Promise<void> {
  return protectedWrite(async () => {
    if (!allowed()) throw Error('auth')
    try {
      const id = scope(key), secret = await wrappingKey(true)
      try {
        if (!allowed()) throw Error('auth')
        const nonce = getRandomValues(new Uint8Array(12))
        const sealed = gcm(secret, nonce, utf8ToBytes(id)).encrypt(utf8ToBytes(value))
        vault().runSync('INSERT INTO vault (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', id, bytesToHex(nonce) + bytesToHex(sealed))
      } finally { secret.fill(0) }
    } catch (cause) { throw Error('storage', { cause }) }
  })
}
async function removeVault(key: string, allowed: () => boolean = () => true): Promise<void> {
  await protectedWrite(async () => {
    if (!allowed()) throw Error('auth')
    try { vault().runSync('DELETE FROM vault WHERE key=?', scope(key)) } catch (cause) { throw Error('storage', { cause }) }
  })
}
export const accountPlatform: AccountPlatform = {
  supported: true, config,
  appleAvailable: () => Apple.isAvailableAsync(),
  async authorize(provider, settings) {
    if (provider === 'apple') {
      const nonce = randomUUID()
      try {
        const state = randomUUID()
        const credential = await Apple.signInAsync({ requestedScopes: [Apple.AppleAuthenticationScope.EMAIL], nonce: bytesToHex(sha256(utf8ToBytes(nonce))), state })
        if (credential.state !== state || !credential.identityToken) throw Error('auth')
        return { token: credential.identityToken, nonce }
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ERR_REQUEST_CANCELED') return null
        throw error
      }
    }
    if (!settings.iosClientId || !settings.webClientId) throw Error('configuration')
    GoogleSignin.configure({ iosClientId: settings.iosClientId, webClientId: settings.webClientId })
    try {
      const response = await GoogleSignin.signIn()
      if (isCancelledResponse(response)) return null
      if (!response.data.idToken) throw Error('auth')
      return { token: response.data.idToken }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === statusCodes.SIGN_IN_CANCELLED) return null
      throw error
    }
  },
  read: readVault, write: writeVault, remove: removeVault,
  retireClient() { ++authEpoch; for (const request of requests) request.abort(); requests.clear() },
  revoke(settings, token) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    void fetch(`${settings.url}/auth/v1/logout?scope=local`, { method: 'POST', headers: { apikey: settings.anonKey, Authorization: `Bearer ${token}` }, signal: controller.signal }).catch(() => undefined).finally(() => clearTimeout(timer))
  },
  createClient(settings) {
    const epoch = ++authEpoch
    const current = () => epoch === authEpoch
    return createClient(settings.url, settings.anonKey, {
      global: { fetch: async (input, init) => {
        if (!current()) throw Error('auth')
        const controller = new AbortController()
        requests.add(controller)
        const cancel = () => controller.abort()
        init?.signal?.addEventListener('abort', cancel, { once: true })
        if (init?.signal?.aborted) cancel()
        const timer = setTimeout(cancel, 30000)
        try {
          const response = await fetch(input, { ...init, signal: controller.signal })
          const body = await response.text()
          if (!current() || controller.signal.aborted) throw Error('auth')
          return new Response(body || null, { status: response.status, statusText: response.statusText, headers: response.headers })
        } finally { clearTimeout(timer); requests.delete(controller); init?.signal?.removeEventListener('abort', cancel) }
      } },
      auth: {
        storageKey: 'goalloom.auth.session', flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, lock: processLock,
        storage: {
          getItem: async key => { const value = await readVault(key); if (!current()) throw Error('auth'); return value },
          setItem: (key, value) => writeVault(key, value, current),
          removeItem: key => removeVault(key, current),
        },
      },
    })
  },
}
