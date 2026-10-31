/**
 * [INPUT]: Current/legacy OS ciphers, storage worker, browser, resolved device locale, connectivity signals and an optional anon key.
 * [OUTPUT]: Independent account-only sessions, explicit sync preparation, typed service pauses with receipt-only recovery, receipt-proven key epochs, noninteractive recovery, explicit cleanup, encrypted exchange and bounded review reads. Sign-out and unused startup do not access the keychain.
 * [POS]: Desktop sync coordinator. Network stays in the main process; the worker only sees opened ops.
 * The password is held in memory only until a join finishes or ten minutes pass.
 */
import { readdir } from 'node:fs/promises'
import { keyScopeSchema, scopeContext, scopeId, type KeyScope } from './key-scope'
import { randomBytes } from 'node:crypto'
import { sealLocal, openLocal } from './sealed-file'
import { hostname } from 'node:os'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { canonicalJson, isSecretFingerprint, isSecretSettingKey, secretSettingKeys } from '@goalloom/contracts'
import { passwordAccepted, publicFromSeed, signDetached, rosterHash, sha256Hex, type RecoverySecrets } from '@goalloom/crypto'
import {
  acceptRosterAdvance, changeSyncPassword, createCloudRemote, createFetchRemote, downloadWorkspace, newDeviceSecret, isServiceFailureCode,
  rebindMessage, unlockWithPassword, workspaceKeyFromEnvelope, SyncFailure, type BoundWorkspace, type DevicePlatform,
  type DeviceSecret, type SyncRemote, scopedRemote, boundedRequest, requestLimits, syncClock, type SyncClock,
} from '@goalloom/sync'
import { isLaterSetting, redactSyncOp, type RemoteEnvelope } from '@goalloom/store-core'
import { DomainError } from '../../shared/contracts/commands'
import { syncActionSchema, syncReplySchema, type AuthProvider, type SyncAction, type SyncReply, type SyncStatus } from '../../shared/contracts/sync'
import type { StorageClient } from '../storage/client'
import { CredentialError, type Cipher } from '../smart/credentials'
import { readSyncConfig } from './config'
import { oauthSignIn, supabaseClient, type OAuthListenOptions } from './oauth'
import { decodeVault, encodeVault, encodeScopedVault, type VaultSecrets } from './vault'
import { SessionVault } from './session-vault'
import { PasswordVault } from './password-vault'
import { PendingCache } from './pending-cache'
import { UploadCooldown } from './cooldown'
import { SyncSchedule } from './schedule'
import { exchangeTurn, type ExchangeState, type LocalView } from './exchange'
import type { NetworkEventHandler } from './network-monitor'
import { BindingJournal, type BindingDraft, type PreparedEpoch } from './binding-journal'
import { resolvePreparedEpoch } from './epoch-custody'
import { createSeedBinding, finishSeedBinding, restoredSeedBinding } from './seed-binding'
import type { BindingIdentity } from '@goalloom/store-core'
import { prepareProductionProfile } from './environment'
import { recoverUnknownReceipts } from './receipt-recovery'

type Phase = SyncStatus['phase']
type SyncError = NonNullable<SyncStatus['error']>
const emptyView = (): LocalView => ({
  workspaceId: null, deviceId: null, generation: '', keyEpoch: null, paused: null, lastAppliedSeq: 0, pending: 0, conflicts: 0, localItems: 0,
})

const emptyRecovery = (): RecoverySecrets => ({
  boxSk: new Uint8Array(), signSk: new Uint8Array(), boxPub: new Uint8Array(), signPub: new Uint8Array(),
})

function desktopPlatform(): DevicePlatform {
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'win32') return 'windows'
  return 'linux'
}

export class SyncService {
  private generationPreview: { token: string; accountId: string; binding: BindingIdentity | null; preview: import('@goalloom/sync').BindingTransitionPreview } | null = null
  private activeBinding: BindingIdentity | null = null
  private epochPending = false
  private secretDirectory: string
  private custody = new Map<string, { scope: KeyScope; key: Uint8Array | null; journal: BindingJournal; password: PasswordVault }>()
  private writingScopeKeys = new Set<string>()
  private preparedPasswords = new Set<PasswordVault>()
  private journalProtection: Promise<void> = Promise.resolve()
  private bindingSetup: Promise<void> = Promise.resolve()
  private vault: SessionVault
  private passwordVault: PasswordVault
  private passwordMode = false
  private passwordReady = false
  private manualUnlock = false
  private credentialBlocked = false
  private secrets: VaultSecrets | null = null
  private client: SupabaseClient | null = null
  private remote: SyncRemote | null = null
  private phase: Phase = 'unconfigured'
  private email: string | null = null
  private identity: { userId: string; expiresAt: number; sessionId?: string | null } | null = null
  cloudContext(): string { return `${this.identity?.userId}|${this.identity?.sessionId}|${this.activeBinding?.bindingToken}|${this.view.generation}` }
  accountId(): string | null { return this.identity && this.identity.expiresAt > Date.parse(this.deps.now()) ? this.identity.userId : null }
  privacyClosed(target: { workspaceId: string; generation: string } | null): void {
    if (target && (this.secrets?.workspaceId !== target.workspaceId || this.secrets?.generation !== target.generation)) return
    this.invalidate(); this.generationPreview = null
    this.error = 'service_revoked'; this.schedule.stop(); this.closeChannel(); this.publish()
  }
  async accountSession(): Promise<{ userId: string; accessToken: string }> {
    const client = this.client
    const result = await client?.auth.getSession()
    if (result?.error) throw new SyncFailure([401, 403].includes(result.error.status ?? 0) ? 'auth' : 'network')
    const session = result?.data.session
    if (!client || this.client !== client || !session || !this.accountId() || session.user.id !== this.accountId()) throw new SyncFailure('auth')
    return { userId: session.user.id, accessToken: session.access_token }
  }
  /** Billing checks do not initialize sync. Existing devices can confirm only their original unknown sends. */
  async billingChecked(eligible: boolean): Promise<void> {
    if (!this.error || !isServiceFailureCode(this.error) || this.stopped || this.operation) return
    if (eligible) {
      if (this.phase === 'ready') await this.tick()
      return
    }
    const secrets = this.secrets, remote = this.remote, id = this.lifecycleId
    if (!remote || !secrets || secrets.userId !== this.accountId() || !secrets.workspaceId || !secrets.deviceId) return
    const view = await this.readView()
    this.checkLifecycle(id)
    if (view.workspaceId !== secrets.workspaceId || view.deviceId !== secrets.deviceId) return
    try {
      await recoverUnknownReceipts({ remote, workspaceId: secrets.workspaceId, deviceId: secrets.deviceId,
        generation: view.generation, signal: this.requestSignal(), storage: command => this.storage(command), at: this.deps.now,
        check: () => this.checkLifecycle(id) })
      await this.readView(); this.checkLifecycle(id); this.publish()
    } catch { /* The original receipt identity stays queued for the next explicit check. */ }
  }
  private error: SyncError | null = null
  private offline = false
  private lastSyncedAt: string | null = null
  private view: LocalView = emptyView()
  private heldPassword: string | null = null
  private heldTimer: ReturnType<typeof setTimeout> | null = null
  private operation: Promise<void> | null = null
  private signInAbort: AbortController | null = null
  private signingInProvider: AuthProvider | undefined
  private signingOut = false
  private ticking = false
  private pendingCache: PendingCache
  private cooldown: UploadCooldown
  private schedule: SyncSchedule
  private lifecycle = new AbortController()
  private lifecycleId = 0
  private turnDeadline = Infinity
  private turnSignal: AbortSignal | null = null
  private stopped = false
  private suspended = false
  private authDispose: (() => void) | null = null
  private exchangeState: ExchangeState = { uploadRetryAt: 0, uploadFailures: 0, receiptRetryAt: 0, receiptFailed: false, verifyRoster: true, uploadReason: 'network' }
  private channel: { unsubscribe: () => Promise<unknown> } | null = null
  private channelContext = ''
  private subscriptionId = 0
  private connecting = false
  private channelClosed: Promise<unknown> = Promise.resolve()
  private headHint = 0
  private started = false
  private seedPending = false
  private appliedSetting = new Map<string, string>()
  private networkCleanup: (() => void) | null = null
  private cleanupBlocked = false
  private selectedWorkspace: string | null = null

  constructor(private deps: {
    userData: string
    packaged?: boolean
    cipher: Cipher
    sessionCipher?: Cipher
    storage: StorageClient
    openExternal: (url: string) => Promise<void>
    notify: (status: SyncStatus) => void
    onApplied: () => void
    settingsRevision?: () => number
    onSettings?: (rows: { key: string; value: unknown; updatedAt: string; opId: string }[], revision?: number) => Promise<string[]>
    collectSeed?: () => Promise<{ key: string; value: unknown }[]>
    readSecret?: (key: string) => Promise<string | null | undefined>
    applySecret?: (key: string, value: string | null) => Promise<void>
    language?: () => string
    locale?: () => string
    clipboard: (text: string) => void
    now: () => string
    clock?: SyncClock
    random?: () => number
    monitorNetwork?: (handler: NetworkEventHandler) => () => void
    beforeLocalClear?: () => Promise<void>
    afterLocalClearAttempt?: () => void
    onLocalCleared?: () => void
    /** Focus the desktop window once the loopback page has been sent. */
    onBrowserReturn?: () => void
    beginSignIn?: (client: SupabaseClient, open: (url: string) => Promise<void>, options?: OAuthListenOptions) => Promise<Session>
  }) {
    this.secretDirectory = deps.userData
    this.vault = new SessionVault(deps.userData, deps.cipher, deps.sessionCipher)
    this.passwordVault = new PasswordVault(deps.userData)
    this.pendingCache = new PendingCache(deps.userData, deps.cipher)
    this.cooldown = new UploadCooldown(deps.userData)
    this.schedule = new SyncSchedule({ run: () => this.runTurn(), onError: error => { this.setError(error); this.publish() },
      ...(deps.clock ? { clock: deps.clock } : {}), ...(deps.random ? { random: deps.random } : {}) })
  }

