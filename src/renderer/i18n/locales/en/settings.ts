/**
 * [INPUT]: SettingsCatalog from the Chinese source, settings categories and interpolation parameters.
 * [OUTPUT]: English settings copy, including per-column completion-confetti and reduced-motion messages.
 * [POS]: English settings catalog matching the source; common actions remain in messages.ts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { SettingsCatalog } from '../zh/settings'

export const settingsMessages: SettingsCatalog = {
  preferences: 'Preferences',
  workspace: 'Workspace',
  items: 'Items',
  backupSection: 'Backup & restore',
  openAnytime: 'Open settings anytime',
  enabledMeta: 'On',
  subtitles: {
    appearance: 'Only affects this device’s display; not recorded in workspace history',
    smart: 'Jev turns a sentence into an editable action preview; nothing is written until you confirm',
    calendar: 'The calendar locks after initial setup; each column decides what happens to overdue unfinished items',
    backup: 'Backups are stored on this computer; restoring replaces the whole workspace without merging',
    trash: 'Restoring returns an item to its original state and position, and tries to recover links broken on deletion',
  },
  // Appearance
  styleNotes: { paper: 'Warm paper, dashed dividers, soft shadows', minimal: 'Neutral grays, thin solid borders' },
  checkNotes: { outline: 'Flow-color outline only, the quietest', paper: 'White fill sets off the flow color', tint: 'Tinted fill, clearest grouping' },
  relationLines: 'Relation lines',
  relationLinesNote: 'When one flow is filtered, lines connect its parents and children',
  celebration: 'Completion confetti',
  celebrationNote: 'Confetti bursts from both bottom corners when you complete an item in a selected column.',
  celebrationOff: 'Off. Select any column to turn it on.',
  celebrationColumns: 'Celebrate completions in these columns',
  celebrationTry: 'Try it',
  celebrationReducedMotion: 'Confetti is paused while Reduce Motion is enabled in your system settings.',
  // Smart input
  smartEnabledNote: 'Write ideas with the global +; they’re organized once you stop typing',
  privacy: 'Privacy',
  privacyPoints: [
    'Only sends the current input text, the workspace date, and the title, status and position of goals you mention or select',
    'Never sends descriptions, history or trash, and never uploads the whole workspace',
    'The key is stored encrypted on this device and never enters workspace data, backups or exports',
  ],
  // Calendar
  lockedNote: 'Locked · To reconfigure, create a protective backup and reset the workspace',
  nextCycle: (date: string) => `Next cycle ${date}`,
  overdue: 'Overdue and unfinished',
  policyNotes: {
    month: { auto: 'Moves to next month at month end', manual: 'Stays in past periods at month end for you to arrange' },
    week: { auto: 'Moves to next week when the week ends', manual: 'Stays in past periods when the week ends for you to arrange' },
    day: { auto: 'Moves to the new today at midnight', manual: 'Stays in past periods at midnight for you to arrange' },
  },
  undoRollover: 'Undo this roll-over',
  // Backup & restore
  backedUpAt: (when: string) => `Backed up ${when}`,
  backupSummary: (count: number) => `${count === 1 ? '1 copy' : `${count} copies`} · On the same disk as the workspace, so they won’t survive a whole-disk failure`,
  dailyBackup: 'Daily automatic backup',
  dailyBackupNote: 'Made the first time you open the app each day',
  keepLatest: 'Keep latest',
  keepCount: (count: number) => count === 1 ? '1 copy' : `${count} copies`,
  backupList: 'Backup list',
  restoreFrom: 'Restore from this',
  showAll: (count: number) => `Show all ${count}`,
  showFewer: 'Show fewer',
  transfer: 'Import & export',
  exportJson: 'Export full JSON',
  exportNote: 'Items, links, periods and all history',
  exportAction: 'Export',
  restoreFile: 'Restore from file',
  restoreFileNote: 'Supports JSON or .sqlite; previews first and backs up current data before replacing',
  chooseFile: 'Choose file',
  resetNote: 'Clears items and sets up the calendar again; theme and existing backups are kept',
  reset: 'Reset',
  today: 'Today',
  yesterday: 'Yesterday',
  // Items
  trashNote: 'The trash is never emptied automatically; deleted items stay here until you restore them.',
}
