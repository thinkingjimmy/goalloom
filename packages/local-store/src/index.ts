/**
 * [INPUT]: Schema, calendar, board rules and the offline workspace.
 * [OUTPUT]: The public surface the mobile app imports.
 * [POS]: Package entry. No React Native. The AI key check is the only call that uses the network, and only when a sheet tests a key.
 */
export { installDevice, installSchema, userVersion } from './schema'
export { LocalWorkspace, StoreError } from './store'
export type { CreateInput, Snapshot } from './store'
export { defaultPrefs, readPrefs, writePrefs } from './prefs'
export type { DevicePrefs, LocaleId } from './prefs'
export { catalogs, systemLocale } from './copy'
export type { Copy } from './copy'
export { seedDemo, DEMO_NOW } from './demo'
export { noteSignal, linkHost } from './notes'
export { columnRange, compactRange, currentPeriod, daysLeft, nearbyPeriods, periodFromId, periodMeta, precedingPeriod, rangeLabel, workspaceDate, yearMenu } from './periods'
export { buildParentOrder, parentOrderedHorizon } from './order'
export type { OrderNode } from './order'
export { flowPalette, flowRing, flowStroke, flowTint } from './colors'
export {
  APP_TABS, BOARD_COLUMNS, COLUMN_MENU_ROW, FLOW_INDENT, GESTURE_SLOP, LONG_PRESS_MS, NEST_INDENT, OPEN_COLUMN, OPEN_INDEX,
  canNest, classifyPointer, columnIndex, columnMenuDismiss, columnMenuIndex, columnOutline, columnSections, completionLabel, dropOnRows, flowColors, flowConnectors, flowLeftLinks, flowSections,
  mayLink, neighborsAfterRemoval, nextHorizon, orderFlowItems, outlineRows, pageFromOffset, parseCapture, rowSwipeAction, sheetRelease, shouldDragSheet, showBreakpoint, withCaptureColumn,
  SHEET_DISMISS_VELOCITY, SHEET_GRABBER,
} from './board'
export type { AppTab, CaptureDraft, DropTarget, FlowRailItem, RowBox } from './board'
export { anchorDateAllowed, calendarAnchorVisible, calendarWeekStart, clampAnchorDate, monthGrid, signInButtons, syncPasswordReady } from './onboarding'
export type { SignInProvider } from './onboarding'
export type { MonthCell } from './onboarding'
export { filterTimeZones, friendlyZoneName, pinCurrentZone, readTimeZones, runtimeZoneName, zoneLocalizedNames } from './time-zones'
export { AI_KEY_URL, AI_PROBE_URL, AI_PROVIDERS, aiKeyAccepted, aiProbeResult, parseAiCredential, probeAiKey, serializeAiCredential } from './ai-connect'
export type { AiConnection, AiCredential, AiProbe, AiProbeFetch, AiProviderId } from './ai-connect'
export { ACTION_TOAST_MS, UNDO_TOAST_MS, actionNotice, boardVisibility } from './feedback'
export type { Glance, ItemVisibility, Notice, NoticeAction, NoticeBoard, ToastCopy } from './feedback'
export { horizons, periodHorizons } from './types'
export type {
  ActivityRow, BoardStyle, CalendarConfig, CheckStyle, Horizon, ItemRow, NoteSignal, Period, PeriodHorizon,
  PolicyMode, RelationRow, SqlDriver, SqlValue, Status, Theme, UndoToken,
} from './types'
