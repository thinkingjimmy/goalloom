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
export { currentPeriod, daysLeft, nearbyPeriods, periodMeta, precedingPeriod, workspaceDate } from './periods'
export { buildParentOrder, parentOrderedHorizon } from './order'
export type { OrderNode } from './order'
export { flowPalette, flowRing, flowStroke, flowTint } from './colors'
export {
  BOARD_COLUMNS, GESTURE_SLOP, LONG_PRESS_MS, NEST_INDENT, OPEN_COLUMN, OPEN_INDEX,
  canNest, classifyPointer, columnIndex, columnOutline, columnSections, dropOnRows, flowColors, flowConnectors, flowSections,
  mayLink, neighborsAfterRemoval, nextHorizon, outlineRows, pageFromOffset, parseCapture, rowSwipeAction, showBreakpoint,
} from './board'
export type { CaptureDraft, DropTarget, RowBox } from './board'
export { horizons, periodHorizons } from './types'
export type {
  ActivityRow, BoardStyle, CalendarConfig, CheckStyle, Horizon, ItemRow, NoteSignal, Period, PeriodHorizon,
  PolicyMode, RelationRow, SqlDriver, SqlValue, Status, Theme, UndoToken,
} from './types'
