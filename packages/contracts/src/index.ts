/**
 * [INPUT]: Validated sync operations, settings and finite business/service failure definitions.
 * [OUTPUT]: Shared schemas, guards, types and service-version metadata for desktop and sync transports.
 * [POS]: Contracts package public entry; no storage, network or credential side effects.
 */
export { canonicalJson } from './canonical'
export {
  isRendererSettingKey, isSecretFingerprint, isSecretSettingKey, isWorkspaceSettingKey, parseSetting, rendererSettingKeys,
  secretSettingKeys, settingSchema, syncedSettingKeys, workspaceSettingKeys,
} from './settings'
export type { Setting, SettingKey, SettingValue } from './settings'
export { businessErrorCodes, isBusinessErrorCode, pushErrorCodes, workspacePauseCodes, serviceFailureCodes, isServiceFailureCode } from './errors'
export type { BusinessErrorCode, PushErrorCode, WorkspacePauseCode, ServiceFailureCode } from './errors'
export {
  actionSchema, blobRefSchema, localOnlyCommands, parseSyncOp, pendingSendStates, periodKeySchema,
  sendStates, sortHintSchema, syncOpPayload, syncOpSchema,
} from './sync-op'
export type { Action, CalendarWire, GuidanceWire, LocalOnlyCommand, PeriodKey, SendState, SortHint, SyncOp } from './sync-op'

export * from './cloud'
export * from './lifecycle'
export * from './retrieval'
