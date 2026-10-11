import { getRandomValues } from 'expo-crypto'

const current = globalThis.crypto
if (!current || typeof current.getRandomValues !== 'function') {
  const crypto = current ?? {}
  crypto.getRandomValues = getRandomValues
  if (!globalThis.crypto) globalThis.crypto = crypto
}
