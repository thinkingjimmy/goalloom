/**
 * [INPUT]: Local start choices and the sync phase. The password stays out of this decision.
 * [OUTPUT]: Which first-run screen is showing. A joining device never selects setup.
 * [POS]: Pure branch for the onboarding entry. App still hides this once setupConfirmedAt exists.
 */
import type { SyncStatus } from '../../../shared/contracts/sync'

export type StartScreen = 'choice' | 'waiting' | 'join' | 'syncing' | 'password' | 'setup'

export function startScreen(input: {
  direct: boolean
  passwordReady: boolean
  joining: boolean
  phase: SyncStatus['phase'] | null
  error: SyncStatus['error'] | null
}): StartScreen {
  if (input.direct || input.phase === 'account') return 'setup'
  if (input.passwordReady && input.phase === 'setup') return 'setup'
  if (input.phase === 'ready' || (input.joining && input.error !== 'password' && input.phase !== 'choose')) return 'syncing'
  if (input.phase === 'signing-in') return 'waiting'
  if (input.phase === 'enter-key' || input.phase === 'choose') return 'join'
  if (input.phase === 'setup') return 'password'
  return 'choice'
}

export function passwordReady(password: string, again: string): boolean {
  const text = password.trim()
  return text.length >= 8 && text.length <= 128 && text === again.trim()
}
