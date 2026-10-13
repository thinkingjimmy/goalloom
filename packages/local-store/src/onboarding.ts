/**
 * [INPUT]: A calendar mode and a pair of sync-password drafts.
 * [OUTPUT]: Whether the rolling start date is shown, and whether a new sync password can be accepted.
 * [POS]: Shared onboarding decisions. No React Native and no network.
 */

export function calendarAnchorVisible(mode: 'rolling' | 'natural'): boolean {
  return mode === 'rolling'
}

/** A new sync password is 8–128 trimmed characters and matches the second entry. */
export function syncPasswordReady(password: string, again: string): boolean {
  const text = password.trim()
  return text.length >= 8 && text.length <= 128 && text === again.trim()
}
