/**
 * [INPUT]: A calendar mode, a start date against workspace today, a pair of sync-password drafts, and a keyboard frame.
 * [OUTPUT]: Whether the rolling start date is shown, whether a date is an allowed anchor, a month grid, whether a new sync password can be accepted, the sign-in button order, and where the suggestion row sits relative to the keyboard. A dismiss frame whose top is at the screen bottom counts as hidden.
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

/** Numeric month title. Chinese and Japanese read year/month; the others read month/year. */
export function calendarMonthTitle(year: number, month: number, locale: 'zh' | 'en' | 'ja' | 'es' | 'fr'): string {
  if (locale === 'zh' || locale === 'ja') return `${year}/${month}`
  return `${month}/${year}`
}

/**
 * Vertical shift that puts a row's bottom edge `gap` above the keyboard.
 * Positive moves the row down, negative moves it up. A missing measurement stays put.
 */
export function suggestionShift(rowBottom: number, keyboardTop: number, gap = 8): number {
  if (!(rowBottom > 0) || !(keyboardTop > 0)) return 0
  return keyboardTop - gap - rowBottom
}

/** Keyboard events report milliseconds, except some iOS frames report seconds. */
export function keyboardDuration(duration: number | undefined): number {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return 250
  return duration < 5 ? Math.round(duration * 1000) : Math.round(duration)
}

/**
 * Window Y of the keyboard top, or 0 when that frame is hidden.
 * iOS dismiss notifications keep the keyboard height and park its top on the screen bottom.
 * A missing Y falls back to measuring that height up from the window bottom.
 */
export function keyboardFrameTop(frame: { height: number; screenY: number }, windowHeight: number): number {
  if (!(frame.height > 0) || !(windowHeight > 0)) return 0
  if (frame.screenY >= windowHeight) return 0
  if (!(frame.screenY > 0)) return windowHeight - frame.height
  return frame.screenY
}
