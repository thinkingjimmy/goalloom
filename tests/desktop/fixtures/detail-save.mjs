/**
 * [INPUT]: A real detail dialog with its observable autosave state.
 * [OUTPUT]: Deterministic waits for committed edits, optionally finishing the focused editor.
 * [POS]: Shared E2E interaction helper; never bypasses the renderer or persistence boundary.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export async function waitForDetailSave(page) {
  await page.locator('dialog.detail .detail-body[data-save-state="saved"]').waitFor()
}
export async function finishDetailEditing(page) {
  await page.evaluate(() => {
    const active = document.activeElement
    if (active instanceof HTMLElement && active.closest('dialog.detail')) active.blur()
  })
  await waitForDetailSave(page)
}
