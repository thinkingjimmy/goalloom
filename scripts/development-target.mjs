/**
 * [INPUT]: Explicit hosted-test URL before any remote operation.
 * [OUTPUT]: Rejection of every target except the dedicated development project.
 * [POS]: Shared guard for destructive test/admin tools; production deployment has a separate entry.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export function assertDevelopmentTarget(url) {
  if (url !== 'https://asqyvcnxdltzzfutbbqy.supabase.co') throw Error('Only the dedicated development Supabase project is allowed')
}
