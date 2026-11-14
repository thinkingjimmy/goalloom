/**
 * [INPUT]: ShortcutCatalog and label types from the Chinese catalog.
 * [OUTPUT]: Spanish shortcut labels, one-line guidance, inline recording feedback and top-bar key instructions.
 * [POS]: Spanish renderer messages for shortcut settings.
 */
import type { ShortcutCatalog, shortcutNames as sourceNames, shortcutNotes as sourceNotes } from '../zh/shortcuts'

export const shortcutNames: typeof sourceNames = {
  palette: 'Abrir búsqueda y comandos', compose: 'Nuevo', settings: 'Abrir ajustes', undo: 'Deshacer', submit: 'Guardar / confirmar', filters: 'Números de la barra superior',
}
export const shortcutNotes: typeof sourceNotes = {
  undo: 'Funciona en cualquier lugar fuera de un campo de texto',
  submit: 'Solo en Nuevo y en el detalle del elemento',
}
export const shortcutMessages: ShortcutCatalog = {
  section: 'Atajos de teclado',
  subtitle: 'Haz clic en un atajo y pulsa las teclas (Esc cancela).',
  general: 'General',
  filters: 'Números de la barra superior',
  filtersToggle: (mod: string) => `Usar ${mod} + número para Later y los filtros de la barra superior`,
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
  needsModifier: 'Debe incluir ⌘/Ctrl o ⌥/Alt',
  reserved: 'Esta combinación la usa el sistema',
}
