/**
 * [INPUT]: Locale-aware dates, mode and period presentation parameters.
 * [OUTPUT]: Complete calendar-mode, annual-direction and anchored-period UI copy.
 * [POS]: Calendar catalog shared by setup, board, details and settings.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { calendarMessages as source } from '../zh/calendar'

export const calendarMessages: typeof source = {
  year: "1 año",
  half: "6 meses",
  naturalYear: "Este año",
  previousQuarter: "Trimestre anterior",
  nextQuarter: "Trimestre siguiente",
  naturalCycle: "Este trimestre",
  previousYear: "Año anterior",
  nextYear: "Año siguiente",
  previousNaturalYear: "El año pasado",
  nextNaturalYear: "El próximo año",
  previousHalf: "Semestre anterior",
  nextHalf: "Semestre siguiente",
  returnCurrent: "Volver al actual",
  returnNaturalYear: "Volver a este año",
  returnNaturalCycle: "Volver a este trimestre",
  chooseCalendar: "Elige tu calendario",
  rollingMode: "365 días",
  naturalMode: "Año natural",
  rollingDescription: "Cada año abarca 12 meses desde la fecha de inicio",
  naturalDescription: "Planifica por años naturales desde el 1 de enero",
  changeAnchor: "Cambiar fecha de inicio",
  anchorLabel: "Fecha de inicio",
  modify: "Cambiar",
  manualAlways: "Siempre se organiza manualmente",
  nextYearStart: "El próximo año empieza",
  nextHalfStart: "El próximo semestre empieza",
  calendarMode: "Modo de calendario",
  dateChanged: "La fecha ha cambiado. Confirma la nueva fecha de inicio.",
  periodRecordsFailed: "No se pudieron cargar los periodos. Reinténtalo.",
  naturalDirectionTitle: "¿Qué es lo que más quieres avanzar este año?",
  useCurrentYear: "Usar este año",
  example1: "Correr un maratón completo",
  example2: "Leer 24 libros",
  example3: "Encontrar tu trabajo ideal",
  modeRange: (year: string, half: string, cycle: string) => `Año hasta ${year} · Semestre hasta ${half} · 3 meses hasta ${cycle}`,
  naturalRange: (days: number, end: string) => `Quedan ${days} días este año · Trimestre hasta ${end}`,
  yearRemaining: (days: number) => `Quedan ${days} días en este año`,
  futureDirection: (days: number, year: string) => `Solo quedan ${days} días. La dirección irá a ${year}.`,
  lockedSummary: (mode: string, date: string, zone: string, weekday: string) => `Se fijará: ${mode} · Inicio ${date} · ${zone} · Semana desde ${weekday}`,
  halfRange: (first: string, last: string, year: string | null) => `${year ? year + ' ' : ''}${first}–${last}`,
}
