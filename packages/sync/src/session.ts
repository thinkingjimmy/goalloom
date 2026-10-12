/**
 * [INPUT]: Device keys, a recovery phrase, and a SyncRemote. Phrase-derived keys exist only inside these calls.
 * [OUTPUT]: A bound workspace key, sealed pushes, and opened remote ops.
 * [POS]: Shared sync session. Desktop and mobile supply the remote and the SQL driver; neither UI lives here.
 */
import type { SyncOp } from '@goalloom/contracts'
import {
  deriveRecovery, hex, publicFromSeed, recoveryPhraseAccepted, rosterHash, signCheckpoint, signRecoveryChallenge, signRoster,
  systemRandom, unhex, unwrap, verifyRecoveryJoin, verifyRosterExtension, wipeRecovery, wrap, type RandomSource, type RosterBody,
} from '@goalloom/crypto'
import { applyRemoteBatch, markAccepted, markSendUnknown, mergeRemoteOps, type ApplyHost, type RemoteEnvelope, type SqlDriver } from '@goalloom/store-core'
import { planPushBatches } from './push'
import { openOpWire, sealOpWire } from './codec'
import { SyncFailure } from './failure'
import { bindWorkspace, captureVisibleBoard, clearProjection, conflictCount, queueBaseline, stageImportedBoard, syncCursor } from './board'
import type { EnvelopeWire, PullWire, PushResultWire, RosterWire, SyncRemote } from './remote'

export interface DeviceSecret { signSk: Uint8Array; boxSk: Uint8Array }

export function newDeviceSecret(random: RandomSource = systemRandom()): DeviceSecret {
  return { signSk: random.bytes(32), boxSk: random.bytes(32) }
}

