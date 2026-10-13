/**
 * [INPUT]: OS cipher, storage worker, system browser and an optional anon key.
 * [OUTPUT]: Google sign-in, recovery-key setup or entry, and an encrypted op exchange. The board stays usable when sync is off.
 * [POS]: Desktop sync coordinator. Network stays in the main process; the worker only sees opened ops.
 */
import { hostname } from 'node:os'
import type { Session, SupabaseClient } from '@supabase/supabase-js'
import {
  generateRecoveryMnemonic, publicFromSeed, recoveryPhraseAccepted, recoveryWordChecks, recoveryWordsMatch, signDetached, systemRandom,
} from '@goalloom/crypto'
import {
  acceptRosterAdvance, createFetchRemote, createRemoteWorkspace, downloadWorkspace, newDeviceSecret, planPushBatches, pullOpened,
  rebindMessage, sealPending, unlockWithPhrase, workspaceKeyFromEnvelope, SyncFailure, type BoundWorkspace, type DevicePlatform,
  type DeviceSecret, type PendingPlain, type SyncRemote,
} from '@goalloom/sync'
import type { RemoteEnvelope } from '@goalloom/store-core'
import { DomainError } from '../../shared/contracts/commands'
import { syncActionSchema, syncReplySchema, type SyncAction, type SyncReply, type SyncStatus } from '../../shared/contracts/sync'
import type { StorageClient } from '../storage/client'
import type { Cipher } from '../smart/credentials'
import { readSyncConfig } from './config'
import { googleSignIn, supabaseClient } from './oauth'
import { SyncVault, type VaultSecrets } from './vault'

type Phase = SyncStatus['phase']
type SyncError = NonNullable<SyncStatus['error']>
interface LocalView {
  workspaceId: string | null
  deviceId: string | null
  generation: string
  keyEpoch: number | null
  paused: string | null
  lastAppliedSeq: number
  pending: number
  conflicts: number
  localItems: number
}
interface PhraseHold { text: string; purpose: 'setup' | 'join' }

const emptyView = (): LocalView => ({
  workspaceId: null, deviceId: null, generation: '', keyEpoch: null, paused: null, lastAppliedSeq: 0, pending: 0, conflicts: 0, localItems: 0,
})

function desktopPlatform(): DevicePlatform {
  if (process.platform === 'darwin') return 'macos'
  if (process.platform === 'win32') return 'windows'
  return 'linux'
}

export class SyncService {
  private vault: SyncVault
  private secrets: VaultSecrets | null = null
  private client: SupabaseClient | null = null
  private remote: SyncRemote | null = null
  private phase: Phase = 'unconfigured'
  private email: string | null = null
  private error: SyncError | null = null
  private offline = false
  private lastSyncedAt: string | null = null
  private checks: number[] | null = null
  private view: LocalView = emptyView()
  private phrase: PhraseHold | null = null
  private phraseTimer: ReturnType<typeof setTimeout> | null = null
  private operation: Promise<void> | null = null
  private ticking = false
  private poll: ReturnType<typeof setInterval> | null = null
  private channel: { unsubscribe: () => Promise<unknown> } | null = null
  private started = false

  constructor(private deps: {
    userData: string
    cipher: Cipher
    storage: StorageClient
    openExternal: (url: string) => Promise<void>
    notify: (status: SyncStatus) => void
    onApplied: () => void
    clipboard: (text: string) => void
    now: () => string
    beginSignIn?: (client: SupabaseClient, open: (url: string) => Promise<void>) => Promise<Session>
  }) {
    this.vault = new SyncVault(deps.userData, deps.cipher)
  }

