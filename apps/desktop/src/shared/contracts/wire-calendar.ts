/**
 * [INPUT]: Date and timezone strings at a validated wire boundary.
 * [OUTPUT]: Strict Gregorian date and IANA timezone predicates without calendar arithmetic.
 * [POS]: Lightweight shared validation; domain/calendar retains Temporal calculations.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export function validDate(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const year = Number(value.slice(0, 4)), month = Number(value.slice(5, 7)), day = Number(value.slice(8, 10))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1]!
}

const zones = new Map<string, boolean>()
export function validTimezone(value: string): boolean {
  if (value.length > 100 || !/^[A-Za-z][A-Za-z0-9_+\-/]*$/.test(value)) return false
  if (zones.has(value)) return zones.get(value)!
  let valid = false
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); valid = true } catch { /* Numeric offsets and unknown zones are not workspace calendars. */ }
  if (zones.size >= 64) zones.delete(zones.keys().next().value!)
  zones.set(value, valid)
  return valid
}
