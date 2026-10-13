/**
 * [INPUT]: Saved plain text and the shared HTTP URL validator.
 * [OUTPUT]: Lossless text/link tokens and ordered, normalized preview destinations.
 * [POS]: Display-only parsing; never rewrites an item or interprets HTML.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { normalizeLinkUrl } from '../../../shared/links'

export type LinkToken = { text: string } | { url: string; label: string; named: boolean }
const stop = /[\s<>"'`\u3000。，、；：！？（）「」『』【】《》“”‘’]/u
const trailing = /[.,;:!?]+$/u

function bareEnd(text: string, start: number): number {
  let end = start
  while (end < text.length && !stop.test(text[end]!)) end++
  let candidate = text.slice(start, end).replace(trailing, '')
  for (;;) {
    const closing = candidate.at(-1), opening = closing === ')' ? '(' : closing === ']' ? '[' : closing === '}' ? '{' : null
    if (!opening || candidate.split(closing!).length <= candidate.split(opening).length) break
    candidate = candidate.slice(0, -1).replace(trailing, '')
  }
  return start + candidate.length
}

function markdown(text: string, start: number): { end: number; token: LinkToken } | null {
  const label = text.slice(start + 1, start + 1026)
  const delimiter = label.indexOf('](')
  if (delimiter < 0 || label.slice(0, delimiter).includes('\n')) return null
  const labelEnd = start + 1 + delimiter
  const urlStart = labelEnd + 2
  let depth = 1, end = urlStart
  for (; end < Math.min(text.length, urlStart + 4099) && depth; end++) {
    if (text[end] === '(') depth++
    else if (text[end] === ')') depth--
    if (text[end] === '\n') return null
  }
  if (depth) return null
  const raw = text.slice(urlStart, end - 1).trim(), url = normalizeLinkUrl(raw)
  if (!url) return null
  const title = text.slice(start + 1, labelEnd)
  return { end, token: { url, label: title, named: title.trim().length > 0 && normalizeLinkUrl(title.trim()) !== url } }
}

export function parseLinks(text: string): LinkToken[] {
  const tokens: LinkToken[] = [], starts = /\[|https?:\/\//giu
  let cursor = 0, match: RegExpExecArray | null
  while ((match = starts.exec(text))) {
    const start = match.index
    const result = match[0] === '[' ? markdown(text, start) : null
    const end = result?.end ?? (match[0] === '[' ? start : bareEnd(text, start))
    const url = result ? null : normalizeLinkUrl(text.slice(start, end))
    const token = result?.token ?? (url ? { url, label: text.slice(start, end), named: false } : null)
    if (!token) { if (match[0] !== '[') starts.lastIndex = end; continue }
    if (start > cursor) tokens.push({ text: text.slice(cursor, start) })
    tokens.push(token); cursor = end; starts.lastIndex = end
  }
  if (cursor < text.length) tokens.push({ text: text.slice(cursor) })
  return tokens
}

export function linkUrls(text: string): string[] {
  return [...new Set(parseLinks(text).flatMap(token => 'url' in token ? [token.url] : []))]
}

export function linkSource(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./u, '')
  return ['youtube.com', 'm.youtube.com', 'youtu.be'].includes(host) ? 'YouTube' : host
}
