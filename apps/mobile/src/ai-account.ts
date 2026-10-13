/**
 * [INPUT]: A verified provider key, or the previously stored blob.
 * [OUTPUT]: The connected provider, with the key written only to the platform secret store.
 * [POS]: Device credential for AI connect. iOS uses the Keychain. The workspace database never sees the key.
 */
import * as SecureStore from 'expo-secure-store'
import { parseAiCredential, serializeAiCredential, type AiConnection, type AiCredential } from '@goalloom/local-store'

const KEY = 'goalloom.ai'
const memory = new Map<string, string>()

async function available(): Promise<boolean> {
  try { return await SecureStore.isAvailableAsync() } catch { return false }
}

async function readRaw(): Promise<string | null> {
  if (!(await available())) return memory.get(KEY) ?? null
  return SecureStore.getItemAsync(KEY)
}

export async function loadAiConnection(): Promise<AiConnection | null> {
  try {
    const parsed = parseAiCredential(await readRaw())
    return parsed ? { provider: parsed.provider } : null
  } catch {
    return null
  }
}

export async function saveAiConnection(value: AiCredential): Promise<AiConnection> {
  const raw = serializeAiCredential(value)
  if (await available()) {
    await SecureStore.setItemAsync(KEY, raw, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY })
  } else memory.set(KEY, raw)
  return { provider: value.provider }
}

export async function clearAiConnection(): Promise<void> {
  if (await available()) await SecureStore.deleteItemAsync(KEY)
  else memory.delete(KEY)
}
