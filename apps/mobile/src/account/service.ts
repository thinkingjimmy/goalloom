/**
 * [INPUT]: The platform account port and explicit sign-in/sign-out/foreground intents.
 * [OUTPUT]: One account session, safe restoration and content-free account status subscriptions.
 * [POS]: Mobile account coordinator shared by onboarding and settings. No task writes or sync-password proof.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { accountPlatform } from './platform'
import type { AccountPlatform, AccountState, AuthProvider } from './types'

export class AccountService {
  private client: SupabaseClient | null = null
  private currentSession: Session | null = null
  private listeners = new Set<(state: AccountState) => void>()
  private operation: Promise<void> | null = null
  private generation = 0
  private foreground = true
  private stopAuth: (() => void) | null = null
  private state: AccountState = { phase: 'loading', email: null, userId: null, provider: null, error: null, enabled: false, appleAvailable: false, googleAvailable: false }
  constructor(readonly platform: AccountPlatform = accountPlatform) {}
  snapshot = () => this.state
  subscribe = (listener: (state: AccountState) => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private publish(update: Partial<AccountState>) {
    this.state = { ...this.state, ...update }
    for (const listener of this.listeners) listener(this.state)
  }
  async start(): Promise<void> {
    if (this.client || this.state.phase !== 'loading') return
    const config = this.platform.config()
    if (!this.platform.supported || !config) { this.publish({ phase: 'signed-out' }); return }
    try {
      this.publish({ enabled: true, appleAvailable: await this.platform.appleAvailable(), googleAvailable: Boolean(config.iosClientId && config.webClientId) })
      this.connect(config)
      const { data, error } = await this.client!.auth.getSession()
      if (error) throw Error('storage')
      this.adopt(data.session)
      if (this.foreground) this.client!.auth.startAutoRefresh()
    } catch { this.publish({ phase: 'signed-out', error: 'storage' }) }
  }
  private adopt(session: Session | null) {
    this.currentSession = session
    const provider = session?.user.app_metadata.provider
    this.publish({ phase: session ? 'signed-in' : 'signed-out', userId: session?.user.id ?? null,
      email: session?.user.email ?? null, provider: provider === 'apple' || provider === 'google' ? provider : null })
  }
  async signIn(provider: AuthProvider): Promise<void> {
    if (this.operation || this.state.phase === 'signed-in') return
    const config = this.platform.config(), client = this.client
    if (!config || !client || provider === 'apple' && !this.state.appleAvailable || provider === 'google' && !this.state.googleAvailable) {
      this.publish({ error: 'configuration' }); return
    }
    const generation = ++this.generation
    this.publish({ phase: 'signing-in', provider, error: null })
    const work = (async () => {
      try {
        const credential = await this.platform.authorize(provider, config)
        if (generation !== this.generation) return
        if (!credential) { this.publish({ phase: 'signed-out', provider: null }); return }
        const { data, error } = await client.auth.signInWithIdToken({ provider, token: credential.token, ...(credential.nonce ? { nonce: credential.nonce } : {}) })
        if (generation !== this.generation) return
        if (error || !data.session) throw error || Error('auth')
        this.adopt(data.session)
        this.publish({ provider })
      } catch (error) {
        if (generation !== this.generation) return
        const message = error instanceof Error ? error.message : ''
        const code = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
        this.publish({ phase: 'signed-out', error: message === 'configuration' ? 'configuration' : message === 'storage' ? 'storage' : code === 'AuthRetryableFetchError' ? 'network' : 'auth' })
      }
    })()
    this.operation = work
    try { await work } finally { if (this.operation === work) this.operation = null }
  }
  async signOut(): Promise<void> {
    if (this.operation || !this.client) return
    const settings = this.platform.config(), token = this.currentSession?.access_token
    this.publish({ error: null })
    const work = (async () => {
      ++this.generation
      this.client?.auth.stopAutoRefresh()
      this.stopAuth?.(); this.stopAuth = null
      this.platform.retireClient()
      try {
        await this.platform.remove('goalloom.auth.session')
        this.client = null
        this.adopt(null)
        // Durable local sign-out must not wait for a reachable revocation endpoint.
        if (settings && token) this.platform.revoke(settings, token)
      } catch {
        this.client = null
        this.publish({ error: 'storage' })
      }
    })()
    this.operation = work
    try { await work } finally {
      if (this.operation === work) this.operation = null
      if (!this.client && settings) this.connect(settings)
    }
  }
  private connect(config: NonNullable<ReturnType<AccountPlatform['config']>>) {
    this.client = this.platform.createClient(config)
    const client = this.client
    const subscription = client.auth.onAuthStateChange((_event, session) => {
      if (this.client === client && !this.operation) this.adopt(session)
    })
    this.stopAuth = () => subscription.data.subscription.unsubscribe()
    if (this.foreground) client.auth.startAutoRefresh()
  }
  setForeground(active: boolean) {
    this.foreground = active
    if (active) this.client?.auth.startAutoRefresh()
    else this.client?.auth.stopAutoRefresh()
  }
  async session(): Promise<Session | null> {
    if (!this.client) return null
    const { data, error } = await this.client!.auth.getSession()
    if (error) throw Error('auth')
    return data.session
  }
  async accessToken(): Promise<string> {
    const session = await this.session()
    if (!session) throw Error('auth')
    return session.access_token
  }
  stop() { ++this.generation; this.platform.retireClient(); this.stopAuth?.(); this.stopAuth = null; this.client?.auth.stopAutoRefresh() }
}
export const accountService = new AccountService()
