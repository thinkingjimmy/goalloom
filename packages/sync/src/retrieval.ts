/**
 * [INPUT]: Exact retained generation, verified Auth scope, pinned control metadata and password/device proof.
 * [OUTPUT]: Verified, secret-free operations for an isolated pending copy; ready only after fixed-head verification.
 * [POS]: Read-only retrieval workflow. It never registers, joins, installs, projects settings or invokes AI.
 */
import {
  canonicalJson, isSecretSettingKey, retrievalLimits, retrievalProofBodySchema, retrievalRecoveryBodySchema,
  type CloudTarget, type RetrievalChallenge, type RetrievalManifest, type RetrievalProofBody, type SyncOp,
} from '@goalloom/contracts'
import {
  checkpointHash, hex, lp, openRecoveryLock, rosterHash, sha256Bytes, sha256Hex, signDetached, unhex, unwrap, utf8,
  verifyCheckpointSig, verifyDetached, verifyRecoveryJoin, verifyRosterExtension, verifyRosterSignature, wipe, wipeRecovery,
  type RecoverySecrets,
} from '@goalloom/crypto'
import { CloudFailure, type CloudRemote } from './cloud-remote'
import { SyncFailure } from './failure'
import { openOpWire } from './codec'
import type { RequestOptions } from './request'
import type { RosterWire } from './remote'

function integrity(condition: unknown): asserts condition { if (!condition) throw new CloudFailure('retrieval_data_unavailable', 'integrity_failure') }
const hash = (value: unknown) => sha256Hex(utf8(canonicalJson(value)))
export function retrievalProofDigest(value: RetrievalProofBody): Uint8Array {
  return sha256Bytes(utf8(`goalloom/retrieval-proof/v1|${canonicalJson(retrievalProofBodySchema.parse(value))}`))
}
export type RetrievalIdentity = { environment: 'development' | 'production'; projectRef: string; accountId: string; authSessionId: string }
export type RetrievalCredentials =
  | { kind: 'recovery'; password: string; pinnedRoster?: { version: number; hash: string } }
  | { kind: 'device'; deviceId: string; signSk: Uint8Array; workspaceKey: Uint8Array; pinnedRoster: { version: number; hash: string } }
export interface RetrievedOperation { seq: number; originalPayloadHash: string; op: SyncOp }

function validateBoundary(challenge: RetrievalChallenge, target: CloudTarget, identity: RetrievalIdentity, proof: RetrievalCredentials): void {
  const m = challenge.manifest, p = challenge.proofBody
  integrity(m.workspaceId === target.workspaceId && m.generation === target.generation && m.environment === identity.environment && m.projectRef === identity.projectRef)
  integrity(p.ownerId === identity.accountId && p.authSessionId === identity.authSessionId && p.manifestHash === challenge.manifestHash && hash(m) === challenge.manifestHash)
  for (const key of ['environment', 'projectRef', 'workspaceId', 'generation', 'lifecycleVersion', 'headSeq', 'headHash', 'checkpointHash', 'rosterHash', 'retrieveUntil', 'proofKind', 'deviceId'] as const) integrity(p[key] === m[key])
  integrity(m.proofKind === proof.kind && m.deviceId === (proof.kind === 'device' ? proof.deviceId : null))
  integrity(p.challengeExpiresAt > challenge.serverNow && p.challengeExpiresAt <= m.retrieveUntil && m.retrieveUntil > challenge.serverNow)
  integrity(Date.parse(p.challengeExpiresAt) - Date.parse(challenge.serverNow) <= 300_000)
  integrity(challenge.checkpoint.cpVersion === 1 && challenge.checkpoint.body.cpVersion === 1 && challenge.checkpoint.body.epoch === 1 && challenge.checkpoint.body.prevCpHash === null)
  integrity(checkpointHash(challenge.checkpoint.body) === m.checkpointHash && hash([challenge.recoveryEnvelope]) === m.envelopeSetHash)
  integrity(utf8(canonicalJson(challenge.checkpoint.body)).byteLength <= retrievalLimits.checkpointBytes)
}