  private keyScope(accountId: string): KeyScope {
    const config = readSyncConfig(this.deps.userData, this.deps.packaged)
    return Object.freeze(keyScopeSchema.parse({ version: 1, accountId, projectRef: new URL(config.url).hostname.split('.')[0], environment: this.deps.packaged ? 'production' : 'development' }))
  }
  private scopeCustody(accountId: string) {
    const scope = this.keyScope(accountId), id = scopeId(scope)
    let owned = this.custody.get(id)
    if (!owned) {
      const holder = { scope, key: null as Uint8Array | null, journal: null as unknown as BindingJournal, password: new PasswordVault(this.secretDirectory, scope) }
      holder.journal = new BindingJournal(this.secretDirectory, scope, () => {
        const key = holder.key, context = `binding-journal/v2|${scopeContext(scope)}`, header = Buffer.from('Goalloom scoped binding journal 1\n')
        return { available: () => Boolean(key), encrypt: text => {
          if (!key) throw new SyncFailure('storage')
          return Buffer.concat([header, sealLocal(key, context, Buffer.from(text))])
        }, decrypt: bytes => {
          if (!key || !bytes.subarray(0, header.length).equals(header)) throw new SyncFailure('storage')
          return openLocal(key, context, bytes.subarray(header.length)).toString()
        } }
      })
      this.custody.set(id, holder); owned = holder
    }
    const key = this.secrets?.bindingJournalKeys?.[id]
    if (key && !this.writingScopeKeys.has(id) && !this.signingOut && !this.stopped) {
      if (owned.key && !Buffer.from(owned.key).equals(key)) throw new SyncFailure('storage')
      owned.key = key
    }
    return owned
  }
  private get bindingJournal(): BindingJournal {
    const accountId = this.requireSecrets().userId
    if (!accountId) throw new SyncFailure('auth')
    return this.scopeCustody(accountId).journal
  }
  private selectPasswordScope(accountId: string): PasswordVault {
    const owned = this.scopeCustody(accountId)
    if (this.passwordVault !== owned.password) { this.passwordVault.forget(); this.passwordVault = owned.password }
    return owned.password
  }
  private cancelCustody(): void {
    this.passwordVault.forget()
    for (const owned of this.custody.values()) { owned.key = null; owned.password.forget() }
    for (const password of this.preparedPasswords) password.forget()
  }
  private async settleCustody(): Promise<void> {
    await Promise.all([...this.custody.values()].flatMap(owned => [owned.password.settle(), owned.journal.settle()]).concat([...this.preparedPasswords].map(password => password.settle())))
  }
  private persistJournalProtection(prepare?: () => void): Promise<void> {
    const secrets = this.requireSecrets(), id = this.lifecycleId
    const work = this.journalProtection.then(() => {
      this.checkLifecycle(id)
      if (this.secrets !== secrets) throw new SyncFailure('cancelled')
      return this.writeJournalProtection(prepare)
    })
    this.journalProtection = work.catch(() => undefined)
    return work
  }
  private async originalJournalExists(owned: ReturnType<SyncService['scopeCustody']>): Promise<boolean> {
    if (await owned.journal.exists()) return true
    try { return (await readdir(this.secretDirectory)).some(name => name === 'sync-bindings.bin' || name.startsWith('sync-bindings.bin.') && name.endsWith('.tmp')) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
  }
  private async verifyScopeKey(secrets: VaultSecrets, scope: KeyScope, key: Uint8Array): Promise<boolean> {
    const recovery = secrets.recoveryBoxSk ?? secrets.pendingRecovery?.recoveryBoxSk
    const workspaceId = secrets.workspaceId ?? secrets.pendingRecovery?.workspaceId
    if (recovery && workspaceId) {
      try { const saved = await this.scopeCustody(scope.accountId).password.recover(recovery, scope.accountId, workspaceId)
        const stored = saved?.bindingJournalKeys?.[scopeId(scope)]
        if (stored && Buffer.from(stored).equals(key)) return true
      } catch { /* Native custody can independently prove the same key. */ }
    }
    try {
      const saved = await this.vault.load(), stored = saved?.bindingJournalKeys?.[scopeId(scope)]
      return Boolean(stored && Buffer.from(stored).equals(key))
    } catch { return false }
  }
  private async writeJournalProtection(prepare?: () => void): Promise<void> {
    const secrets = this.requireSecrets(), lifecycle = this.lifecycleId
    if (!secrets.userId) throw new SyncFailure('auth')
    const owned = this.scopeCustody(secrets.userId), id = scopeId(owned.scope), keys = secrets.bindingJournalKeys ??= {}
    const previousKey = keys[id], previousRecovery = secrets.pendingRecovery
    if (!previousKey && await this.originalJournalExists(owned)) throw new SyncFailure('storage')
    this.checkLifecycle(lifecycle)
    prepare?.()
    if (!previousKey && Object.keys(keys).length >= 100) throw new SyncFailure('storage')
    const key = previousKey ?? randomBytes(32)
    this.writingScopeKeys.add(id); keys[id] = key
    try {
      if (this.passwordMode && (!this.passwordReady || !secrets.workspaceKey && !secrets.pendingRecovery)) throw new SyncFailure('storage')
      let failed: unknown
      try { await this.persist() } catch (error) { failed = error }
      if (!await this.verifyScopeKey(secrets, owned.scope, key)) throw failed ?? new SyncFailure('storage')
      this.checkLifecycle(lifecycle)
      if (this.secrets !== secrets || this.signingOut) throw new SyncFailure('cancelled')
      owned.key = key
    } catch (error) {
      if (keys[id] === key) {
        if (previousKey) keys[id] = previousKey; else delete keys[id]
        secrets.pendingRecovery = previousRecovery ?? null
        owned.key = previousKey ?? null
        if (key !== previousKey) key.fill(0)
      }
      throw error
    } finally { this.writingScopeKeys.delete(id) }
  }
  private async ensureJournalKey(): Promise<void> {
    const secrets = this.requireSecrets(), lifecycle = this.lifecycleId
    await this.journalProtection
    this.checkLifecycle(lifecycle)
    if (this.secrets !== secrets || !secrets.userId) throw new SyncFailure('cancelled')
    const owned = this.scopeCustody(secrets.userId), id = scopeId(owned.scope), keys = secrets.bindingJournalKeys ??= {}
    if (!keys[id]) {
      const recovery = secrets.recoveryBoxSk ?? secrets.pendingRecovery?.recoveryBoxSk, workspaceId = secrets.workspaceId ?? secrets.pendingRecovery?.workspaceId
      if (recovery && workspaceId) {
        const saved = await owned.password.recover(recovery, secrets.userId, workspaceId)
        this.checkLifecycle(lifecycle)
        const original = saved?.bindingJournalKeys?.[id]
        if (original) { keys[id] = original; owned.key = original }
      }
    }
    if (!keys[id]) await this.persistJournalProtection()
    else owned.key = keys[id]!
  }

  async start(): Promise<void> {
    this.stopped = false
    this.watchNetwork()
    try { await this.initialize(false) }
    catch (error) { if (this.stopped || error instanceof SyncFailure && error.code === 'cancelled') return; if (this.phase === 'unconfigured') this.phase = 'signed-out'; this.setError(error); this.publish() }
  }

  private async initialize(interactive: boolean, signal?: AbortSignal): Promise<void> {
    if (this.client) return
    const config = readSyncConfig(this.deps.userData, this.deps.packaged)
    if (!config.anonKey) { this.phase = 'unconfigured'; this.publish(); return }
    if (this.deps.packaged) {
      const directory = await prepareProductionProfile(this.deps.userData, this.deps.storage)
      this.secretDirectory = directory
      this.custody.clear()
      this.vault = new SessionVault(directory, this.deps.cipher, this.deps.sessionCipher)
      this.passwordVault = new PasswordVault(directory)
      this.pendingCache = new PendingCache(directory, this.deps.cipher)
      this.cooldown = new UploadCooldown(directory)
    }
    this.started = true
    const initializing = this.lifecycleId
    const loading = signal ? AbortSignal.any([signal, this.lifecycle.signal]) : this.lifecycle.signal
    this.manualUnlock = Boolean(interactive && this.deps.sessionCipher)
    this.credentialBlocked = false
    try {
      this.passwordMode = Boolean(await this.passwordVault.identity())
      const secrets = this.deps.sessionCipher || this.vault.available || !this.passwordMode
        ? await this.vault.load({ resumeOnly: !interactive, signal: loading, passwordFallback: this.passwordMode }) : null
      if (loading.aborted || this.stopped) return
      this.secrets = secrets
      if (secrets) this.passwordMode = false
      if (!this.secrets && !interactive) { this.phase = 'signed-out'; this.publish(); return }
      if (!this.secrets && !this.passwordMode && !this.vault.available) throw new CredentialError('unavailable')
    } catch (error) {
      if (loading.aborted || this.stopped) return
      this.activeBinding = null
    this.secrets = null
      if (error instanceof CredentialError) {
        this.passwordMode = true
        this.credentialBlocked = !interactive
        if (!interactive) { this.phase = 'signed-out'; this.error = null; this.publish(); return }
      } else {
        this.phase = 'locked'; this.error = 'storage'; this.publish(); return
      }
    }
    this.secrets = this.secrets ?? this.freshSecrets()
    this.client = supabaseClient(config.url, config.anonKey, this.sessionStorage(), async (url, init) =>
      boundedRequest({ ms: requestLimits.write, clock: this.clock, signals: [this.lifecycle.signal, init?.signal ?? undefined] }, async signal => {
        const response = await fetch(url, { ...init, signal })
        const body = await response.text()
        signal.throwIfAborted()
        return new Response(body || null, { status: response.status, statusText: response.statusText, headers: response.headers })
      }))
    this.remote = createFetchRemote({ url: config.url, anonKey: config.anonKey, accessToken: () => this.accessToken(), signal: () => this.requestSignal(), clock: this.clock })
    const client = this.client
    const { data } = client.auth.onAuthStateChange((_event, session) => { if (!this.stopped && this.client === client) void this.keepSession(session).catch(() => undefined) })
    this.authDispose = () => data.subscription.unsubscribe()
    if (!interactive && this.secrets.refreshToken) {
      if (this.offline) { this.phase = 'signed-out'; this.error = 'network'; this.publish(); return }
      const refreshed = await this.client.auth.refreshSession({ refresh_token: this.secrets.refreshToken }).catch(() => null)
      if (this.stopped || initializing !== this.lifecycleId) return
      if (refreshed?.data.session) {
        await this.keepSession(refreshed.data.session)
        this.email = refreshed.data.session.user.email ?? null
        await this.afterAccountAuth()
      } else {
        this.phase = 'signed-out'
        const network = !refreshed || refreshed.error?.name === 'AuthRetryableFetchError'
        this.error = network ? 'network' : 'auth'
        this.offline = network
      }
    } else if (!interactive) this.phase = 'signed-out'
    if (this.phase === 'ready' && !this.stopped && !this.suspended) this.schedule.start()
    this.publish()
  }

  private watchNetwork(): void {
    if (this.networkCleanup || !this.deps.monitorNetwork) return
    this.networkCleanup = this.deps.monitorNetwork(event => {
      if (this.stopped || this.suspended) return
      this.offline = event === 'offline'
      if (event === 'online') void this.reconnect()
      this.publish()
    })
  }

  private async reconnect(): Promise<void> {
    if (this.operation || this.stopped || this.suspended) return
    if (this.credentialBlocked && !this.client) {
      try { await this.initialize(false) }
      catch (error) { if (!this.stopped) { this.setError(error); this.publish() } }
    }
    else if (this.phase === 'ready') {
      // Connectivity is a retry hint, never permission to bypass a server upload quota.
      if (this.exchangeState.uploadReason === 'network') this.exchangeState.uploadRetryAt = 0
      this.exchangeState.receiptRetryAt = 0
      this.nudge('network_restored')
    } else if (this.client && this.secrets?.refreshToken && this.error === 'network') {
      await this.exclusive(async () => {
        const result = await this.client!.auth.refreshSession({ refresh_token: this.secrets!.refreshToken! })
        if (result.data.session) { this.email = result.data.session.user.email ?? null; await this.afterAccountAuth() }
        else throw new SyncFailure('network')
      }).catch(error => { this.setError(error); this.publish() })
    }
  }

  private get clock(): SyncClock { return this.deps.clock ?? syncClock }
  private requestSignal(): AbortSignal {
    return this.turnSignal ? AbortSignal.any([this.lifecycle.signal, this.turnSignal]) : this.lifecycle.signal
  }
  private invalidate(): void {
    this.lifecycle.abort(new SyncFailure('cancelled'))
    this.lifecycle = new AbortController()
    this.lifecycleId++
    this.headHint = 0
    this.exchangeState.verifyRoster = true
  }
  stop(): void {
    this.stopped = true
    this.networkCleanup?.(); this.networkCleanup = null
    this.invalidate()
    this.schedule.stop()
    this.pendingCache.clear()
    this.dropPassword()
    this.cancelCustody()
    this.signInAbort?.abort()
    this.authDispose?.(); this.authDispose = null
    this.closeChannel()
    this.client?.auth.stopAutoRefresh?.()
    this.client?.realtime?.disconnect()
  }

  setForeground(value: boolean): void { this.schedule.setForeground(value) }
  suspend(): void { this.suspended = true; this.invalidate(); this.schedule.suspend() }
  async resume(): Promise<void> {
    this.invalidate()
    const id = this.lifecycleId
    await this.schedule.settle()
    this.suspended = false
    try {
      await this.restoreCooldown()
      this.checkLifecycle(id)
      if (this.phase === 'ready') this.schedule.resume()
      else if (this.error === 'network' || this.credentialBlocked) await this.reconnect()
    } catch (error) { this.setError(error); this.publish() }
  }

  private async restoreCooldown(): Promise<void> {
    const userId = this.secrets?.userId
    if (!userId) return
    const id = this.lifecycleId
    const signal = this.requestSignal()
    const wait = await this.cooldown.load(userId, signal)
    this.checkLifecycle(id, signal)
    this.exchangeState.uploadRetryAt = wait ? this.clock.now() + Math.max(0, wait.until - Date.now()) : 0
    this.exchangeState.uploadReason = wait?.reason ?? 'network'
    this.exchangeState.uploadFailures = 0; this.exchangeState.receiptRetryAt = 0; this.exchangeState.receiptFailed = false
  }
  workspaceReplaced(): void {
    this.generationPreview = null
    this.activeBinding = null
    this.epochPending = false
    this.invalidate(); this.schedule.stop(); this.closeChannel(); this.view = emptyView()
    if (this.phase === 'ready' || this.phase === 'choose') this.phase = 'enter-key'
    this.publish()
  }
  nudge(reason: 'write' | 'event' | 'network_restored' | 'realtime_reconnected' = 'event'): void {
    if (this.phase !== 'ready' || this.operation || this.stopped || this.suspended) return
    if (reason === 'write') this.schedule.changed()
    void this.schedule.wake(reason === 'write' ? 200 : 0)
  }

  async handle(input: unknown): Promise<SyncReply> {
    const action = syncActionSchema.parse(input)
    if (action.type === 'generation-preview') {
      const id = this.lifecycleId
      if (action.expectedAccountId !== this.accountId()) throw new SyncFailure('auth')
      let view = await this.readView()
      await this.ensureActiveBinding(view)
      if (view.initializing && this.activeBinding) {
        await finishSeedBinding({ journal: this.bindingJournal, binding: this.activeBinding, remote: this.requireRemote(), storage: command => this.storage(command), check: () => this.checkLifecycle(id) })
        view = await this.readView()
        if (view.initializing) throw new SyncFailure('initialization_pending')
      }
      const preview = await this.storage<import('@goalloom/sync').BindingTransitionPreview & { delivery?: { unknown: number } }>({ type: 'transition-preview', expectedBinding: this.activeBinding, expectedLocalGeneration: view.generation })
      this.checkLifecycle(id)
      if (action.expectedAccountId !== this.accountId()) throw new SyncFailure('cancelled')
      const token = globalThis.crypto.randomUUID()
      this.generationPreview = { token, accountId: action.expectedAccountId, binding: this.activeBinding, preview }
      return syncReplySchema.parse({ status: this.status(), generationPreview: { token, accountId: action.expectedAccountId, generation: view.generation, revision: preview.revision, items: preview.counts.items, operations: preview.retired.counts.sync_op, unknown: preview.delivery?.unknown ?? 0 } })
    }
    if (action.type === 'reviews') {
      const reviews = await this.deps.storage.call('sync', { ...action, at: this.deps.now() })
      await this.readView()
      this.publish()
      return syncReplySchema.parse({ status: this.status(), reviews })
    }
    try {
      if (action.type === 'status') await this.readView().catch(() => undefined)
      else if (action.type === 'cancel') this.cancelJoin()
      else if (action.type === 'retry') await this.tick()
      else await this.exclusive(() => this.perform(action))
    } catch (error) {
      this.setError(error)
      this.publish()
    }
    return syncReplySchema.parse({ status: this.status() })
  }

  private async perform(action: SyncAction): Promise<void> {
    if (action.type === 'sign-in') await this.signIn(action.provider, action.purpose)
    else if (action.type === 'prepare-sync') {
      if (!this.accountId() || !this.secrets) throw new SyncFailure('auth')
      if (this.phase !== 'account') { this.error = 'busy'; this.publish(); return }
      this.manualUnlock = Boolean(this.deps.sessionCipher)
      this.secrets.accountOnly = false
      await this.persist()
      await this.afterAuth()
    }
    else if (action.type === 'sign-out') await this.signOut(action.clearLocal)
    else if (action.type === 'create') await this.createWorkspace(action.password)
    else if (action.type === 'submit-password') await this.submitPassword(action.password)
    else if (action.type === 'change-password') await this.changePassword(action.password)
    else if (action.type === 'reset-sync') await this.resetAndUpload(action.password)
    else if (action.type === 'create-new-workspace') {
      const approved = this.generationPreview
      if (!approved || approved.token !== action.previewToken || approved.accountId !== action.expectedAccountId || this.accountId() !== action.expectedAccountId) throw new SyncFailure('mismatch')
      await this.resetAndUpload(action.password, false, approved)
    }
    else if (action.type === 'join') await this.finishJoin(action.choice, action.acknowledged)
  }

  private async exclusive(work: () => Promise<void>): Promise<void> {
    if (this.operation) { this.error = 'busy'; return }
    this.schedule.stop()
    this.invalidate()
    let current: Promise<void> = Promise.resolve()
    current = this.schedule.settle().then(work).finally(() => {
      if (this.operation === current) this.operation = null
      if (this.phase === 'ready' && !this.stopped && !this.suspended) { this.listen(); this.schedule.start(); this.nudge() }
    })
    this.operation = current
    await current
  }

  private async signIn(provider: AuthProvider, purpose: 'sync' | 'ai' = 'sync'): Promise<void> {
    if (this.cleanupBlocked) { await this.deps.storage.call('finishLocalClear'); this.cleanupBlocked = false }
    this.watchNetwork()
    const abort = new AbortController()
    this.signInAbort = abort
    this.phase = 'signing-in'
    this.signingInProvider = provider
    this.manualUnlock = Boolean(this.deps.sessionCipher)
    this.error = null
    this.publish()
    try {
      if (!this.client) await this.initialize(true, abort.signal)
      if (abort.signal.aborted || !this.client || !this.remote || !this.secrets) return
      const session = await this.requestSignIn(provider, abort.signal)
      if (abort.signal.aborted) return
      this.email = session.user.email ?? null
      this.secrets.accountOnly = purpose === 'ai'
      if (purpose === 'ai') {
        this.manualUnlock = false
        // Keep a linked workspace's sync owner until its explicit sync flow validates the account.
        if (!(await this.readView()).workspaceId) await this.activateAccount(session.user.id)
      }
      await this.keepSession(session)
      await this.persist()
      if (abort.signal.aborted) {
        await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined)
        this.phase = 'signed-out'
        this.email = null
        this.error = null
        return
      }
      await this.afterAccountAuth()
    } catch (error) {
      if (abort.signal.aborted || (error instanceof SyncFailure && error.message === 'cancelled')) {
        this.phase = 'signed-out'
        this.error = null
        return
      }
      this.phase = error instanceof SyncFailure && isServiceFailureCode(error.code) ? 'account' : 'signed-out'
      throw error
    } finally {
      if (this.signInAbort === abort) this.signInAbort = null
      this.signingInProvider = undefined
    }
  }

