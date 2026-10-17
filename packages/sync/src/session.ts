/**
 * [INPUT]: Device keys, a sync password, and a SyncRemote. The password exists only inside these calls.
 * [OUTPUT]: A bound workspace key, sealed pushes, and opened remote ops.
 * [POS]: Shared sync session. Desktop and mobile supply the remote and the SQL driver; neither UI lives here.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { isSecretFingerprint, isSecretSettingKey, syncOpPayload, type SyncOp } from '@goalloom/contracts'
import {
  hex, newRecovery, openRecoveryLock, passwordAccepted, publicFromSeed, rosterHash, sealRecoveryLock, sha256Hex, signCheckpoint,
  signRecoveryChallenge, signRoster, systemRandom, unhex, unwrap, utf8, verifyRecoveryJoin, verifyRosterExtension, wrap,
  type Envelope, type RandomSource, type RecoverySecrets, type RosterBody, type SyncKdfParams,
} from '@goalloom/crypto'
import { markAccepted, markSendUnknown, mergeRemoteOps, type ApplyHost, type RemoteEnvelope, type SqlDriver } from '@goalloom/store-core'
import { planPushBatches } from './push'
import { openOpWire, sealOpWire } from './codec'
import { SyncFailure } from './failure'
import { bindWorkspace, conflictCount, queueBaseline, syncCursor } from './board'
import { installJoined } from './join'
export { installJoined } from './join'
import type { EnvelopeWire, PullWire, PushResultWire, RosterWire, SyncRemote } from './remote'

export interface DeviceSecret { signSk: Uint8Array; boxSk: Uint8Array }

export function newDeviceSecret(random: RandomSource = systemRandom()): DeviceSecret {
  return { signSk: random.bytes(32), boxSk: random.bytes(32) }
}

function envelopesFor(input: {
  senderId: string; signSk: Uint8Array; workspaceKey: Uint8Array; workspaceId: string; epoch: number; rosterVersion: number
  targets: { id: string; boxPub: string }[]; random: RandomSource
}): EnvelopeWire[] {
  return input.targets.map(target => {
    const envelope = wrap({
      senderId: input.senderId, signSk: input.signSk, recipientId: target.id, recipientBoxPub: unhex(target.boxPub),
      ctx: `wk|${input.workspaceId}|${input.epoch}`, plaintext: input.workspaceKey, random: input.random,
    })
    return {
      epoch: input.epoch, recipient: target.id, ciphertext: hex(new TextEncoder().encode(JSON.stringify(envelope))),
      signature: envelope.sig, rosterVersion: input.rosterVersion, signerDevice: input.senderId,
    }
  })
}

function readEnvelope(wire: EnvelopeWire): { envelope: ReturnType<typeof wrap>; epoch: number } {
  const envelope = JSON.parse(new TextDecoder().decode(unhex(wire.ciphertext)))
  return { envelope, epoch: wire.epoch }
}

interface RecoveryBody { v: 2; kdf: SyncKdfParams; lock: string; wrap: Envelope }

function readRecovery(wire: EnvelopeWire): RecoveryBody {
  const parsed = JSON.parse(new TextDecoder().decode(unhex(wire.ciphertext))) as Partial<RecoveryBody>
  if (parsed.v !== 2 || !parsed.kdf || !parsed.lock || !parsed.wrap) throw new SyncFailure('key')
  return parsed as RecoveryBody
}

async function recoveryWire(input: {
  senderId: string; signSk: Uint8Array; workspaceKey: Uint8Array; workspaceId: string; epoch: number; rosterVersion: number
  recovery: RecoverySecrets; password: string; random: RandomSource
}): Promise<EnvelopeWire> {
  const lock = await sealRecoveryLock({ password: input.password, workspaceId: input.workspaceId, secrets: input.recovery, random: input.random })
  const wrapped = wrap({
    senderId: input.senderId, signSk: input.signSk, recipientId: 'recovery', recipientBoxPub: input.recovery.boxPub,
    ctx: `wk|${input.workspaceId}|${input.epoch}`, plaintext: input.workspaceKey, random: input.random,
  })
  const body: RecoveryBody = { v: 2, kdf: lock.kdf, lock: lock.lock, wrap: wrapped }
  return {
    epoch: input.epoch, recipient: 'recovery', ciphertext: hex(utf8(JSON.stringify(body))),
    signature: wrapped.sig, rosterVersion: input.rosterVersion, signerDevice: input.senderId,
  }
}

export interface BoundWorkspace {
  workspaceId: string; generation: string; epoch: number; workspaceKey: Uint8Array; roster: RosterBody; recovery: RecoverySecrets
}

export async function createRemoteWorkspace(input: {
  remote: SyncRemote; deviceId: string; secret: DeviceSecret; password: string; generation: string; random?: RandomSource
  workspaceId?: string; workspaceKey?: Uint8Array; recovery?: RecoverySecrets; createNew?: boolean
}): Promise<BoundWorkspace> {
  if (!passwordAccepted(input.password)) throw new SyncFailure('password')
  if (Boolean(input.workspaceId) !== Boolean(input.workspaceKey)) throw new SyncFailure('storage', 'pending workspace')
  const random = input.random ?? systemRandom()
  const generation = input.generation
  if (!generation) throw new SyncFailure('storage', 'generation missing')
  const workspaceId = input.workspaceId ?? globalThis.crypto.randomUUID()
  const workspaceKey = input.workspaceKey ?? random.bytes(32)
  const signPub = hex(publicFromSeed('ed25519', input.secret.signSk))
  const boxPub = hex(publicFromSeed('x25519', input.secret.boxSk))
  const recovery = input.recovery ?? newRecovery(random)
  const roster: RosterBody = {
    workspaceId, version: 1, epoch: 1, prevHash: null,
    devices: [{ id: input.deviceId, signPub, boxPub }],
    recoverySignPub: hex(recovery.signPub), recoveryBoxPub: hex(recovery.boxPub),
  }
  const checkpoint = {
    workspaceId, cpVersion: 1, rosterVersion: 1, rosterHash: rosterHash(roster), epoch: 1,
    recoverySignPub: hex(recovery.signPub), recoveryBoxPub: hex(recovery.boxPub), prevCpHash: null,
  }
  const wires = [
    ...envelopesFor({
      senderId: input.deviceId, signSk: input.secret.signSk, workspaceKey, workspaceId, epoch: 1, rosterVersion: 1, random,
      targets: [{ id: input.deviceId, boxPub }],
    }),
    await recoveryWire({
      senderId: input.deviceId, signSk: input.secret.signSk, workspaceKey, workspaceId, epoch: 1, rosterVersion: 1, random,
      recovery, password: input.password,
    }),
  ]
  try {
    await input.remote.bootstrap({
      deviceId: input.deviceId, workspaceId, generation, roster, rosterHash: rosterHash(roster),
      rosterSig: signRoster(roster, input.secret.signSk), checkpoint,
      recSig: signCheckpoint(checkpoint, recovery.signSk), devSig: signCheckpoint(checkpoint, input.secret.signSk),
      ...(input.createNew ? { createNew: true } : {}),
    })
  } catch (error) {
    if (!input.workspaceId || !(error instanceof SyncFailure) || !error.message.includes('workspace')) throw error
    const account = await input.remote.account({ workspaceId })
    if (!account || account.workspaceId !== workspaceId) throw error
    const saved = await input.remote.getCheckpoint(workspaceId, input.deviceId)
    if (!saved || saved.body.recoverySignPub !== hex(recovery.signPub)) throw new SyncFailure('password')
  }
  await input.remote.putEnvelopes(workspaceId, input.deviceId, wires)
  return { workspaceId, generation, epoch: 1, workspaceKey, roster, recovery }
}

export async function bootstrapWorkspace(input: {
  remote: SyncRemote; driver: SqlDriver; host: ApplyHost; deviceId: string; secret: DeviceSecret; password: string; at: string
  random?: RandomSource
}): Promise<BoundWorkspace> {
  const generation = String(input.driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation ?? '')
  const bound = await createRemoteWorkspace({ ...input, generation })
  bindWorkspace(input.driver, { workspaceId: bound.workspaceId, deviceId: input.deviceId, keyEpoch: bound.epoch }, input.at)
  queueBaseline(input.driver, input.host, input.deviceId, input.at)
  return bound
}

export async function unlockWithPassword(input: {
  remote: SyncRemote; deviceId: string; secret: DeviceSecret; password: string; random?: RandomSource; workspaceId?: string
}): Promise<{ bound: BoundWorkspace; ops: RemoteEnvelope[] }> {
  if (!passwordAccepted(input.password)) throw new SyncFailure('password')
  const random = input.random ?? systemRandom()
  const account = await input.remote.account(input.workspaceId ? { workspaceId: input.workspaceId } : undefined)
  if (!account) throw new SyncFailure('mismatch')
  const checkpoint = await input.remote.getCheckpoint(account.workspaceId, input.deviceId)
  const chain = await input.remote.getRoster(account.workspaceId, input.deviceId)
  if (!checkpoint) throw new SyncFailure('key')
  const pinned = chain.find(link => link.version === checkpoint.body.rosterVersion)
  if (!pinned) throw new SyncFailure('key')
  const newer = chain.filter(link => link.version > pinned.version).sort((left, right) => left.version - right.version)
  const head = newer.at(-1)?.roster ?? pinned.roster
  const envelopes = await input.remote.getEnvelopes(account.workspaceId, input.deviceId)
  const recoveryWrap = envelopes.find(item => item.recipient === 'recovery' && item.epoch === head.epoch)
  if (!recoveryWrap) throw new SyncFailure('key')
  const body = readRecovery(recoveryWrap)
  let recovery: RecoverySecrets
  try {
    recovery = await openRecoveryLock({ password: input.password, workspaceId: account.workspaceId, lock: { kdf: body.kdf, lock: body.lock } })
  } catch (error) {
    if (error instanceof SyncFailure) throw error
    throw new SyncFailure('password')
  }
  try {
    verifyRecoveryJoin({
      secrets: recovery, workspaceId: account.workspaceId, checkpoint: checkpoint.body,
      recSig: unhex(checkpoint.recSig), devSig: unhex(checkpoint.devSig), roster: pinned.roster,
      newer: newer.map(link => ({
        body: link.roster, signature: unhex(link.signature), signerId: link.signerType === 'recovery' ? 'recovery' : (link.signerDevice ?? ''),
      })),
    })
  } catch (error) {
    if (error instanceof SyncFailure) throw error
    const message = error instanceof Error ? error.message : ''
    throw new SyncFailure(message.includes('recovery') ? 'password' : 'key')
  }
  const sender = head.devices.find(device => device.id === body.wrap.senderId) ?? pinned.roster.devices.find(device => device.id === body.wrap.senderId)
  if (!sender) throw new SyncFailure('key')
  const workspaceKey = unwrap(body.wrap, {
    expectedCtx: `wk|${account.workspaceId}|${head.epoch}`, recipientId: 'recovery', boxSk: recovery.boxSk, senderSignPub: unhex(sender.signPub),
  })
  const challenge = await input.remote.startRecovery(account.workspaceId, input.deviceId)
  if (challenge.rosterHash !== rosterHash(head)) throw new SyncFailure('key')
  const signPub = hex(publicFromSeed('ed25519', input.secret.signSk))
  const boxPub = hex(publicFromSeed('x25519', input.secret.boxSk))
  const next: RosterBody = {
    ...head, version: head.version + 1, prevHash: rosterHash(head),
    devices: [...head.devices.filter(device => device.id !== input.deviceId), { id: input.deviceId, signPub, boxPub }],
  }
  await input.remote.completeRecovery({
    workspaceId: account.workspaceId, deviceId: input.deviceId, challengeId: challenge.challengeId,
    signature: signRecoveryChallenge({ workspaceId: account.workspaceId, deviceId: input.deviceId, nonceHex: challenge.nonce, rosterHash: challenge.rosterHash, signSk: recovery.signSk }),
    roster: next, bodyHash: rosterHash(next), rosterSig: signRoster(next, recovery.signSk),
  })
  await input.remote.putEnvelopes(account.workspaceId, input.deviceId, envelopesFor({
    senderId: input.deviceId, signSk: input.secret.signSk, workspaceKey, workspaceId: account.workspaceId, epoch: head.epoch,
    rosterVersion: next.version, random, targets: [{ id: input.deviceId, boxPub }],
  }))
  const ops = await downloadWorkspace({ remote: input.remote, deviceId: input.deviceId, workspaceId: account.workspaceId, workspaceKey })
  return { bound: { workspaceId: account.workspaceId, generation: account.generation, epoch: head.epoch, workspaceKey, roster: next, recovery }, ops }
}

/** Re-seals the recovery keypair. An unlocked device already holds that keypair and does not need the old password. */
export async function changeSyncPassword(input: {
  remote: SyncRemote; deviceId: string; workspaceId: string; recovery: RecoverySecrets; password: string; random?: RandomSource
}): Promise<void> {
  if (!passwordAccepted(input.password)) throw new SyncFailure('password')
  const random = input.random ?? systemRandom()
  const checkpoint = await input.remote.getCheckpoint(input.workspaceId, input.deviceId)
  if (!checkpoint || checkpoint.body.recoveryBoxPub !== hex(input.recovery.boxPub) || checkpoint.body.recoverySignPub !== hex(input.recovery.signPub)) {
    throw new SyncFailure('key')
  }
  const envelopes = await input.remote.getEnvelopes(input.workspaceId, input.deviceId)
  const current = envelopes.find(item => item.recipient === 'recovery' && item.epoch === checkpoint.body.epoch)
  if (!current) throw new SyncFailure('key')
  const body = readRecovery(current)
  const lock = await sealRecoveryLock({ password: input.password, workspaceId: input.workspaceId, secrets: input.recovery, random })
  const next: RecoveryBody = { v: 2, kdf: lock.kdf, lock: lock.lock, wrap: body.wrap }
  await input.remote.putEnvelopes(input.workspaceId, input.deviceId, [{
    epoch: current.epoch, recipient: 'recovery', ciphertext: hex(utf8(JSON.stringify(next))),
    signature: body.wrap.sig, rosterVersion: current.rosterVersion, signerDevice: input.deviceId,
  }])
}

