/**
 * [INPUT]: A calendar mode, a start date against workspace today, and a pair of sync-password drafts.
 * [OUTPUT]: Whether the rolling start date is shown, whether a date is an allowed anchor, a month grid, whether a new sync password can be accepted, and the sign-in button order.
 * [POS]: Shared onboarding decisions. No React Native and no network.
 */

export function calendarAnchorVisible(mode: 'rolling' | 'natural'): boolean {
  return mode === 'rolling'
}

/**
 * Rolling start date. Same bound as the desktop `<input type="date" max={today}>`:
 * today or any earlier civil date, never a future one.
 */
export function clampAnchorDate(value: string, today: string): string {
  return value > today ? today : value
}

export function anchorDateAllowed(value: string, today: string): boolean {
  return value <= today
}

/** Apple stays first so a later enable renders it above Google, per the Apple HIG. */
export const SIGN_IN_PROVIDERS = ['apple', 'google'] as const
export type SignInProvider = (typeof SIGN_IN_PROVIDERS)[number]

export function signInButtons(enabled: readonly SignInProvider[]): SignInProvider[] {
  return SIGN_IN_PROVIDERS.filter(id => enabled.includes(id))
}

/** Sunday for English, Monday for the other shipped locales. Matches a localized calendar, not the board week-start setting. */
export function calendarWeekStart(locale: 'zh' | 'en' | 'ja' | 'es' | 'fr'): 0 | 1 {
  return locale === 'en' ? 0 : 1
}

export interface MonthCell { ymd: string; inMonth: boolean; allowed: boolean }

/** One month, padded to whole weeks. `month` is 1–12. Days after `today` are not allowed. */
export function monthGrid(year: number, month: number, today: string, weekStartsOn: 0 | 1): MonthCell[] {
  const leading = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() - weekStartsOn + 7) % 7
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const total = Math.ceil((leading + days) / 7) * 7
  const cells: MonthCell[] = []
  for (let index = 0; index < total; index += 1) {
    const date = new Date(Date.UTC(year, month - 1, 1 - leading + index))
    const ymd = formatUtc(date)
    cells.push({ ymd, inMonth: index >= leading && index < leading + days, allowed: anchorDateAllowed(ymd, today) })
  }
  return cells
}

function formatUtc(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/** A new sync password is 8–128 trimmed characters and matches the second entry. */
export function syncPasswordReady(password: string, again: string): boolean {
  const text = password.trim()
  return text.length >= 8 && text.length <= 128 && text === again.trim()
}
