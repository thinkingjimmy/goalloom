/**
 * [INPUT]: ShortcutCatalog and label types from the Chinese catalog.
 * [OUTPUT]: Japanese shortcut labels, one-line guidance, inline recording feedback and top-bar key instructions.
 * [POS]: Japanese renderer messages for shortcut settings.
 */
import type { ShortcutCatalog, shortcutNames as sourceNames, shortcutNotes as sourceNotes } from '../zh/shortcuts'

export const shortcutNames: typeof sourceNames = {
  palette: '検索とコマンドを開く', compose: '新規', settings: '設定を開く', undo: '取り消し', submit: '保存 / 確定', filters: 'トップバーの数字キー',
}
export const shortcutNotes: typeof sourceNotes = {
  undo: '入力欄の外ならどこでも使えます',
  submit: '新規作成と項目の詳細でのみ',
}
export const shortcutMessages: ShortcutCatalog = {
  section: 'ショートカット',
  subtitle: 'キーをクリックし、新しいキーを押す（Esc でキャンセル）。',
  general: '一般',
  filters: 'トップバーの数字キー',
  filtersToggle: (mod: string) => `${mod} + 数字で Later とトップバーの絞り込みを切り替え`,
  filtersNote: '数字はトップバーの左からの位置です。ブラウザのタブ切り替えと同じです',
  diagram: '図：トップバーの位置とショートカットの対応',
  diagramTag: '図',
  diagramCaption: 'トップバー',
  legendAll: 'すべて',
  legendFlows: 'トップバーのフロー、左から右へ',
  restore: 'デフォルトに戻す',
  recording: '新しいキーの組み合わせを押してください…',
  unset: '未設定',
  edit: (name: string) => `ショートカットを変更：${name}`,
  clear: (name: string) => `ショートカットをクリア：${name}`,
  conflict: (names: string[]) => `「${names.join('」「')}」と同じキーを使用しています`,
  needsModifier: '⌘/Ctrl または ⌥/Alt を含めてください',
  reserved: 'この組み合わせはシステムで使用されています',
}
