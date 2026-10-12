/**
 * [INPUT]: JSON-compatible values (no bigint, function, or undefined-in-array).
 * [OUTPUT]: One canonical UTF-8 JSON string: object keys sorted by UTF-16 code unit, no insignificant whitespace.
 * [POS]: The only canonicalization used for payloadHash, roster bodies and recovery checkpoints.
 */

function sortValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sortValue)
  const source = value as Record<string, unknown>
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) {
    if (source[key] !== undefined) sorted[key] = sortValue(source[key])
  }
  return sorted
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}
