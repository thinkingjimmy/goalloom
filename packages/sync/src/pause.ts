import { SyncApplyError, pauseWorkspace, type SqlDriver } from '@goalloom/store-core'

export function rejectUnknownFormat(driver: SqlDriver, formatVersion: number, at: string): void {
  if (formatVersion <= 1) return
  pauseWorkspace(driver, 'unsupported_version', at)
  throw new SyncApplyError('unsupported_version')
}

export function rejectMissingKey(driver: SqlDriver, hasKey: boolean, at: string): void {
  if (hasKey) return
  pauseWorkspace(driver, 'key_missing', at)
  throw new SyncApplyError('key_missing')
}
