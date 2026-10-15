/**
 * [INPUT]: Native settings controls and the current device language.
 * [OUTPUT]: An explicit completed-task display mode for owning E2E scenarios.
 * [POS]: Shared UI driver; legacy fold coverage opts in without changing the product default.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const completedLayoutCopy = {
  zh: { settings: '设置与数据', board: '看板', label: '折叠已完成任务', close: '关闭' },
  en: { settings: 'Settings & data', board: 'Board', label: 'Collapse completed tasks', close: 'Close' },
  ja: { settings: '設定とデータ', board: 'ボード', label: '完了したタスクを折りたたむ', close: '閉じる' },
  es: { settings: 'Ajustes y datos', board: 'Tablero', label: 'Plegar tareas completadas', close: 'Cerrar' },
  fr: { settings: 'Réglages et données', board: 'Tableau', label: 'Replier les tâches terminées', close: 'Fermer' },
}

export async function setCompletedLayout(page, collapsed) {
  const locale = await page.evaluate(() => document.documentElement.lang.split('-')[0])
  const copy = completedLayoutCopy[locale]
  await page.getByRole('button', { name: copy.settings, exact: true }).click()
  const dialog = page.locator('dialog.settings-modal')
  await dialog.getByRole('navigation').getByRole('button', { name: copy.board, exact: true }).click()
  const control = dialog.getByRole('switch', { name: copy.label, exact: true })
  if (await control.getAttribute('aria-checked') !== String(collapsed)) await control.click()
  await dialog.getByRole('button', { name: copy.close, exact: true }).click()
}
