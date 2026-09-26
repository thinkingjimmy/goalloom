/**
 * [INPUT]: SettingsCatalog from the Chinese source, settings categories and interpolation parameters.
 * [OUTPUT]: French settings copy, including per-column completion-confetti and reduced-motion messages.
 * [POS]: French settings catalog matching the source; common actions remain in messages.ts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { SettingsCatalog } from '../zh/settings'

export const settingsMessages: SettingsCatalog = {
  preferences: 'Préférences',
  workspace: 'Espace de travail',
  items: 'Éléments',
  backupSection: 'Sauvegardes',
  openAnytime: 'Ouvrir les réglages à tout moment',
  enabledMeta: 'Activé',
  subtitles: {
    appearance: 'Ne concerne que l’affichage sur cet appareil, sans entrer dans l’historique de l’espace de travail',
    smart: 'Jev transforme une phrase en aperçu d’actions modifiable ; rien n’est écrit avant votre confirmation',
    calendar: 'Le calendrier est verrouillé après la première confirmation ; chaque colonne décide du sort des éléments non terminés à échéance',
    backup: 'Les sauvegardes restent sur cet ordinateur ; une restauration remplace toute la base, sans fusion',
    trash: 'La restauration rétablit l’état et l’emplacement d’origine, et tente de retrouver les liens rompus à la suppression',
  },
  // Appearance
  styleNotes: { paper: 'Papier chaud, séparateurs pointillés, ombres douces', minimal: 'Gris neutres, contours fins et pleins' },
  checkNotes: { outline: 'Seul le contour à la couleur du flux, le plus discret', paper: 'Fond blanc qui fait ressortir la couleur du flux', tint: 'Fond teinté de la même couleur, groupes les plus visibles' },
  relationLines: 'Lignes de relation',
  relationLinesNote: 'Quand un seul flux est filtré, des lignes relient ses parents et ses enfants',
  celebration: 'Confettis à la fin',
  celebrationNote: 'Des confettis jaillissent des deux coins inférieurs quand un élément est terminé. Choisissez les colonnes concernées.',
  celebrationReducedMotion: 'Les confettis sont suspendus lorsque l’option de réduction des animations du système est activée.',
  // Smart input
  smartEnabledNote: 'Notez une idée avec le + global ; elle est organisée dès que vous arrêtez de taper',
  privacy: 'Confidentialité',
  privacyPoints: [
    'Seuls sont envoyés le texte saisi, la date de l’espace de travail, et le titre, l’état et l’emplacement des objectifs que vous mentionnez ou sélectionnez',
    'Les descriptions, l’historique et la corbeille ne sont pas envoyés, ni l’espace de travail entier',
    'La Key est chiffrée sur cet appareil et n’entre ni dans les données de l’espace de travail, ni dans les sauvegardes ou exports',
  ],
  // Calendar
  lockedNote: 'Verrouillé · pour reconfigurer, créez une sauvegarde de protection puis réinitialisez l’espace de travail',
  nextCycle: (date: string) => `Prochain cycle le ${date}`,
  overdue: 'Non terminés à échéance',
  policyNotes: {
    month: { auto: 'Passent au mois suivant à la fin du mois', manual: 'Restent dans les périodes passées à la fin du mois, à organiser' },
    week: { auto: 'Passent à la semaine suivante en fin de semaine', manual: 'Restent dans les périodes passées en fin de semaine, à organiser' },
    day: { auto: 'Passent au nouvel aujourd’hui à minuit', manual: 'Restent dans les périodes passées à minuit, à organiser' },
  },
  undoRollover: 'Annuler ce report',
  // Backup & restore
  backedUpAt: (when: string) => `Sauvegardé ${when}`,
  backupSummary: (count: number) => `${count} ${count > 1 ? 'copies' : 'copie'} · sur le même disque que l’espace de travail, sans protection contre une panne du disque entier`,
  dailyBackup: 'Sauvegarde quotidienne automatique',
  dailyBackupNote: 'Créée à la première ouverture de chaque jour',
  keepLatest: 'Conserver',
  keepCount: (count: number) => `${count} ${count > 1 ? 'copies' : 'copie'}`,
  backupList: 'Liste des sauvegardes',
  restoreFrom: 'Restaurer',
  showAll: (count: number) => `Afficher les ${count}`,
  showFewer: 'Réduire',
  transfer: 'Import et export',
  exportJson: 'Exporter en JSON complet',
  exportNote: 'Éléments, liens, périodes et tout l’historique',
  exportAction: 'Exporter',
  restoreFile: 'Restaurer depuis un fichier',
  restoreFileNote: 'JSON ou .sqlite ; un aperçu et une sauvegarde automatique des données actuelles précèdent le remplacement',
  chooseFile: 'Choisir un fichier',
  resetNote: 'Efface les éléments et reconfigure le calendrier ; le thème et les sauvegardes existantes sont conservés',
  reset: 'Réinitialiser',
  today: 'aujourd’hui',
  yesterday: 'hier',
  // Items
  trashNote: 'La corbeille ne se vide jamais automatiquement ; les éléments supprimés y restent jusqu’à ce que vous les restauriez.',
}
