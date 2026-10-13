/**
 * [INPUT]: Untrusted link text from tasks or the desktop bridge.
 * [OUTPUT]: A canonical HTTP(S) URL or null, without changing stored task text.
 * [POS]: Lightweight link syntax shared by renderer and main; network destination checks remain in main.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export function normalizeLinkUrl(value: string): string | null {
  if (value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > 4096) return null
    return url.href
  } catch { return null }
}
