/**
 * [INPUT]: Pinned vectors in test/vectors.json and two fixed SyncOps.
 * [OUTPUT]: A UTF-8 transcript and its SHA-256. No clock and no randomness.
 * [POS]: The byte string Node and Hermes both print. A mismatch is a failed parity check.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { parseSyncOp, syncOpPayload } from '@goalloom/contracts'
import { hex, unhex } from './bytes'
import { sha256Hex } from './kdf'
import { openOp } from './op'
import { openSnapshot } from './stream'
import { uuidv5 } from './uuid'
import { unwrap, type Envelope } from './wrap'
import vectors from '../test/vectors.json'

const syncOps = [
  {
    v: 1,
    opId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    deviceId: 'device-a',
    at: '2026-09-23T02:00:00.000Z',
    actions: [{ t: 'item.set', id: 'item-1', fields: { dueDate: null, title: 'offline' } }],
  },
  {
    at: '2026-09-23T02:00:00.000Z',
    deviceId: 'device-b',
    v: 1,
    opId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    actions: [{
      reason: 'arrange',
      sortHint: { beforeId: 'item-1', afterId: null },
      periodKey: null,
      horizon: 'later',
      id: 'item-2',
      t: 'item.place',
    }],
  },
] as const

/** One labeled line per pinned output, then canonical JSON and payloadHash for each SyncOp. */
export function parityTranscript(): string {
  const lines: string[] = []
  const secret = unhex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60')
  lines.push(`ed25519.pub ${hex(ed25519.getPublicKey(secret))}`)
  lines.push(`ed25519.sig ${hex(ed25519.sign(new Uint8Array(), secret))}`)
  const alice = unhex('77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a')
  const bobPub = unhex('de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f')
  lines.push(`x25519.shared ${hex(x25519.getSharedSecret(alice, bobPub))}`)
  const okm = hkdf(sha256, unhex('0b'.repeat(22)), unhex('000102030405060708090a0b0c'), unhex('f0f1f2f3f4f5f6f7f8f9'), 42)
  lines.push(`hkdf.okm ${hex(okm)}`)
  const x = vectors.xchacha
  lines.push(`xchacha.ct ${hex(xchacha20poly1305(unhex(x.key), unhex(x.nonce), unhex(x.aad)).encrypt(unhex(x.pt)))}`)
  const c1 = vectors.c1
  lines.push(`c1.pt ${hex(unwrap(c1.envelope as Envelope, { expectedCtx: c1.ctx, recipientId: c1.recipientId, boxSk: unhex(c1.boxSk), senderSignPub: unhex(c1.signPub) }))}`)
  lines.push(`op.pt ${hex(openOp({ workspaceKey: unhex(vectors.op.key), workspaceId: vectors.op.workspaceId, opId: vectors.op.opId, epoch: vectors.op.epoch, ciphertext: unhex(vectors.op.ct) }))}`)
  lines.push(`snap.pt ${hex(openSnapshot({ workspaceKey: unhex(vectors.snap.key), workspaceId: vectors.snap.workspaceId, uptoSeq: vectors.snap.uptoSeq, epoch: vectors.snap.epoch, ciphertext: unhex(vectors.snap.ct) }))}`)
  lines.push(`uuidv5 ${uuidv5('rollover:item:week:2026-09-21@0:week:2026-09-28', '11111111-1111-4111-8111-111111111111')}`)
  for (const raw of syncOps) {
    const payload = syncOpPayload(parseSyncOp(raw))
    lines.push(`canon ${payload}`)
    lines.push(`hash ${sha256Hex(payload)}`)
  }
  return lines.join('\n')
}

/** SHA-256 of parityTranscript(). Compare this hex across Node and Hermes. */
export function parityDigest(): string {
  return sha256Hex(parityTranscript())
}
