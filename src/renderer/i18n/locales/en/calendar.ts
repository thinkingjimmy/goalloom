/**
 * [INPUT]: Locale-aware dates, mode and period presentation parameters.
 * [OUTPUT]: Complete calendar-mode, annual-direction and anchored-period UI copy.
 * [POS]: Calendar catalog shared by setup, board, details and settings.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { calendarMessages as source } from '../zh/calendar'

export const calendarMessages: typeof source = {
  year: "1 year",
  half: "6 months",
  naturalYear: "This year",
  previousQuarter: "Last quarter",
  nextQuarter: "Next quarter",
  naturalCycle: "This quarter",
  previousYear: "Previous year",
  nextYear: "Next year",
  previousNaturalYear: "Last year",
  nextNaturalYear: "Next year",
  previousHalf: "Previous half",
  nextHalf: "Next half",
  returnCurrent: "Back to current",
  returnNaturalYear: "Back to this year",
  returnNaturalCycle: "Back to this quarter",
  chooseCalendar: "Choose your calendar",
  rollingMode: "365 days",
  naturalMode: "Calendar year",
  rollingDescription: "Each year spans 12 months from your start date",
  naturalDescription: "Plan by calendar years starting January 1",
  changeAnchor: "Change start date",
  anchorLabel: "Start date",
  modify: "Change",
  manualAlways: "Always arranged manually",
  nextYearStart: "Next year starts",
  nextHalfStart: "Next half starts",
  calendarMode: "Calendar mode",
  dateChanged: "The date has changed. Confirm the new start date.",
  periodRecordsFailed: "Couldn’t load period records. Try again.",
  naturalDirectionTitle: "What do you most want to move forward this year?",
  useCurrentYear: "Use this year",
  example1: "Run a full marathon",
  example2: "Read 24 books",
  example3: "Find your ideal job",
  modeRange: (year: string, half: string, cycle: string) => `Year ends ${year} · Half ends ${half} · 3 months ends ${cycle}`,
  naturalRange: (days: number, end: string) => `${days} days left this year · Quarter ends ${end}`,
  yearRemaining: (days: number) => `${days} days left in this year`,
  futureDirection: (days: number, year: string) => `Only ${days} days remain. Your direction will go into ${year}.`,
  lockedSummary: (mode: string, date: string, zone: string, weekday: string) => `Will lock: ${mode} · Start ${date} · ${zone} · Week starts ${weekday}`,
  halfRange: (first: string, last: string, year: string | null) => `${year ? year + ' ' : ''}${first}–${last}`,
}
