/**
 * [INPUT]: Two sessions that share one user. No sockets and no clock beyond the caller.
 * [OUTPUT]: A SyncRemote that assigns seq, rejects a bad roster signature, and keeps ciphertext opaque.
 * [POS]: The simulated second computer for convergence tests.
 */
import { canonicalJson, type InitializationReceipt } from '@goalloom/contracts'
import { hex, rosterHash, unhex, verifyDetached, verifyRosterSignature } from '@goalloom/crypto'
import type { RequestOptions } from './request'
import { SyncFailure } from './failure'
import { maxOpCiphertextBytes } from './push'
import type { AccountView, CheckpointWire, EnvelopeWire, PullWire, PushResultWire, PushWire, RecoveryChallenge, RosterWire, SyncRemote } from './remote'

interface DeviceRow { id: string; sessionId: string; signPub: Uint8Array; boxPub: Uint8Array; status: 'registered' | 'authorized' | 'revoked' }
interface ChallengeRow { id: string; deviceId: string; nonce: string; rosterVersion: number; rosterHash: string; consumed: boolean }
interface WorkspaceRow {
  id: string
  generation: string
  keyEpoch: number
  headSeq: number
  rosterVersion: number
  rosters: RosterWire[]
  envelopes: EnvelopeWire[]
  ops: PullWire[]
  receipts: Map<string, { hash: string; seq: number }>
  checkpoint: CheckpointWire | null
  initialization?: { requestId: string; creatorDeviceId: string; finalOpId: string; finalSeq: number | null; finalPayloadHash: string | null; receipt: InitializationReceipt | null }
  challenges: ChallengeRow[]
}

export interface MemoryWorld {
  online: boolean
  devices: Map<string, DeviceRow>
  workspace: WorkspaceRow | null
  workspaces: Map<string, WorkspaceRow>
}

export function createMemoryWorld(): MemoryWorld {
  return { online: true, devices: new Map(), workspace: null, workspaces: new Map() }
}

function failIfOffline(world: MemoryWorld): void {
  if (!world.online) throw new SyncFailure('network')
}

function device(world: MemoryWorld, sessionId: string, deviceId: string, allowPending: boolean): DeviceRow {
  const row = world.devices.get(deviceId)
  if (!row || row.sessionId !== sessionId || row.status === 'revoked') throw new SyncFailure('auth')
  if (!allowPending && row.status !== 'authorized') throw new SyncFailure('auth')
  return row
}

function workspaceFor(world: MemoryWorld, id?: string): WorkspaceRow {
  const workspace = id ? world.workspaces.get(id) ?? (world.workspace?.id === id ? world.workspace : null) : world.workspace
  if (!workspace) throw new SyncFailure('mismatch')
  return workspace
}

