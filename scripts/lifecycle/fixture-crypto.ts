/**
 * [INPUT]: Protected synthetic device/recovery seeds, exact assigned device and planned workspace IDs.
 * [OUTPUT]: Original signed creation/envelope/final-op payloads using the shared crypto implementation.
 * [POS]: Development fixture preparation only; callers persist the complete returned bytes before dispatch.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { syncOpPayload } from '../../packages/contracts/src/sync-op.ts'
import { encodeExactSeed } from '../../packages/sync/src/seed.ts'
import { describeSeedRecords } from '../../packages/store-core/src/seed-records.ts'
import { wrap } from '../../packages/crypto/src/wrap.ts'
import { sealRecoveryLock } from '../../packages/crypto/src/password.ts'
import { sealOp } from '../../packages/crypto/src/op.ts'
import { signRoster, rosterHash } from '../../packages/crypto/src/roster.ts'
import { signCheckpoint } from '../../packages/crypto/src/recovery.ts'
const hex = (value: Uint8Array) => Buffer.from(value).toString('hex')
const bytes = (value: string) => Buffer.from(value, 'hex')
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex')
export function fixtureSecrets() {
  const sign = randomBytes(32), box = randomBytes(32), recoverySign = randomBytes(32), recoveryBox = randomBytes(32)
  return { signSeed: hex(sign), boxSeed: hex(box), recoverySignSeed: hex(recoverySign), recoveryBoxSeed: hex(recoveryBox),
    workspaceKey: hex(randomBytes(32)), syncPassword: randomBytes(32).toString('base64url'),
    signPub: hex(ed25519.getPublicKey(sign)), boxPub: hex(x25519.getPublicKey(box)) }
}
export async function fixtureCreation(input: { deviceId: string; workspaceId: string; generation: string; secrets: ReturnType<typeof fixtureSecrets> }) {
  const { secrets, workspaceId, deviceId } = input, random = { bytes: (n: number) => new Uint8Array(randomBytes(n)) }
  const recovery = { signSk: bytes(secrets.recoverySignSeed), boxSk: bytes(secrets.recoveryBoxSeed),
    signPub: ed25519.getPublicKey(bytes(secrets.recoverySignSeed)), boxPub: x25519.getPublicKey(bytes(secrets.recoveryBoxSeed)) }
  const roster = { workspaceId, version: 1, epoch: 1, prevHash: null,
    devices: [{ id: deviceId, signPub: secrets.signPub, boxPub: secrets.boxPub }],
    recoverySignPub: hex(recovery.signPub), recoveryBoxPub: hex(recovery.boxPub) }
  const checkpoint = { workspaceId, cpVersion: 1, rosterVersion: 1, rosterHash: rosterHash(roster), epoch: 1,
    recoverySignPub: roster.recoverySignPub, recoveryBoxPub: roster.recoveryBoxPub, prevCpHash: null }
  const wrapped = (recipient: string, publicKey: Uint8Array) => wrap({ senderId: deviceId, signSk: bytes(secrets.signSeed),
    recipientId: recipient, recipientBoxPub: publicKey, ctx: `wk|${workspaceId}|1`, plaintext: bytes(secrets.workspaceKey), random })
  const deviceWrap = wrapped(deviceId, bytes(secrets.boxPub)), recoveryWrap = wrapped('recovery', recovery.boxPub)
  const lock = await sealRecoveryLock({ password: secrets.syncPassword, workspaceId, secrets: recovery, random })
  const envelope = (recipient: string, value: unknown, signature: string) => ({ epoch: 1, recipient,
    ciphertext: hex(Buffer.from(JSON.stringify(value))), signature, rosterVersion: 1, signerDevice: deviceId })
  const envelopes = [envelope(deviceId, deviceWrap, deviceWrap.sig), envelope('recovery', { v: 2, ...lock, wrap: recoveryWrap }, recoveryWrap.sig)]
  const requestId = randomUUID(), finalOpId = randomUUID()
  const encoded = encodeExactSeed(describeSeedRecords([{ kind: 'workspace', calendar: null, setupConfirmedAt: null }]),
    { seedId: randomUUID(), finalOpId, deviceId, at: new Date().toISOString() })
  const operations = encoded.ops.map(op => ({ op_id: op.opId, payload_hash: hash(syncOpPayload(op)), format_version: 1, key_epoch: 1,
    ciphertext: hex(sealOp({ workspaceKey: bytes(secrets.workspaceKey), workspaceId, opId: op.opId, epoch: 1, plaintext: Buffer.from(syncOpPayload(op)), random })) }))
  return { creation: { p_device: deviceId, p_workspace: workspaceId, p_generation: input.generation, p_roster: roster,
    p_roster_hash: rosterHash(roster), p_roster_sig: `\\x${hex(signRoster(roster, bytes(secrets.signSeed)))}`,
    p_checkpoint: checkpoint, p_rec_sig: `\\x${hex(signCheckpoint(checkpoint, recovery.signSk))}`, p_dev_sig: `\\x${hex(signCheckpoint(checkpoint, bytes(secrets.signSeed)))}`,
    p_initialization: { requestId, finalOpId, envelopes } }, operations, expected: encoded.ops,
    finish: { version: 1, requestId, target: { workspaceId, generation: input.generation }, creatorDeviceId: deviceId,
      finalOpId, finalPayloadHash: encoded.final.payloadHash, finalSeq: encoded.final.seq } }
}