  async start(): Promise<void> {
    const config = readSyncConfig(this.deps.userData)
    if (!config.anonKey) { this.phase = 'unconfigured'; this.publish(); return }
    if (!this.vault.available) { this.phase = 'locked'; this.publish(); return }
    this.started = true
    try { this.secrets = await this.vault.load() }
    catch {
      this.phase = 'locked'
      this.error = 'storage'
      this.secrets = null
      this.publish()
      return
    }
    this.secrets = this.secrets ?? this.freshSecrets()
    this.client = supabaseClient(config.url, config.anonKey, this.sessionStorage())
    this.remote = createFetchRemote({ url: config.url, anonKey: config.anonKey, accessToken: () => this.accessToken() })
    this.client.auth.onAuthStateChange((_event, session) => { void this.keepSession(session).catch(() => undefined) })
    if (this.secrets.refreshToken) {
      const refreshed = await this.client.auth.refreshSession({ refresh_token: this.secrets.refreshToken }).catch(() => null)
      if (refreshed?.data.session) {
        this.email = refreshed.data.session.user.email ?? null
        await this.afterAuth()
      } else {
        this.phase = 'signed-out'
        this.error = refreshed ? 'auth' : 'network'
        this.offline = !refreshed
      }
    } else this.phase = 'signed-out'
    this.poll = setInterval(() => { void this.tick() }, 8_000)
    this.poll.unref()
    this.publish()
  }

  stop(): void {
    if (this.poll) clearInterval(this.poll)
    this.poll = null
    void this.channel?.unsubscribe()
    this.channel = null
  }

  nudge(): void {
    if (this.phase === 'ready') void this.tick()
  }

  async handle(input: unknown): Promise<SyncReply> {
    const action = syncActionSchema.parse(input)
    try {
      if (action.type === 'status') await this.readView().catch(() => undefined)
      else if (action.type === 'copy') this.copyPhrase()
      else if (action.type === 'cancel') this.cancelPhrase()
      else await this.exclusive(() => this.perform(action))
    } catch (error) {
      this.setError(error)
      this.publish()
    }
    const phrase = action.type === 'prepare' ? this.phrase?.text ?? null : null
    return syncReplySchema.parse({ status: this.status(), phrase })
  }

  private async perform(action: SyncAction): Promise<void> {
    if (action.type === 'sign-in') await this.signIn()
    else if (action.type === 'sign-out') await this.signOut()
    else if (action.type === 'prepare') this.preparePhrase()
    else if (action.type === 'confirm') await this.confirmPhrase(action.words)
    else if (action.type === 'submit-phrase') await this.submitPhrase(action.phrase)
    else if (action.type === 'join') await this.finishJoin(action.choice, action.acknowledged)
  }

  private async exclusive(work: () => Promise<void>): Promise<void> {
    if (this.operation) { this.error = 'busy'; return }
    let current: Promise<void> = Promise.resolve()
    current = work().finally(() => { if (this.operation === current) this.operation = null })
    this.operation = current
    await current
  }

  private async signIn(): Promise<void> {
    if (!this.client || !this.remote || !this.secrets) return
    this.phase = 'signing-in'
    this.error = null
    this.publish()
    try {
      const session = await (this.deps.beginSignIn ?? googleSignIn)(this.client, this.deps.openExternal)
      this.email = session.user.email ?? null
      await this.keepSession(session)
      await this.afterAuth()
    } catch (error) {
      this.phase = 'signed-out'
      throw error
    }
  }

  private async signOut(): Promise<void> {
    this.phase = 'signed-out'
    this.email = null
    this.error = null
    this.offline = false
    this.dropPhrase()
    if (this.secrets) { this.secrets.refreshToken = null; await this.persist() }
    await this.client?.auth.signOut({ scope: 'local' }).catch(() => undefined)
    void this.channel?.unsubscribe()
    this.channel = null
    this.publish()
  }

  private preparePhrase(): void {
    if (this.phase !== 'setup' && this.phase !== 'confirm') return
    const text = generateRecoveryMnemonic()
    this.phrase = { text, purpose: 'setup' }
    this.checks = recoveryWordChecks(systemRandom())
    this.phase = 'confirm'
    this.armPhrase()
    this.publish()
  }

  private copyPhrase(): void {
    if (this.phrase) this.deps.clipboard(this.phrase.text)
  }

