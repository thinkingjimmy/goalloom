/**
 * [INPUT]: Current/legacy OS ciphers, storage worker, browser, resolved device locale, connectivity signals and an optional anon key.
 * [OUTPUT]: Persistent sessions, noninteractive recovery, explicit cleanup, encrypted exchange and bounded sync review reads. Sign-out and unused/signed-out startup do not access the keychain.
 * [POS]: Desktop sync coordinator. Network stays in the main process; the worker only sees opened ops.
 * The password is held in memory only until a join finishes or ten minutes pass.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { hostname } from 'node:os'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import { isSecretFingerprint, isSecretSettingKey, secretSettingKeys } from '@goalloom/contracts'
import { newRecovery, passwordAccepted, publicFromSeed, signDetached, systemRandom, type RecoverySecrets } from '@goalloom/crypto'
import {
  acceptRosterAdvance, changeSyncPassword, createFetchRemote, createRemoteWorkspace, downloadWorkspace, newDeviceSecret,
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
import { type VaultSecrets } from './vault'
import { SessionVault } from './session-vault'
import { PasswordVault } from './password-vault'
import { PendingCache } from './pending-cache'
import { UploadCooldown } from './cooldown'
import { SyncSchedule } from './schedule'
import { exchangeTurn, type ExchangeState, type LocalView } from './exchange'
import type { NetworkEventHandler } from './network-monitor'
import { createRecoveryWorkspace } from './recovery'
import { prepareProductionProfile } from './environment'

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
    onSettings?: (rows: { key: string; value: unknown; updatedAt: string; opId: string }[]) => Promise<string[]>
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
    onLocalCleared?: () => void
    /** Focus the desktop window once the loopback page has been sent. */
    onBrowserReturn?: () => void
    beginSignIn?: (client: SupabaseClient, open: (url: string) => Promise<void>, options?: OAuthListenOptions) => Promise<Session>
  }) {
    this.vault = new SessionVault(deps.userData, deps.cipher, deps.sessionCipher)
    this.passwordVault = new PasswordVault(deps.userData)
    this.pendingCache = new PendingCache(deps.userData, deps.cipher)
    this.cooldown = new UploadCooldown(deps.userData)
    this.schedule = new SyncSchedule({ run: () => this.runTurn(), onError: error => { this.setError(error); this.publish() },
      ...(deps.clock ? { clock: deps.clock } : {}), ...(deps.random ? { random: deps.random } : {}) })
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
      const secrets = this.deps.sessionCipher || !this.passwordMode
        ? await this.vault.load({ resumeOnly: !interactive, signal: loading, passwordFallback: this.passwordMode }) : null
      if (loading.aborted || this.stopped) return
      this.secrets = secrets
      if (secrets) this.passwordMode = false
      if (!this.secrets && !interactive) { this.phase = 'signed-out'; this.publish(); return }
      if (!this.secrets && !this.passwordMode && !this.vault.available) throw new CredentialError('unavailable')
    } catch (error) {
      if (loading.aborted || this.stopped) return
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
        this.email = refreshed.data.session.user.email ?? null
        await this.afterAuth()
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
        if (result.data.session) { this.email = result.data.session.user.email ?? null; await this.afterAuth() }
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
    this.passwordVault.forget()
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
    if (action.type === 'sign-in') await this.signIn(action.provider)
    else if (action.type === 'sign-out') await this.signOut(action.clearLocal)
    else if (action.type === 'create') await this.createWorkspace(action.password)
    else if (action.type === 'submit-password') await this.submitPassword(action.password)
    else if (action.type === 'change-password') await this.changePassword(action.password)
    else if (action.type === 'reset-sync') await this.resetAndUpload(action.password)
    else if (action.type === 'create-new-workspace') await this.resetAndUpload(action.password, false)
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

  private async signIn(provider: AuthProvider): Promise<void> {
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
      await this.keepSession(session)
      if (abort.signal.aborted) {
        await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined)
        this.phase = 'signed-out'
        this.email = null
        this.error = null
        return
      }
      await this.afterAuth()
    } catch (error) {
      if (abort.signal.aborted || (error instanceof SyncFailure && error.message === 'cancelled')) {
        this.phase = 'signed-out'
        this.error = null
        return
      }
      this.phase = 'signed-out'
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
    this.signingOut = true
    let cleanupPending = false
    try {
      if (clearLocal) {
        // Cleanup requires an unlocked credential store, not Google authorization alone.
        if (this.passwordMode) {
          const secrets = this.requireSecrets()
          if (!this.passwordReady || !secrets.recoveryBoxSk || !secrets.userId || !secrets.workspaceId) throw new SyncFailure('storage')
          if (!await this.passwordVault.recover(secrets.recoveryBoxSk, secrets.userId, secrets.workspaceId)) throw new SyncFailure('storage')
        } else await this.vault.load()
        const result = await this.deps.storage.call<{ cleanupPending: boolean }>('clearLocal')
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
    this.secrets = null
    this.passwordReady = false
    this.manualUnlock = false
    this.credentialBlocked = false
    this.passwordVault.forget()
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
    if (this.phase !== 'setup') return
    if (!passwordAccepted(password)) throw new SyncFailure('password')
    this.manualUnlock = false
    if (this.passwordMode && !this.passwordReady) {
      await this.passwordVault.prepare(password)
      this.passwordReady = true
      await this.ensureDevice()
    }
    const remote = this.requireRemote()
    const deviceId = this.requireDevice()
    const secrets = this.requireSecrets()
    const view = await this.readView()
    if (!secrets.workspaceId || !secrets.workspaceKey || !this.recoveryFromVault()) {
      const recovery = newRecovery(systemRandom())
      secrets.workspaceId = globalThis.crypto.randomUUID()
      secrets.workspaceKey = systemRandom().bytes(32)
      secrets.recoveryBoxSk = recovery.boxSk
      secrets.recoverySignSk = recovery.signSk
      secrets.generation = view.generation
      secrets.epoch = 1
      secrets.roster = null
    }
    await this.persist()
    const recovery = this.recoveryFromVault()
    const workspaceId = secrets.workspaceId
    const workspaceKey = secrets.workspaceKey
    if (!recovery || !workspaceId || !workspaceKey) throw new SyncFailure('storage', 'pending workspace')
    const bound = await createRemoteWorkspace({
      remote, deviceId, secret: this.deviceSecret(), password, recovery,
      generation: secrets.generation || view.generation, workspaceId, workspaceKey,
    })
    await this.remember(bound)
    const at = this.deps.now()
    await this.storage({ type: 'protect', at })
    await this.storage({ type: 'baseline', deviceId, at })
    await this.storage({ type: 'bind', binding: { workspaceId: bound.workspaceId, deviceId, keyEpoch: bound.epoch }, at: this.deps.now() })
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
        await this.afterAuth()
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
    if (!passwordAccepted(password)) throw new SyncFailure('password')
    const secrets = this.requireSecrets()
    const recovery = this.recoveryFromVault()
    if (!recovery || !secrets.workspaceId || !secrets.deviceId) throw new SyncFailure('key')
    await changeSyncPassword({
      remote: this.requireRemote(), deviceId: secrets.deviceId, workspaceId: secrets.workspaceId, recovery, password,
    })
    if (this.passwordMode) { await this.passwordVault.prepare(password); await this.persist() }
    this.error = null
    this.publish()
  }

  private async resetAndUpload(password: string, destructive = true): Promise<void> {
    if (this.phase !== 'enter-key' && this.phase !== 'ready') return
    if (!passwordAccepted(password)) throw new SyncFailure('password')
    this.manualUnlock = false
    if (this.passwordMode) {
      await this.passwordVault.prepare(password)
      this.passwordReady = true
      await this.ensureDevice()
    }
    const remote = this.requireRemote()
    const deviceId = this.requireDevice()
    const secrets = this.requireSecrets()
    const view = await this.readView()
    const sourceWorkspaceId = secrets.pendingRecovery?.sourceWorkspaceId ?? secrets.workspaceId ?? this.selectedWorkspace
    if (!sourceWorkspaceId) throw new SyncFailure('mismatch')
    await this.storage({ type: 'protect', at: this.deps.now() })
    if (destructive) this.phase = 'enter-key'
    const bound = await createRecoveryWorkspace({ remote, deviceId, secret: this.deviceSecret(), secrets, password,
      sourceWorkspaceId, localGeneration: view.generation, destructive, persist: () => this.persist() })
    // A new cloud key cannot exchange the old local log while installation is incomplete.
    this.phase = 'enter-key'
    await this.remember(bound)
    this.selectedWorkspace = bound.workspaceId
    await this.installRecovery()
    this.becomeReady()
    await this.runTurn()
    this.publish()
  }

  private async installRecovery(): Promise<void> {
    const secrets = this.requireSecrets(), draft = secrets.pendingRecovery
    if (!draft || !secrets.deviceId || secrets.workspaceId !== draft.workspaceId) throw new SyncFailure('storage')
    await this.storage({ type: 'recover-bind', binding: { workspaceId: draft.workspaceId, deviceId: secrets.deviceId, keyEpoch: 1 },
      at: this.deps.now(), expectedGeneration: draft.localGeneration })
    secrets.pendingRecovery = null
    await this.persist()
  }

  private async finishJoin(choice: 'use-remote' | 'merge', acknowledged: boolean): Promise<void> {
    if (this.phase === 'ready') return
    if (choice === 'use-remote' && !acknowledged) return
    const remote = this.requireRemote()
    let secrets = this.requireSecrets()
    let deviceId = this.requireDevice()
    const view = await this.readView()
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
      if (restored) {
        this.secrets = secrets = { ...restored, refreshToken: secrets.refreshToken }
        await this.ensureDevice()
        deviceId = this.requireDevice()
      }
      this.passwordReady = true
    }
    const opened = ops.map(entry => ({ ...entry, op: redactSyncOp(entry.op) }))
    // Persist recovered keys before installation so a restart resumes the binding instead of importing again.
    await this.remember(bound, writeRecovery)
    this.dropPassword()
    const plan = await this.storage<'resume' | 'automatic' | 'choose'>({ type: 'join-plan', workspaceId: bound.workspaceId, ops: opened })
    if (!acknowledged && plan === 'choose') { this.phase = 'choose'; this.error = null; this.publish(); return }
    await this.storage({ type: 'hold', closed: true })
    try {
      await this.storage({ type: 'protect', at: this.deps.now() })
      const at = this.deps.now()
      const installed = await this.storage<string>({
        type: 'install', binding: { workspaceId: bound.workspaceId, deviceId, keyEpoch: bound.epoch },
        ops: opened, at, merge: choice === 'merge', automatic: !acknowledged, expectedGeneration: view.generation,
      })
      if (installed === 'choose') { this.phase = 'choose'; this.error = null; this.publish(); return }
      await this.deliverSecrets(ops, 'installed')
    } finally {
      await this.storage({ type: 'hold', closed: false }).catch(() => undefined)
    }
    this.becomeReady()
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
    const savedIdentity = this.passwordMode && !this.passwordReady ? await this.passwordVault.identity() : null
    if (savedIdentity && savedIdentity.userId !== userId) {
      await this.signOut(); this.error = 'mismatch'; this.publish(); return
    }
    await this.activateAccount(userId)
    await this.restoreCooldown()
    const secrets = this.requireSecrets()
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
    if (secrets.pendingRecovery?.workspaceId === secrets.workspaceId && secrets.roster) await this.installRecovery()
    if (!account) { this.phase = 'setup'; this.error = null; this.publish(); return }
    if (!secrets.workspaceKey || secrets.workspaceId !== account.workspaceId) {
      this.phase = 'enter-key'
      this.error = null
      this.publish()
      return
    }
    const view = await this.readView()
    if (view.workspaceId === account.workspaceId && !view.paused) {
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
    const applied = await onSettings(fresh)
    this.checkLifecycle(id, signal)
    for (const key of applied) {
      const row = fresh.find(item => item.key === key)
      if (row) this.appliedSetting.set(key, row.opId)
    }
  }

  private async exchangeOnce(signal = this.requestSignal()): Promise<{ more: boolean; sendable: boolean }> {
    const remote = this.requireRemote()
    const id = this.lifecycleId
    const binding = () => {
      const secrets = this.requireSecrets()
      if (!secrets.workspaceId || !secrets.workspaceKey || !secrets.deviceId || !secrets.generation || !secrets.epoch || !secrets.roster) throw new SyncFailure('key')
      return { workspaceId: secrets.workspaceId, workspaceKey: secrets.workspaceKey, deviceId: secrets.deviceId,
        journalKey: secrets.recoveryBoxSk ?? secrets.boxSk,
        generation: secrets.generation, epoch: secrets.epoch, rosterVersion: secrets.roster.version }
    }
    return exchangeTurn({ remote, signal, cache: this.pendingCache, account: this.secrets?.userId ?? '', binding, view: () => this.readView(), storage: command => this.storage(command),
      followRoster: () => this.followRoster(), lookup: () => this.secretLookup(), deliver: ops => this.deliverSecrets(ops, true),
      applied: this.deps.onApplied, busy: () => { this.ticking = true; this.publish() }, check: () => this.checkLifecycle(id, signal),
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
    const id = this.lifecycleId
    const chain = await remote.getRoster(secrets.workspaceId, secrets.deviceId)
    this.checkLifecycle(id)
    const next = acceptRosterAdvance(secrets.roster, chain, secrets.deviceId)
    if (next.version === secrets.roster.version && next.epoch === secrets.epoch) return
    if (next.epoch !== secrets.epoch) {
      const envelopes = await remote.getEnvelopes(secrets.workspaceId, secrets.deviceId)
      this.checkLifecycle(id)
      const wire = envelopes.find(item => item.recipient === secrets.deviceId && item.epoch === next.epoch)
      if (!wire) throw new SyncFailure('key')
      secrets.workspaceKey = workspaceKeyFromEnvelope({
        wire, roster: next, workspaceId: secrets.workspaceId, recipientId: secrets.deviceId, boxSk: secrets.boxSk,
      })
      secrets.epoch = next.epoch
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
    const secrets = this.requireSecrets()
    if (secrets.userId) secrets.accounts[secrets.userId] = this.accountSecrets()
    if (this.passwordMode) {
      if (this.passwordReady && (secrets.workspaceKey || secrets.pendingRecovery)) {
        await this.passwordVault.save(secrets)
        if (this.signingOut || this.stopped || this.secrets !== secrets) return
        if (this.deps.sessionCipher && !this.manualUnlock) {
          try { await this.vault.save(secrets) }
          catch (error) { if (error instanceof CredentialError) return; throw error }
          this.passwordMode = false
          this.passwordReady = false
          this.passwordVault.forget()
        }
      }
    } else await this.vault.save(this.manualUnlock ? { ...secrets, refreshToken: null } : secrets)
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
      const channel = client.channel(`ws:${id}`, { config: { private: true } })
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

  private storage<T>(argument: unknown): Promise<T> {
    if (this.stopped) return Promise.reject(new SyncFailure('cancelled'))
    return this.deps.storage.call<T>('sync', argument)
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
    return {
      phase: this.phase,
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
