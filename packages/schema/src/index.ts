/**
 * [INPUT]: sqlite_master rows for the seven projection tables.
 * [OUTPUT]: v8 DDL, v9 history/sync DDL, and base_* statements cloned from the live schema text.
 * [POS]: Schema package. No node:sqlite types. Desktop migrate() is the only writer of user_version.
 */
export { businessTables, prefixShadowSql, shadowStatements, v9HistoryRewrite, v9SyncDdl, type MasterRow } from './v9'
export { v8Ddl } from './v8'