export async function downloadWorkspace(input: {
  remote: SyncRemote; deviceId: string; workspaceId: string; workspaceKey: Uint8Array
}): Promise<RemoteEnvelope[]> {
  return pullOpened({ ...input, after: 0 })
}

export async function pullOpened(input: {
  remote: SyncRemote; deviceId: string; workspaceId: string; workspaceKey: Uint8Array; after: number
}): Promise<RemoteEnvelope[]> {
  const pulled = await pullAll(input.remote, input.workspaceId, input.deviceId, input.after)
  return pulled.map(row => ({ seq: row.seq, op: openOpWire(row, { workspaceKey: input.workspaceKey, workspaceId: input.workspaceId }) }))
}

export function workspaceKeyFromEnvelope(input: {
  wire: EnvelopeWire; roster: RosterBody; earlier?: RosterBody; workspaceId: string; recipientId: string; boxSk: Uint8Array
}): Uint8Array {
  const opened = readEnvelope(input.wire)
  const sender = input.roster.devices.find(device => device.id === opened.envelope.senderId)
    ?? input.earlier?.devices.find(device => device.id === opened.envelope.senderId)
  if (!sender) throw new SyncFailure('key')
  return unwrap(opened.envelope, {
    expectedCtx: `wk|${input.workspaceId}|${opened.epoch}`, recipientId: input.recipientId, boxSk: input.boxSk, senderSignPub: unhex(sender.signPub),
  })
}

