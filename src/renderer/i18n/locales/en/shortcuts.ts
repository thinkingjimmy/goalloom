/**
 * [INPUT]: 依赖 ../zh/shortcuts 的 ShortcutCatalog、shortcutNames、shortcutNotes 类型。
 * [OUTPUT]: 与 zh 同构的英文快捷键分册：行标题、作用范围说明、流程筛选开关与示意、录制/冲突/校验提示。
 * [POS]: renderer/i18n/locales/en 的快捷键分册，与 zh 同构；不决定键位。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ShortcutCatalog, shortcutNames as names, shortcutNotes as notes } from '../zh/shortcuts'

export const shortcutNames: typeof names = {
  palette: 'Open search & commands', compose: 'New', settings: 'Open settings', undo: 'Undo', submit: 'Save / confirm', filters: 'Flow filter',
}
export const shortcutNotes: typeof notes = {
  undo: 'Works anywhere outside text fields',
  submit: 'Only in New and item details',
}
export const shortcutMessages: ShortcutCatalog = {
  section: 'Shortcuts',
  subtitle: 'Click a key, then press a new combination; Esc cancels. Combinations must include ⌘/Ctrl or ⌥/Alt.',
  general: 'General',
  filters: 'Flow filter',
  filtersToggle: (mod: string) => `Use ${mod} + number to switch top bar filters`,
  filtersNote: 'The number is the position from the left in the top bar, like switching browser tabs',
  diagram: 'Diagram: how top bar positions map to shortcuts',
  diagramTag: 'Diagram',
  diagramCaption: 'Top bar',
  legendAll: 'All',
  legendFlows: 'Flows in the top bar, left to right',
  restore: 'Restore defaults',
  recording: 'Press a new key combination…',
  unset: 'Not set',
  edit: (name: string) => `Change shortcut: ${name}`,
  clear: (name: string) => `Clear shortcut: ${name}`,
  conflict: (names: string[]) => `Same keys as “${names.join('”, “')}”`,
  conflictNote: 'Shortcuts that only work in specific dialogs can share keys. Conflicts are only flagged; saving isn’t blocked.',
  needsModifier: 'Must include ⌘/Ctrl or ⌥/Alt',
  reserved: 'This combination is reserved by the system',
}