function normalize(mnemonic: string): string {
  return mnemonic.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
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

export interface BoundWorkspace { workspaceId: string; generation: string; epoch: number; workspaceKey: Uint8Array; roster: RosterBody }

export async function createRemoteWorkspace(input: {
  remote: SyncRemote; deviceId: string; secret: DeviceSecret; mnemonic: string; generation: string; random?: RandomSource
}): Promise<BoundWorkspace> {
  const phrase = normalize(input.mnemonic)
  if (!recoveryPhraseAccepted(phrase)) throw new SyncFailure('phrase')
  const random = input.random ?? systemRandom()
  const generation = input.generation
  if (!generation) throw new SyncFailure('storage', 'generation missing')
  const workspaceId = globalThis.crypto.randomUUID()
  const signPub = hex(publicFromSeed('ed25519', input.secret.signSk))
  const boxPub = hex(publicFromSeed('x25519', input.secret.boxSk))
  const recovery = deriveRecovery(phrase, workspaceId)
  const workspaceKey = random.bytes(32)
  try {
    const roster: RosterBody = {
      workspaceId, version: 1, epoch: 1, prevHash: null,
      devices: [{ id: input.deviceId, signPub, boxPub }],
      recoverySignPub: hex(recovery.signPub), recoveryBoxPub: hex(recovery.boxPub),
    }
    const checkpoint = {
      workspaceId, cpVersion: 1, rosterVersion: 1, rosterHash: rosterHash(roster), epoch: 1,
      recoverySignPub: hex(recovery.signPub), recoveryBoxPub: hex(recovery.boxPub), prevCpHash: null,
    }
    const wires = envelopesFor({
      senderId: input.deviceId, signSk: input.secret.signSk, workspaceKey, workspaceId, epoch: 1, rosterVersion: 1, random,
      targets: [{ id: input.deviceId, boxPub }, { id: 'recovery', boxPub: hex(recovery.boxPub) }],
    })
    await input.remote.bootstrap({
      deviceId: input.deviceId, workspaceId, generation, roster, rosterHash: rosterHash(roster),
      rosterSig: signRoster(roster, input.secret.signSk), checkpoint,
      recSig: signCheckpoint(checkpoint, recovery.signSk), devSig: signCheckpoint(checkpoint, input.secret.signSk),
    })
    await input.remote.putEnvelopes(workspaceId, input.deviceId, wires)
    return { workspaceId, generation, epoch: 1, workspaceKey, roster }
  } finally {
    wipeRecovery(recovery)
  }
}

export async function bootstrapWorkspace(input: {
  remote: SyncRemote; driver: SqlDriver; host: ApplyHost; deviceId: string; secret: DeviceSecret; mnemonic: string; at: string
  random?: RandomSource
}): Promise<BoundWorkspace> {
  const generation = String(input.driver.prepare('SELECT generation FROM workspace WHERE id=1').get()?.generation ?? '')
  const bound = await createRemoteWorkspace({ ...input, generation })
  bindWorkspace(input.driver, { workspaceId: bound.workspaceId, deviceId: input.deviceId, keyEpoch: bound.epoch }, input.at)
  queueBaseline(input.driver, input.host, input.deviceId, input.at)
  return bound
}

export async function unlockWithPhrase(input: {
  remote: SyncRemote; deviceId: string; secret: DeviceSecret; mnemonic: string; random?: RandomSource
}): Promise<{ bound: BoundWorkspace; ops: RemoteEnvelope[] }> {
  const phrase = normalize(input.mnemonic)
  if (!recoveryPhraseAccepted(phrase)) throw new SyncFailure('phrase')
  const random = input.random ?? systemRandom()
  const account = await input.remote.account()
  if (!account) throw new SyncFailure('mismatch')
  const checkpoint = await input.remote.getCheckpoint(account.workspaceId, input.deviceId)
  const chain = await input.remote.getRoster(account.workspaceId, input.deviceId)
  if (!checkpoint) throw new SyncFailure('key')
  const pinned = chain.find(link => link.version === checkpoint.body.rosterVersion)
  if (!pinned) throw new SyncFailure('key')
  const newer = chain.filter(link => link.version > pinned.version).sort((left, right) => left.version - right.version)
  const recovery = deriveRecovery(phrase, account.workspaceId)
  try {
    try {
      verifyRecoveryJoin({
        mnemonic: phrase, workspaceId: account.workspaceId, checkpoint: checkpoint.body,
        recSig: unhex(checkpoint.recSig), devSig: unhex(checkpoint.devSig), roster: pinned.roster,
        newer: newer.map(link => ({
          body: link.roster, signature: unhex(link.signature), signerId: link.signerType === 'recovery' ? 'recovery' : (link.signerDevice ?? ''),
        })),
      })
    } catch (error) {
      if (error instanceof SyncFailure) throw error
      const message = error instanceof Error ? error.message : ''
      throw new SyncFailure(message.includes('recovery') ? 'phrase' : 'key')
    }
    const head = newer.at(-1)?.roster ?? pinned.roster
    const envelopes = await input.remote.getEnvelopes(account.workspaceId, input.deviceId)
    const recoveryWrap = envelopes.find(item => item.recipient === 'recovery' && item.epoch === head.epoch)
    if (!recoveryWrap) throw new SyncFailure('key')
    const workspaceKey = workspaceKeyFromEnvelope({
      wire: recoveryWrap, roster: head, earlier: pinned.roster, workspaceId: account.workspaceId, recipientId: 'recovery', boxSk: recovery.boxSk,
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
    return { bound: { workspaceId: account.workspaceId, generation: account.generation, epoch: head.epoch, workspaceKey, roster: next }, ops }
  } finally { wipeRecovery(recovery) }
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

/** Installs a recovered log. `merge` keeps the local board as new items after the remote log is applied. */
export async function joinWorkspace(input: {
  remote: SyncRemote; driver: SqlDriver; host: ApplyHost; deviceId: string; secret: DeviceSecret; mnemonic: string
  choice: 'use-remote' | 'merge'; at: string; random?: RandomSource
}): Promise<BoundWorkspace> {
  const captured = input.choice === 'merge' ? captureVisibleBoard(input.driver) : null
  const { bound, ops } = await unlockWithPhrase(input)
  input.driver.transaction(() => {
    clearProjection(input.driver, { workspaceId: bound.workspaceId, deviceId: input.deviceId, keyEpoch: bound.epoch }, input.at)
    applyRemoteBatch(input.driver, ops, input.host, input.at)
  })
  if (captured) stageImportedBoard(input.driver, input.host, captured, input.deviceId, input.at)
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

export function sealPending(rows: PendingPlain[], input: { workspaceKey: Uint8Array; workspaceId: string; epoch: number; random?: RandomSource }): { opId: string; localOrder: number; wire: ReturnType<typeof sealOpWire> }[] {
  return rows.map(row => {
    const op = JSON.parse(row.payload) as SyncOp
    return { opId: row.opId, localOrder: row.localOrder, wire: sealOpWire({ op, workspaceKey: input.workspaceKey, workspaceId: input.workspaceId, epoch: input.epoch, ...(input.random ? { random: input.random } : {}) }) }
  })
}

export function acceptPushResults(driver: SqlDriver, pending: PendingPlain[], results: PushResultWire[], at: string): void {
  for (const result of results) {
    const local = pending.find(row => row.opId === result.opId)
    if (!local) throw new SyncFailure('storage', 'unknown receipt')
    if (result.error) throw new SyncFailure(result.error === 'stale_epoch' ? 'key' : 'rejected', result.error)
    if (result.seq === undefined) throw new SyncFailure('rejected')
    markAccepted(driver, result.opId, result.seq, at)
    if (result.seq > Number(driver.prepare('SELECT lastUploadedSeq AS seq FROM sync_state WHERE id=1').get()?.seq ?? 0)) {
      driver.prepare('UPDATE sync_state SET lastUploadedSeq=?, updatedAt=? WHERE id=1').run(result.seq, at)
    }
  }
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
}): Promise<{ pushed: number; pulled: number; conflicts: number }> {
  const pending = takePending(input.driver, input.at, globalThis.crypto.randomUUID())
  const sealed = sealPending(pending, input)
  const batches = planPushBatches(sealed.map(row => ({ opId: row.opId, localOrder: row.localOrder, bytes: row.wire.ciphertext.length / 2, blobReady: true })))
  let pushed = 0
  for (const ids of batches) {
    const wires = ids.map(opId => sealed.find(row => row.opId === opId)!.wire)
    const results = await input.remote.pushOps({ workspaceId: input.workspaceId, deviceId: input.deviceId, generation: input.generation, ops: wires })
    acceptPushResults(input.driver, pending, results, input.at)
    pushed += results.length
  }
  const pulledRows = await pullAll(input.remote, input.workspaceId, input.deviceId, syncCursor(input.driver))
  const pulled = absorbPulled(input.driver, input.host, pulledRows, input)
  return { pushed, pulled, conflicts: conflictCount(input.driver) }
}

export function rebindMessage(deviceId: string): Uint8Array {
  return new TextEncoder().encode(`goalloom/rebind/v1|${deviceId}`)
}