/** Installs a recovered log. `merge` keeps unknown local item identities after the remote log is applied. */
export async function joinWorkspace(input: {
  remote: SyncRemote; driver: SqlDriver; host: ApplyHost; deviceId: string; secret: DeviceSecret; password: string
  choice: 'use-remote' | 'merge'; at: string; random?: RandomSource
}): Promise<BoundWorkspace> {
  const { bound, ops } = await unlockWithPassword(input)
  installJoined(input.driver, input.host, {
    binding: { workspaceId: bound.workspaceId, deviceId: input.deviceId, keyEpoch: bound.epoch },
    ops, at: input.at, merge: input.choice === 'merge',
  })
  return bound
}

export function acceptRosterAdvance(pinned: RosterBody, chain: RosterWire[], deviceId: string): RosterBody {
  const ordered = [...chain].sort((left, right) => left.version - right.version)
  const current = ordered.find(link => link.version === pinned.version)
  if (!current || rosterHash(current.roster) !== rosterHash(pinned)) throw new SyncFailure('key', 'roster fork')
  let previous = pinned
  for (const link of ordered) {
    if (link.version <= pinned.version) continue
    if (link.version !== previous.version + 1) throw new SyncFailure('key', 'roster gap')
    verifyRosterExtension(previous, {
      body: link.roster, signature: unhex(link.signature),
      signerId: link.signerType === 'recovery' ? 'recovery' : (link.signerDevice ?? ''),
    })
    previous = link.roster
  }
  if (!previous.devices.some(device => device.id === deviceId)) throw new SyncFailure('auth')
  return previous
}

