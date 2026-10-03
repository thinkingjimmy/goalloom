/**
 * [INPUT]: Isolated Playwright page and optional calendar/direction choices.
 * [OUTPUT]: Completes the real calendar → annual direction → AI setup, or stops at direction/AI for owning scenarios.
 * [POS]: Shared desktop setup driver; uses rendered controls and never writes setup through IPC.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
const copy = {
  zh: { change: '更改起点', skip: '暂时跳过', custom: '自选日期…' },
  en: { change: 'Change start date', skip: 'Skip for now', custom: 'Custom date…' },
  ja: { change: '開始日を変更', skip: '今はスキップ', custom: '日付を選ぶ…' },
  es: { change: 'Cambiar inicio', skip: 'Omitir por ahora', custom: 'Fecha personalizada…' },
  fr: { change: 'Modifier le début', skip: 'Ignorer pour le moment', custom: 'Date personnalisée…' },
}
export async function chooseSetupCalendar(page, { mode = 'rolling', timezone, weekStart, anchor } = {}) {
  await page.locator('.calendar-modes').waitFor()
  const locale = await page.evaluate(() => document.documentElement.lang.split('-')[0])
  await page.locator(`.calendar-mode[data-mode="${mode}"]`).click()
  if (timezone) {
    await page.locator('.calendar-controls button[aria-haspopup="listbox"]').first().click()
    const search = page.locator('.timezone-menu input')
    await search.fill(timezone); await search.press('Enter')
  }
  if (weekStart) {
    const trigger = page.locator('.calendar-choice [role="combobox"]').first()
    await trigger.click()
    await page.getByRole('option').nth(weekStart - 1).press('Enter')
    await page.getByRole('listbox').waitFor({ state: 'hidden' })
  }
  if (anchor) {
    await page.locator('.calendar-start .text-button').click()
    await page.locator('.calendar-start [role="combobox"]').click()
    await page.getByRole('option').last().click()
    await page.locator('.calendar-start input[type="date"]').fill(anchor)
  }
  await page.locator('.onboarding-actions button').last().click()
  await page.locator('.direction-input').waitFor()
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