function validateChain(challenge: RetrievalChallenge, chain: RosterWire[], proof: RetrievalCredentials): void {
  const m = challenge.manifest, cp = challenge.checkpoint, first = chain[0], head = chain.at(-1)
  integrity(first && head && chain.length === m.rosterVersion && head.bodyHash === m.rosterHash)
  integrity(first.roster.prevHash === null && cp.body.rosterVersion === 1 && cp.body.rosterHash === first.bodyHash && cp.body.workspaceId === m.workspaceId)
  integrity(sha256Hex(unhex(first.roster.recoverySignPub)) === m.recoveryKeyId)
  integrity(cp.body.recoverySignPub === first.roster.recoverySignPub && cp.body.recoveryBoxPub === first.roster.recoveryBoxPub)
  integrity(verifyCheckpointSig(cp.body, unhex(cp.recSig), unhex(first.roster.recoverySignPub)))
  integrity(first.roster.devices.some(device => verifyCheckpointSig(cp.body, unhex(cp.devSig), unhex(device.signPub))))
  for (const [index, link] of chain.entries()) {
    integrity(link.version === index + 1 && link.roster.version === link.version && link.roster.epoch === 1 && link.roster.workspaceId === m.workspaceId)
    integrity(utf8(canonicalJson(link.roster)).byteLength <= retrievalLimits.rosterBytes && rosterHash(link.roster) === link.bodyHash)
    integrity(new Set(link.roster.devices.map(device => device.id)).size === link.roster.devices.length)
    integrity(link.roster.recoverySignPub === first.roster.recoverySignPub && link.roster.recoveryBoxPub === first.roster.recoveryBoxPub)
    if (index) verifyRosterExtension(chain[index - 1]!.roster, { body: link.roster, signature: unhex(link.signature), signerId: link.signerType === 'recovery' ? 'recovery' : link.signerDevice ?? '' })
    else {
      const signer = link.signerType === 'device' ? link.roster.devices.find(device => device.id === link.signerDevice)?.signPub : null
      integrity(signer && verifyRosterSignature(link.roster, unhex(link.signature), unhex(signer)))
    }
  }
  if (proof.pinnedRoster) integrity(chain.find(link => link.version === proof.pinnedRoster!.version)?.bodyHash === proof.pinnedRoster.hash)
  if (proof.kind === 'device') integrity(head.roster.devices.some(device => device.id === proof.deviceId))
}

function recoveryBody(challenge: RetrievalChallenge, chain: RosterWire[]) {
  const wire = challenge.recoveryEnvelope
  integrity(wire.epoch === 1 && wire.recipient === 'recovery')
  let body: ReturnType<typeof retrievalRecoveryBodySchema.parse>
  try { body = retrievalRecoveryBodySchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(unhex(wire.ciphertext)))) }
  catch { throw new CloudFailure('retrieval_data_unavailable', 'integrity_failure') }
  const issuer = chain.find(link => link.version === wire.rosterVersion)?.roster.devices.find(device => device.id === body.wrap.senderId)
  integrity(issuer && wire.signature === body.wrap.sig && body.wrap.ctx === `wk|${challenge.manifest.workspaceId}|1`)
  const aad = lp('goalloom/wrap/v1', body.wrap.ctx, body.wrap.senderId, 'recovery', unhex(body.wrap.ephPub), unhex(chain[0]!.roster.recoveryBoxPub))
  integrity(verifyDetached(sha256Bytes(lp(aad, unhex(body.wrap.nonce), unhex(body.wrap.ct))), unhex(body.wrap.sig), unhex(issuer.signPub)))
  return { body, issuer }
}

