import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { describe, expect, it } from 'vitest'
import { canonicalJson } from '@goalloom/contracts'
import {
  counterRandom, deriveRecovery, generateRecoveryMnemonic, hex, openOp, openSnapshot, qrMatchesHead, rosterHash,
  sealOp, sealSnapshot, signCheckpoint, signRoster, systemRandom, unhex, unwrap, uuidv5, verifyRecoveryJoin,
  verifyRosterExtension, wipeRecovery, wrap, type Envelope, type RosterBody,
} from '@goalloom/crypto'
import vectors from '../../packages/crypto/test/vectors.json'

const utf8 = (value: string) => new TextEncoder().encode(value)

describe('pinned primitive vectors', () => {
  it('RFC 8032 Ed25519, RFC 7748 X25519 and RFC 5869 HKDF', () => {
    const secret = unhex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
    expect(hex(ed25519.getPublicKey(secret))).toBe('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')
    expect(hex(ed25519.sign(new Uint8Array(), secret))).toBe('e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b')
    const alice = unhex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a')
    const bobPub = unhex('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f')
    expect(hex(x25519.getSharedSecret(alice, bobPub))).toBe('4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742')
    const okm = hkdf(sha256, unhex('0b'.repeat(22)), unhex('000102030405060708090a0b0c'), unhex('f0f1f2f3f4f5f6f7f8f9'), 42)
    expect(hex(okm)).toBe('3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865')
  })

  it('draft XChaCha20-Poly1305 vector and our C1–C4 fixtures match byte for byte', () => {
    const x = vectors.xchacha
    const cipher = xchacha20poly1305(unhex(x.key), unhex(x.nonce), unhex(x.aad))
    expect(hex(cipher.encrypt(unhex(x.pt)))).toBe(x.ct)
    const c1 = vectors.c1
    const opened = unwrap(c1.envelope as Envelope, { expectedCtx: c1.ctx, recipientId: c1.recipientId, boxSk: unhex(c1.boxSk), senderSignPub: unhex(c1.signPub) })
    expect(hex(opened)).toBe(c1.pt)
    expect(hex(openOp({ workspaceKey: unhex(vectors.op.key), workspaceId: vectors.op.workspaceId, opId: vectors.op.opId, epoch: vectors.op.epoch, ciphertext: unhex(vectors.op.ct) }))).toBe(vectors.op.pt)
    expect(hex(openSnapshot({ workspaceKey: unhex(vectors.snap.key), workspaceId: vectors.snap.workspaceId, uptoSeq: vectors.snap.uptoSeq, epoch: vectors.snap.epoch, ciphertext: unhex(vectors.snap.ct) }))).toBe(vectors.snap.pt)
  })
})

