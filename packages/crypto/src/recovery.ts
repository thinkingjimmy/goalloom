/**
 * [INPUT]: A random recovery keypair, or one opened from the password lock. Private keys stay with the caller.
 * [OUTPUT]: X25519 and Ed25519 recovery keys, plus dual-signed checkpoint checks.
 * [POS]: Recovery trust anchor. A roster that merely copies the recovery public key is not enough.
 * The password that encrypts this keypair lives in password.ts. It is not derived from these keys.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { canonicalJson } from '@goalloom/contracts'
import { unhex, utf8, wipe } from './bytes'
import { sha256Bytes, sha256Hex } from './kdf'
import { publicFromSeed } from './wrap'
import { rosterHash, verifyRosterExtension, type RosterBody, type RosterLink } from './roster'

export interface RecoverySecrets { boxSk: Uint8Array; boxPub: Uint8Array; signSk: Uint8Array; signPub: Uint8Array }

export function newRecovery(random: { bytes(length: number): Uint8Array }): RecoverySecrets {
  const boxSk = random.bytes(32)
  const signSk = random.bytes(32)
  return { boxSk, boxPub: publicFromSeed('x25519', boxSk), signSk, signPub: publicFromSeed('ed25519', signSk) }
}

export function recoveryChallengeMessage(input: { workspaceId: string; deviceId: string; nonceHex: string; rosterHash: string }): Uint8Array {
  return utf8(`goalloom/recover/v1|${input.workspaceId}|${input.deviceId}|${input.nonceHex}|${input.rosterHash}`)
}

export function signRecoveryChallenge(input: { workspaceId: string; deviceId: string; nonceHex: string; rosterHash: string; signSk: Uint8Array }): Uint8Array {
  return ed25519.sign(recoveryChallengeMessage(input), input.signSk)
}

export function wipeRecovery(secrets: RecoverySecrets | null): void {
  if (!secrets) return
  wipe(secrets.boxSk); wipe(secrets.signSk); wipe(secrets.boxPub); wipe(secrets.signPub)
}

export interface CheckpointBody {
  workspaceId: string; cpVersion: number; rosterVersion: number; rosterHash: string; epoch: number
  recoverySignPub: string; recoveryBoxPub: string; prevCpHash: string | null
}

export function checkpointHash(body: CheckpointBody): string { return sha256Hex(utf8(canonicalJson(body))) }

export function signCheckpoint(body: CheckpointBody, signSk: Uint8Array): Uint8Array {
  return ed25519.sign(sha256Bytes(utf8(`goalloom/recovery-cp/v1|${canonicalJson(body)}`)), signSk)
}

/** A pinned checkpoint rejects an older version, a different workspace, a fork, and a version gap the caller did not supply. */
export function acceptNewerCheckpoint(pinned: CheckpointBody, offered: CheckpointBody): void {
  if (offered.workspaceId !== pinned.workspaceId) throw new Error('checkpoint workspace mismatch')
  if (offered.cpVersion < pinned.cpVersion) throw new Error('checkpoint rollback')
  if (offered.cpVersion === pinned.cpVersion && checkpointHash(offered) !== checkpointHash(pinned)) throw new Error('checkpoint fork')
  if (offered.cpVersion > pinned.cpVersion + 1) throw new Error('checkpoint gap')
  if (offered.cpVersion === pinned.cpVersion + 1 && offered.prevCpHash !== checkpointHash(pinned)) throw new Error('checkpoint fork')
}

export function verifyCheckpointSig(body: CheckpointBody, signature: Uint8Array, signPub: Uint8Array): boolean {
  return ed25519.verify(signature, sha256Bytes(utf8(`goalloom/recovery-cp/v1|${canonicalJson(body)}`)), signPub)
}

export interface JoinInput {
  secrets: RecoverySecrets; workspaceId: string; checkpoint: CheckpointBody; recSig: Uint8Array; devSig: Uint8Array
  roster: RosterBody; newer?: RosterLink[]
}

/** Rules (a)–(f) from protocol §9.3. Fails closed. The caller opens the password lock first. */
export function verifyRecoveryJoin(input: JoinInput): void {
  const secrets = input.secrets
  if (input.checkpoint.workspaceId !== input.workspaceId) throw new Error('checkpoint workspace mismatch')
  const derived = toHex(secrets.signPub)
  if (input.checkpoint.recoverySignPub !== derived) throw new Error('checkpoint recovery key mismatch')
  if (!verifyCheckpointSig(input.checkpoint, input.recSig, secrets.signPub)) throw new Error('checkpoint recovery signature rejected')
  if (input.roster.version !== input.checkpoint.rosterVersion || rosterHash(input.roster) !== input.checkpoint.rosterHash || input.roster.epoch !== input.checkpoint.epoch) {
    throw new Error('checkpoint roster mismatch')
  }
  const signer = input.roster.devices.find(device => verifyCheckpointSig(input.checkpoint, input.devSig, unhex(device.signPub)))
  if (!signer) throw new Error('checkpoint device signature rejected')
  if (input.roster.recoverySignPub !== derived || input.roster.recoveryBoxPub !== toHex(secrets.boxPub)) throw new Error('roster recovery key mismatch')
  let previous = input.roster
  for (const link of input.newer ?? []) {
    verifyRosterExtension(previous, link, secrets.signPub)
    previous = link.body
  }
}

function toHex(bytes: Uint8Array): string { return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('') }
