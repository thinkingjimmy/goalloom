/**
 * [INPUT]: Deterministic application, replay, settings, send-state and conflict metadata modules.
 * [OUTPUT]: Shared SQL-driver sync core, placement-local outline SQL, gap-safe allocation and task-grouped review/acknowledgement APIs.
 * [POS]: Public store-core boundary; host file, UI and network APIs stay outside this package.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export { applySyncOp, type AppliedOp, type CanonChange } from './apply'
export { businessCode } from './classify'
export { SyncApplyError, type ApplyHost, type PeriodRow, type SqlDriver, type SqlStatement, type SqlValue } from './driver'
export { projectionHash } from './hash'
export { localParentSql } from './outline'
export { SORT_KEY_STEP, sortKeyBetween } from './sort'
export { applyRemoteBatch, assertForeignKeys, copyProjectionToBase, mergeRemoteOps, rebuildVisibleFull, type RemoteEnvelope } from './rebuild'
export { exportCanonicalSnapshot, installCanonicalSnapshot, type SnapshotBody } from './snapshot'
export { cancelIfNeverSent, markAccepted, markSendUnknown, pauseWorkspace } from './state'
export {
  clearSyncSettings, isLaterSetting, enqueueSettings, projectWorkspaceSettings, readSettings, scrubSecretMaterial, settingsBaselineOp, syncSettingsReady, writeSetting, type SettingEntry, type SettingRow,
} from './settings'
export { persistedSecret, redactSyncOp, secretFingerprint } from './secrets'
export { actionItem, acknowledgeConflict, pendingConflicts, recordOverwrittenConflicts, type PendingConflict } from './conflicts'