describe('C1–C4 and trust anchors', () => {
  const random = () => counterRandom(unhex('11'.repeat(32)))
  const sender = ed25519.utils.randomSecretKey()
  const recipient = x25519.utils.randomSecretKey()
  const signPub = ed25519.getPublicKey(sender)
  const boxPub = x25519.getPublicKey(recipient)

  it('rejects tampered ciphertext, wrong recipient, ctx and an unlisted sender', () => {
    const envelope = wrap({ senderId: 'dev', signSk: sender, recipientId: 'bob', recipientBoxPub: boxPub, ctx: 'wk|ws|1', plaintext: utf8('wk'), random: random() })
    expect(new TextDecoder().decode(unwrap(envelope, { expectedCtx: 'wk|ws|1', recipientId: 'bob', boxSk: recipient, senderSignPub: signPub }))).toBe('wk')
    const tampered = { ...envelope, ct: `${envelope.ct.slice(0, -2)}00` }
    expect(() => unwrap(tampered, { expectedCtx: 'wk|ws|1', recipientId: 'bob', boxSk: recipient, senderSignPub: signPub })).toThrow()
    expect(() => unwrap(envelope, { expectedCtx: 'wk|ws|2', recipientId: 'bob', boxSk: recipient, senderSignPub: signPub })).toThrow()
    expect(() => unwrap(envelope, { expectedCtx: 'wk|ws|1', recipientId: 'bob', boxSk: x25519.utils.randomSecretKey(), senderSignPub: signPub })).toThrow()
    expect(() => unwrap(envelope, { expectedCtx: 'wk|ws|1', recipientId: 'bob', boxSk: recipient, senderSignPub: ed25519.getPublicKey(ed25519.utils.randomSecretKey()) })).toThrow()
  })

  it('derives recovery keys per workspace and opens a wrap made without the phrase', () => {
    const phrase = generateRecoveryMnemonic()
    const first = deriveRecovery(phrase, 'ws-1')
    const again = deriveRecovery(phrase, 'ws-1')
    expect(hex(first.signPub)).toBe(hex(again.signPub))
    const other = deriveRecovery(phrase, 'ws-2')
    expect(hex(other.signPub)).not.toBe(hex(first.signPub))
    expect(() => deriveRecovery('abandon '.repeat(23) + 'abandon', 'ws-1')).toThrow()
    const envelope = wrap({ senderId: 'dev', signSk: sender, recipientId: 'recovery', recipientBoxPub: first.boxPub, ctx: 'wk|ws-1|2', plaintext: utf8('next'), random: systemRandom() })
    expect(new TextDecoder().decode(unwrap(envelope, { expectedCtx: 'wk|ws-1|2', recipientId: 'recovery', boxSk: again.boxSk, senderSignPub: signPub }))).toBe('next')
    wipeRecovery(first); wipeRecovery(again); wipeRecovery(other)
  })

  it('signs the domain-separated roster digest pinned for bootstrap_workspace', () => {
    const body: RosterBody = {
      workspaceId: '11111111-1111-4111-8111-111111111111', version: 1, epoch: 1, prevHash: null,
      devices: [{ id: 'dev', signPub: 'bb', boxPub: 'aa' }], recoverySignPub: 'dd', recoveryBoxPub: 'cc',
    }
    expect(canonicalJson(body)).toBe('{"devices":[{"boxPub":"aa","id":"dev","signPub":"bb"}],"epoch":1,"prevHash":null,"recoveryBoxPub":"cc","recoverySignPub":"dd","version":1,"workspaceId":"11111111-1111-4111-8111-111111111111"}')
    expect(hex(signRoster(body, new Uint8Array(32).fill(0x42)))).toBe('0a92e4dedfc06749fcd95129ef6f54f20a9e72b5de577b7d57d9cddcb1e0a95449cb5a42c924b88d12fe0e09534de40730eae92259d3f30bc302d43ef098a30d')
  })

  it('rejects a broken roster chain, a forged self-signed head, and a copied recovery public key', () => {
    const body = (version: number, prevHash: string | null, recovery = hex(signPub)): RosterBody => ({
      workspaceId: '11111111-1111-4111-8111-111111111111', version, epoch: 1, prevHash, devices: [{ id: 'dev', signPub: hex(signPub), boxPub: hex(boxPub) }], recoverySignPub: recovery, recoveryBoxPub: hex(boxPub),
    })
    const v1 = body(1, null)
    const v2 = body(2, rosterHash(v1))
    expect(() => verifyRosterExtension(v1, { body: v2, signature: signRoster(v2, sender), signerId: 'dev' })).not.toThrow()
    expect(() => verifyRosterExtension(v1, { body: v2, signature: signRoster(v2, ed25519.utils.randomSecretKey()), signerId: 'intruder' })).toThrow()
    const forged = body(2, '00'.repeat(32))
    expect(() => verifyRosterExtension(v1, { body: forged, signature: signRoster(forged, sender), signerId: 'dev' })).toThrow()
    const anchor = { workspaceId: v1.workspaceId, epoch: 1, rosterVersion: 1, rosterHash: rosterHash(v1), approverDeviceId: 'dev', approverSignPub: hex(signPub) }
    expect(qrMatchesHead(anchor, v1)).toBe(true)
    expect(qrMatchesHead(anchor, body(1, null, hex(ed25519.getPublicKey(ed25519.utils.randomSecretKey()))))).toBe(false)
    const phrase = generateRecoveryMnemonic()
    const secrets = deriveRecovery(phrase, v1.workspaceId)
    const checkpoint = { workspaceId: v1.workspaceId, cpVersion: 1, rosterVersion: 1, rosterHash: rosterHash(v1), epoch: 1, recoverySignPub: hex(secrets.signPub), recoveryBoxPub: hex(secrets.boxPub), prevCpHash: null }
    const realRoster = { ...v1, recoverySignPub: hex(secrets.signPub), recoveryBoxPub: hex(secrets.boxPub) }
    const realCp = { ...checkpoint, rosterHash: rosterHash(realRoster) }
    verifyRecoveryJoin({ mnemonic: phrase, workspaceId: v1.workspaceId, checkpoint: realCp, recSig: signCheckpoint(realCp, secrets.signSk), devSig: signCheckpoint(realCp, sender), roster: realRoster })
    const copied = { ...realRoster, devices: [{ id: 'evil', signPub: hex(ed25519.getPublicKey(ed25519.utils.randomSecretKey())), boxPub: hex(boxPub) }] }
    const copiedCp = { ...realCp, rosterHash: rosterHash(copied) }
    expect(() => verifyRecoveryJoin({ mnemonic: phrase, workspaceId: v1.workspaceId, checkpoint: copiedCp, recSig: signCheckpoint(copiedCp, secrets.signSk), devSig: signCheckpoint(copiedCp, sender), roster: copied })).toThrow()
    expect(() => verifyRecoveryJoin({ mnemonic: phrase, workspaceId: '22222222-2222-4222-8222-222222222222', checkpoint: realCp, recSig: signCheckpoint(realCp, secrets.signSk), devSig: signRoster(realRoster, sender), roster: realRoster })).toThrow()
    wipeRecovery(secrets)
  })

  it('op and snapshot AAD reject swapped ids, epochs, truncation and reordered blocks', () => {
    const key = unhex('22'.repeat(32))
    const ct = sealOp({ workspaceKey: key, workspaceId: 'ws', opId: '11111111-1111-4111-8111-111111111111', epoch: 1, plaintext: utf8('hello'), random: random() })
    expect(new TextDecoder().decode(openOp({ workspaceKey: key, workspaceId: 'ws', opId: '11111111-1111-4111-8111-111111111111', epoch: 1, ciphertext: ct }))).toBe('hello')
    expect(() => openOp({ workspaceKey: key, workspaceId: 'ws', opId: '22222222-2222-4222-8222-222222222222', epoch: 1, ciphertext: ct })).toThrow()
    expect(() => openOp({ workspaceKey: key, workspaceId: 'other', opId: '11111111-1111-4111-8111-111111111111', epoch: 1, ciphertext: ct })).toThrow()
    expect(() => openOp({ workspaceKey: key, workspaceId: 'ws', opId: '11111111-1111-4111-8111-111111111111', epoch: 2, ciphertext: ct })).toThrow()
    expect(() => openOp({ workspaceKey: unhex('33'.repeat(32)), workspaceId: 'ws', opId: '11111111-1111-4111-8111-111111111111', epoch: 1, ciphertext: ct })).toThrow()
    const snap = sealSnapshot({ workspaceKey: key, workspaceId: 'ws', uptoSeq: 4, epoch: 1, plaintext: utf8('x'.repeat(70_000)), random: random() })
    expect(openSnapshot({ workspaceKey: key, workspaceId: 'ws', uptoSeq: 4, epoch: 1, ciphertext: snap }).length).toBe(70_000)
    expect(() => openSnapshot({ workspaceKey: key, workspaceId: 'ws', uptoSeq: 5, epoch: 1, ciphertext: snap })).toThrow()
    expect(() => openSnapshot({ workspaceKey: key, workspaceId: 'ws', uptoSeq: 4, epoch: 1, ciphertext: snap.slice(0, -8) })).toThrow()
  })

  it('uuid v5 is stable', () => {
    expect(uuidv5('rollover:item:week:2026-09-21@0:week:2026-09-28', '11111111-1111-4111-8111-111111111111')).toBe(vectors.uuid)
  })
})
