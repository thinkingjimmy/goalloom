/**
 * [INPUT]: A SQL driver inside the caller's protected migration transaction.
 * [OUTPUT]: Live and base workspace tables accepting the macos style, preserving every row and column.
 * [POS]: Shared appearance constraint migration; historical v8 DDL remains immutable.
 */
interface Driver {
  exec(sql: string): void
  prepare(sql: string): { get(): Record<string, unknown> | undefined }
}

export function widenWorkspaceStyles(db: Driver): void {
  for (const table of ['workspace', 'base_workspace']) {
    const sql = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='${table}'`).get()?.sql
    if (typeof sql !== 'string' || sql.includes("'macos'")) continue
    const constraint = "CHECK(style IN ('paper','minimal'))"
    if (!sql.includes(constraint)) throw new Error('Unsupported workspace style constraint')
    const create = sql.replace(/^CREATE TABLE\s+(?:"[^"]+"|\w+)/i, `CREATE TABLE ${table}_appearance`)
      .replace(constraint, "CHECK(style IN ('paper','minimal','macos'))")
    db.exec(`${create}; INSERT INTO ${table}_appearance SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_appearance RENAME TO ${table};`)
  }
}
