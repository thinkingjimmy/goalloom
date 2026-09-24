/**
 * [INPUT]: 依赖 ../zh/shortcuts 的 ShortcutCatalog、shortcutNames、shortcutNotes 类型。
 * [OUTPUT]: 法语快捷键设置分册：行标题、作用范围说明、流程筛选开关与示意、录制/冲突/校验提示。
 * [POS]: renderer/i18n/locales/fr 的快捷键分册，与 zh 同构；不决定键位。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { ShortcutCatalog, shortcutNames as names, shortcutNotes as notes } from '../zh/shortcuts'

export const shortcutNames: typeof names = {
  palette: 'Recherche et commandes', compose: 'Nouveau', settings: 'Ouvrir les réglages', undo: 'Annuler', submit: 'Enregistrer / confirmer', filters: 'Filtre de flux',
}
export const shortcutNotes: typeof notes = {
  undo: 'Disponible partout hors des champs de saisie',
  submit: 'Uniquement dans Nouveau et le détail d’un élément',
}
export const shortcutMessages: ShortcutCatalog = {
  section: 'Raccourcis clavier',
  subtitle: 'Cliquez sur une touche puis tapez la nouvelle combinaison, Esc pour annuler ; elle doit inclure ⌘/Ctrl ou ⌥/Alt',
  general: 'Général',
  filters: 'Filtre de flux',
  filtersToggle: (mod: string) => `${mod} + chiffre pour changer de filtre dans la barre du haut`,
  filtersNote: 'Le chiffre correspond à la position dans la barre du haut en partant de la gauche, comme pour changer d’onglet dans un navigateur',
  diagram: 'Schéma : correspondance entre positions de la barre du haut et raccourcis',
  diagramTag: 'Schéma',
  diagramCaption: 'Barre du haut',
  legendAll: 'Tous',
  legendFlows: 'Les flux de la barre du haut, de gauche à droite',
  restore: 'Rétablir les valeurs par défaut',
  recording: 'Tapez la nouvelle combinaison…',
  unset: 'Non défini',
  edit: (name: string) => `Modifier le raccourci : ${name}`,
  clear: (name: string) => `Effacer le raccourci : ${name}`,
  conflict: (names: string[]) => `Mêmes touches que ${names.map(name => `« ${name} »`).join(', ')}`,
  conflictNote: 'Les raccourcis actifs seulement dans certaines fenêtres peuvent partager des touches ; un conflit est signalé sans empêcher l’enregistrement.',
  needsModifier: 'Doit inclure ⌘/Ctrl ou ⌥/Alt',
  reserved: 'Cette combinaison est réservée par le système',
}
