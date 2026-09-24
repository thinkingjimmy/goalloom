/** Numeric, opt-in wire-validation counters; no values are retained. */
let enabled = false, count = 0, duration = 0
export function beginValidationMetrics(active: boolean): void { enabled = active; count = 0; duration = 0 }
export function endValidationMetrics() { enabled = false; return { dateChecks: count, dateMs: duration } }
export function measureDate<T>(validate: () => T): T {
  if (!enabled) return validate()
  const start = performance.now()
  try { return validate() } finally { count++; duration += performance.now() - start }
}
