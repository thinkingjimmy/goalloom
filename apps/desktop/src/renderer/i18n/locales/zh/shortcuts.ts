/**
 * [INPUT]: Shortcut and conflict identifiers from state/shortcuts.
 * [OUTPUT]: Chinese shortcut labels, one-line guidance, inline recording feedback and top-bar key instructions.
 * [POS]: Source catalog for the renderer's shortcut translations.
 */
import type { ConflictId, ShortcutId } from '../../../state/shortcuts'
import { widen } from '../../../../shared/i18n/locale'

export const shortcutNames: Record<ConflictId, string> = {
  palette: '打开搜索与命令', compose: '新建', settings: '打开设置', undo: '撤销', submit: '保存 / 确认', filters: '顶栏数字键',
}
export const shortcutNotes: Partial<Record<ShortcutId, string>> = {
  undo: '在输入框外任意位置可用',
  submit: '仅在新建与条目详情中',
}
export const shortcutMessages = widen({
  section: '快捷键',
  subtitle: '点击键帽后按下新组合，Esc 取消。',
  general: '通用',
  filters: '顶栏数字键',
  filtersToggle: (mod: string) => `用 ${mod} + 数字切换 Later 与顶栏筛选`,
  filtersNote: '数字就是顶栏从左数的位置，和浏览器切换标签页一样',
  diagram: '示意：顶栏位置与快捷键的对应关系',
  diagramTag: '示意',
  diagramCaption: '顶栏',
  legendAll: '全部',
  legendFlows: '顶栏里的流程，从左到右',
  restore: '恢复默认',
  recording: '按下新的组合键…',
  unset: '未设置',
  edit: (name: string) => `修改快捷键：${name}`,
  clear: (name: string) => `清除快捷键：${name}`,
  conflict: (names: string[]) => `与「${names.join('」「')}」使用相同按键`,
  needsModifier: '需要包含 ⌘/Ctrl 或 ⌥/Alt',
  reserved: '该组合键由系统占用',
})
export type ShortcutCatalog = typeof shortcutMessages
