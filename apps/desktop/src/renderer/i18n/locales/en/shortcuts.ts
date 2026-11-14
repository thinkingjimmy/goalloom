/**
 * [INPUT]: ShortcutCatalog and label types from the Chinese catalog.
 * [OUTPUT]: English shortcut labels, one-line guidance, inline recording feedback and top-bar key instructions.
 * [POS]: English renderer messages for shortcut settings.
 */
import type { ShortcutCatalog, shortcutNames as names, shortcutNotes as notes } from '../zh/shortcuts'

export const shortcutNames: typeof names = {
  palette: 'Open search & commands', compose: 'New', settings: 'Open settings', undo: 'Undo', submit: 'Save / confirm', filters: 'Top bar numbers',
}
export const shortcutNotes: typeof notes = {
  undo: 'Works anywhere outside text fields',
  submit: 'Only in New and item details',
}
export const shortcutMessages: ShortcutCatalog = {
  section: 'Shortcuts',
  subtitle: 'Click a shortcut, then press new keys (Esc to cancel).',
  general: 'General',
  filters: 'Top bar numbers',
  filtersToggle: (mod: string) => `Use ${mod} + number for Later and top bar filters`,
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
  needsModifier: 'Must include ⌘/Ctrl or ⌥/Alt',
  reserved: 'This combination is reserved by the system',
}
