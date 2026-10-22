/**
 * [INPUT]: sqlite_master rows for the seven projection tables.
 * [OUTPUT]: Historical DDL, nesting and appearance migrations, and base_* statements cloned from live schema text.
 * [POS]: Schema package. No node:sqlite types. Desktop migrate() is the only writer of user_version.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export { businessTables, prefixShadowSql, shadowStatements, v9HistoryRewrite, v9SyncDdl, type MasterRow } from './v9'
export { nestingMigrationSql } from './v10'
export { syncSettingsDdl } from './settings'
export { v8Ddl } from './v8'
export { widenWorkspaceStyles } from './appearance'
