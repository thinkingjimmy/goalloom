/**
 * [INPUT]: Workspace key, epoch and canonical SyncOp bytes.
 * [OUTPUT]: nonce ‖ XChaCha20-Poly1305 ciphertext. AAD binds workspace, op id and epoch.
 * [POS]: C3. Re-encrypting for a new epoch does not change the payload or its hash.
 */
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { concat, lp, u32, wipe } from './bytes'
import { hkdfSha256 } from './kdf'
import type { RandomSource } from './random'

export function opKey(workspaceKey: Uint8Array): Uint8Array {
  return hkdfSha256(workspaceKey, new Uint8Array(), 'goalloom/op/v1|key')
}

function aad(workspaceId: string, opId: string, epoch: number): Uint8Array {
  return lp('goalloom/op/v1', workspaceId, opId, u32(epoch))
}

export function sealOp(input: { workspaceKey: Uint8Array; workspaceId: string; opId: string; epoch: number; plaintext: Uint8Array; random: RandomSource }): Uint8Array {
  const key = opKey(input.workspaceKey)
  try {
    const nonce = input.random.bytes(24)
    return concat(nonce, xchacha20poly1305(key, nonce, aad(input.workspaceId, input.opId, input.epoch)).encrypt(input.plaintext))
  } finally { wipe(key) }
}

export function openOp(input: { workspaceKey: Uint8Array; workspaceId: string; opId: string; epoch: number; ciphertext: Uint8Array }): Uint8Array {
  if (input.ciphertext.length < 24 + 16) throw new Error('op ciphertext truncated')
  const key = opKey(input.workspaceKey)
  try {
    const nonce = input.ciphertext.slice(0, 24)
    return xchacha20poly1305(key, nonce, aad(input.workspaceId, input.opId, input.epoch)).decrypt(input.ciphertext.slice(24))
  } finally { wipe(key) }
}
