/**
 * [INPUT]: A board column locator.
 * [OUTPUT]: Header-B helpers — open or close the column's period panel, step one period from the title with the arrow keys, and check whether the adjacent month in the year grid can be chosen.
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

/** One period from the column title. Arrow keys do not animate; the panel closes afterwards unless kept open. */
export async function stepPeriod(column, direction, { keepOpen = false } = {}) {
  const switcher = column.locator('[data-period-switch]')
  await switcher.focus()
  await switcher.press(direction === 'next' ? 'ArrowRight' : 'ArrowLeft')
  if (keepOpen) await openPeriodPanel(column)
  else if (await column.locator('.period-picker').count()) await closePeriodPanel(column)
}

/** The adjacent month in the open year grid. A month off the current year page counts as reachable. */
export async function stepEnabled(column, direction) {
  await openPeriodPanel(column)
  const months = column.locator('.period-picker-months > button')
  const index = await months.evaluateAll(nodes => nodes.findIndex(node => node.getAttribute('aria-pressed') === 'true'))
  const next = index + (direction === 'next' ? 1 : -1)
  const enabled = next >= 0 && next < await months.count() ? await months.nth(next).isEnabled() : index >= 0
  await closePeriodPanel(column)
  return enabled
}
