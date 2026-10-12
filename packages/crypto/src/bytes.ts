export function utf8(value: string): Uint8Array { return new TextEncoder().encode(value) }
export function hex(bytes: Uint8Array): string { return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('') }
export function unhex(value: string): Uint8Array {
  if (value.length % 2 !== 0 || /[^0-9a-f]/i.test(value)) throw new Error('bad hex')
  const out = new Uint8Array(value.length / 2)
  for (let index = 0; index < out.length; index++) out[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  return out
}
export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) { out.set(part, offset); offset += part.length }
  return out
}
export function u32(value: number): Uint8Array {
  const bytes = new Uint8Array(4)
  new DataView(bytes.buffer).setUint32(0, value, false)
  return bytes
}
/** Length-prefix each segment with a 4-byte big-endian length. */
export function lp(...parts: Array<Uint8Array | string>): Uint8Array {
  return concat(...parts.map(part => {
    const bytes = typeof part === 'string' ? utf8(part) : part
    return concat(u32(bytes.length), bytes)
  }))
}
export function wipe(bytes: Uint8Array | null | undefined): void { bytes?.fill(0) }
export function equal(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false
  let diff = 0
  for (let index = 0; index < left.length; index++) diff |= (left[index] ?? 0) ^ (right[index] ?? 0)
  return diff === 0
}
