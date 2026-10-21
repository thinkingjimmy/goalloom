/**
 * [INPUT]: Provider identities and Supabase session types.
 * [OUTPUT]: Finite mobile account state and the platform authentication port.
 * [POS]: Account contracts; no native module or credential value reaches a view.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
export type AuthProvider = 'apple' | 'google'
export type AccountError = 'configuration' | 'auth' | 'network' | 'storage'
export interface AccountState {
  phase: 'loading' | 'signed-out' | 'signing-in' | 'signed-in'
  email: string | null
  userId: string | null
  provider: AuthProvider | null
  error: AccountError | null
  enabled: boolean
  appleAvailable: boolean
  googleAvailable: boolean
}
export interface AuthConfig { target: string; url: string; anonKey: string; iosClientId: string; webClientId: string }
export interface AccountPlatform {
  supported: boolean
  config(): AuthConfig | null
  appleAvailable(): Promise<boolean>
  authorize(provider: AuthProvider, config: AuthConfig): Promise<{ token: string; nonce?: string } | null>
  read(key: string): Promise<string | null>
  write(key: string, value: string): Promise<void>
  remove(key: string): Promise<void>
  retireClient(): void
  revoke(config: AuthConfig, token: string): void
  createClient(config: AuthConfig): SupabaseClient
}