  private requestSignIn(provider: AuthProvider, signal: AbortSignal): Promise<Session> {
    if (!this.client) return Promise.reject(new SyncFailure('auth'))
    return new Promise((resolve, reject) => {
      if (signal.aborted) { reject(new SyncFailure('auth', 'cancelled')); return }
      const onAbort = () => reject(new SyncFailure('auth', 'cancelled'))
      signal.addEventListener('abort', onAbort, { once: true })
      const onCallback = this.deps.onBrowserReturn
      const begin = this.deps.beginSignIn ?? ((client, open, options) => oauthSignIn(provider, client, open, options))
      void begin(this.client!, this.deps.openExternal, {
        provider,
        signal, language: this.deps.locale?.() ?? this.deps.language?.() ?? 'en', returnToApp: this.deps.packaged === true, ...(onCallback ? { onCallback } : {}),
      }).then(session => {
        signal.removeEventListener('abort', onAbort)
        resolve(session)
      }, error => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      })
    })
  }

  private async signOut(clearLocal = false): Promise<void> {
    this.identity = null
    this.publish()
    this.signingOut = true
    this.cancelCustody()
    let cleanupPending = false
    try {
      if (clearLocal) {
        // Cleanup requires an unlocked credential store, not Google authorization alone.
        if (this.passwordMode) {
          const secrets = this.requireSecrets()
          if (!this.passwordReady || !secrets.recoveryBoxSk || !secrets.userId || !secrets.workspaceId) throw new SyncFailure('storage')
          if (!await this.passwordVault.recover(secrets.recoveryBoxSk, secrets.userId, secrets.workspaceId)) throw new SyncFailure('storage')
        } else await this.vault.load()
        await this.settleCustody()
        await this.deps.beforeLocalClear?.()
        let result: { cleanupPending: boolean }
        try { result = await this.deps.storage.call<{ cleanupPending: boolean }>('clearLocal') }
        finally { this.deps.afterLocalClearAttempt?.() }
        cleanupPending = result.cleanupPending
        this.cleanupBlocked = cleanupPending
      } else await this.vault.signOut()
    } catch {
      throw new SyncFailure('storage')
    } finally {
      this.signingOut = false
    }
    this.authDispose?.(); this.authDispose = null
    this.networkCleanup?.(); this.networkCleanup = null
    this.closeChannel()
    const client = this.client
    this.client = null
    this.remote = null
    this.activeBinding = null
    this.secrets = null
    this.epochPending = false
    this.passwordReady = false
    this.manualUnlock = false
    this.credentialBlocked = false
    this.cancelCustody()
    client?.auth.stopAutoRefresh?.()
    client?.realtime?.disconnect()
    // Remote revocation is best effort; local sign-out must also finish offline.
    void client?.auth.signOut({ scope: 'local' }).catch(() => undefined)
    this.pendingCache.clear()
    this.phase = 'signed-out'
    this.email = null
    this.error = this.cleanupBlocked ? 'cleanup' : null
    this.offline = false
    this.dropPassword()
    this.selectedWorkspace = null
    if (clearLocal) { this.view = emptyView(); this.appliedSetting.clear(); this.deps.onLocalCleared?.(); this.deps.onApplied() }
    this.publish()
  }

  private async createWorkspace(password: string): Promise<void> {
    const lifecycle = this.lifecycleId
    if (this.phase !== 'setup') return
    if (!passwordAccepted(password)) throw new SyncFailure('password')
    this.manualUnlock = false
    await this.passwordVault.prepare(password)
    this.checkLifecycle(lifecycle)
    if (this.passwordMode && !this.passwordReady) {
      this.passwordReady = true
      await this.ensureDevice()
    }
    const view = await this.readView()
    await this.createSeed(password, view)
    this.becomeReady()
    await this.runTurn()
    this.publish()
  }

  private async submitPassword(password: string): Promise<void> {
    if (this.phase !== 'enter-key') return
    if (!passwordAccepted(password)) throw new SyncFailure('password')
    if (this.passwordMode && !this.passwordReady) {
      const current = this.requireSecrets()
      if (!current.userId) throw new SyncFailure('auth')
      const restored = await this.passwordVault.unlock(password, current.userId)
      if (restored) {
        if (this.selectedWorkspace && restored.workspaceId && restored.workspaceId !== this.selectedWorkspace) throw new SyncFailure('mismatch')
        this.secrets = { ...restored, refreshToken: current.refreshToken }
        this.passwordReady = true
        this.manualUnlock = false
        await this.persist()
        await this.afterAccountAuth()
        return
      }
      await this.ensureDevice()
    }
    this.heldPassword = password
    this.armPassword()
    await this.finishJoin('merge', false)
  }

  private async changePassword(password: string): Promise<void> {
    if (this.phase !== 'ready') return
    if ((await this.readView()).initializing) throw new SyncFailure('initialization_pending')
    if (!passwordAccepted(password)) throw new SyncFailure('password')
    const secrets = this.requireSecrets()
    const recovery = this.recoveryFromVault()
    if (!recovery || !secrets.workspaceId || !secrets.deviceId) throw new SyncFailure('key')
    await changeSyncPassword({
      remote: this.requireRemote(), deviceId: secrets.deviceId, workspaceId: secrets.workspaceId, recovery, password,
    })
    await this.passwordVault.prepare(password); await this.persist()
    this.error = null
    this.publish()
  }

  private async resetAndUpload(password: string, destructive = true, approved?: NonNullable<SyncService['generationPreview']>): Promise<void> {
    const operation = this.lifecycleId
    if (this.phase !== 'enter-key' && this.phase !== 'ready' && !(this.phase === 'account' && approved)) return
    if (!passwordAccepted(password)) throw new SyncFailure('password')
    if (this.phase === 'account') {
      const lifecycle = this.lifecycleId, signal = this.lifecycle.signal, context = this.cloudContext(), accountId = this.accountId()
      if (!approved || !accountId || accountId !== approved.accountId) throw new SyncFailure('auth')
      const config = readSyncConfig(this.deps.userData, this.deps.packaged), auth = await this.accountSession()
      if (auth.userId !== accountId || !config.anonKey) throw new SyncFailure('auth')
      const remote = createCloudRemote({ ...config, anonKey: config.anonKey, accessToken: async () => auth.accessToken, signal: () => signal })
      const status = await remote.status({ version: 1, query: { kind: 'discover', after: null } })
      this.checkLifecycle(lifecycle)
      if (this.accountId() !== accountId || this.cloudContext() !== context) throw new SyncFailure('cancelled')
      if (status.environment !== (this.deps.packaged ? 'production' : 'development') || status.projectRef !== new URL(config.url).hostname.split('.')[0]) throw new SyncFailure('configuration')
      if (!status.canCreateCloud) throw new SyncFailure('rejected', 'new cloud workspace admission denied')
      const fresh = await this.storage<import('@goalloom/sync').BindingTransitionPreview>({ type: 'transition-preview', expectedBinding: approved.binding, expectedLocalGeneration: approved.preview.localGeneration })
      this.checkLifecycle(lifecycle)
      if (fresh.revision !== approved.preview.revision || fresh.sourceDigest !== approved.preview.sourceDigest) throw new SyncFailure('storage', 'source preview changed')
      this.requireSecrets().accountOnly = false
      await this.ensureDevice()
    }
    this.manualUnlock = false
    await this.passwordVault.prepare(password)
    this.checkLifecycle(operation)
    if (this.passwordMode) {
      this.passwordReady = true
      await this.ensureDevice()
    }
    let view = await this.readView()
    await this.ensureActiveBinding(view)
    if (view.initializing && this.activeBinding) {
      const id = this.lifecycleId
      await finishSeedBinding({ journal: this.bindingJournal, binding: this.activeBinding, remote: this.requireRemote(), storage: command => this.storage(command), check: () => this.checkLifecycle(id) })
      view = await this.readView()
    }
    if (view.initializing) throw new SyncFailure('initialization_pending')
    await this.createSeed(password, view, approved, destructive)
    this.becomeReady()
    await this.runTurn()
    this.publish()
  }

  private draftSecrets(draft: BindingDraft, secrets: VaultSecrets): VaultSecrets {
    if (secrets.userId !== draft.binding.accountId || secrets.deviceId !== draft.binding.deviceId) throw new SyncFailure('mismatch')
    const roster = restoredSeedBinding(draft, { signSk: secrets.signSk, boxSk: secrets.boxSk }, this.bindingJournal).roster
    return { ...secrets, roster, workspaceId: draft.binding.workspaceId, generation: draft.binding.generation, epoch: 1,
      workspaceKey: Buffer.from(draft.workspaceKey, 'hex'), recoveryBoxSk: Buffer.from(draft.recoveryBoxSk, 'hex'), recoverySignSk: Buffer.from(draft.recoverySignSk, 'hex'), pendingRecovery: null }
  }
  private async prepareDraftPassword(draft: BindingDraft, password: string, lifecycle: number): Promise<void> {
    const secrets = this.requireSecrets(), scope = this.keyScope(draft.binding.accountId)
    const prepared = new PasswordVault(this.secretDirectory, scope, draft.transitionRequestId)
    this.preparedPasswords.add(prepared)
    try { await prepared.prepare(password); this.checkLifecycle(lifecycle); await prepared.save(this.draftSecrets(draft, secrets)); this.checkLifecycle(lifecycle) }
    finally { prepared.forget(); this.preparedPasswords.delete(prepared) }
  }
  private async promoteDraftPassword(draft: BindingDraft): Promise<void> {
    const secrets = this.requireSecrets(), lifecycle = this.lifecycleId, scope = this.keyScope(draft.binding.accountId)
    const receipt = await this.storage<import('@goalloom/sync').BindingTransitionReceipt | null>({ type: 'transition-read', requestId: draft.transitionRequestId })
    const view = await this.readView(), active = await this.storage<BindingIdentity | null>({ type: 'active-binding' })
    this.checkLifecycle(lifecycle)
    if (!receipt || receipt.initializationRequestId !== draft.initializationRequestId || receipt.manifest.seedId !== draft.seedId || receipt.finalOpId !== draft.finalOpId
      || canonicalJson(receipt.newBinding) !== canonicalJson(draft.binding) || canonicalJson(active) !== canonicalJson(draft.binding)
      || view.generation !== draft.binding.localGeneration || view.workspaceId !== draft.binding.workspaceId) throw new SyncFailure('storage')
    const current = this.selectPasswordScope(draft.binding.accountId), prepared = new PasswordVault(this.secretDirectory, scope, draft.transitionRequestId)
    await current.promote(prepared, this.draftSecrets(draft, secrets), () => {
      this.checkLifecycle(lifecycle)
      if (this.secrets !== secrets || secrets.userId !== draft.binding.accountId) throw new SyncFailure('cancelled')
    })
    this.checkLifecycle(lifecycle)
    if (this.secrets !== secrets) throw new SyncFailure('cancelled')
  }

  private async createSeed(password: string, view: LocalView, approved?: NonNullable<SyncService['generationPreview']>, destructive = false): Promise<void> {
    const id = this.lifecycleId, secrets = this.requireSecrets(), deviceId = this.requireDevice()
    const accountId = secrets.userId
    if (!accountId) throw new SyncFailure('auth')
    const config = readSyncConfig(this.deps.userData, this.deps.packaged)
    const scope = { accountId, projectRef: new URL(config.url).hostname.split('.')[0]!, environment: this.deps.packaged ? 'production' as const : 'development' as const, localGeneration: view.generation, deviceId }
    await this.ensureActiveBinding(view)
    const result = await createSeedBinding({ journal: this.bindingJournal, remote: this.requireRemote(), storage: command => this.storage(command), secret: this.deviceSecret(), secrets, scope, expectedBinding: this.activeBinding, remotePrepared: () => { this.phase = 'enter-key' }, protectDraft: async draft => { await this.persistJournalProtection(() => {
      if (this.passwordMode && !secrets.workspaceId) secrets.pendingRecovery = { sourceWorkspaceId: view.generation, destructive: false, localGeneration: view.generation, workspaceId: draft.binding.workspaceId, generation: draft.binding.generation, workspaceKey: Buffer.from(draft.workspaceKey, 'hex'), recoveryBoxSk: Buffer.from(draft.recoveryBoxSk, 'hex'), recoverySignSk: Buffer.from(draft.recoverySignSk, 'hex') }
    }); await this.prepareDraftPassword(draft, password, id) }, promoteDraft: draft => this.promoteDraftPassword(draft), password, ...(approved ? { preview: approved.preview, approvedBinding: approved.binding } : {}), destructive, at: this.deps.now(), check: () => this.checkLifecycle(id) })
    this.checkLifecycle(id)
    this.activeBinding = result.binding
    secrets.pendingRecovery = null
    await this.remember(result.bound)
    this.selectedWorkspace = result.bound.workspaceId
  }

  private ensureActiveBinding(view = this.view, signal = this.requestSignal()): Promise<void> {
    const secrets = this.secrets, id = this.lifecycleId
    const work = this.bindingSetup.then(() => {
      this.checkLifecycle(id, signal)
      if (this.secrets !== secrets) throw new SyncFailure('cancelled')
      return this.initializeActiveBinding(view, signal)
    })
    this.bindingSetup = work.catch(() => undefined)
    return work
  }
  private async resolveEpoch(prepared: PreparedEpoch, signal = this.requestSignal()): Promise<void> {
    const secrets = this.requireSecrets(), id = this.lifecycleId, journal = this.bindingJournal
    const scope = this.keyScope(prepared.expectedBinding.accountId), password = this.selectPasswordScope(scope.accountId), vault = this.vault
    const passwordMode = this.passwordMode, manual = this.manualUnlock
    const check = () => { this.checkLifecycle(id, signal); if (this.secrets !== secrets) throw new SyncFailure('cancelled') }
    this.epochPending = true
    const result = await resolvePreparedEpoch({ prepared, scope, secrets, journal, check, storage: command => this.storage(command), save: async next => {
      check()
      const snapshot = decodeVault(encodeVault(next))
      snapshot.accounts[scope.accountId] = { deviceId: snapshot.deviceId, workspaceKey: snapshot.workspaceKey, workspaceId: snapshot.workspaceId,
        generation: snapshot.generation, epoch: snapshot.epoch, roster: snapshot.roster, recoveryBoxSk: snapshot.recoveryBoxSk, recoverySignSk: snapshot.recoverySignSk }
      const hasPassword = await password.exists(); check()
      if (passwordMode || hasPassword) { await password.save(snapshot); check() }
      if (!passwordMode) {
        let failed: unknown
        try { await vault.save(manual ? { ...snapshot, refreshToken: null } : snapshot) } catch (error) { failed = error }
        check()
        const saved = await vault.load(); check()
        if (!saved || encodeScopedVault(saved, scope) !== encodeScopedVault(snapshot, scope)) throw failed ?? new SyncFailure('storage')
      }
    } })
    check()
    secrets.workspaceKey = result.secrets.workspaceKey; secrets.epoch = result.secrets.epoch; secrets.roster = result.secrets.roster
    secrets.accounts[scope.accountId] = this.accountSecrets()
    this.activeBinding = result.binding
    this.epochPending = false
  }
  private async initializeActiveBinding(view: LocalView, signal = this.requestSignal()): Promise<void> {
    const id = this.lifecycleId
    const s = this.secrets
    if (!s?.userId || !s.workspaceId || !s.generation || !s.deviceId || !s.epoch || view.workspaceId !== s.workspaceId) return
    if (!this.epochPending && this.activeBinding && this.activeBinding.accountId === s.userId && this.activeBinding.workspaceId === s.workspaceId && this.activeBinding.generation === s.generation && this.activeBinding.localGeneration === view.generation && this.activeBinding.deviceId === s.deviceId && this.activeBinding.keyEpoch === s.epoch) return
    const config = readSyncConfig(this.deps.userData, this.deps.packaged)
    await this.ensureJournalKey()
    const pending = await this.bindingJournal.pendingEpoch(s.userId, s.workspaceId, this.epochPending ? s.epoch : undefined)
    this.checkLifecycle(id, signal)
    if (this.secrets !== s) throw new SyncFailure('cancelled')
    if (pending) { await this.resolveEpoch(pending, signal); return }
    if (this.epochPending) throw new SyncFailure('storage', 'epoch preparation missing')
    const existing = await this.bindingJournal.binding(s.userId, s.workspaceId)
    this.checkLifecycle(id, signal)
    if (this.secrets !== s) throw new SyncFailure('cancelled')
    if (existing && existing.keyEpoch > 1) {
      const preparation = await this.bindingJournal.epochPreparation(existing)
      this.checkLifecycle(id, signal)
      if (preparation) { await this.resolveEpoch(preparation, signal); return }
      const receipt = await this.storage({ type: 'epoch-current', binding: existing })
      this.checkLifecycle(id, signal)
      if (receipt) throw new SyncFailure('storage', 'epoch preparation missing')
    }
    const identity: BindingIdentity = existing ?? { accountId: s.userId, projectRef: new URL(config.url).hostname.split('.')[0]!, environment: this.deps.packaged ? 'production' : 'development', workspaceId: s.workspaceId, generation: s.generation, localGeneration: view.generation, deviceId: s.deviceId, keyEpoch: s.epoch, bindingToken: globalThis.crypto.randomUUID() }
    if (identity.localGeneration !== view.generation || identity.generation !== s.generation || identity.deviceId !== s.deviceId || identity.keyEpoch !== s.epoch || identity.projectRef !== new URL(config.url).hostname.split('.')[0]) throw new SyncFailure('mismatch')
    await this.bindingJournal.remember(identity)
    this.checkLifecycle(id, signal)
    await this.storage({ type: 'active-binding', binding: identity })
    this.checkLifecycle(id, signal)
    this.activeBinding = identity
  }

  private async preparePeerBinding(bound: BoundWorkspace, deviceId: string, localGeneration: string): Promise<BindingIdentity> {
    const id = this.lifecycleId, accountId = this.requireSecrets().userId
    if (!accountId) throw new SyncFailure('auth')
    const config = readSyncConfig(this.deps.userData, this.deps.packaged), projectRef = new URL(config.url).hostname.split('.')[0]!
    const previous = await this.bindingJournal.binding(accountId, bound.workspaceId)
    this.checkLifecycle(id)
    const source: BindingIdentity = previous?.localGeneration === localGeneration ? previous : { accountId, projectRef,
      environment: this.deps.packaged ? 'production' : 'development', workspaceId: bound.workspaceId, generation: bound.generation,
      localGeneration, deviceId, keyEpoch: bound.epoch, bindingToken: globalThis.crypto.randomUUID() }
    if (source.accountId !== accountId || source.projectRef !== projectRef || source.generation !== bound.generation || source.deviceId !== deviceId || source.keyEpoch !== bound.epoch) throw new SyncFailure('mismatch')
    await this.bindingJournal.remember(source)
    this.checkLifecycle(id)
    return source
  }

  private async finishJoin(choice: 'use-remote' | 'merge', acknowledged: boolean): Promise<void> {
    const lifecycle = this.lifecycleId
    if (this.phase === 'ready') return
    if (choice === 'use-remote' && !acknowledged) return
    const remote = this.requireRemote()
    let secrets = this.requireSecrets()
    let deviceId = this.requireDevice()
    const view = await this.readView()
    this.checkLifecycle(lifecycle)
    let bound: BoundWorkspace
    let ops: RemoteEnvelope[]
    let writeRecovery = true
    if (this.heldPassword) {
      const unlocked = await unlockWithPassword({ remote, deviceId, secret: this.deviceSecret(), password: this.heldPassword,
        ...(this.selectedWorkspace ? { workspaceId: this.selectedWorkspace } : {}) })
      bound = unlocked.bound
      ops = unlocked.ops
      this.manualUnlock = false
    } else if (secrets.workspaceKey && secrets.workspaceId && secrets.epoch && secrets.roster && secrets.generation) {
      const recovery = this.recoveryFromVault()
      writeRecovery = Boolean(recovery)
      bound = {
        workspaceId: secrets.workspaceId, generation: secrets.generation, epoch: secrets.epoch,
        workspaceKey: secrets.workspaceKey, roster: secrets.roster, recovery: recovery ?? emptyRecovery(),
      }
      ops = await downloadWorkspace({ remote, deviceId, workspaceId: secrets.workspaceId, workspaceKey: secrets.workspaceKey })
    } else throw new SyncFailure('password')
    if (this.passwordMode && !this.passwordReady) {
      if (!secrets.userId) throw new SyncFailure('auth')
      // Recovery keys survive password changes and workspace-key rotation.
      const restored = await this.passwordVault.recover(bound.recovery.boxSk, secrets.userId, bound.workspaceId)
      this.checkLifecycle(lifecycle)
      if (restored) {
        this.secrets = secrets = { ...restored, refreshToken: secrets.refreshToken }
        await this.ensureDevice()
        deviceId = this.requireDevice()
      }
      this.passwordReady = true
    }
    const opened = ops.map(entry => ({ ...entry, op: redactSyncOp(entry.op) }))
    // Persist recovered keys before installation so a restart resumes the binding instead of importing again.
    if (this.heldPassword && !this.passwordVault.prepared) await this.passwordVault.prepare(this.heldPassword)
    await this.remember(bound, writeRecovery)
    this.dropPassword()
    await this.ensureJournalKey()
    if (view.workspaceId === bound.workspaceId) await this.ensureActiveBinding(view)
    const sourceBinding = await this.preparePeerBinding(bound, deviceId, view.generation)
    const plan = await this.storage<'resume' | 'automatic' | 'choose'>({ type: 'join-plan', workspaceId: bound.workspaceId, ops: opened })
    if (!acknowledged && plan === 'choose') { this.phase = 'choose'; this.error = null; this.publish(); return }
    await this.storage({ type: 'hold', closed: true })
    try {
      await this.storage({ type: 'protect', at: this.deps.now() })
      const at = this.deps.now()
      const installed = await this.storage<string>({
        type: 'install', binding: { workspaceId: bound.workspaceId, deviceId, keyEpoch: bound.epoch }, sourceBinding,
        ops: opened, at, merge: choice === 'merge', automatic: !acknowledged, expectedGeneration: view.generation,
      })
      this.checkLifecycle(lifecycle)
      if (installed === 'choose') { this.phase = 'choose'; this.error = null; this.publish(); return }
      this.activeBinding = sourceBinding
      await this.deliverSecrets(ops, 'installed')
    } finally {
      await this.storage({ type: 'hold', closed: false }).catch(() => undefined)
    }
    await this.ensureActiveBinding(await this.readView())
    this.becomeReady()
    if (this.deps.onSettings) await this.projectRemote()
    this.deps.onApplied()
    await this.runTurn()
    this.publish()
  }

  private becomeReady(): void {
    this.dropPassword()
    this.phase = 'ready'
    this.error = null
    this.seedPending = true
    if (!this.operation) this.schedule.start()
    this.listen()
  }

  private async afterAccountAuth(): Promise<void> {
    if (this.secrets?.accountOnly) { this.phase = 'account'; this.error = null; this.publish(); return }
    await this.afterAuth()
  }

  private async afterAuth(): Promise<void> {
    const id = this.lifecycleId
    const remote = this.requireRemote()
    const userId = (await this.client?.auth.getSession())?.data.session?.user.id ?? null
    const local = await this.readView()
    if (local.workspaceId && this.secrets?.userId && this.secrets.userId !== userId) {
      await this.signOut()
      this.error = 'mismatch'
      this.publish()
      return
    }
    if (userId) this.selectPasswordScope(userId)
    const savedIdentity = !this.passwordReady && (this.passwordMode || !this.secrets?.recoveryBoxSk) ? await this.passwordVault.identity() : null
    this.checkLifecycle(id)
    if (savedIdentity && !this.secrets?.recoveryBoxSk) this.passwordMode = true
    if (savedIdentity && savedIdentity.userId !== userId) {
      await this.signOut(); this.error = 'mismatch'; this.publish(); return
    }
    await this.activateAccount(userId)
    if (this.passwordMode && !this.passwordReady && savedIdentity) { this.selectedWorkspace = savedIdentity.workspaceId; this.phase = 'enter-key'; this.error = null; this.publish(); return }
    await this.restoreCooldown()
    const secrets = this.requireSecrets()
    if (secrets.userId && (!this.passwordMode || this.passwordReady) && await this.bindingJournal.exists()) await this.ensureJournalKey()
    const draft = secrets.userId && (!this.passwordMode || this.passwordReady) ? await this.bindingJournal.pending(secrets.userId) : null
    if (draft) {
      const receipt = await this.storage<import('@goalloom/sync').BindingTransitionReceipt | null>({ type: 'transition-read', requestId: draft.transitionRequestId })
      this.checkLifecycle(id)
      if (receipt) {
        if (receipt.newBinding.bindingToken !== draft.binding.bindingToken || receipt.initializationRequestId !== draft.initializationRequestId || receipt.manifest.seedId !== draft.seedId) throw new SyncFailure('storage')
        await this.promoteDraftPassword(draft)
        this.checkLifecycle(id)
        if (this.secrets !== secrets) throw new SyncFailure('cancelled')
        this.activeBinding = draft.binding
        secrets.pendingRecovery = null
        await this.bindingJournal.remember(draft.binding)
        this.checkLifecycle(id)
        if (this.secrets !== secrets) throw new SyncFailure('cancelled')
        await this.remember(restoredSeedBinding(draft, this.deviceSecret(), this.bindingJournal))
      } else {
        await this.ensureDevice()
        this.phase = local.workspaceId ? 'enter-key' : 'setup'
        this.selectedWorkspace = draft.binding.workspaceId
        this.error = null; this.publish(); return
      }
    }
    const pinned = secrets.workspaceId ?? (this.passwordMode ? local.workspaceId ?? savedIdentity?.workspaceId : null)
    const account = await remote.account(pinned ? { workspaceId: pinned } : undefined)
    this.checkLifecycle(id)
    this.selectedWorkspace = account?.workspaceId ?? null
    if (pinned && account && account.workspaceId !== pinned) {
      this.phase = 'signed-out'
      this.error = 'mismatch'
      this.publish()
      return
    }
    if (pinned && !account) {
      // A local password proof is still required before trusting an unfinished creation draft.
      if (savedIdentity) { this.phase = 'enter-key'; this.error = null; this.publish(); return }
      if (secrets.workspaceKey && !secrets.roster && !local.workspaceId) {
        await this.ensureDevice(); this.phase = 'setup'; this.error = null; this.publish(); return
      }
      await this.signOut()
      this.error = 'mismatch'
      this.publish()
      return
    }
    if (this.passwordMode && !this.passwordReady) {
      this.phase = account ? 'enter-key' : 'setup'; this.error = null; this.publish(); return
    }
    await this.ensureDevice()
    if (this.manualUnlock && account) { this.phase = 'enter-key'; this.error = null; this.publish(); return }
    if (secrets.pendingRecovery) throw new SyncFailure('storage', 'legacy recovery needs explicit review')
    if (!account) { this.phase = 'setup'; this.error = null; this.publish(); return }
    if (!secrets.workspaceKey || secrets.workspaceId !== account.workspaceId) {
      this.phase = 'enter-key'
      this.error = null
      this.publish()
      return
    }
    const view = await this.readView()
    if (view.workspaceId === account.workspaceId && !view.paused) {
      await this.ensureActiveBinding(view)
      this.phase = 'ready'
      this.error = null
      this.seedPending = true
      this.schedule.start()
      this.listen()
      this.publish()
      await this.tick()
      return
    }
    await this.finishJoin('merge', false)
  }

  private async ensureDevice(): Promise<void> {
    const id = this.lifecycleId
    const remote = this.requireRemote()
    const secrets = this.requireSecrets()
    const signPub = publicFromSeed('ed25519', secrets.signSk)
    const boxPub = publicFromSeed('x25519', secrets.boxSk)
    if (secrets.deviceId) {
      try {
        const message = rebindMessage(secrets.deviceId)
        await remote.rebindDevice(secrets.deviceId, message, signDetached(message, secrets.signSk))
        this.checkLifecycle(id)
        return
      } catch (error) {
        if (!(error instanceof SyncFailure) || error.code !== 'auth') throw error
        secrets.deviceId = null
      }
    }
    const registered = await remote.registerDevice({
      name: hostname().slice(0, 64) || 'Goalloom', platform: desktopPlatform(), signPub, boxPub,
    })
    this.checkLifecycle(id)
    secrets.deviceId = registered
    await this.persist()
  }

  private async activateAccount(userId: string | null): Promise<void> {
    const secrets = this.requireSecrets()
    if (!userId || secrets.userId === userId) {
      if (userId && !secrets.userId) { secrets.userId = userId; await this.persist() }
      return
    }
    if (secrets.userId) secrets.accounts[secrets.userId] = this.accountSecrets()
    const stored = secrets.accounts[userId]
    secrets.pendingRecovery = null
    secrets.pendingSecrets = {}
    secrets.userId = userId
    secrets.deviceId = stored?.deviceId ?? null
    secrets.workspaceKey = stored?.workspaceKey ?? null
    secrets.workspaceId = stored?.workspaceId ?? null
    secrets.generation = stored?.generation ?? null
    secrets.epoch = stored?.epoch ?? null
    secrets.roster = stored?.roster ?? null
    secrets.recoveryBoxSk = stored?.recoveryBoxSk ?? null
    secrets.recoverySignSk = stored?.recoverySignSk ?? null
    await this.persist()
  }

  private accountSecrets() {
    const secrets = this.requireSecrets()
    return {
      deviceId: secrets.deviceId, workspaceKey: secrets.workspaceKey, workspaceId: secrets.workspaceId,
      generation: secrets.generation, epoch: secrets.epoch, roster: secrets.roster,
      recoveryBoxSk: secrets.recoveryBoxSk, recoverySignSk: secrets.recoverySignSk,
    }
  }

  private async tick(): Promise<void> {
    if (this.phase === 'ready' && !this.operation && !this.stopped) await this.schedule.retry()
  }

  private async runTurn(): Promise<{ more: boolean; sendable: boolean }> {
    if (this.phase !== 'ready' || this.stopped || this.suspended) return { more: false, sendable: false }
    const id = this.lifecycleId
    if (!this.channel && !this.connecting) this.listen()
    try {
      return await boundedRequest({ ms: requestLimits.turn, clock: this.clock, signals: [this.lifecycle.signal] }, async signal => {
        this.turnSignal = signal
        this.turnDeadline = this.clock.now() + requestLimits.turn
        try {
          const result = await this.pushAndPull()
          this.checkLifecycle(id, signal)
          this.error = null; this.offline = false
          this.lastSyncedAt = this.deps.now()
          return result
        } finally { if (this.turnSignal === signal) this.turnSignal = null }
      })
    } finally { this.turnSignal = null; this.turnDeadline = Infinity; this.ticking = false; if (id === this.lifecycleId) this.publish() }
  }

  private checkLifecycle(id: number, signal = this.requestSignal()): void {
    if (id !== this.lifecycleId || this.stopped) throw new SyncFailure('cancelled')
    signal.throwIfAborted()
  }

  private async pushAndPull(): Promise<{ more: boolean; sendable: boolean }> {
    const id = this.lifecycleId
    const signal = this.requestSignal()
    if (this.deps.onSettings) await this.projectRemote()
    this.checkLifecycle(id, signal)
    if (this.seedPending && this.deps.collectSeed && this.deps.language) await this.seedLocal()
    this.checkLifecycle(id, signal)
    this.seedPending = false
    const result = await this.exchangeOnce(signal)
    this.checkLifecycle(id, signal)
    if (this.deps.onSettings) await this.projectRemote()
    return result
  }

  private async seedLocal(): Promise<void> {
    const collectSeed = this.deps.collectSeed
    const language = this.deps.language
    if (!collectSeed || !language) return
    const meta = await this.deps.storage.call<{ workspace: { theme: string; style: string; checkStyle: string; backupEnabled: boolean; backupRetention: number } }>('metadata')
    const entries = [
      { key: 'theme', value: meta.workspace.theme },
      { key: 'style', value: meta.workspace.style },
      { key: 'checkStyle', value: meta.workspace.checkStyle },
      { key: 'backup.enabled', value: meta.workspace.backupEnabled },
      { key: 'backup.retention', value: meta.workspace.backupRetention },
      { key: 'language', value: language() },
      ...await collectSeed(),
    ]
    await this.storage({ type: 'emit-settings', entries, at: this.deps.now(), opId: globalThis.crypto.randomUUID(), mode: 'seed' })
  }

  private async projectRemote(): Promise<void> {
    const id = this.lifecycleId, signal = this.requestSignal()
    const onSettings = this.deps.onSettings
    if (!onSettings) return
    const revision = this.deps.settingsRevision?.()
    const rows = await this.storage<{ key: string; value: unknown; updatedAt: string; opId: string }[]>({ type: 'settings' })
    if (!Array.isArray(rows)) return
    const deferred = this.secrets?.pendingSecrets
    if (deferred && this.deps.applySecret) {
      let changed = false
      for (const [key, value] of Object.entries(deferred)) {
        try {
          if (rows.some(row => row.key === key && row.opId === value.opId)) await this.deps.applySecret(key, value.value)
          delete deferred[key]; changed = true
        } catch { /* The encrypted copy stays available until the OS store accepts it. */ }
      }
      if (changed) await this.persist()
    }
    const fresh = rows.filter(row => this.appliedSetting.get(row.key) !== row.opId)
    if (!fresh.length) return
    this.checkLifecycle(id, signal)
    const applied = await onSettings(fresh, revision)
    this.checkLifecycle(id, signal)
    for (const key of applied) {
      const row = fresh.find(item => item.key === key)
      if (row) this.appliedSetting.set(key, row.opId)
    }
  }

  private async exchangeOnce(signal = this.requestSignal()): Promise<{ more: boolean; sendable: boolean }> {
    const remote = this.requireRemote()
    const id = this.lifecycleId
    const view = await this.readView()
    this.checkLifecycle(id, signal)
    await this.ensureActiveBinding(view, signal)
    this.checkLifecycle(id, signal)
    let expectedBinding = this.activeBinding
    const binding = () => {
      const secrets = this.requireSecrets()
      if (!secrets.workspaceId || !secrets.workspaceKey || !secrets.deviceId || !secrets.generation || !secrets.epoch || !secrets.roster) throw new SyncFailure('key')
      return { workspaceId: secrets.workspaceId, workspaceKey: secrets.workspaceKey, deviceId: secrets.deviceId,
        journalKey: secrets.recoveryBoxSk ?? secrets.boxSk,
        ...(expectedBinding ? { context: `${expectedBinding.environment}|${expectedBinding.projectRef}|${expectedBinding.accountId}|${expectedBinding.workspaceId}|${expectedBinding.generation}|${expectedBinding.localGeneration}|${expectedBinding.bindingToken}` } : {}),
        generation: secrets.generation, epoch: secrets.epoch, rosterVersion: secrets.roster.version }
    }
    return exchangeTurn({ remote, signal, cache: this.pendingCache, account: this.secrets?.userId ?? '', binding, view: () => this.readView(), storage: command => this.storage({ ...command as object, ...(expectedBinding ? { expectedBinding } : {}) }),
      finishSeed: async () => { if (expectedBinding) await finishSeedBinding({ journal: this.bindingJournal, binding: expectedBinding, remote, storage: command => this.storage(command), check: () => this.checkLifecycle(id, signal) }) },
      followRoster: async () => { await this.followRoster(); expectedBinding = this.activeBinding }, lookup: () => this.secretLookup(), deliver: ops => this.deliverSecrets(ops, true),
      applied: async () => {
        if (this.deps.onSettings) await this.projectRemote()
        this.checkLifecycle(id, signal)
        this.deps.onApplied()
      }, busy: () => { this.ticking = true; this.publish() }, check: () => this.checkLifecycle(id, signal),
      remaining: () => this.turnDeadline - this.clock.now(), random: this.deps.random ?? Math.random,
      at: this.deps.now, now: () => this.clock.now(), cooldown: async () => {
        this.checkLifecycle(id, signal)
        const account = this.secrets?.userId
        if (account) await this.cooldown.save(account, this.exchangeState.uploadRetryAt > this.clock.now()
          ? { until: Date.now() + this.exchangeState.uploadRetryAt - this.clock.now(), reason: this.exchangeState.uploadReason } : null)
      },
    }, this.exchangeState)
  }

  private async secretLookup(): Promise<(key: string) => string | null | undefined> {
    const read = this.deps.readSecret
    if (!read) return () => undefined
    const map = new Map<string, string | null | undefined>()
    for (const key of secretSettingKeys) map.set(key, await read(key))
    return key => (map.has(key) ? map.get(key) : undefined)
  }

  /** Applies secret winners before incremental replay, or from the committed first-join projection. */
  private async deliverSecrets(ops: RemoteEnvelope[], preserveLocal: boolean | 'installed' = false): Promise<void> {
    const apply = this.deps.applySecret
    if (!apply) return
    const winners = new Map((preserveLocal ? await this.storage<{ key: string; updatedAt: string; opId: string }[]>({ type: 'settings' }) : []).map(row => [row.key, row]))
    for (const entry of ops) {
      for (const action of entry.op.actions) {
        if (action.t !== 'pref.set' || !isSecretSettingKey(action.key)) continue
        if (typeof action.value === 'string' && isSecretFingerprint(action.value)) continue
        if (action.value !== null && typeof action.value !== 'string') continue
        const winner = winners.get(action.key)
        if (preserveLocal === 'installed') {
          if (winner?.opId !== entry.op.opId || winner.updatedAt !== entry.op.at) continue
        } else if (winner && !isLaterSetting(entry.op.at, entry.op.opId, winner.updatedAt, winner.opId)) continue
        try { await apply(action.key, action.value) }
        catch (error) {
          if (!this.passwordMode && !this.deps.sessionCipher) throw error
          const secrets = this.requireSecrets()
          secrets.pendingSecrets ??= {}
          secrets.pendingSecrets[action.key] = { value: action.value, opId: entry.op.opId, updatedAt: entry.op.at }
          await this.persist()
        }
        winners.set(action.key, { key: action.key, updatedAt: entry.op.at, opId: entry.op.opId })
      }
    }
  }

  private async followRoster(): Promise<void> {
    const remote = this.requireRemote()
    const secrets = this.requireSecrets()
    if (!secrets.roster || !secrets.workspaceId || !secrets.deviceId || !secrets.workspaceKey || secrets.epoch === null) return
    const id = this.lifecycleId, signal = this.requestSignal()
    const check = () => { this.checkLifecycle(id, signal); if (this.secrets !== secrets) throw new SyncFailure('cancelled') }
    const pending = await this.bindingJournal.pendingEpoch(secrets.userId!, secrets.workspaceId, this.epochPending ? secrets.epoch : undefined)
    check()
    if (pending) await this.resolveEpoch(pending, signal)
    const chain = await remote.getRoster(secrets.workspaceId, secrets.deviceId)
    check()
    const next = acceptRosterAdvance(secrets.roster, chain, secrets.deviceId)
    if (next.version === secrets.roster.version && next.epoch === secrets.epoch) return
    if (next.epoch !== secrets.epoch) {
      const envelopes = await remote.getEnvelopes(secrets.workspaceId, secrets.deviceId)
      check()
      const wire = envelopes.find(item => item.recipient === secrets.deviceId && item.epoch === next.epoch)
      if (!wire) throw new SyncFailure('key')
      const workspaceKey = workspaceKeyFromEnvelope({
        wire, roster: next, workspaceId: secrets.workspaceId, recipientId: secrets.deviceId, boxSk: secrets.boxSk,
      })
      const binding = this.activeBinding
      if (!binding || binding.keyEpoch !== secrets.epoch) throw new SyncFailure('mismatch')
      const vault = encodeScopedVault({ ...secrets, workspaceKey, epoch: next.epoch, roster: next }, this.keyScope(binding.accountId))
      const prepared = await this.bindingJournal.prepareEpoch({ requestId: globalThis.crypto.randomUUID(), expectedBinding: binding, nextEpoch: next.epoch,
        rosterHash: rosterHash(next), contextDigest: sha256Hex(vault), vault, at: this.deps.now() })
      check()
      await this.resolveEpoch(prepared, signal)
      return
    }
    secrets.roster = next
    await this.persist()
  }

  private async remember(bound: BoundWorkspace, writeRecovery = true): Promise<void> {
    const secrets = this.requireSecrets()
    secrets.workspaceId = bound.workspaceId
    secrets.generation = bound.generation
    secrets.epoch = bound.epoch
    secrets.workspaceKey = bound.workspaceKey
    secrets.roster = bound.roster
    if (writeRecovery) {
      secrets.recoveryBoxSk = bound.recovery.boxSk
      secrets.recoverySignSk = bound.recovery.signSk
    }
    await this.persist()
  }

  private recoveryFromVault(): RecoverySecrets | null {
    const secrets = this.requireSecrets()
    if (!secrets.recoveryBoxSk || !secrets.recoverySignSk || secrets.recoveryBoxSk.length !== 32 || secrets.recoverySignSk.length !== 32) return null
    return {
      boxSk: secrets.recoveryBoxSk, signSk: secrets.recoverySignSk,
      boxPub: publicFromSeed('x25519', secrets.recoveryBoxSk),
      signPub: publicFromSeed('ed25519', secrets.recoverySignSk),
    }
  }

  private async persist(): Promise<void> {
    if (this.signingOut || this.stopped) return
    const secrets = this.requireSecrets(), lifecycle = this.lifecycleId, vault = this.vault
    const password = secrets.userId ? this.selectPasswordScope(secrets.userId) : this.passwordVault
    if (secrets.userId) secrets.accounts[secrets.userId] = this.accountSecrets()
    const snapshot = decodeVault(encodeVault(secrets)), passwordMode = this.passwordMode, manual = this.manualUnlock
    const current = () => !this.signingOut && !this.stopped && this.secrets === secrets && this.lifecycleId === lifecycle
    if (passwordMode) {
      if (this.passwordReady && (snapshot.workspaceKey || snapshot.pendingRecovery)) {
        await password.save(snapshot)
        if (!current()) return
        if (this.deps.sessionCipher && !manual) {
          try { await vault.save(snapshot) }
          catch (error) { if (error instanceof CredentialError) return; throw error }
          if (!current()) return
          this.passwordMode = false; this.passwordReady = false; password.forget()
        }
      }
    } else {
      if (snapshot.userId && (snapshot.workspaceKey || snapshot.pendingRecovery) && (password.prepared || await password.exists())) {
        if (!current()) return
        await password.save(snapshot)
      }
      if (!current()) return
      await vault.save(manual ? { ...snapshot, refreshToken: null } : snapshot)
    }
  }

  private closeChannel(): void {
    const previous = this.channel
    this.channel = null; this.channelContext = ''; this.connecting = false
    this.subscriptionId++
    this.schedule.connection(false)
    if (previous) this.channelClosed = previous.unsubscribe().catch(() => undefined)
  }

  private listen(): void {
    const id = this.secrets?.workspaceId, client = this.client
    if (!client || !id || this.stopped) return
    const context = `${this.secrets?.userId}|${id}|${this.secrets?.generation}`
    // The SDK reuses a topic object; subscribing twice to it throws.
    if (context === this.channelContext && (this.channel || this.connecting)) return
    this.closeChannel()
    const subscription = this.subscriptionId
    this.channelContext = context; this.connecting = true; this.headHint = 0
    void this.channelClosed.then(() => {
      if (this.stopped || subscription !== this.subscriptionId) return
      const channel = client.channel(`cloud:v1:ws:${id}`, { config: { private: true } })
      channel.on('broadcast', { event: 'head' }, ({ payload }: { payload: { head?: number } }) => {
        if (this.phase !== 'ready' || this.suspended || this.stopped || subscription !== this.subscriptionId) return
        if (this.channel === channel && Number.isSafeInteger(payload?.head) && payload.head! > Math.max(this.headHint, this.view.lastAppliedSeq)) {
          this.headHint = payload.head!; this.nudge()
        }
      })
      client.realtime?.onHeartbeat(status => {
        if (this.stopped || subscription !== this.subscriptionId || status === 'sent') return
        this.schedule.heartbeat(status === 'ok')
      })
      this.channel = channel; this.connecting = false
      channel.subscribe(status => {
        if (subscription !== this.subscriptionId || this.channel !== channel || this.stopped) return
        this.exchangeState.verifyRoster = true
        this.schedule.connection(status === 'SUBSCRIBED')
        if (status === 'SUBSCRIBED') console.info('[Sync] Realtime connected')
      })
    }).catch(() => { if (subscription === this.subscriptionId) this.closeChannel() })
  }

  private async accessToken(): Promise<string> {
    const session = (await this.client?.auth.getSession())?.data.session
    if (!session) throw new SyncFailure('auth')
    return session.access_token
  }

  private async keepSession(session: Session | null): Promise<void> {
    let sessionId: string | null = null
    try { sessionId = session ? String(JSON.parse(Buffer.from(session.access_token.split('.')[1]!, 'base64url').toString()).session_id ?? '') : null } catch { /* An invalid session cannot authorize remote work. */ }
    this.identity = session && !this.signingOut ? { userId: session.user.id, expiresAt: (session.expires_at ?? 0) * 1000, sessionId } : null
    this.publish()
    if (this.signingOut || !this.secrets || !session?.refresh_token || session.refresh_token === this.secrets.refreshToken) return
    this.secrets.refreshToken = session.refresh_token
    this.email = session.user.email ?? this.email
    if (!this.secrets.userId) this.secrets.userId = session.user.id
    await this.persist()
  }

  private sessionStorage() {
    const values = new Map<string, string>()
    return {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
  }

  private freshSecrets(): VaultSecrets {
    const secret = newDeviceSecret()
    return {
      deviceId: null, signSk: secret.signSk, boxSk: secret.boxSk, workspaceKey: null, workspaceId: null,
      generation: null, epoch: null, roster: null, recoveryBoxSk: null, recoverySignSk: null,
      refreshToken: null, userId: null, accounts: {},
    }
  }

  private deviceSecret(): DeviceSecret {
    const secrets = this.requireSecrets()
    return { signSk: secrets.signSk, boxSk: secrets.boxSk }
  }

  private requireRemote(): SyncRemote {
    if (!this.remote) throw new SyncFailure('auth')
    return scopedRemote(this.remote, this.requestSignal())
  }

  private requireSecrets(): VaultSecrets {
    if (this.stopped) throw new SyncFailure('cancelled')
    if (!this.secrets) throw new SyncFailure('auth')
    return this.secrets
  }

  private requireDevice(): string {
    const deviceId = this.secrets?.deviceId
    if (!deviceId) throw new SyncFailure('auth')
    return deviceId
  }

  private async readView(): Promise<LocalView> {
    if (!this.started) return this.view
    this.view = await this.storage<LocalView>({ type: 'view' })
    return this.view
  }

  local<T>(argument: object): Promise<T> { return this.storage<T>(argument) }
  private storage<T>(argument: unknown): Promise<T> {
    if (this.stopped) return Promise.reject(new SyncFailure('cancelled'))
    const value = argument as { type?: string; expectedBinding?: BindingIdentity }
    const guarded = ['peek', 'mark', 'take', 'accept', 'absorb', 'install', 'bind', 'baseline', 'rebaseline', 'recover-bind', 'pause', 'settings', 'emit-settings'].includes(value.type ?? '')
    return this.deps.storage.call<T>('sync', guarded && this.activeBinding ? { ...value, expectedBinding: value.expectedBinding ?? this.activeBinding } : argument)
  }

  private armPassword(): void {
    if (this.heldTimer) clearTimeout(this.heldTimer)
    this.heldTimer = setTimeout(() => {
      this.dropPassword()
      if (this.phase === 'choose') this.phase = 'enter-key'
      this.publish()
    }, 10 * 60 * 1000)
    this.heldTimer.unref()
  }

  private cancelJoin(): void {
    if (this.phase === 'signing-in') {
      this.signInAbort?.abort()
      this.phase = 'signed-out'
      this.error = null
      this.publish()
      return
    }
    this.dropPassword()
    if (this.phase === 'choose') this.phase = 'enter-key'
    if (this.phase === 'signed-out' && this.error === 'auth') this.error = null
    this.publish()
  }

  private dropPassword(): void {
    this.heldPassword = null
    if (this.heldTimer) clearTimeout(this.heldTimer)
    this.heldTimer = null
  }

  private setError(error: unknown): void {
    if (this.cleanupBlocked) { this.error = 'cleanup'; return }
    if (error instanceof SyncFailure) {
      if (error.code === 'cancelled') return
      if (isServiceFailureCode(error.code)) {
        this.error = error.code; this.offline = false; this.schedule.stop(); this.closeChannel()
        if (this.accountId() && ['signed-out', 'unconfigured', 'signing-in'].includes(this.phase)) this.phase = 'account'
        return
      }
      if (error.code === 'initialization_pending' || error.code === 'initialization_conflict') { this.error = error.code; this.schedule.stop(); this.closeChannel(); return }
      if (error.code === 'configuration') this.error = 'configuration'
      else if (error.code === 'timeout' || error.code === 'rate_limited') this.error = 'network'
      else if (error.message === 'port') this.error = 'port'
      else if (error.code === 'version') this.error = 'key'
      else if (error.code === 'storage') this.error = 'storage'
      else if (error.code === 'rejected' && error.message.includes('workspace')) this.error = 'mismatch'
      else if (error.code === 'rejected') this.error = 'key'
      else this.error = error.code
      this.offline = error.code === 'network' || error.code === 'timeout'
      return
    }
    if (error instanceof DomainError) { this.error = 'storage'; return }
    this.error = 'network'
    this.offline = true
  }

  private status(): SyncStatus {
    const ready = this.phase === 'ready' || this.phase === 'choose'
    return { accountId: this.accountId(),
      phase: this.phase,
      ...(this.view.initializing ? { initializationPending: true } : {}),
      ...(this.phase === 'signing-in' && this.signingInProvider ? { signingInProvider: this.signingInProvider } : {}),
      email: this.email,
      pending: ready ? this.view.pending : 0,
      conflicts: ready ? this.view.conflicts : 0,
      paused: this.view.paused,
      lastSyncedAt: this.lastSyncedAt,
      error: this.error,
      localItems: this.view.localItems,
      offline: this.offline,
      syncing: this.ticking,
      realtimeConnected: this.schedule.realtimeConnected,
      ...(this.passwordMode ? { credentialStorage: 'password' as const } : {}),
      ...(this.phase === 'ready' && this.view.hasTaskHistory === false ? { awaitingTasks: true } : {}),
      ...(ready && this.view.pending > 0 && this.exchangeState.uploadRetryAt > this.clock.now() ? {
        uploadWait: { retryAt: new Date(Date.now() + this.exchangeState.uploadRetryAt - this.clock.now()).toISOString(), reason: this.exchangeState.uploadReason },
      } : {}),
    }
  }

  private publish(): void {
    this.deps.notify(this.status())
  }
}
