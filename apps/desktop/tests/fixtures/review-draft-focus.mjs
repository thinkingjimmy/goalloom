/**
 * [INPUT]: An isolated native weekly review with production IPC/SQLite and two monthly planning sources.
 * [OUTPUT]: Focused draft appearance, editing/Tab/resume checks and screenshots without unrelated hover coverage.
 * [POS]: Focus-specific group of weekly-review; the full weekly scenario keeps its existing acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'

export async function verifyReviewDraftFocus({ page, mode, out, scenario, check }) {
  await page.locator('[data-review]').click()
  const drawer = page.locator('.review-drawer[open]')
  const rows = drawer.locator('.review-plan-row')
  for (let step = 0; step < 3; step++) {
    await drawer.locator('.review-body[aria-busy=false]').waitFor()
    if (await rows.count()) break
    const previous = await drawer.locator('.review-steps [aria-current=step]').textContent()
    await drawer.locator('.review-foot .primary:not(:disabled)').click()
    await page.waitForFunction(previous => document.querySelector('.review-drawer[open] [aria-current=step]')?.textContent !== previous, previous)
  }
  assert.equal(await rows.count(), 2)
  const revision = () => page.evaluate(() => window.goalloom.getSnapshot().then(snapshot => snapshot.workspace.revision))
  const before = await revision()
  const input = rows.first().locator('.seed-title')
  await input.fill('Editable review draft')
  const appearance = await input.evaluate(input => {
    const style = getComputedStyle(input)
    return { focused: input === document.activeElement, focusVisible: input.matches(':focus-visible'), outline: style.outlineStyle,
      shadow: style.boxShadow, border: style.borderTopWidth, background: style.backgroundColor }
  })
  assert.equal(appearance.focused, true)
  assert.equal(appearance.focusVisible, true)
  assert.equal(appearance.outline, 'none')
  assert.equal(appearance.shadow, 'none')
  assert.equal(appearance.border, '0px')
  assert.equal(await input.inputValue(), 'Editable review draft')
  scenario.draftFocus = appearance
  await rows.first().screenshot({ path: `${out}/${mode}-focused-draft.png` })
  await input.press('Tab')
  await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'combobox')
  const choice = rows.nth(1).getByRole('combobox')
  const keyboard = await choice.evaluate(choice => ({ focused: choice === document.activeElement, outline: getComputedStyle(choice).outlineStyle }))
  assert.equal(keyboard.focused, true)
  assert.equal(keyboard.outline, 'solid')
  scenario.keyboardFocus = keyboard
  await choice.click()
  await drawer.getByRole('option', { name: '不排入', exact: true }).click()
  await drawer.locator('.review-head .icon-button').click()
  await drawer.waitFor({ state: 'hidden' })
  await page.locator('[data-review]').click()
  await drawer.locator('.review-body[aria-busy=false]').waitFor()
  assert.equal(await input.inputValue(), 'Editable review draft')
  assert.equal(await choice.innerText(), '不排入')
  assert.equal(await revision(), before)
  check('Focused draft has no outline/shadow/border; editing, visible Tab focus and resumed choices remain intact without writes')
}
