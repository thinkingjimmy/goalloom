import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { sha1 } from '@noble/hashes/legacy.js'
import { utf8 } from './bytes'

export function sha256Bytes(data: Uint8Array): Uint8Array { return sha256(data) }
export function sha256Hex(data: Uint8Array | string): string {
  const digest = sha256(typeof data === 'string' ? utf8(data) : data)
  return [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
export function hkdfSha256(ikm: Uint8Array, salt: Uint8Array, info: string, length = 32): Uint8Array {
  return hkdf(sha256, ikm, salt, utf8(info), length)
}
export function sha1Bytes(data: Uint8Array): Uint8Array { return sha1(data) }
