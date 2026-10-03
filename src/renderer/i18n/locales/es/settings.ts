/**
 * [INPUT]: SettingsCatalog from the Chinese source, settings categories and interpolation parameters.
 * [OUTPUT]: Spanish settings copy, including calendar grouping, per-column completion-confetti, reduced-motion and About / software-update messages.
 * [POS]: Spanish settings catalog matching the source; common actions remain in messages.ts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { SettingsCatalog } from '../zh/settings'

export const settingsMessages: SettingsCatalog = {
  preferences: 'Preferencias',
  workspace: 'Espacio de trabajo',
  items: 'Elementos',
  backupSection: 'Copias y restauración',
  enabledMeta: 'Activada',
  board: "Tablero",
  parentOrder: "Ordenar por elemento superior",
  parentOrderNote: 'Los semestres, períodos de tres meses, meses, semanas, días y períodos futuros siguen a sus superiores más cercanos. Arrastra dentro de cada grupo. Al desactivar, se conserva el orden actual.',
  subtitles: {
    ai: 'Añade una clave una vez y deja que la entrada inteligente y Perspectiva elijan servicio; las claves se guardan cifradas en el llavero de este equipo y solo van al servicio que elijas',
    board: "Orden y avisos al completar, guardados en este dispositivo",
    insight: 'Cortes, repasos y cómo te entiende el borrador',
    appearance: 'Solo afecta a la visualización en este dispositivo; no se guarda en el historial del espacio de trabajo',
    smart: 'Jev convierte una frase en una vista previa de acciones editable; solo se guarda cuando confirmas',
    calendar: 'El calendario se bloquea tras la primera confirmación; cada columna decide qué hacer con lo pendiente al terminar el periodo',
    backup: 'Las copias se guardan en este ordenador; restaurar reemplaza todo, sin combinar',
    trash: 'Recuperar devuelve el elemento a su estado y ubicación, e intenta restaurar los vínculos rotos al eliminarlo',
    about: 'Versión y actualizaciones de software',
  },
  // Appearance
  styleNotes: { paper: 'Papel cálido, separadores punteados, sombras suaves', minimal: 'Grises neutros, bordes finos continuos' },
  checkNotes: { outline: 'Solo el contorno del color de flujo; el más discreto', paper: 'Fondo blanco que resalta el color de flujo', tint: 'Fondo del mismo color, suave; agrupa mejor' },
  relationLines: 'Líneas de relación',
  relationLinesNote: 'Al filtrar un solo flujo, unas líneas unen sus elementos superiores e inferiores',
  celebration: 'Confeti al completar',
  celebrationNote: 'Lanza confeti desde las dos esquinas inferiores al completar un elemento en las columnas elegidas.',
  celebrationOff: 'Desactivado. Elige cualquier columna para activarlo.',
  celebrationColumns: 'Celebrar al completar en estas columnas',
  celebrationTry: 'Probar',
  celebrationReducedMotion: 'El confeti se pausa mientras esté activada la opción de reducir movimiento del sistema.',
  // Smart input
  privacy: 'Privacidad',
  privacyPoints: [
    'Solo recibe contenido el servicio que usa cada función; las funciones desactivadas no envían nada',
    'La entrada inteligente solo envía el texto actual, la fecha del espacio de trabajo y los objetivos que menciones o elijas; Perspectiva solo envía un resumen del tablero y tus preferencias',
    'No se envían descripciones, historial ni papelera; las claves se guardan cifradas en este equipo, fuera de los datos, copias y exportaciones',
  ],
  // Calendar
  calendarSettings: 'Configuración del calendario',
  nextCycle: (date: string) => `Siguiente ciclo: ${date}`,
  overdue: 'Pendiente al terminar',
  policyNotes: {
    month: { auto: 'A fin de mes pasa solo al mes siguiente', manual: 'A fin de mes queda en periodos anteriores hasta que lo organices' },
    week: { auto: 'Al terminar la semana pasa sola a la siguiente', manual: 'Al terminar la semana queda en periodos anteriores hasta que lo organices' },
    day: { auto: 'A medianoche pasa solo al nuevo hoy', manual: 'A medianoche queda en periodos anteriores hasta que lo organices' },
  },
  // Backup & restore
  backedUpAt: (when: string) => `Copia hecha ${when}`,
  backupSummary: (count: number) => `${count === 1 ? '1 copia' : `${count} copias`} · En el mismo disco que el espacio de trabajo; no protege contra el fallo de todo el disco`,
  dailyBackup: 'Copia diaria automática',
  dailyBackupNote: 'Se crea la primera vez que abres la aplicación cada día',
  keepLatest: 'Conservar las últimas',
  keepCount: (count: number) => count === 1 ? '1 copia' : `${count} copias`,
  backupList: 'Lista de copias',
  restoreFrom: 'Restaurar desde aquí',
  showAll: (count: number) => `Mostrar las ${count}`,
  showFewer: 'Mostrar menos',
  transfer: 'Importar y exportar',
  exportJson: 'Exportar JSON completo',
  exportNote: 'Elementos, vínculos, periodos y todo el historial',
  exportAction: 'Exportar',
  restoreFile: 'Restaurar desde archivo',
  restoreFileNote: 'Admite JSON o .sqlite; antes de reemplazar se muestra una vista previa y se hace una copia de los datos actuales',
  chooseFile: 'Elegir archivo',
  resetNote: 'Vacía los elementos y vuelve a configurar el calendario; se conservan el tema y las copias existentes',
  reset: 'Restablecer',
  today: 'hoy',
  yesterday: 'ayer',
  // About
  about: {
    section: 'Acerca de',
    navMeta: 'Nueva versión',
    tagline: 'Conecta las metas del trimestre con las tareas de hoy',
    version: (version: string) => `Versión ${version}`,
    updates: 'Actualización de software',
    unsupported: 'Las versiones de desarrollo no buscan actualizaciones',
    idle: 'Las nuevas versiones se descargan en segundo plano y se aplican al reiniciar',
    checking: 'Buscando actualizaciones…',
    latest: (time: string) => `Todo al día · comprobado a las ${time}`,
    downloading: (version: string, percent: number) => `Descargando ${version} · ${percent}%`,
    ready: (version: string) => `${version} está lista: reinicia para terminar de actualizar`,
    failed: 'No se pudo buscar actualizaciones. Revisa tu conexión e inténtalo de nuevo.',
    check: 'Buscar actualizaciones',
    restart: 'Reiniciar y actualizar',
    website: 'Sitio web',
    releaseNotes: 'Notas de la versión',
    settingsWithUpdate: (settings: string) => `${settings} (actualización disponible)`,
  },
  // Items
  trashNote: 'La papelera no se vacía sola; los elementos eliminados se quedan aquí hasta que los recuperes.',
}
