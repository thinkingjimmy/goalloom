/**
 * [INPUT]: A board column locator.
 * [OUTPUT]: Header-B helpers — open the column's period panel, step with its footer buttons, check a step's state and close it again.
 * [POS]: Shared by period, history, ordering, relations, feedback and insight scenarios so none depends on panel internals.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export async function openPeriodPanel(column) {
  if (!await column.locator('.period-picker').count()) await column.locator('[data-period-switch]').click()
  await column.locator('.period-picker').waitFor()
}

export async function closePeriodPanel(column) {
  if (await column.locator('.period-picker').count()) await column.locator('[data-period-switch]').click()
  await column.locator('.period-picker').waitFor({ state: 'detached' })
}

/** Pointer step through the panel footer, like the old header arrows; the panel closes afterwards unless kept open. */
export async function stepPeriod(column, direction, { keepOpen = false } = {}) {
  await openPeriodPanel(column)
  await column.locator(`[data-${direction}-period]`).click()
  if (!keepOpen) await closePeriodPanel(column)
}

export async function stepEnabled(column, direction) {
  await openPeriodPanel(column)
  const enabled = await column.locator(`[data-${direction}-period]`).isEnabled()
  await closePeriodPanel(column)
  return enabled
}
