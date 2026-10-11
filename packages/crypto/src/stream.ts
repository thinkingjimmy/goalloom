/**
 * [INPUT]: Workspace key and a snapshot or blob byte string.
 * [OUTPUT]: Chunked XChaCha20-Poly1305. Chunk i uses nonce = base(16) ‖ u32(i) ‖ u32(last).
 * [POS]: C4. Truncation, reordering and a swapped uptoSeq or blob id fail closed.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { concat, lp, u32, utf8, wipe } from './bytes'
import { hkdfSha256 } from './kdf'
import type { RandomSource } from './random'

export const chunkSize = 64 * 1024

function streamKey(workspaceKey: Uint8Array, kind: 'snap' | 'blob'): Uint8Array {
  return hkdfSha256(workspaceKey, new Uint8Array(), kind === 'snap' ? 'goalloom/snap/v1|key' : 'goalloom/blob/v1|key')
}

function chunkAad(kind: 'snap' | 'blob', workspaceId: string, objectId: string, epoch: number, index: number, last: boolean): Uint8Array {
  const domain = kind === 'snap' ? 'goalloom/snap/v1' : 'goalloom/blob/v1'
  return lp(domain, workspaceId, objectId, u32(epoch), u32(index), u32(last ? 1 : 0))
}

export function sealStream(input: {
  kind: 'snap' | 'blob'; workspaceKey: Uint8Array; workspaceId: string; objectId: string; epoch: number
  plaintext: Uint8Array; random: RandomSource
}): Uint8Array {
  const key = streamKey(input.workspaceKey, input.kind)
  const base = input.random.bytes(16)
  try {
    const chunks: Uint8Array[] = [base]
    const count = Math.max(1, Math.ceil(input.plaintext.length / chunkSize))
    for (let index = 0; index < count; index++) {
      const start = index * chunkSize
      const block = input.plaintext.slice(start, start + chunkSize)
      const last = index === count - 1
      const nonce = concat(base, u32(index), u32(last ? 1 : 0))
      chunks.push(xchacha20poly1305(key, nonce, chunkAad(input.kind, input.workspaceId, input.objectId, input.epoch, index, last)).encrypt(block))
    }
    return concat(...chunks)
  } finally { wipe(key) }
}

export function openStream(input: {
  kind: 'snap' | 'blob'; workspaceKey: Uint8Array; workspaceId: string; objectId: string; epoch: number; ciphertext: Uint8Array
}): Uint8Array {
  if (input.ciphertext.length < 16) throw new Error('stream truncated')
  const key = streamKey(input.workspaceKey, input.kind)
  const base = input.ciphertext.slice(0, 16)
  try {
    const body = input.ciphertext.slice(16)
    const parts: Uint8Array[] = []
    let offset = 0
    let index = 0
    while (offset < body.length) {
      const rest = body.length - offset
      const take = Math.min(chunkSize + 16, rest)
      if (take < 16) throw new Error('stream truncated')
      const last = offset + take === body.length
      const nonce = concat(base, u32(index), u32(last ? 1 : 0))
      parts.push(xchacha20poly1305(key, nonce, chunkAad(input.kind, input.workspaceId, input.objectId, input.epoch, index, last)).decrypt(body.slice(offset, offset + take)))
      offset += take
      index++
    }
    if (!parts.length) throw new Error('stream truncated')
    return concat(...parts)
  } finally { wipe(key) }
}

export function sealSnapshot(input: Omit<Parameters<typeof sealStream>[0], 'kind' | 'objectId'> & { uptoSeq: number }): Uint8Array {
  return sealStream({ ...input, kind: 'snap', objectId: String(input.uptoSeq) })
}
export function openSnapshot(input: Omit<Parameters<typeof openStream>[0], 'kind' | 'objectId'> & { uptoSeq: number }): Uint8Array {
  return openStream({ ...input, kind: 'snap', objectId: String(input.uptoSeq) })
}

export function pairingCode(input: { nonce: Uint8Array; newSignPub: Uint8Array; newBoxPub: Uint8Array; approverSignPub: Uint8Array; rosterHash: string; workspaceId: string; epoch: number }): string {
  const digest = hkdfSha256(input.nonce, lp(input.newSignPub, input.newBoxPub, input.approverSignPub, input.rosterHash, input.workspaceId, u32(input.epoch)), 'goalloom/pair/v2', 4)
  const value = new DataView(digest.buffer, digest.byteOffset, 4).getUint32(0) % 1_000_000
  return value.toString().padStart(6, '0')
}

export function utf8Bytes(value: string): Uint8Array { return utf8(value) }