export async function retrieveRetained(input: {
  remote: CloudRemote; target: CloudTarget; identity: RetrievalIdentity; credentials: RetrievalCredentials
  append: (operations: RetrievedOperation[]) => Promise<void>; options?: RequestOptions
}): Promise<{ manifest: RetrievalManifest; manifestHash: string; verifiedAt: string }> {
  const check = () => input.options?.signal?.throwIfAborted()
  check()
  const proof = input.credentials
  const initial = await input.remote.retrievalBootstrap({ version: 1, ...input.target, proof: proof.kind === 'device' ? { kind: 'device', deviceId: proof.deviceId } : { kind: 'recovery' } }, input.options)
  integrity(initial.kind === 'challenge')
  validateBoundary(initial, input.target, input.identity, proof)
  const chain: RosterWire[] = []
  let page = initial.rosterPage
  for (;;) {
    integrity(page.afterRosterVersion === chain.length && page.nextAfterRosterVersion === chain.length + page.rosters.length)
    chain.push(...page.rosters)
    integrity(page.nextAfterRosterVersion <= initial.manifest.rosterVersion && page.done === (page.nextAfterRosterVersion === initial.manifest.rosterVersion))
    if (page.done) break
    integrity(page.rosters.length > 0)
    const next = await input.remote.retrievalBootstrap({ version: 1, challengeId: initial.proofBody.challengeId, afterRosterVersion: chain.length }, input.options)
    integrity(next.kind === 'control' && next.challengeId === initial.proofBody.challengeId && next.manifestHash === initial.manifestHash)
    page = next.rosterPage
  }
  let recovery: RecoverySecrets | null = null, key: Uint8Array | null = null
  try {
    try { validateChain(initial, chain, proof) } catch { throw new CloudFailure('retrieval_data_unavailable', 'integrity_failure') }
    const { body, issuer } = recoveryBody(initial, chain)
    let signSk: Uint8Array
    if (proof.kind === 'recovery') {
      try { recovery = await openRecoveryLock({ password: proof.password, workspaceId: input.target.workspaceId, lock: { kdf: body.kdf, lock: body.lock } }) }
      catch { throw new SyncFailure('password') }
      try {
        verifyRecoveryJoin({ secrets: recovery, workspaceId: input.target.workspaceId, checkpoint: initial.checkpoint.body, recSig: unhex(initial.checkpoint.recSig), devSig: unhex(initial.checkpoint.devSig), roster: chain[0]!.roster,
          newer: chain.slice(1).map(link => ({ body: link.roster, signature: unhex(link.signature), signerId: link.signerType === 'recovery' ? 'recovery' : link.signerDevice ?? '' })) })
        key = unwrap(body.wrap, { expectedCtx: `wk|${input.target.workspaceId}|1`, recipientId: 'recovery', boxSk: recovery.boxSk, senderSignPub: unhex(issuer.signPub) })
      } catch { throw new CloudFailure('retrieval_data_unavailable', 'integrity_failure') }
      signSk = recovery.signSk
    } else { key = proof.workspaceKey.slice(); signSk = proof.signSk }
    integrity(key.length === 32)
    const grant = await input.remote.retrievalAuthorize({ version: 1, challengeId: initial.proofBody.challengeId, signature: hex(signDetached(retrievalProofDigest(initial.proofBody), signSk)) }, input.options)
    integrity(grant.manifestHash === initial.manifestHash && grant.expiresAt <= initial.manifest.retrieveUntil && grant.expiresAt > grant.serverNow && Date.parse(grant.expiresAt) - Date.parse(grant.serverNow) <= 900_000)
    const entries: (number | string)[][] = [], ids = new Set<string>()
    let cursor = 0, verifiedAt = grant.serverNow
    for (;;) {
      const next = await input.remote.retrievalRead({ version: 1, capability: grant.capability, afterSeq: cursor }, input.options)
      integrity(next.manifestHash === initial.manifestHash && next.afterSeq === cursor && next.nextAfterSeq === cursor + next.operations.length && next.nextAfterSeq <= initial.manifest.headSeq)
      integrity(next.done === (next.nextAfterSeq === initial.manifest.headSeq) && (next.done || next.operations.length > 0))
      const opened: RetrievedOperation[] = []
      for (const row of next.operations) {
        integrity(row.seq === cursor + 1 && !ids.has(row.opId))
        ids.add(row.opId); cursor++
        entries.push([row.seq, row.opId, row.payloadHash, row.formatVersion, row.keyEpoch])
        let op: SyncOp
        try { op = openOpWire(row, { workspaceKey: key, workspaceId: input.target.workspaceId }) }
        catch { throw new CloudFailure('retrieval_data_unavailable', 'integrity_failure') }
        const init = initial.manifest.initialization
        if (init && row.seq <= init.finalSeq) {
          integrity(op.deviceId === init.creatorDeviceId && op.actions.length === 1 && op.actions[0]!.t.startsWith('seed.'))
          if (row.seq === init.finalSeq) integrity(row.opId === init.finalOpId && row.payloadHash === init.finalPayloadHash && op.actions[0]!.t === 'seed.final')
        }
        // Original plaintext/hash is verified above. The isolated copy never receives recovered API keys.
        const actions = op.actions.map(action => action.t === 'pref.set' && isSecretSettingKey(action.key) && typeof action.value === 'string' && !/^sha256:[0-9a-f]{64}$/.test(action.value) ? { ...action, value: `sha256:${sha256Hex(action.value)}` } : action)
        opened.push({ seq: row.seq, originalPayloadHash: row.payloadHash, op: { ...op, actions } })
      }
      check()
      await input.append(opened)
      check()
      verifiedAt = next.serverNow
      if (next.done) break
    }
    integrity(entries.length === initial.manifest.operationCount && hash({ workspaceId: input.target.workspaceId, generation: input.target.generation, headSeq: initial.manifest.headSeq, entries }) === initial.manifest.headHash)
    check()
    return { manifest: initial.manifest, manifestHash: initial.manifestHash, verifiedAt }
  } finally { if (key) wipe(key); wipeRecovery(recovery) }
}
