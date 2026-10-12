/**
 * [INPUT]: A platform CSPRNG. Noble refuses more than 65536 bytes per call.
 * [OUTPUT]: Key and nonce bytes. Callers wipe secrets after use.
 * [POS]: The only randomness boundary. Mobile installs expo-crypto before importing this package.
 */
export interface RandomSource { bytes(length: number): Uint8Array }

export function assertRandom(source: RandomSource): void {
  const probe = source.bytes(32)
  if (probe.length !== 32) throw new Error('random source unavailable')
  wipeCopy(probe)
}

function wipeCopy(bytes: Uint8Array): void { bytes.fill(0) }

export function systemRandom(): RandomSource {
  const crypto = globalThis.crypto
  if (!crypto?.getRandomValues) throw new Error('random source unavailable')
  return { bytes(length: number) {
    if (length < 1 || length > 65536) throw new RangeError('random bytes must be 1..65536')
    const out = new Uint8Array(length)
    crypto.getRandomValues(out)
    return out
  } }
}

/** Deterministic stream for test vectors. Not a CSPRNG. */
export function counterRandom(seed: Uint8Array): RandomSource {
  let counter = 0
  return { bytes(length: number) {
    const out = new Uint8Array(length)
    for (let index = 0; index < length; index++) out[index] = (seed[(index + counter) % seed.length] ?? 0) ^ ((counter + index) & 0xff)
    counter = (counter + length) & 0xff
    return out
  } }
}
