/**
 * [INPUT]: A pref.set value or a SyncOp that may contain an API key.
 * [OUTPUT]: The same value with a secret key replaced by sha256:<hex>. Null stays null. A fingerprint is left as-is.
 * [POS]: The workspace file stores a fingerprint. The OS keychain stores the key. Sealing restores the key in memory.
 */
import { isSecretFingerprint, isSecretSettingKey, type SyncOp } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'

export function secretFingerprint(value: string): string {
  return `sha256:${sha256Hex(value)}`
}

export function persistedSecret(value: unknown): unknown {
  if (typeof value !== 'string' || isSecretFingerprint(value)) return value
  return secretFingerprint(value)
}

export function redactSyncOp(op: SyncOp): SyncOp {
  const actions = op.actions.map(action => {
    if (action.t !== 'pref.set' || !isSecretSettingKey(action.key)) return action
    const value = persistedSecret(action.value)
    if (value === action.value) return action
    return { ...action, value: value as string | null }
  })
  if (actions.every((action, index) => action === op.actions[index])) return op
  return { ...op, actions }
}
