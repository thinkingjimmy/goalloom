/**
 * [INPUT]: Current business sqlite_master rows and an empty host database.
 * [OUTPUT]: Direct current business/sync DDL, the pre-focus upgrade statement, exact binding metadata and shadow statements.
 * [POS]: Shared desktop/mobile launch schema. Hosts own format versions and transactions.
 */
export { businessDdl, focusDdl } from './business'
export { canonChangesBody, syncDdl } from './sync'
export { focusMigrationSql } from './migration'
export { businessTables, prefixShadowSql, shadowStatements, type MasterRow } from './shadow'
export { syncSettingsDdl } from './settings'
export { bindingEpochDdl, syncBaselineDdl } from './sync-baseline'
