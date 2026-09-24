/**
 * [INPUT]: 依赖 ../zh/shortcuts 的 ShortcutCatalog、shortcutNames、shortcutNotes 类型。
 * [OUTPUT]: 日语的快捷键设置分册：行标题、作用范围说明、流程筛选开关与示意、录制/冲突/校验提示。
 * [POS]: renderer/i18n/locales/ja 的快捷键分册，与 zh 同构；不决定键位。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ShortcutCatalog, shortcutNames as sourceNames, shortcutNotes as sourceNotes } from '../zh/shortcuts'

export const shortcutNames: typeof sourceNames = {
  palette: '検索とコマンドを開く', compose: '新規', settings: '設定を開く', undo: '取り消し', submit: '保存 / 確定', filters: 'フローで絞り込み',
}
export const shortcutNotes: typeof sourceNotes = {
  undo: '入力欄の外ならどこでも使えます',
  submit: '新規作成と項目の詳細でのみ',
}
export const shortcutMessages: ShortcutCatalog = {
  section: 'ショートカット',
  subtitle: 'キーをクリックして新しい組み合わせを押します。Esc でキャンセル。⌘/Ctrl または ⌥/Alt を含めてください',
  general: '一般',
  filters: 'フローで絞り込み',
  filtersToggle: (mod: string) => `${mod} + 数字でトップバーの絞り込みを切り替え`,
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
  conflictNote: '特定のダイアログでのみ有効なショートカットはキーを共有できます。競合は通知のみで、保存は妨げません。',
  needsModifier: '⌘/Ctrl または ⌥/Alt を含めてください',
  reserved: 'この組み合わせはシステムで使用されています',
}
