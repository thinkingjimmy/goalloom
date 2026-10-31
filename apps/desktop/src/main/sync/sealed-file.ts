/**
 * [INPUT]: A secret 32-byte key, a purpose/account scope and local bytes.
 * [OUTPUT]: Authenticated local ciphertext with a fresh nonce and a domain-separated key.
 * [POS]: Session/password-vault and send-journal protection. Keys never enter SQLite or file metadata.
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { hkdfSha256, wipe } from '@goalloom/crypto'

export function sealLocal(secret: Uint8Array, context: string, plain: Uint8Array): Buffer {
  if (secret.length !== 32) throw Error('Invalid protected key')
  const key = hkdfSha256(secret, new Uint8Array(), `goalloom/local/v1|${context}`)
  try {
    const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key, nonce)
    cipher.setAAD(Buffer.from(context))
    const bytes = Buffer.concat([cipher.update(plain), cipher.final()])
    return Buffer.concat([nonce, cipher.getAuthTag(), bytes])
  } finally { wipe(key) }
}

export function openLocal(secret: Uint8Array, context: string, bytes: Uint8Array): Buffer {
  if (secret.length !== 32 || bytes.length < 28) throw Error('Invalid protected file')
  const key = hkdfSha256(secret, new Uint8Array(), `goalloom/local/v1|${context}`)
  try {
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
    cipher.setAAD(Buffer.from(context)); cipher.setAuthTag(bytes.subarray(12, 28))
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()])
  } finally { wipe(key) }
}