export function memoryRemote(world: MemoryWorld, sessionId: string): SyncRemote {
  const remote: SyncRemote = {
    async registerDevice(input) {
      failIfOffline(world)
      const id = globalThis.crypto.randomUUID()
      world.devices.set(id, { id, sessionId, signPub: input.signPub.slice(), boxPub: input.boxPub.slice(), status: 'registered' })
      return id
    },
    async rebindDevice(deviceId, message, signature) {
      failIfOffline(world)
      const row = world.devices.get(deviceId)
      if (!row || row.status === 'revoked' || !verifyDetached(message, signature, row.signPub)) throw new SyncFailure('auth')
      row.sessionId = sessionId
    },
    async account(options): Promise<AccountView | null> {
      failIfOffline(world)
      const workspace = options?.workspaceId ? world.workspaces.get(options.workspaceId) ?? (world.workspace?.id === options.workspaceId ? world.workspace : null) : world.workspace
      if (!workspace) return null
      return { workspaceId: workspace.id, generation: workspace.generation, keyEpoch: workspace.keyEpoch, headSeq: workspace.headSeq, rosterVersion: workspace.rosterVersion }
    },
    async getSyncStatus(workspaceId, deviceId, options) {
      options?.signal?.throwIfAborted()
      failIfOffline(world); device(world, sessionId, deviceId, false)
      const workspace = workspaceFor(world, workspaceId)
      if (workspace.initialization && !workspace.initialization.receipt && workspace.initialization.creatorDeviceId !== deviceId) throw new SyncFailure('initialization_pending')
      if (workspace.id !== workspaceId) throw new SyncFailure('mismatch')
      return { workspaceId, generation: workspace.generation, keyEpoch: workspace.keyEpoch, headSeq: workspace.headSeq,
        rosterVersion: workspace.rosterVersion, minRetainedSeq: 0, minProtocolRead: 1, minProtocolWrite: 1 }
    },
    async receiptsFor(workspaceId, deviceId, operations, options) {
      options?.signal?.throwIfAborted()
      await remote.getSyncStatus(workspaceId, deviceId, options)
      if (operations.length > 200) throw new SyncFailure('rejected')
      return operations.flatMap(({ opId, payloadHash }) => {
        const row = workspaceFor(world, workspaceId).receipts.get(opId)
        return row && row.hash === payloadHash ? [{ opId, payloadHash: row.hash, seq: row.seq }] : []
      })
    },
    async finishInitialization(input) {
      failIfOffline(world); device(world, sessionId, input.creatorDeviceId, false)
      const workspace = workspaceFor(world, input.target.workspaceId), init = workspace.initialization
      if (!init || workspace.generation !== input.target.generation || init.requestId !== input.requestId || init.creatorDeviceId !== input.creatorDeviceId || init.finalOpId !== input.finalOpId || init.finalSeq !== input.finalSeq || init.finalPayloadHash !== input.finalPayloadHash) throw new SyncFailure('initialization_conflict')
      if (init.receipt) return { ...init.receipt, serverNow: new Date().toISOString().replace('Z', '000Z') }
      if (workspace.headSeq !== input.finalSeq) throw new SyncFailure('initialization_conflict')
      const now = new Date().toISOString().replace('Z', '000Z')
      return init.receipt = { ok: true, version: 1, serverNow: now, requestId: input.requestId, target: input.target, finalOpId: input.finalOpId, finalPayloadHash: input.finalPayloadHash, finalSeq: input.finalSeq, completedAt: now, initialization: 'complete', lifecycleVersion: 2, lifecycleState: 'active' }
    },
    async resetSync(deviceId, options) {
      failIfOffline(world)
      device(world, sessionId, deviceId, true)
      if (options?.workspaceId) {
        world.workspaces.delete(options.workspaceId)
        if (world.workspace?.id === options.workspaceId) world.workspace = [...world.workspaces.values()].at(-1) ?? null
      } else { world.workspace = null; world.workspaces.clear() }
    },
    async bootstrap(input) {
      failIfOffline(world)
      device(world, sessionId, input.deviceId, true)
      const prior = world.workspaces.get(input.workspaceId)
      if (prior?.initialization && input.initialization && prior.generation === input.generation && prior.initialization.requestId === input.initialization.requestId && prior.initialization.creatorDeviceId === input.deviceId && prior.initialization.finalOpId === input.initialization.finalOpId && canonicalJson(prior.envelopes) === canonicalJson(input.initialization.envelopes)) return
      if ([...world.workspaces.values()].some(row => row.initialization && !row.initialization.receipt)) throw new SyncFailure('initialization_pending')
      if (world.workspaces.has(input.workspaceId) || world.workspace && !input.createNew) throw new SyncFailure('rejected', 'workspace exists')
      const row = world.devices.get(input.deviceId)!
      if (!verifyRosterSignature(input.roster, input.rosterSig, row.signPub)) throw new SyncFailure('rejected', 'roster signature rejected')
      if (rosterHash(input.roster) !== input.rosterHash) throw new SyncFailure('rejected', 'roster hash')
      row.status = 'authorized'
      world.workspace = {
        id: input.workspaceId, generation: input.generation, keyEpoch: 1, headSeq: 0, rosterVersion: 1,
        rosters: [{ version: 1, roster: input.roster, bodyHash: input.rosterHash, signature: hex(input.rosterSig), signerType: 'device', signerDevice: input.deviceId }],
        ...(input.initialization ? { initialization: { requestId: input.initialization.requestId, finalOpId: input.initialization.finalOpId, creatorDeviceId: input.deviceId, finalSeq: null, finalPayloadHash: null, receipt: null } } : {}),
        envelopes: structuredClone(input.initialization?.envelopes ?? []), ops: [], receipts: new Map(), challenges: [],
        checkpoint: { cpVersion: 1, body: input.checkpoint, recSig: hex(input.recSig), devSig: hex(input.devSig) },
      }
      world.workspaces.set(input.workspaceId, world.workspace)
    },
    async putEnvelopes(workspaceId, deviceId, envelopes) {
      failIfOffline(world)
      device(world, sessionId, deviceId, false)
      const workspace = workspaceFor(world, workspaceId)
      if (workspace.initialization && !workspace.initialization.receipt && workspace.initialization.creatorDeviceId !== deviceId) throw new SyncFailure('initialization_pending')
      if (workspace.id !== workspaceId) throw new SyncFailure('mismatch')
      if (workspace.initialization && !workspace.initialization.receipt && canonicalJson(workspace.envelopes) !== canonicalJson(envelopes)) throw new SyncFailure('initialization_conflict')
      for (const envelope of envelopes) {
        if (unhex(envelope.ciphertext).length > 65536) throw new SyncFailure('rejected', 'payload_too_large')
        const index = workspace.envelopes.findIndex(item => item.epoch === envelope.epoch && item.recipient === envelope.recipient)
        const stored = { ...envelope, signerDevice: deviceId }
        if (index >= 0) workspace.envelopes[index] = stored
        else workspace.envelopes.push(stored)
      }
    },
    async getEnvelopes(workspaceId, deviceId) {
      failIfOffline(world)
      device(world, sessionId, deviceId, true)
      const workspace = workspaceFor(world, workspaceId)
      if (workspace.initialization && !workspace.initialization.receipt && workspace.initialization.creatorDeviceId !== deviceId) throw new SyncFailure('initialization_pending')
      if (workspace.id !== workspaceId) throw new SyncFailure('mismatch')
      return workspace.envelopes.map(item => ({ ...item }))
    },
    async getCheckpoint(workspaceId, deviceId): Promise<CheckpointWire | null> {
      failIfOffline(world)
      device(world, sessionId, deviceId, true)
      const workspace = workspaceFor(world, workspaceId)
      if (workspace.initialization && !workspace.initialization.receipt && workspace.initialization.creatorDeviceId !== deviceId) throw new SyncFailure('initialization_pending')
      if (workspace.id !== workspaceId) throw new SyncFailure('mismatch')
      return workspace.checkpoint
    },
    async getRoster(workspaceId, deviceId) {
      failIfOffline(world)
      device(world, sessionId, deviceId, true)
      const workspace = workspaceFor(world, workspaceId)
      if (workspace.initialization && !workspace.initialization.receipt && workspace.initialization.creatorDeviceId !== deviceId) throw new SyncFailure('initialization_pending')
      if (workspace.id !== workspaceId) throw new SyncFailure('mismatch')
      return workspace.rosters.map(item => ({ ...item, roster: structuredClone(item.roster) }))
    },
    async startRecovery(workspaceId, deviceId): Promise<RecoveryChallenge> {
      failIfOffline(world)
      device(world, sessionId, deviceId, true)
      const workspace = workspaceFor(world, workspaceId)
      if (workspace.initialization && !workspace.initialization.receipt && workspace.initialization.creatorDeviceId !== deviceId) throw new SyncFailure('initialization_pending')
      if (workspace.id !== workspaceId) throw new SyncFailure('mismatch')
      const head = workspace.rosters[workspace.rosters.length - 1]
      if (!head) throw new SyncFailure('rejected', 'no roster')
      const challenge = { id: globalThis.crypto.randomUUID(), deviceId, nonce: hex(crypto.getRandomValues(new Uint8Array(32))), rosterVersion: head.version, rosterHash: head.bodyHash, consumed: false }
      workspace.challenges.push(challenge)
      return { challengeId: challenge.id, nonce: challenge.nonce, rosterVersion: challenge.rosterVersion, rosterHash: challenge.rosterHash }
    },
    async completeRecovery(input) {
      failIfOffline(world)
      device(world, sessionId, input.deviceId, true)
      const workspace = workspaceFor(world, input.workspaceId)
      if (workspace.initialization && !workspace.initialization.receipt && workspace.initialization.creatorDeviceId !== input.deviceId) throw new SyncFailure('initialization_pending')
      if (workspace.id !== input.workspaceId) throw new SyncFailure('mismatch')
      const challenge = workspace.challenges.find(item => item.id === input.challengeId && item.deviceId === input.deviceId)
      const head = workspace.rosters[workspace.rosters.length - 1]
      if (!challenge || challenge.consumed || !head || challenge.rosterVersion !== head.version) throw new SyncFailure('rejected', 'challenge rejected')
      const message = new TextEncoder().encode(`goalloom/recover/v1|${input.workspaceId}|${input.deviceId}|${challenge.nonce}|${head.bodyHash}`)
      if (!verifyDetached(message, input.signature, unhex(head.roster.recoverySignPub))) throw new SyncFailure('rejected', 'recovery signature rejected')
      if (!verifyRosterSignature(input.roster, input.rosterSig, unhex(head.roster.recoverySignPub))) throw new SyncFailure('rejected', 'roster_signature_rejected')
      if (input.bodyHash !== rosterHash(input.roster) || input.roster.prevHash !== head.bodyHash || input.roster.version !== head.version + 1) throw new SyncFailure('rejected', 'roster cas failed')
      challenge.consumed = true
      workspace.rosters.push({ version: input.roster.version, roster: input.roster, bodyHash: input.bodyHash, signature: hex(input.rosterSig), signerType: 'recovery', signerDevice: null })
      workspace.rosterVersion = input.roster.version
      world.devices.get(input.deviceId)!.status = 'authorized'
    },
    async pushOps(input): Promise<PushResultWire[]> {
      failIfOffline(world)
      device(world, sessionId, input.deviceId, false)
      const workspace = workspaceFor(world, input.workspaceId)
      if (workspace.id !== input.workspaceId || workspace.generation !== input.generation) throw new SyncFailure('mismatch')
      if (input.ops.length > 200) throw new SyncFailure('rejected', 'batch limit')
      const init = workspace.initialization
      if (init && !init.receipt) {
        if (init.creatorDeviceId !== input.deviceId) throw new SyncFailure('initialization_pending')
        let final = init.finalSeq !== null
        for (const op of input.ops) {
          const prior = workspace.receipts.get(op.opId)
          if (prior) { if (prior.hash !== op.payloadHash) throw new SyncFailure('initialization_conflict'); continue }
          if (final || op.keyEpoch !== 1 || op.formatVersion !== 1 || !/^[a-f0-9]{64}$/.test(op.payloadHash) || op.ciphertext.length / 2 > maxOpCiphertextBytes) throw new SyncFailure('initialization_conflict')
          if (op.opId === init.finalOpId) final = true
        }
      }
      const results: PushResultWire[] = []
      let bytes = 0
      for (const op of input.ops) results.push(acceptOp(workspace, input.deviceId, op, () => { bytes += op.ciphertext.length / 2; return bytes }))
      if (init && !init.receipt) { const receipt = workspace.receipts.get(init.finalOpId); if (receipt) { init.finalSeq = receipt.seq; init.finalPayloadHash = receipt.hash } }
      return results
    },
    async pullOps(input): Promise<PullWire[]> {
      failIfOffline(world)
      device(world, sessionId, input.deviceId, false)
      const workspace = workspaceFor(world, input.workspaceId)
      if (workspace.initialization && !workspace.initialization.receipt && workspace.initialization.creatorDeviceId !== input.deviceId) throw new SyncFailure('initialization_pending')
      if (workspace.id !== input.workspaceId) throw new SyncFailure('mismatch')
      if (input.limit < 1 || input.limit > 200) throw new SyncFailure('rejected', 'bad limit')
      return workspace.ops.filter(row => row.seq > input.after).slice(0, input.limit).map(row => ({ ...row }))
    },
  }
  return new Proxy(remote, { get(target, key) {
    const method = Reflect.get(target, key)
    if (typeof method !== 'function') return method
    return (...args: unknown[]) => {
      const signal = (args.at(-1) as RequestOptions | undefined)?.signal
      if (signal?.aborted) return Promise.reject(new SyncFailure('cancelled'))
      return Promise.resolve(Reflect.apply(method, target, args)).then(result => {
        if (signal?.aborted) throw new SyncFailure('cancelled')
        return result
      })
    }
  } })
}