  private async confirmPhrase(words: string[]): Promise<void> {
    if (!this.phrase || !this.checks || !recoveryWordsMatch(this.phrase.text, this.checks, words)) throw new SyncFailure('phrase')
    const remote = this.requireRemote()
    const deviceId = this.requireDevice()
    const secrets = this.requireSecrets()
    const view = await this.readView()
    if (!secrets.roster) {
      if (!secrets.workspaceId || !secrets.workspaceKey) {
        secrets.workspaceId = globalThis.crypto.randomUUID()
        secrets.workspaceKey = systemRandom().bytes(32)
        secrets.generation = view.generation
        secrets.epoch = 1
        await this.persist()
      }
    }
    const workspaceId = secrets.workspaceId
    const workspaceKey = secrets.workspaceKey
    if (!workspaceId || !workspaceKey) throw new SyncFailure('storage', 'pending workspace')
    let bound: BoundWorkspace
    try {
      bound = await createRemoteWorkspace({
        remote, deviceId, secret: this.deviceSecret(), mnemonic: this.phrase.text,
        generation: secrets.generation || view.generation, workspaceId, workspaceKey,
      })
    } catch (error) {
      if (!(error instanceof SyncFailure) || !error.message.includes('workspace')) throw error
      const account = await remote.account()
      if (account?.workspaceId === workspaceId) throw error
      const unlocked = await unlockWithPhrase({ remote, deviceId, secret: this.deviceSecret(), mnemonic: this.phrase.text })
      bound = unlocked.bound
    }
    await this.remember(bound)
    await this.storage({ type: 'baseline', deviceId, at: this.deps.now() })
    await this.storage({ type: 'bind', binding: { workspaceId: bound.workspaceId, deviceId, keyEpoch: bound.epoch }, at: this.deps.now() })
    this.dropPhrase()
    this.phase = 'ready'
    this.error = null
    this.listen()
    await this.pushAndPull()
    this.publish()
  }

  private async submitPhrase(phrase: string): Promise<void> {
    const text = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
    if (!recoveryPhraseAccepted(text)) throw new SyncFailure('phrase')
    this.phrase = { text, purpose: 'join' }
    this.armPhrase()
    const view = await this.readView()
    if (view.localItems > 0) { this.phase = 'choose'; this.error = null; this.publish(); return }
    await this.finishJoin('use-remote', true)
  }

  private async finishJoin(choice: 'use-remote' | 'merge', acknowledged: boolean): Promise<void> {
    const remote = this.requireRemote()
    const secrets = this.requireSecrets()
    const deviceId = this.requireDevice()
    const view = await this.readView()
    if (view.localItems > 0 && !acknowledged) return
    await this.storage({ type: 'hold', closed: true })
    let bound: BoundWorkspace
    let ops: RemoteEnvelope[]
    try {
      await this.storage({ type: 'protect', at: this.deps.now() })
      if (this.phrase) {
        const unlocked = await unlockWithPhrase({ remote, deviceId, secret: this.deviceSecret(), mnemonic: this.phrase.text })
        bound = unlocked.bound
        ops = unlocked.ops
      } else if (secrets.workspaceKey && secrets.workspaceId && secrets.epoch && secrets.roster && secrets.generation) {
        bound = {
          workspaceId: secrets.workspaceId, generation: secrets.generation, epoch: secrets.epoch,
          workspaceKey: secrets.workspaceKey, roster: secrets.roster,
        }
        ops = await downloadWorkspace({ remote, deviceId, workspaceId: secrets.workspaceId, workspaceKey: secrets.workspaceKey })
      } else throw new SyncFailure('phrase')
      const at = this.deps.now()
      await this.storage({
        type: 'install', binding: { workspaceId: bound.workspaceId, deviceId, keyEpoch: bound.epoch },
        ops, at, merge: choice === 'merge',
      })
    } finally {
      await this.storage({ type: 'hold', closed: false }).catch(() => undefined)
    }
    await this.remember(bound)
    this.dropPhrase()
    this.phase = 'ready'
    this.error = null
    this.listen()
    this.deps.onApplied()
    await this.pushAndPull()
    this.publish()
  }