export interface PendingPlain { opId: string; localOrder: number; payload: string; payloadHash: string }

export function takePending(driver: SqlDriver, at: string, attemptId: string): PendingPlain[] {
  const rows = driver.prepare(`SELECT opId, localOrder, payload, payloadHash, state FROM sync_ops
    WHERE origin='local' AND state IN ('never_sent','send_unknown') ORDER BY localOrder`).all()
  const fresh = rows.filter(row => String(row.state) === 'never_sent').map(row => String(row.opId))
  if (fresh.length) markSendUnknown(driver, fresh, attemptId, at)
  return rows.map(row => ({ opId: String(row.opId), localOrder: Number(row.localOrder), payload: String(row.payload), payloadHash: String(row.payloadHash) }))
}

export function peekPending(driver: SqlDriver, unknownOnly = false): PendingPlain[] {
  return driver.prepare(`SELECT opId, localOrder, payload, payloadHash FROM sync_ops
    WHERE origin='local' AND state IN (${unknownOnly ? "'send_unknown'" : "'never_sent','send_unknown'"}) ORDER BY localOrder LIMIT 200`).all()
    .map(row => ({ opId: String(row.opId), localOrder: Number(row.localOrder), payload: String(row.payload), payloadHash: String(row.payloadHash) }))
}

