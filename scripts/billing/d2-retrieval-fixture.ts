/**
 * [INPUT]: Synthetic identities, real crypto helpers and the failure matrix recorded before implementation.
 * [OUTPUT]: Controlled Auth/RPC transport for real loopback HTTP journeys and canonical vectors.
 * [POS]: D2 integration fixture; it does not simulate a successful real PostgreSQL acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash, randomBytes } from 'node:crypto'
import { ed25519 } from '@noble/curves/ed25519.js'
import { hex, unhex, utf8 } from '../../packages/crypto/src/bytes.ts'
import { newRecovery, checkpointHash, signCheckpoint } from '../../packages/crypto/src/recovery.ts'
import { rosterHash, signRoster, type RosterBody } from '../../packages/crypto/src/roster.ts'
import { sealRecoveryLock } from '../../packages/crypto/src/password.ts'
import { wrap } from '../../packages/crypto/src/wrap.ts'
import { sealOp, openOp } from '../../packages/crypto/src/op.ts'
import { createRetrievalHandler } from '../../supabase/functions/retained-retrieval/handler.ts'
import { canonicalJson, retrievalProofDigest, sha256, type Manifest, type Rpc, type RosterWire } from '../../supabase/functions/retained-retrieval/protocol.ts'
export { createRetrievalHandler, retrievalProofDigest, canonicalJson, sha256 }
export const fixtureId = (index: number) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`
export const config = { url: 'https://asqyvcnxdltzzfutbbqy.supabase.co', projectRef: 'asqyvcnxdltzzfutbbqy',
  environment: 'development' as const, serviceKey: 'controlled-fixture-service-credential' }
export const identity = { ownerId: fixtureId(1), sessionId: fixtureId(2), workspaceId: fixtureId(3), generation: fixtureId(4) }
const referenceProofDigest = (body: unknown) => createHash('sha256').update(`goalloom/retrieval-proof/v1|${canonicalJson(body)}`).digest()
export function jwt(overrides = {}) {
  const claims = { iss: `${config.url}/auth/v1`, role: 'authenticated', sub: identity.ownerId, session_id: identity.sessionId,
    exp: Math.floor(Date.now() / 1000) + 3600, ...overrides }
  return `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.controlled`
}
export async function createFixture(count = 202, initialization: 'legacy' | 'pending' | 'completed' = 'completed') {
  const random = { bytes: (size: number) => new Uint8Array(randomBytes(size)) }
  const recovery = newRecovery(random), workspaceKey = random.bytes(32)
  const aSk = random.bytes(32), bSk = random.bytes(32)
  const a = { id: fixtureId(10), signPub: hex(ed25519.getPublicKey(aSk)), boxPub: hex(random.bytes(32)) }
  const b = { id: fixtureId(11), signPub: hex(ed25519.getPublicKey(bSk)), boxPub: hex(random.bytes(32)) }
  const first: RosterBody = { workspaceId: identity.workspaceId, version: 1, epoch: 1, prevHash: null,
    devices: [a], recoverySignPub: hex(recovery.signPub), recoveryBoxPub: hex(recovery.boxPub) }
  const second = { ...first, version: 2, prevHash: rosterHash(first), devices: [a, b] }
  const third = { ...first, version: 3, prevHash: rosterHash(second), devices: [b] }
  const wire = (roster: RosterBody, signer: string, sk: Uint8Array): RosterWire => ({ version: roster.version, roster,
    bodyHash: rosterHash(roster), signature: hex(signRoster(roster, sk)), signerType: 'device', signerDevice: signer })
  const rosters = [wire(first, a.id, aSk), wire(second, a.id, aSk), wire(third, b.id, bSk)]
  const cpBody = { workspaceId: identity.workspaceId, cpVersion: 1, rosterVersion: 1, rosterHash: rosterHash(first), epoch: 1,
    recoverySignPub: first.recoverySignPub, recoveryBoxPub: first.recoveryBoxPub, prevCpHash: null }
  const checkpoint = { cpVersion: 1, body: cpBody, recSig: hex(signCheckpoint(cpBody, recovery.signSk)), devSig: hex(signCheckpoint(cpBody, aSk)) }
  const lock = await sealRecoveryLock({ password: '测试 Password 2026', workspaceId: identity.workspaceId, secrets: recovery, random })
  const wrapped = wrap({ senderId: a.id, signSk: aSk, recipientId: 'recovery', recipientBoxPub: recovery.boxPub,
    ctx: `wk|${identity.workspaceId}|1`, plaintext: workspaceKey, random })
  const recoveryEnvelope = { epoch: 1, recipient: 'recovery', ciphertext: hex(utf8(JSON.stringify({ v: 2, ...lock, wrap: wrapped }))),
    signature: wrapped.sig, rosterVersion: 1, signerDevice: b.id }
  const plaintexts = Array.from({ length: count }, (_, index) => canonicalJson({ fixture: 'retained-copy', seq: index + 1, text: `示例 ${index + 1}` }))
  const operations = plaintexts.map((plaintext, index) => ({ seq: index + 1, opId: fixtureId(index + 100), payloadHash: sha256(plaintext),
    formatVersion: 1, keyEpoch: 1, ciphertext: hex(sealOp({ workspaceKey, workspaceId: identity.workspaceId,
      opId: fixtureId(index + 100), epoch: 1, plaintext: utf8(plaintext), random })) }))
  const final = initialization === 'legacy' ? null : { requestId: fixtureId(30), creatorDeviceId: a.id,
    finalOpId: operations[Math.min(count, 2) - 1]?.opId, finalPayloadHash: operations[Math.min(count, 2) - 1]?.payloadHash, finalSeq: Math.min(count, 2) }
  const boundary = { ...identity, lifecycleVersion: 7, state: 'retained', accessEndedAt: '2026-10-01T00:00:00.123456Z',
    retrieveUntil: '2026-10-31T00:00:00.123456Z', onlineDeleteBy: '2026-11-07T00:00:00.123456Z', headSeq: count,
    minRetainedSeq: 0, keyEpoch: 1, rosterVersion: 3, checkpointVersion: 1, initialization: final,
    initializationCompleted: initialization === 'legacy' ? null : initialization === 'completed' }
  const { sessionId: _session, ...scalars } = boundary
  const state = { rosters, checkpoint, recoveryEnvelope, boundary: scalars, operations,
    serverNow: '2026-10-23T18:00:00.123456Z', challengeExpiresAt: '2026-10-23T18:05:00.123456Z',
    expiresAt: '2026-10-23T18:15:00.123456Z', calls: [] as string[], consumed: false, closed: false, revoked: false,
    authValid: true, expireCapability: false, challenge: null as Record<string, any> | null, manifest: null as Manifest | null,
    proofKind: 'recovery', mutate: null as null | ((name: string, result: any) => any),
    before: null as null | ((name: string) => Promise<void>) }
  const page = (after: number) => { const rows = state.rosters.slice(after, after + 2); return { afterRosterVersion: after,
    nextAfterRosterVersion: after + rows.length, rosters: rows, done: after + rows.length === 3 } }
  const deny = (error: string, reason?: string) => ({ ok: false, version: 1, serverNow: state.serverNow, error, ...(reason ? { reason } : {}) })
  const rpc: Rpc = async (name, args) => {
    state.calls.push(name)
    await state.before?.(name)
    if (args.p_owner !== identity.ownerId || args.p_session !== identity.sessionId || args.p_environment !== 'development') return deny('authentication_failed')
    if (state.closed) return deny('retrieval_boundary_changed')
    if (state.revoked && state.proofKind === 'device') return deny('retrieval_proof_invalid')
    const request = args.p_request as any, common = { ok: true, version: 1, serverNow: state.serverNow }
    let result: any
    if (name === 'service_retrieval_prepare') {
      state.proofKind = request.proof.kind
      result = { ...common, buildId: fixtureId(40), boundary: state.boundary, checkpoint: state.checkpoint,
        recoveryEnvelope: state.recoveryEnvelope, proofPublicKey: request.proof.kind === 'device' ? b.signPub : first.recoverySignPub }
    } else if (name === 'service_retrieval_source') {
      const rows = request.section === 'rosters' ? state.rosters : state.operations.map(({ ciphertext: _ct, ...op }) => ({ ...op, deviceId: a.id }))
      const selected = rows.slice(request.after, request.after + (request.section === 'rosters' ? 2 : 200))
      result = { ...common, after: request.after, next: request.after + selected.length,
        done: request.after + selected.length === rows.length, rows: selected }
    } else if (name === 'service_retrieval_finalize') {
      state.manifest = request.manifest
      const manifestHash = sha256(canonicalJson(request.manifest))
      const manifest = request.manifest
      const proofBody = { version: 1, purpose: 'retained-copy', environment: config.environment, projectRef: config.projectRef,
        ownerId: identity.ownerId, authSessionId: identity.sessionId, challengeId: fixtureId(41), nonce: 'ab'.repeat(32), manifestHash,
        workspaceId: identity.workspaceId, generation: identity.generation, lifecycleVersion: state.boundary.lifecycleVersion,
        headSeq: manifest.headSeq, headHash: manifest.headHash, checkpointHash: checkpointHash(cpBody), rosterHash: rosters[2].bodyHash,
        retrieveUntil: state.boundary.retrieveUntil, challengeExpiresAt: state.challengeExpiresAt,
        proofKind: manifest.proofKind, deviceId: manifest.deviceId }
      state.challenge = { ...common, kind: 'challenge', manifest, manifestHash, checkpoint: state.checkpoint,
        recoveryEnvelope: state.recoveryEnvelope, proofBody, rosterPage: page(0) }
      result = state.challenge
    } else if (name === 'service_retrieval_continue') {
      if (!state.challenge || request.challengeId !== fixtureId(41)) return deny('retrieval_proof_invalid')
      result = { ...common, kind: 'control', challengeId: fixtureId(41), manifestHash: state.challenge.manifestHash, rosterPage: page(request.afterRosterVersion) }
    } else if (name === 'service_retrieval_authorize') {
      if (!state.challenge || state.consumed || request.challengeId !== fixtureId(41)) return deny('retrieval_proof_invalid')
      const pub = state.proofKind === 'device' ? unhex(b.signPub) : recovery.signPub
      if (!ed25519.verify(unhex(request.signature), referenceProofDigest(state.challenge.proofBody), pub)) return deny('retrieval_proof_invalid')
      state.consumed = true
      result = { ...common, capability: 'cd'.repeat(32), manifestHash: state.challenge.manifestHash, expiresAt: state.expiresAt }
    } else if (name === 'service_retrieval_read') {
      if (!state.consumed || request.capability !== 'cd'.repeat(32)) return deny('retrieval_proof_invalid')
      if (state.expireCapability) return deny('retrieval_capability_expired')
      if (request.afterSeq > count) return deny('invalid_request')
      const rows = state.operations.slice(request.afterSeq, request.afterSeq + 200)
      result = { ...common, manifestHash: state.challenge!.manifestHash, afterSeq: request.afterSeq,
        nextAfterSeq: request.afterSeq + rows.length, operations: rows, done: request.afterSeq + rows.length === count }
    } else throw Error('Unexpected facade')
    return structuredClone(state.mutate ? state.mutate(name, result) : result)
  }
  const authFetch: typeof fetch = async input => {
    if (String(input) !== `${config.url}/auth/v1/user`) throw Error('Unexpected external request')
    return new Response(JSON.stringify(state.authValid ? { id: identity.ownerId } : { error: 'bad_jwt' }), { status: state.authValid ? 200 : 401 })
  }
  return { state, rpc, authFetch, initial: { version: 1, workspaceId: identity.workspaceId, generation: identity.generation, proof: { kind: 'recovery' } },
    deviceId: b.id, sign: (body: unknown, device = false) => hex(ed25519.sign(retrievalProofDigest(body), device ? bSk : recovery.signSk)),
    signMessage: (message: string) => hex(ed25519.sign(utf8(message), recovery.signSk)),
    open: (row: typeof operations[number]) => new TextDecoder('utf-8', { fatal: true }).decode(openOp({ workspaceKey,
      workspaceId: identity.workspaceId, opId: row.opId, epoch: row.keyEpoch, ciphertext: unhex(row.ciphertext) })),
    expectedHeadHash: () => createHash('sha256').update(canonicalJson({ workspaceId: identity.workspaceId, generation: identity.generation,
      headSeq: count, entries: state.operations.map(row => [row.seq, row.opId, row.payloadHash, row.formatVersion, row.keyEpoch]) })).digest('hex'),
  }
}
