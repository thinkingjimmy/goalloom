/**
 * [INPUT]: Optional, process-owned GOALLOOM_PERF_LOG path and numeric measurements.
 * [OUTPUT]: Local JSONL timings and memory counters; never SQL, arguments, or task content.
 * [POS]: Opt-in diagnostics shared by main and its storage thread. RSS is process-wide.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { appendFileSync } from 'node:fs'
import { isMainThread } from 'node:worker_threads'
import type { DatabaseSync } from 'node:sqlite'

export const measuring = Boolean(process.env.GOALLOOM_PERF_LOG)
export function metric(stage: string, values: Record<string, string | number | boolean | null> = {}): void {
  if (!measuring) return
  const { heapUsed, external, arrayBuffers } = process.memoryUsage()
  try { appendFileSync(process.env.GOALLOOM_PERF_LOG!, `${JSON.stringify({ stage, thread: isMainThread ? 'main' : 'storage', at: Date.now(), heapUsed, external, arrayBuffers, ...values })}\n`) } catch { /* Diagnostics must never affect a write. */ }
}

let counts = { statements: 0, rows: 0, sqlMs: 0 }
export function sqlCounters() { const result = counts; counts = { statements: 0, rows: 0, sqlMs: 0 }; return result }
export function observeDatabase(db: DatabaseSync): void {
  if (!measuring) return
  const prepare = db.prepare.bind(db)
  db.prepare = (...args) => {
    const statement = prepare(...args)
    for (const method of ['all', 'get', 'run'] as const) {
      const original = statement[method].bind(statement)
      Object.defineProperty(statement, method, { value: (...parameters: Parameters<typeof original>) => {
        const start = performance.now()
        try {
          const result = Reflect.apply(original, statement, parameters)
          counts.rows += Array.isArray(result) ? result.length : method === 'get' && result ? 1 : 0
          return result
        } finally { counts.statements++; counts.sqlMs += performance.now() - start }
      } })
    }
    const iterate = statement.iterate.bind(statement)
    Object.defineProperty(statement, 'iterate', { value: function* (...parameters: unknown[]) {
      const start = performance.now(); counts.statements++
      try { for (const row of Reflect.apply(iterate, statement, parameters)) { counts.rows++; yield row } }
      finally { counts.sqlMs += performance.now() - start }
    } })
    return statement
  }
}