export function markPending(driver: SqlDriver, ids: string[], at: string, attemptId: string): void {
  markSendUnknown(driver, ids, attemptId, at)
}

export type SecretLookup = (key: string) => string | null | undefined

/**
 * Puts keychain keys back into pending pref.set ops. `undefined` means the cipher cannot be read, and the queue stops
 * before that op so a fingerprint is never sealed as if it were the key. `null` means the key is gone.
 */
export function restorePendingSecrets(rows: PendingPlain[], lookup: SecretLookup): { rows: PendingPlain[]; blocked: boolean } {
  const ready: PendingPlain[] = []
  for (const row of rows) {
    const restored = restoreRow(row, lookup)
    if (!restored) return { rows: ready, blocked: true }
    ready.push(restored)
  }
  return { rows: ready, blocked: false }
}

function restoreRow(row: PendingPlain, lookup: SecretLookup): PendingPlain | null {
  const op = JSON.parse(row.payload) as SyncOp
  let changed = false
  const actions = op.actions.map(action => {
    if (action.t !== 'pref.set' || !isSecretSettingKey(action.key) || !isSecretFingerprint(action.value)) return action
    const secret = lookup(action.key)
    if (secret === undefined) return null
    changed = true
    return { ...action, value: secret }
  })
  if (actions.some(action => action === null)) return null
  if (!changed) return row
  const payload = syncOpPayload({ ...op, actions: actions as SyncOp['actions'] })
  return { ...row, payload, payloadHash: sha256Hex(payload) }
}

export function sealPending(rows: PendingPlain[], input: { workspaceKey: Uint8Array; workspaceId: string; epoch: number; random?: RandomSource }): { opId: string; localOrder: number; wire: ReturnType<typeof sealOpWire> }[] {
  return rows.map(row => {
    const op = JSON.parse(row.payload) as SyncOp
    return { opId: row.opId, localOrder: row.localOrder, wire: sealOpWire({ op, workspaceKey: input.workspaceKey, workspaceId: input.workspaceId, epoch: input.epoch, ...(input.random ? { random: input.random } : {}) }) }
  })
}

