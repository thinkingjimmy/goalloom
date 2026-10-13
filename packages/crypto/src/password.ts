/**
 * [INPUT]: A user password and the salt stored with the recovery envelope.
 * [OUTPUT]: A 32-byte key-encryption key, and a sealed copy of the random recovery keypair.
 * [POS]: The only password secret. Argon2id parameters are chosen so a phone finishes in about a second.
 * Measured on this Linux x86_64 VM: m=8192 (8 MiB), t=2, p=1 took about 100ms. A larger RFC 9106
 * profile (19 MiB) was about 180ms here and can pass one second in pure JS on a phone.
 */
import { argon2idAsync } from '@noble/hashes/argon2.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js'
import { concat, hex, unhex, utf8, wipe } from './bytes'
import type { RandomSource } from './random'
import { publicFromSeed } from './wrap'
import type { RecoverySecrets } from './recovery'

export const syncPasswordKdf = { alg: 'argon2id' as const, m: 8192, t: 2, p: 1, dkLen: 32 }

export interface SyncKdfParams { alg: 'argon2id'; salt: string; m: number; t: number; p: number }

export function normalizePassword(password: string): string { return password.trim() }

export function passwordAccepted(password: string): boolean {
  const text = normalizePassword(password)
  return text.length >= 8 && text.length <= 128
}

export async function deriveSyncKek(password: string, params: SyncKdfParams): Promise<Uint8Array> {
  if (!passwordAccepted(password)) throw new Error('password rejected')
  if (params.alg !== 'argon2id' || params.p !== 1 || params.t < 1 || params.t > 4 || params.m < 8192 || params.m > 65536) throw new Error('kdf rejected')
  if (unhex(params.salt).length !== 16) throw new Error('kdf rejected')
  return argon2idAsync(normalizePassword(password), unhex(params.salt), { m: params.m, t: params.t, p: params.p, dkLen: syncPasswordKdf.dkLen })
}

export interface RecoveryLock { kdf: SyncKdfParams; lock: string }

export async function sealRecoveryLock(input: {
  password: string; workspaceId: string; secrets: RecoverySecrets; random: RandomSource
}): Promise<RecoveryLock> {
  const kdf: SyncKdfParams = { alg: 'argon2id', salt: hex(input.random.bytes(16)), m: syncPasswordKdf.m, t: syncPasswordKdf.t, p: syncPasswordKdf.p }
  const kek = await deriveSyncKek(input.password, kdf)
  try {
    const nonce = input.random.bytes(24)
    const ct = xchacha20poly1305(kek, nonce, utf8(`goalloom/recovery-lock/v1|${input.workspaceId}`)).encrypt(concat(input.secrets.boxSk, input.secrets.signSk))
    return { kdf, lock: hex(concat(nonce, ct)) }
  } finally { wipe(kek) }
}

export async function openRecoveryLock(input: { password: string; workspaceId: string; lock: RecoveryLock }): Promise<RecoverySecrets> {
  const kek = await deriveSyncKek(input.password, input.lock.kdf)
  try {
    const packed = unhex(input.lock.lock)
    const plain = xchacha20poly1305(kek, packed.slice(0, 24), utf8(`goalloom/recovery-lock/v1|${input.workspaceId}`)).decrypt(packed.slice(24))
    if (plain.length !== 64) throw new Error('recovery lock rejected')
    const boxSk = plain.slice(0, 32)
    const signSk = plain.slice(32)
    return { boxSk, signSk, boxPub: publicFromSeed('x25519', boxSk), signPub: publicFromSeed('ed25519', signSk) }
  } catch (error) {
    if (error instanceof Error && (error.message === 'password rejected' || error.message === 'kdf rejected')) throw error
    throw new Error('recovery lock rejected')
  } finally { wipe(kek) }
}
