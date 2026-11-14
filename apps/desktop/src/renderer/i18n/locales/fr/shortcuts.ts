/**
 * [INPUT]: ShortcutCatalog and label types from the Chinese catalog.
 * [OUTPUT]: French shortcut labels, one-line guidance, inline recording feedback and top-bar key instructions.
 * [POS]: French renderer messages for shortcut settings.
 */
import type { ShortcutCatalog, shortcutNames as names, shortcutNotes as notes } from '../zh/shortcuts'

export const shortcutNames: typeof names = {
  palette: 'Recherche et commandes', compose: 'Nouveau', settings: 'Ouvrir les réglages', undo: 'Annuler', submit: 'Enregistrer / confirmer', filters: 'Chiffres de la barre du haut',
}
export const shortcutNotes: typeof notes = {
  undo: 'Disponible partout hors des champs de saisie',
  submit: 'Uniquement dans Nouveau et le détail d’un élément',
}
export const shortcutMessages: ShortcutCatalog = {
  section: 'Raccourcis clavier',
  subtitle: 'Cliquez, puis tapez les touches (Échap pour annuler).',
  general: 'Général',
  filters: 'Chiffres de la barre du haut',
  filtersToggle: (mod: string) => `${mod} + chiffre pour Later et les filtres de la barre du haut`,
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
  needsModifier: 'Doit inclure ⌘/Ctrl ou ⌥/Alt',
  reserved: 'Cette combinaison est réservée par le système',
}
