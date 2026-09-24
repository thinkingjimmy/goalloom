/**
 * [INPUT]: 依赖 ../zh/shortcuts 的 ShortcutCatalog、shortcutNames、shortcutNotes 类型。
 * [OUTPUT]: 西班牙语的快捷键设置分册：行标题、作用范围说明、流程筛选开关与示意、录制/冲突/校验提示。
 * [POS]: renderer/i18n/locales/es 的快捷键分册，与 zh 同构；不决定键位。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ShortcutCatalog, shortcutNames as sourceNames, shortcutNotes as sourceNotes } from '../zh/shortcuts'

export const shortcutNames: typeof sourceNames = {
  palette: 'Abrir búsqueda y comandos', compose: 'Nuevo', settings: 'Abrir ajustes', undo: 'Deshacer', submit: 'Guardar / confirmar', filters: 'Filtro de flujo',
}
export const shortcutNotes: typeof sourceNotes = {
  undo: 'Funciona en cualquier lugar fuera de un campo de texto',
  submit: 'Solo en Nuevo y en el detalle del elemento',
}
export const shortcutMessages: ShortcutCatalog = {
  section: 'Atajos de teclado',
  subtitle: 'Haz clic en una tecla y pulsa la nueva combinación; Esc cancela. Debe incluir ⌘/Ctrl o ⌥/Alt',
  general: 'General',
  filters: 'Filtro de flujo',
  filtersToggle: (mod: string) => `Cambiar el filtro de la barra superior con ${mod} + número`,
  filtersNote: 'El número es la posición en la barra superior contando desde la izquierda, como al cambiar de pestaña en el navegador',
  diagram: 'Esquema: posiciones de la barra superior y sus atajos',
  diagramTag: 'Esquema',
  diagramCaption: 'Barra superior',
  legendAll: 'Todos',
  legendFlows: 'Flujos de la barra superior, de izquierda a derecha',
  restore: 'Restablecer predeterminados',
  recording: 'Pulsa la nueva combinación…',
  unset: 'Sin asignar',
  edit: (name: string) => `Cambiar atajo: ${name}`,
  clear: (name: string) => `Quitar atajo: ${name}`,
  conflict: (names: string[]) => `Usa las mismas teclas que “${names.join('”, “')}”`,
  conflictNote: 'Los atajos que solo funcionan en ventanas concretas pueden compartir teclas; los conflictos solo se avisan y no impiden guardar.',
  needsModifier: 'Debe incluir ⌘/Ctrl o ⌥/Alt',
  reserved: 'Esta combinación la usa el sistema',
}