  private async afterAuth(): Promise<void> {
    const remote = this.requireRemote()
    const userId = (await this.client?.auth.getSession())?.data.session?.user.id ?? null
    await this.activateAccount(userId)
    const secrets = this.requireSecrets()
    const account = await remote.account()
    if (secrets.workspaceId && account && account.workspaceId !== secrets.workspaceId) {
      this.phase = 'signed-out'
      this.error = 'mismatch'
      this.publish()
      return
    }
    if (secrets.workspaceId && !account) {
      this.phase = 'signed-out'
      this.error = 'mismatch'
      this.publish()
      return
    }
    await this.ensureDevice()
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
      this.listen()
      this.publish()
      await this.tick()
      return
    }
    this.phase = view.localItems > 0 ? 'choose' : 'enter-key'
    if (this.phase === 'enter-key' && view.localItems === 0) await this.finishJoin('use-remote', true)
    else this.publish()
  }

  private async ensureDevice(): Promise<void> {
    const remote = this.requireRemote()
    const secrets = this.requireSecrets()
    const signPub = publicFromSeed('ed25519', secrets.signSk)
    const boxPub = publicFromSeed('x25519', secrets.boxSk)
    if (secrets.deviceId) {
      try {
        const message = rebindMessage(secrets.deviceId)
        await remote.rebindDevice(secrets.deviceId, message, signDetached(message, secrets.signSk))
        return
      } catch (error) {
        if (!(error instanceof SyncFailure) || error.code !== 'auth') throw error
        secrets.deviceId = null
      }
    }
    secrets.deviceId = await remote.registerDevice({
      name: hostname().slice(0, 64) || 'Goalloom', platform: desktopPlatform(), signPub, boxPub,
    })
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
    secrets.userId = userId
    secrets.deviceId = stored?.deviceId ?? null
    secrets.workspaceKey = stored?.workspaceKey ?? null
    secrets.workspaceId = stored?.workspaceId ?? null
    secrets.generation = stored?.generation ?? null
    secrets.epoch = stored?.epoch ?? null
    secrets.roster = stored?.roster ?? null
    await this.persist()
  }

  private accountSecrets() {
    const secrets = this.requireSecrets()
    return {
      deviceId: secrets.deviceId, workspaceKey: secrets.workspaceKey, workspaceId: secrets.workspaceId,
      generation: secrets.generation, epoch: secrets.epoch, roster: secrets.roster,
    }
  }

  private async tick(): Promise<void> {
    if (this.ticking || this.operation || this.phase !== 'ready') return
    this.ticking = true
    try {
      await this.pushAndPull()
    } catch (error) {
      this.setError(error)
    } finally {
      this.ticking = false
      this.publish()
    }
  }

  private async pushAndPull(): Promise<void> {
    await this.exchangeOnce()
    this.error = null
    this.offline = false
    this.lastSyncedAt = this.deps.now()
  }

  private async exchangeOnce(): Promise<void> {
    const remote = this.requireRemote()
    const secrets = this.requireSecrets()
    if (!secrets.workspaceId || !secrets.workspaceKey || !secrets.deviceId || !secrets.generation || secrets.epoch === null || !secrets.roster) return
    const view = await this.readView()
    if (view.paused || view.workspaceId !== secrets.workspaceId) {
      this.phase = view.localItems > 0 ? 'choose' : 'enter-key'
      return
    }
    await this.followRoster()
    const at = this.deps.now()
    const pending = await this.storage<PendingPlain[]>({ type: 'take', at, attemptId: globalThis.crypto.randomUUID() })
    const sealed = sealPending(pending, { workspaceKey: secrets.workspaceKey, workspaceId: secrets.workspaceId, epoch: secrets.epoch })
    const batches = planPushBatches(sealed.map(row => ({ opId: row.opId, localOrder: row.localOrder, bytes: row.wire.ciphertext.length / 2, blobReady: true })))
    let held: string | null = null
    for (const ids of batches) {
      if (held) break
      const ops = ids.map(opId => sealed.find(row => row.opId === opId)!.wire)
      const results = await remote.pushOps({ workspaceId: secrets.workspaceId, deviceId: secrets.deviceId, generation: secrets.generation, ops })
      held = await this.storage<string | null>({ type: 'accept', pending, results, at })
    }
    const cursor = (await this.readView()).lastAppliedSeq
    const opened = await pullOpened({
      remote, deviceId: secrets.deviceId, workspaceId: secrets.workspaceId, workspaceKey: secrets.workspaceKey, after: cursor,
    })
    const applied = Number(await this.storage({ type: 'absorb', ops: opened, at }) ?? 0)
    if (applied > 0) this.deps.onApplied()
    if (held === 'stale_epoch') throw new SyncFailure('key', held)
    if (held) throw new SyncFailure('rejected', held)
  }

  private async followRoster(): Promise<void> {
    const remote = this.requireRemote()
    const secrets = this.requireSecrets()
    if (!secrets.roster || !secrets.workspaceId || !secrets.deviceId || !secrets.workspaceKey || secrets.epoch === null) return
    const chain = await remote.getRoster(secrets.workspaceId, secrets.deviceId)
    const next = acceptRosterAdvance(secrets.roster, chain, secrets.deviceId)
    if (next.version === secrets.roster.version && next.epoch === secrets.epoch) return
    if (next.epoch !== secrets.epoch) {
      const envelopes = await remote.getEnvelopes(secrets.workspaceId, secrets.deviceId)
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

  private async remember(bound: BoundWorkspace): Promise<void> {
    const secrets = this.requireSecrets()
    secrets.workspaceId = bound.workspaceId
    secrets.generation = bound.generation
    secrets.epoch = bound.epoch
    secrets.workspaceKey = bound.workspaceKey
    secrets.roster = bound.roster
    await this.persist()
  }

  private async persist(): Promise<void> {
    const secrets = this.requireSecrets()
    if (secrets.userId) secrets.accounts[secrets.userId] = this.accountSecrets()
    await this.vault.save(secrets)
  }

  private listen(): void {
    const id = this.secrets?.workspaceId
    if (!this.client || !id) return
    void this.channel?.unsubscribe()
    const channel = this.client.channel(`ws:${id}`, { config: { private: true } })
    channel.on('broadcast', { event: 'head' }, () => this.nudge())
    channel.subscribe()
    this.channel = channel
  }

  private async accessToken(): Promise<string> {
    const session = (await this.client?.auth.getSession())?.data.session
    if (!session) throw new SyncFailure('auth')
    return session.access_token
  }

  private async keepSession(session: Session | null): Promise<void> {
    if (!this.secrets || !session?.refresh_token || session.refresh_token === this.secrets.refreshToken) return
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
      generation: null, epoch: null, roster: null, refreshToken: null, userId: null, accounts: {},
    }
  }

  private deviceSecret(): DeviceSecret {
    const secrets = this.requireSecrets()
    return { signSk: secrets.signSk, boxSk: secrets.boxSk }
  }

  private requireRemote(): SyncRemote {
    if (!this.remote) throw new SyncFailure('auth')
    return this.remote
  }

  private requireSecrets(): VaultSecrets {
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
    return this.deps.storage.call<T>('sync', argument)
  }

  private armPhrase(): void {
    if (this.phraseTimer) clearTimeout(this.phraseTimer)
    this.phraseTimer = setTimeout(() => {
      const purpose = this.phrase?.purpose
      this.dropPhrase()
      if (this.phase === 'confirm' || this.phase === 'choose') this.phase = purpose === 'setup' ? 'setup' : 'enter-key'
      this.publish()
    }, 10 * 60 * 1000)
    this.phraseTimer.unref()
  }

  private cancelPhrase(): void {
    const purpose = this.phrase?.purpose
    this.dropPhrase()
    if (this.phase === 'confirm' || this.phase === 'choose' || this.phase === 'enter-key') this.phase = purpose === 'setup' ? 'setup' : 'enter-key'
    this.publish()
  }

  private dropPhrase(): void {
    this.phrase = null
    this.checks = null
    if (this.phraseTimer) clearTimeout(this.phraseTimer)
    this.phraseTimer = null
  }

  private setError(error: unknown): void {
    if (error instanceof SyncFailure) {
      if (error.message === 'port') this.error = 'port'
      else if (error.code === 'version') this.error = 'key'
      else if (error.code === 'storage') this.error = 'storage'
      else if (error.code === 'rejected' && error.message.includes('workspace')) this.error = 'mismatch'
      else if (error.code === 'rejected') this.error = 'key'
      else this.error = error.code
      this.offline = error.code === 'network'
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
      email: this.email,
      pending: ready ? this.view.pending : 0,
      conflicts: ready ? this.view.conflicts : 0,
      paused: this.view.paused,
      lastSyncedAt: this.lastSyncedAt,
      error: this.error,
      localItems: this.view.localItems,
      checks: this.phase === 'confirm' ? this.checks : null,
      offline: this.offline,
    }
  }

  private publish(): void {
    this.deps.notify(this.status())
  }
}
