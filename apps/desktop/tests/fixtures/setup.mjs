/**
 * [INPUT]: Isolated Playwright page and optional calendar/direction choices through the shared Select controls and an emulated computer timezone.
 * [OUTPUT]: Chooses local use on the welcome page, then completes the real calendar → annual direction → AI setup, or stops at direction/AI for owning scenarios.
 * [POS]: Shared desktop setup driver; uses rendered controls and CDP device emulation; never writes setup through IPC.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
const copy = {
  zh: { change: '更改起点', skip: '暂时跳过', custom: '自选日期…' },
  en: { change: 'Change start date', skip: 'Skip for now', custom: 'Custom date…' },
  ja: { change: '開始日を変更', skip: '今はスキップ', custom: '日付を選ぶ…' },
  es: { change: 'Cambiar inicio', skip: 'Omitir por ahora', custom: 'Fecha personalizada…' },
  fr: { change: 'Modifier le début', skip: 'Ignorer pour le moment', custom: 'Date personnalisée…' },
}
/** Each step's content fades in once; waiting for it keeps evidence screenshots and later clicks on a settled layout. */
export const settleSetupStep = page => page.locator('.onboarding').evaluate(node => Promise.all((node.closest('.onboarding-stage') ?? node).getAnimations({ subtree: true }).filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))))
/** First-run and post-reset windows open on the local-or-account choice. Calendar setup matches the second selector. */
export const waitForSetupEntry = page => page.locator('.start-cards, .calendar-modes').first().waitFor()
/** Apply an isolated device preference, then reload first-run copy without exposing a language control. */
export async function reloadDeviceLanguage(page, locale) {
  await page.evaluate(locale => window.goalloom.setLanguage(locale), locale)
  await page.reload()
  await waitForSetupEntry(page)
  await page.waitForFunction(locale => document.documentElement.lang.split('-')[0] === locale, locale)
}
/** Local use is the primary welcome action. Joining a second computer never reaches this helper. */
export async function chooseLocalStart(page) {
  await waitForSetupEntry(page)
  const choice = page.locator('.start-cards')
  if (await choice.isVisible()) await choice.locator('button.start-local').click()
  await page.locator('.calendar-modes').waitFor()
}
/** Emulate the computer, not a removed timezone setting. This uses the browser debugger only. */
const timezoneSessions = new WeakMap()
export async function setDeviceTimezone(page, timezone) {
  let session = timezoneSessions.get(page)
  if (!session) { session = await page.context().newCDPSession(page); timezoneSessions.set(page, session) }
  await session.send('Emulation.setTimezoneOverride', { timezoneId: timezone })
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await page.waitForFunction(timezone => document.querySelector('[data-setup-timezone]')?.getAttribute('data-setup-timezone') === timezone, timezone)
}
export async function chooseSetupCalendar(page, { mode = 'rolling', timezone, weekStart, anchor } = {}) {
  await chooseLocalStart(page)
  const locale = await page.evaluate(() => document.documentElement.lang.split('-')[0])
  await page.locator('#setup-calendar-mode').click()
  await page.getByRole('option').nth(mode === 'rolling' ? 0 : 1).click()
  if (timezone) await setDeviceTimezone(page, timezone)
  if (weekStart) {
    const trigger = page.locator('#setup-week-start')
    await trigger.click()
    await page.getByRole('option').nth(weekStart - 1).press('Enter')
    await page.getByRole('listbox').waitFor({ state: 'hidden' })
  }
  if (anchor) {
    await page.locator('#setup-calendar-anchor').click()
    await page.getByRole('option').last().click()
    const dialog = page.locator('dialog.calendar-anchor-dialog')
    await dialog.locator('input[type="date"]').fill(anchor)
    await dialog.locator('button[type="submit"]').click()
    await dialog.waitFor({ state: 'detached' })
  }
  await page.locator('.onboarding-actions button').last().click()
  await page.locator('.direction-input').waitFor()
  await settleSetupStep(page)
  return copy[locale] ?? copy.en
}
export async function finishSetup(page, { direction = '', skipAi = true, ...calendar } = {}) {
  const words = await chooseSetupCalendar(page, calendar)
  await page.locator('.direction-input').fill(direction)
  await page.locator('.onboarding-actions button').last().click()
  if (skipAi) {
    await page.getByRole('button', { name: words.skip, exact: true }).click()
    await page.locator('.board').waitFor()
  }
}
