import { unhex } from './bytes'
import { sha1Bytes } from './kdf'

function parseUuid(uuid: string): Uint8Array {
  const bytes = unhex(uuid.replace(/-/g, ''))
  if (bytes.length !== 16) throw new Error('bad uuid')
  return bytes
}

/** RFC 4122 UUID version 5 (SHA-1). Namespace is a UUID string. */
export function uuidv5(name: string, namespace: string): string {
  const hash = sha1Bytes(new Uint8Array([...parseUuid(namespace), ...new TextEncoder().encode(name)]))
  const bytes = hash.slice(0, 16)
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
