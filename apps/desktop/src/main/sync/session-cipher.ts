/**
 * [INPUT]: A private profile, noninteractive native session keys and the existing Windows OS cipher.
 * [OUTPUT]: A profile-bound authenticated cipher; missing native access fails without replacing keys.
 * [POS]: Sync-only persistent session encryption. AI credentials and legacy ciphertext keep their existing adapters.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { protectedSessionKey } from '../keychain'
import { CredentialError, type Cipher } from '../smart/credentials'
import { openLocal, sealLocal } from './sealed-file'

export function sessionCipher(directory: string, otherPlatform: Cipher): Cipher {
  if (process.platform !== 'darwin') return otherPlatform
  const scope = createHash('sha256').update(resolve(directory)).digest('hex')
  const context = `session|${scope}`, header = Buffer.from('Goalloom protected session 1\n')
  function key(create: boolean): Buffer | null {
    try { return protectedSessionKey(scope, create) }
    catch { throw new CredentialError('unavailable') }
  }
  return {
    available: () => { try { const value = key(false); value?.fill(0); return true } catch { return false } },
    encrypt: text => {
      const value = key(true)
      if (!value) throw new CredentialError('unavailable')
      const plain = Buffer.from(text)
      try { return Buffer.concat([header, sealLocal(value, context, plain)]) }
      finally { value.fill(0); plain.fill(0) }
    },
    decrypt: bytes => {
      if (!bytes.subarray(0, header.length).equals(header)) throw Error('Invalid protected session')
      const value = key(false)
      if (!value) throw new CredentialError('unavailable')
      try {
        const plain = openLocal(value, context, bytes.subarray(header.length))
        try { return plain.toString() } finally { plain.fill(0) }
      } finally { value.fill(0) }
    },
  }
}