function acceptOp(workspace: WorkspaceRow, _deviceId: string, op: PushWire, measure: () => number): PushResultWire {
  const existing = workspace.receipts.get(op.opId)
  if (existing) {
    if (existing.hash !== op.payloadHash) return { opId: op.opId, error: 'op_id_reused' }
    return { opId: op.opId, seq: existing.seq, duplicate: true }
  }
  if (measure() > maxOpCiphertextBytes || op.ciphertext.length / 2 > maxOpCiphertextBytes) return { opId: op.opId, error: 'payload_too_large' }
  if (op.keyEpoch !== workspace.keyEpoch) return { opId: op.opId, error: 'stale_epoch' }
  if (op.formatVersion < 1) return { opId: op.opId, error: 'protocol_too_old' }
  const seq = workspace.headSeq + 1
  workspace.headSeq = seq
  workspace.ops.push({ seq, opId: op.opId, payloadHash: op.payloadHash, formatVersion: op.formatVersion, keyEpoch: op.keyEpoch, ciphertext: op.ciphertext })
  workspace.receipts.set(op.opId, { hash: op.payloadHash, seq })
  return { opId: op.opId, seq, duplicate: false }
}

export function memoryCiphertext(world: MemoryWorld): string {
  const workspace = world.workspace
  if (!workspace) return ''
  return workspace.ops.map(row => row.ciphertext).join('') + workspace.envelopes.map(row => row.ciphertext).join('')
}