/** Marks accepted ops. A per-op rejection stays pending and is returned so the caller can still pull. */
export function acceptPushResults(driver: SqlDriver, pending: PendingPlain[], results: PushResultWire[], at: string): string | null {
  let held: string | null = null
  for (const result of results) {
    const local = pending.find(row => row.opId === result.opId)
    if (!local) throw new SyncFailure('storage', 'unknown receipt')
    if (result.error) { held = held ?? result.error; continue }
    if (result.seq === undefined) throw new SyncFailure('rejected')
    markAccepted(driver, result.opId, result.seq, at)
    if (result.seq > Number(driver.prepare('SELECT lastUploadedSeq AS seq FROM sync_state WHERE id=1').get()?.seq ?? 0)) {
      driver.prepare('UPDATE sync_state SET lastUploadedSeq=?, updatedAt=? WHERE id=1').run(result.seq, at)
    }
  }
  return held
}

export function absorbPulled(driver: SqlDriver, host: ApplyHost, rows: PullWire[], input: { workspaceKey: Uint8Array; workspaceId: string; at: string }): number {
  const cursor = syncCursor(driver)
  const fresh = rows.filter(row => row.seq > cursor).sort((left, right) => left.seq - right.seq)
  if (!fresh.length) return 0
  return absorbOpened(driver, host, fresh.map(row => ({ seq: row.seq, op: openOpWire(row, input) })), input.at)
}

export function absorbOpened(driver: SqlDriver, host: ApplyHost, batch: RemoteEnvelope[], at: string): number {
  const cursor = syncCursor(driver)
  const fresh = batch.filter(row => row.seq > cursor).sort((left, right) => left.seq - right.seq)
  if (!fresh.length) return 0
  mergeRemoteOps(driver, fresh, host, at)
  return fresh.length
}

async function pullAll(remote: SyncRemote, workspaceId: string, deviceId: string, after: number): Promise<PullWire[]> {
  const rows: PullWire[] = []
  let cursor = after
  for (;;) {
    const page = await remote.pullOps({ workspaceId, deviceId, after: cursor, limit: 200 })
    rows.push(...page)
    if (page.length < 200) return rows
    cursor = page[page.length - 1]!.seq
  }
}

export async function exchange(input: {
  remote: SyncRemote; driver: SqlDriver; host: ApplyHost; deviceId: string; workspaceId: string; generation: string
  epoch: number; workspaceKey: Uint8Array; at: string; random?: RandomSource
  secrets?: SecretLookup
}): Promise<{ pushed: number; pulled: number; conflicts: number }> {
  const pulledRows = await pullAll(input.remote, input.workspaceId, input.deviceId, syncCursor(input.driver))
  const pulled = absorbPulled(input.driver, input.host, pulledRows, input)
  const pending = restorePendingSecrets(peekPending(input.driver), input.secrets ?? (() => undefined)).rows
  const sealed = sealPending(pending, input)
  const ids = planPushBatches(sealed.map(row => ({ opId: row.opId, localOrder: row.localOrder, bytes: row.wire.ciphertext.length / 2, blobReady: true })))[0] ?? []
  let pushed = 0
  let held: string | null = null
  if (ids.length) {
    markPending(input.driver, ids, input.at, globalThis.crypto.randomUUID())
    const results = await input.remote.pushOps({ workspaceId: input.workspaceId, deviceId: input.deviceId, generation: input.generation, ops: ids.map(opId => sealed.find(row => row.opId === opId)!.wire) })
    held = acceptPushResults(input.driver, pending, results, input.at)
    pushed = results.length
  }
  if (held === 'stale_epoch') throw new SyncFailure('key', held)
  if (held) throw new SyncFailure('rejected', held)
  const own = await pullAll(input.remote, input.workspaceId, input.deviceId, syncCursor(input.driver))
  return { pushed, pulled: pulled + absorbPulled(input.driver, input.host, own, input), conflicts: conflictCount(input.driver) }
}

export function rebindMessage(deviceId: string): Uint8Array {
  return new TextEncoder().encode(`goalloom/rebind/v1|${deviceId}`)
}
