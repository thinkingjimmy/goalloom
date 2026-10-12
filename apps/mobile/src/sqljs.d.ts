declare module '*.wasm' {
  const url: string
  export default url
}

declare module 'sql.js' {
  interface Statement {
    bind(values?: readonly (string | number | null | Uint8Array)[]): boolean
    step(): boolean
    getAsObject(): Record<string, string | number | null | Uint8Array>
    free(): boolean
  }
  interface Database {
    run(sql: string, params?: readonly (string | number | null)[]): Database
    exec(sql: string): unknown
    prepare(sql: string): Statement
    getRowsModified(): number
    export(): Uint8Array
  }
  interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | null) => Database
  }
  export default function initSqlJs(config?: { wasmBinary?: ArrayBuffer | Uint8Array }): Promise<SqlJsStatic>
}
