/**
 * [INPUT]: Canonical roster bodies and Ed25519 signatures from a pinned chain.
 * [OUTPUT]: Accept only a chain that extends the pinned head. A self-signed v1 is not an anchor.
 * [POS]: Device trust. Public keys inside a server-supplied body are not trusted until the chain verifies.
 */
import { canonicalJson } from '@goalloom/contracts'
import { ed25519 } from '@noble/curves/ed25519.js'
import { unhex, utf8 } from './bytes'
import { sha256Bytes, sha256Hex } from './kdf'

export interface RosterDevice { id: string; signPub: string; boxPub: string }
export interface RosterBody {
  workspaceId: string; version: number; epoch: number; prevHash: string | null
  devices: RosterDevice[]; recoverySignPub: string; recoveryBoxPub: string
}

export function rosterHash(body: RosterBody): string { return sha256Hex(utf8(canonicalJson(body))) }

export function signRoster(body: RosterBody, signSk: Uint8Array): Uint8Array {
  return ed25519.sign(sha256Bytes(utf8(`goalloom/roster/v1|${canonicalJson(body)}`)), signSk)
}

export function verifyRosterSignature(body: RosterBody, signature: Uint8Array, signPub: Uint8Array): boolean {
  return ed25519.verify(signature, sha256Bytes(utf8(`goalloom/roster/v1|${canonicalJson(body)}`)), signPub)
}

export interface RosterLink { body: RosterBody; signature: Uint8Array; signerId: string | 'recovery' }

/** signerId 'recovery' uses body.recoverySignPub of the PREVIOUS body (or the same body only when the caller passed an out-of-band recovery public). */
export function verifyRosterExtension(previous: RosterBody, next: RosterLink, previousRecoverySignPub?: Uint8Array): void {
  if (next.body.version !== previous.version + 1) throw new Error('roster version regression')
  if (next.body.prevHash !== rosterHash(previous)) throw new Error('roster prevHash mismatch')
  if (next.body.workspaceId !== previous.workspaceId) throw new Error('roster workspace mismatch')
  const encoded = next.signerId === 'recovery'
    ? null
    : previous.devices.find(device => device.id === next.signerId)?.signPub
  const pub = next.signerId === 'recovery' ? previousRecoverySignPub ?? unhex(previous.recoverySignPub) : encoded ? unhex(encoded) : new Uint8Array()
  if (pub.length !== 32 || !verifyRosterSignature(next.body, next.signature, pub)) throw new Error('roster signer rejected')
}

export interface QrAnchor { workspaceId: string; epoch: number; rosterVersion: number; rosterHash: string; approverDeviceId: string; approverSignPub: string }

/** Wrap targets are roster devices plus the recovery recipient. A public key that is only in the server devices table is not a target. */
export function rosterWrapTargets(body: RosterBody): string[] {
  return [...body.devices.map(device => device.id), 'recovery']
}

export function qrMatchesHead(anchor: QrAnchor, head: RosterBody): boolean {
  return anchor.workspaceId === head.workspaceId && anchor.epoch === head.epoch
    && anchor.rosterVersion === head.version && anchor.rosterHash === rosterHash(head)
    && head.devices.some(device => device.id === anchor.approverDeviceId && device.signPub === anchor.approverSignPub)
}
