/**
 * [INPUT]: SettingsCatalog from the Chinese source, settings categories and interpolation parameters.
 * [OUTPUT]: French settings copy, including calendar grouping, per-column completion-confetti, reduced-motion and About / software-update messages.
 * [POS]: French settings catalog matching the source; common actions remain in messages.ts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { SettingsCatalog } from '../zh/settings'

export const settingsMessages: SettingsCatalog = {
  preferences: 'Préférences',
  workspace: 'Espace de travail',
  items: 'Éléments',
  backupSection: 'Sauvegardes',
  enabledMeta: 'Activé',
  board: "Tableau",
  parentOrder: "Trier selon les parents",
  parentOrderNote: 'Les semestres, périodes de trois mois, mois, semaines, jours et périodes futures suivent leurs parents les plus proches. Glissez dans un groupe. Désactiver conserve l’ordre actuel.',
  subtitles: {
    ai: 'Ajoutez une clé une fois, puis la saisie intelligente et les Aperçus choisissent chacun leur service ; les clés restent chiffrées dans le trousseau de cet appareil et ne vont qu’au service choisi',
    board: "Ordre et retours de fin, enregistrés sur cet appareil",
    insight: 'Ruptures, bilans et comment la rédaction vous comprend',
    appearance: 'Ne concerne que l’affichage sur cet appareil, sans entrer dans l’historique de l’espace de travail',
    smart: 'Jev transforme une phrase en aperçu d’actions modifiable ; rien n’est écrit avant votre confirmation',
    calendar: 'Le calendrier est verrouillé après la première confirmation ; chaque colonne décide du sort des éléments non terminés à échéance',
    backup: 'Les sauvegardes restent sur cet ordinateur ; une restauration remplace toute la base, sans fusion',
    trash: 'La restauration rétablit l’état et l’emplacement d’origine, et tente de retrouver les liens rompus à la suppression',
    about: 'Version et mises à jour du logiciel',
  },
  // Appearance
  styleNotes: { paper: 'Papier chaud, séparateurs pointillés, ombres douces', minimal: 'Gris neutres, contours fins et pleins' },
  checkNotes: { outline: 'Seul le contour à la couleur du flux, le plus discret', paper: 'Fond blanc qui fait ressortir la couleur du flux', tint: 'Fond teinté de la même couleur, groupes les plus visibles' },
  relationLines: 'Lignes de relation',
  relationLinesNote: 'Quand un seul flux est filtré, des lignes relient ses parents et ses enfants',
  celebration: 'Confettis à la fin',
  celebrationNote: 'Des confettis jaillissent des deux coins inférieurs quand un élément est terminé dans une colonne choisie.',
  celebrationOff: 'Désactivé. Choisissez une colonne pour l’activer.',
  celebrationColumns: 'Célébrer les éléments terminés dans ces colonnes',
  celebrationTry: 'Essayer',
  celebrationReducedMotion: 'Les confettis sont suspendus lorsque l’option de réduction des animations du système est activée.',
  // Smart input
  privacy: 'Confidentialité',
  privacyPoints: [
    'Seul le service utilisé par une fonction reçoit du contenu ; une fonction désactivée n’envoie rien',
    'La saisie intelligente n’envoie que le texte saisi, la date de l’espace de travail et les objectifs mentionnés ou sélectionnés ; les Aperçus n’envoient qu’un résumé du tableau et vos préférences',
    'Les descriptions, l’historique et la corbeille ne sont jamais envoyés ; les clés restent chiffrées sur cet appareil, hors des données, sauvegardes et exports',
  ],
  // Calendar
  calendarSettings: 'Réglages du calendrier',
  overdue: 'Non terminés à échéance',
  policyNotes: {
    month: { auto: 'Passent au mois suivant à la fin du mois', manual: 'Restent dans les périodes passées à la fin du mois, à organiser' },
    week: { auto: 'Passent à la semaine suivante en fin de semaine', manual: 'Restent dans les périodes passées en fin de semaine, à organiser' },
    day: { auto: 'Passent au nouvel aujourd’hui à minuit', manual: 'Restent dans les périodes passées à minuit, à organiser' },
  },
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
  // About
  about: {
    section: 'À propos',
    navMeta: 'Nouvelle version',
    tagline: 'Reliez les objectifs du trimestre aux tâches du jour',
    version: (version: string) => `Version ${version}`,
    updates: 'Mise à jour du logiciel',
    unsupported: 'Les versions de développement ne recherchent pas de mises à jour',
    idle: 'Les nouvelles versions se téléchargent en arrière-plan et s’appliquent au redémarrage',
    checking: 'Recherche de mises à jour…',
    latest: (time: string) => `À jour · vérifié à ${time}`,
    downloading: (version: string, percent: number) => `Téléchargement de ${version} · ${percent} %`,
    ready: (version: string) => `${version} est prête : redémarrez pour terminer la mise à jour`,
    failed: 'Impossible de rechercher des mises à jour. Vérifiez votre connexion et réessayez.',
    check: 'Rechercher des mises à jour',
    restart: 'Redémarrer pour mettre à jour',
    website: 'Site web',
    releaseNotes: 'Notes de version',
    settingsWithUpdate: (settings: string) => `${settings} (mise à jour disponible)`,
  },
  // Items
  trashNote: 'La corbeille ne se vide jamais automatiquement ; les éléments supprimés y restent jusqu’à ce que vous les restauriez.',
}
