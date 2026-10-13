/**
 * [INPUT]: Schema, calendar, board rules and the offline workspace.
 * [OUTPUT]: The public surface the mobile app imports.
 * [POS]: Package entry. No React Native and no network.
 */
export { installDevice, installSchema, userVersion } from './schema'
export { LocalWorkspace, StoreError } from './store'
export type { CreateInput, Snapshot } from './store'
export { defaultPrefs, readPrefs, writePrefs } from './prefs'
export type { DevicePrefs, LocaleId } from './prefs'
export { seedDemo, DEMO_NOW } from './demo'
export { noteSignal, linkHost } from './notes'
export { compactRange, currentPeriod, daysLeft, nearbyPeriods, periodFromId, periodMeta, precedingPeriod, rangeLabel, workspaceDate } from './periods'
export { buildParentOrder, parentOrderedHorizon } from './order'
export type { OrderNode } from './order'
export { flowPalette, flowRing, flowStroke, flowTint } from './colors'
export {
  APP_TABS, BOARD_COLUMNS, FLOW_INDENT, GESTURE_SLOP, LONG_PRESS_MS, NEST_INDENT, OPEN_COLUMN, OPEN_INDEX,
  canNest, classifyPointer, columnIndex, columnOutline, columnSections, completionLabel, dropOnRows, flowColors, flowConnectors, flowLeftLinks, flowSections,
  mayLink, neighborsAfterRemoval, nextHorizon, outlineRows, pageFromOffset, parseCapture, rowSwipeAction, sheetRelease, shouldDragSheet, showBreakpoint, withCaptureColumn,
  SHEET_DISMISS_VELOCITY, SHEET_GRABBER,
} from './board'
export type { AppTab, CaptureDraft, DropTarget, FlowRailItem, RowBox } from './board'
export { anchorDateAllowed, calendarAnchorVisible, calendarWeekStart, clampAnchorDate, monthGrid, syncPasswordReady } from './onboarding'
export type { MonthCell } from './onboarding'
export { filterTimeZones, friendlyZoneName, pinCurrentZone, readTimeZones, runtimeZoneName, zoneLocalizedNames } from './time-zones'
export { ACTION_TOAST_MS, UNDO_TOAST_MS, actionNotice, boardVisibility } from './feedback'
export type { Glance, ItemVisibility, Notice, NoticeAction, NoticeBoard, ToastCopy } from './feedback'
export { horizons, periodHorizons } from './types'
export type {
  ActivityRow, BoardStyle, CalendarConfig, CheckStyle, Horizon, ItemRow, NoteSignal, Period, PeriodHorizon,
  PolicyMode, RelationRow, SqlDriver, SqlValue, Status, Theme, UndoToken,
} from './types'
