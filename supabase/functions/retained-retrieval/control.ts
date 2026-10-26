// Copyright (C) 2026 Jimmy Wong
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * [INPUT]: Frozen checkpoint/envelope and every contiguous signed roster from version one.
 * [OUTPUT]: Verified fixed-epoch control hashes and the proof key from the signed chain.
 * [POS]: Server integrity gate. Client possession and existing local pins remain authoritative.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { ed25519 } from '@noble/curves/ed25519.js'
import { lp, unhex } from '../../../packages/crypto/src/bytes.ts'
import { rosterHash, verifyRosterExtension, verifyRosterSignature } from '../../../packages/crypto/src/roster.ts'
import { checkpointHash, verifyCheckpointSig } from '../../../packages/crypto/src/recovery.ts'
import { byteLength, canonicalJson, CHECKPOINT_BYTES, checkpointSchema, dataFailure, envelopeSchema,
  recoveryBodySchema, ROSTER_BYTES, rosterWireSchema, sha256, type CheckpointWire, type EnvelopeWire, type InitialRequest,
  type RosterWire, RetrievalFailure } from './protocol.ts'
export class ControlVerifier {
  private previous: RosterWire | null = null
  private recoverySignPub: string | null = null
  private recoveryBoxPub: string | null = null
  private issuerPub: string | null = null
  private checkpoint: CheckpointWire
  private envelope: EnvelopeWire
  private recoveryBody: ReturnType<typeof recoveryBodySchema.parse>
  constructor(private readonly target: InitialRequest, checkpoint: unknown, envelope: unknown) {
    const cp = checkpointSchema.safeParse(checkpoint), env = envelopeSchema.safeParse(envelope)
    if (!cp.success || !env.success) dataFailure('integrity_failure')
    this.checkpoint = cp.data; this.envelope = env.data
    if (byteLength(JSON.parse(canonicalJson(cp.data.body))) > CHECKPOINT_BYTES) dataFailure('unsupported_profile')
    if (cp.data.cpVersion !== 1 || cp.data.body.cpVersion !== 1 || cp.data.body.rosterVersion !== 1
      || cp.data.body.epoch !== 1 || cp.data.body.prevCpHash !== null || env.data.epoch !== 1) dataFailure('unsupported_profile')
    if (cp.data.body.workspaceId !== target.workspaceId || env.data.recipient !== 'recovery') dataFailure('integrity_failure')
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(unhex(env.data.ciphertext))
      this.recoveryBody = recoveryBodySchema.parse(JSON.parse(text))
    } catch (error) { if (error instanceof RetrievalFailure) throw error; dataFailure('integrity_failure') }
    const wrap = this.recoveryBody.wrap
    if (wrap.ctx !== `wk|${target.workspaceId}|1` || wrap.sig !== env.data.signature) dataFailure('integrity_failure')
  }
  add(value: unknown): void {
    const parsed = rosterWireSchema.safeParse(value)
    if (!parsed.success) dataFailure('integrity_failure')
    const row = parsed.data, body = row.roster, cp = this.checkpoint
    if (new TextEncoder().encode(canonicalJson(body)).byteLength > ROSTER_BYTES) dataFailure('unsupported_profile')
    if (body.epoch !== 1) dataFailure('unsupported_profile')
    if (row.version !== (this.previous?.version ?? 0) + 1 || body.version !== row.version
      || body.workspaceId !== this.target.workspaceId || rosterHash(body) !== row.bodyHash
      || new Set(body.devices.map(device => device.id)).size !== body.devices.length
      || ((row.signerType === 'recovery') !== (row.signerDevice === null))) dataFailure('integrity_failure')
    try {
      if (!this.previous) {
        if (row.signerType !== 'device' || body.prevHash !== null) dataFailure('integrity_failure')
        const signer = body.devices.find(device => device.id === row.signerDevice)
        if (!signer || !verifyRosterSignature(body, unhex(row.signature), unhex(signer.signPub))) dataFailure('integrity_failure')
        if (cp.body.rosterHash !== row.bodyHash || cp.body.recoverySignPub !== body.recoverySignPub
          || cp.body.recoveryBoxPub !== body.recoveryBoxPub
          || !verifyCheckpointSig(cp.body, unhex(cp.recSig), unhex(body.recoverySignPub))
          || !body.devices.some(device => verifyCheckpointSig(cp.body, unhex(cp.devSig), unhex(device.signPub)))) dataFailure('integrity_failure')
        this.recoverySignPub = body.recoverySignPub; this.recoveryBoxPub = body.recoveryBoxPub
      } else {
        if (body.recoverySignPub !== this.recoverySignPub || body.recoveryBoxPub !== this.recoveryBoxPub) dataFailure('unsupported_profile')
        verifyRosterExtension(this.previous.roster, { body, signature: unhex(row.signature),
          signerId: row.signerType === 'recovery' ? 'recovery' : row.signerDevice! })
      }
      if (row.version === this.envelope.rosterVersion) {
        const wrap = this.recoveryBody.wrap
        const issuer = body.devices.find(device => device.id === wrap.senderId)
        if (!issuer) dataFailure('integrity_failure')
        const header = lp('goalloom/wrap/v1', wrap.ctx, wrap.senderId, 'recovery', unhex(wrap.ephPub), unhex(body.recoveryBoxPub))
        const digest = unhex(sha256(lp(header, unhex(wrap.nonce), unhex(wrap.ct))))
        if (!ed25519.verify(unhex(wrap.sig), digest, unhex(issuer.signPub))) dataFailure('integrity_failure')
        this.issuerPub = issuer.signPub
      }
    } catch (error) { if (error instanceof RetrievalFailure) throw error; dataFailure('integrity_failure') }
    this.previous = row
  }
  finish(expectedVersion: number, proofPublicKey: string): { checkpointHash: string; rosterHash: string; recoveryKeyId: string; envelopeSetHash: string } {
    if (!this.previous || this.previous.version !== expectedVersion || !this.issuerPub) dataFailure('integrity_failure')
    const proof = this.target.proof
    const key = proof.kind === 'recovery' ? this.recoverySignPub
      : this.previous.roster.devices.find(device => device.id === proof.deviceId)?.signPub
    if (!key || key !== proofPublicKey) dataFailure('integrity_failure')
    return { checkpointHash: checkpointHash(this.checkpoint.body), rosterHash: this.previous.bodyHash,
      recoveryKeyId: sha256(unhex(this.recoverySignPub!)), envelopeSetHash: sha256(canonicalJson([this.envelope])) }
  }
}
export function validateControlProfile(input: { target: InitialRequest; checkpoint: unknown; recoveryEnvelope: unknown;
  rosters: unknown[]; rosterVersion: number; proofPublicKey: string }) {
  const verifier = new ControlVerifier(input.target, input.checkpoint, input.recoveryEnvelope)
  for (const row of input.rosters) verifier.add(row)
  return verifier.finish(input.rosterVersion, input.proofPublicKey)
}
