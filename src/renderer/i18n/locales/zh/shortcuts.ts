/**
 * [INPUT]: state/shortcuts 的快捷键标识。
 * [OUTPUT]: 快捷键设置分册：行标题、作用范围说明、流程筛选开关与示意、录制/冲突/校验提示。
 * [POS]: renderer/i18n/locales/zh 的快捷键分册，与 messages.ts 同构；不决定键位。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ConflictId, ShortcutId } from '../../../state/shortcuts'
import { widen } from '../../../../shared/i18n/locale'

export const shortcutNames: Record<ConflictId, string> = {
  palette: '打开搜索与命令', compose: '新建', settings: '打开设置', undo: '撤销', submit: '保存 / 确认', filters: '流程筛选',
}
export const shortcutNotes: Partial<Record<ShortcutId, string>> = {
  undo: '在输入框外任意位置可用',
  submit: '仅在新建与条目详情中',
}
export const shortcutMessages = widen({
  section: '快捷键',
  subtitle: '点击键帽后按下新组合，Esc 取消；组合需包含 ⌘/Ctrl 或 ⌥/Alt',
  general: '通用',
  filters: '流程筛选',
  filtersToggle: (mod: string) => `用 ${mod} + 数字切换顶栏筛选`,
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
  conflictNote: '仅在特定弹窗中生效的快捷键可以共用按键，冲突只提示、不阻止保存。',
  needsModifier: '需要包含 ⌘/Ctrl 或 ⌥/Alt',
  reserved: '该组合键由系统占用',
})
export type ShortcutCatalog = typeof shortcutMessages
