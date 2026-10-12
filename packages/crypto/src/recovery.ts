/**
 * [INPUT]: 24-word English mnemonic and workspace id. Private keys exist only for the duration of a call.
 * [OUTPUT]: X25519 and Ed25519 recovery keys, plus dual-signed checkpoint checks (v1.4).
 * [POS]: Recovery trust anchor. A roster that merely copies the recovery public key is not enough.
 */
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { canonicalJson } from '@goalloom/contracts'
import { unhex, utf8, wipe } from './bytes'
import { hkdfSha256, sha256Bytes, sha256Hex } from './kdf'
import { publicFromSeed } from './wrap'
import { rosterHash, verifyRosterExtension, type RosterBody, type RosterLink } from './roster'

export interface RecoverySecrets { boxSk: Uint8Array; boxPub: Uint8Array; signSk: Uint8Array; signPub: Uint8Array }

export function generateRecoveryMnemonic(): string { return generateMnemonic(wordlist, 256) }

export function deriveRecovery(mnemonic: string, workspaceId: string): RecoverySecrets {
  if (!validateMnemonic(mnemonic, wordlist) || mnemonic.trim().split(/\s+/).length !== 24) throw new Error('recovery phrase rejected')
  const entropy = mnemonicToEntropy(mnemonic, wordlist)
  const salt = utf8(`goalloom/recovery/v1|${workspaceId}`)
  const boxSk = hkdfSha256(entropy, salt, 'x25519')
  const signSk = hkdfSha256(entropy, salt, 'ed25519')
  wipe(entropy)
  return { boxSk, boxPub: publicFromSeed('x25519', boxSk), signSk, signPub: publicFromSeed('ed25519', signSk) }
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
  mnemonic: string; workspaceId: string; checkpoint: CheckpointBody; recSig: Uint8Array; devSig: Uint8Array
  roster: RosterBody; newer?: RosterLink[]
}

/** Rules (a)–(f) from protocol §9.3. Fails closed. */
export function verifyRecoveryJoin(input: JoinInput): void {
  const secrets = deriveRecovery(input.mnemonic, input.workspaceId)
  try {
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
  } finally { wipeRecovery(secrets) }
}

function toHex(bytes: Uint8Array): string { return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('') }
