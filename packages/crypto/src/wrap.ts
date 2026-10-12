/**
 * [INPUT]: Sender Ed25519 secret, recipient X25519 public, context string and plaintext.
 * [OUTPUT]: C1 envelope. Unwrap verifies the signature against a caller-supplied trusted public key before decrypting.
 * [POS]: Authenticated wrap for workspace keys. Never trust a public key that arrived only from the server.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { ed25519, x25519 } from '@noble/curves/ed25519.js'
import { concat, equal, lp, unhex, wipe } from './bytes'
import { hkdfSha256, sha256Bytes } from './kdf'
import type { RandomSource } from './random'

export interface Envelope {
  v: 1; ctx: string; senderId: string; recipientId: string
  ephPub: string; nonce: string; ct: string; sig: string
}

function header(ctx: string, senderId: string, recipientId: string, ephPub: Uint8Array, recipientBoxPub: Uint8Array): Uint8Array {
  return lp('goalloom/wrap/v1', ctx, senderId, recipientId, ephPub, recipientBoxPub)
}

export function wrap(input: {
  senderId: string; signSk: Uint8Array; recipientId: string; recipientBoxPub: Uint8Array
  ctx: string; plaintext: Uint8Array; random: RandomSource
}): Envelope {
  const ephSk = input.random.bytes(32)
  try {
    const ephPub = x25519.getPublicKey(ephSk)
    const shared = x25519.getSharedSecret(ephSk, input.recipientBoxPub)
    const key = hkdfSha256(shared, concat(ephPub, input.recipientBoxPub), 'goalloom/wrap/v1|key')
    const aad = header(input.ctx, input.senderId, input.recipientId, ephPub, input.recipientBoxPub)
    const nonce = input.random.bytes(24)
    const ct = xchacha20poly1305(key, nonce, aad).encrypt(input.plaintext)
    const sig = ed25519.sign(sha256Bytes(lp(aad, nonce, ct)), input.signSk)
    wipe(shared); wipe(key)
    return {
      v: 1, ctx: input.ctx, senderId: input.senderId, recipientId: input.recipientId,
      ephPub: toHex(ephPub), nonce: toHex(nonce), ct: toHex(ct), sig: toHex(sig),
    }
  } finally { wipe(ephSk) }
}

export function unwrap(envelope: Envelope, input: {
  expectedCtx: string; recipientId: string; boxSk: Uint8Array; senderSignPub: Uint8Array
}): Uint8Array {
  if (envelope.v !== 1 || envelope.ctx !== input.expectedCtx || envelope.recipientId !== input.recipientId) throw new Error('wrap context mismatch')
  const ephPub = unhex(envelope.ephPub), nonce = unhex(envelope.nonce), ct = unhex(envelope.ct), sig = unhex(envelope.sig)
  const recipientBoxPub = x25519.getPublicKey(input.boxSk)
  const aad = header(envelope.ctx, envelope.senderId, envelope.recipientId, ephPub, recipientBoxPub)
  const digest = sha256Bytes(lp(aad, nonce, ct))
  if (!ed25519.verify(sig, digest, input.senderSignPub)) throw new Error('wrap signature rejected')
  const shared = x25519.getSharedSecret(input.boxSk, ephPub)
  const key = hkdfSha256(shared, concat(ephPub, recipientBoxPub), 'goalloom/wrap/v1|key')
  try { return xchacha20poly1305(key, nonce, aad).decrypt(ct) }
  finally { wipe(shared); wipe(key) }
}

function toHex(bytes: Uint8Array): string { return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('') }

export function publicFromSeed(kind: 'ed25519' | 'x25519', seed: Uint8Array): Uint8Array {
  return kind === 'ed25519' ? ed25519.getPublicKey(seed) : x25519.getPublicKey(seed)
}

export function keysEqual(left: Uint8Array, right: Uint8Array): boolean { return equal(left, right) }
