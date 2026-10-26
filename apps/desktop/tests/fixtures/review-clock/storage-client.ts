/**
 * [INPUT]: Production StorageClient constructor arguments and a baked test worker path.
 * [OUTPUT]: The unchanged production RPC client connected to the fixed-clock worker.
 * [POS]: Importer-scoped test-main alias; production client and workerData stay unchanged.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { StorageClient as ProductionStorageClient } from '../../../src/main/storage/client'
import type { Locale } from '../../../src/shared/i18n/locale'
declare const __GOALLOOM_REVIEW_WORKER__: string
export class StorageClient extends ProductionStorageClient {
  constructor(_workerPath: string, databasePath: string, backupDirectory: string, locale: Locale) {
    super(__GOALLOOM_REVIEW_WORKER__, databasePath, backupDirectory, locale)
  }
}
