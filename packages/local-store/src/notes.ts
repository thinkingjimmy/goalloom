/**
 * [INPUT]: A saved Markdown description.
 * [OUTPUT]: The same bounded note signal the desktop board uses.
 * [POS]: Kept byte-for-behavior aligned with apps/desktop/src/shared/notes.ts. The parity test fails if they drift.
 */

const limit = 120, maxLinks = 3
const clip = (text: string) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text

function normalizeLinkUrl(value: string): string | null {
  if (value.length > 4096 || /[\u0000-\u0020\u007f\\]/.test(value)) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.href.length > 4096) return null
    return url.href
  } catch { return null }
}

const plain = (line: string) => line
  .replace(/!?\[([^\]]*)\]\(([^)\s]*)\)/g, (_, label: string, url: string) => label || url)
  .replace(/`([^`]*)`/g, '$1')
  .replace(/https?:\/\/\S+/g, '')
  .replace(/(\*\*|__|~~|\*|_)(\S(?:.*?\S)?)\1/g, '$2')
  .replace(/^\s*(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
  .replace(/\s+/g, ' ').trim()

export interface NoteSignal {
  tasks: { done: number; total: number } | null
  next: string | null
  links: string[]
  linkCount: number
  excerpt: string
}

export function noteSignal(text: string): NoteSignal | null {
  if (!text.trim()) return null
  let done = 0, total = 0, next: string | null = null, excerpt = '', fenced = false
  const links: string[] = [], seen = new Set<string>()
  for (const raw of text.split('\n')) {
    if (/^\s{0,3}(```|~~~)/.test(raw)) { fenced = !fenced; continue }
    if (fenced) continue
    const task = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(raw)
    if (task) {
      total++
      if (task[1] !== ' ') done++
      else if (next === null) next = clip(plain(task[2] ?? '')) || null
    }
    for (const match of raw.replace(/`[^`]*`/g, ' ').matchAll(/https?:\/\/[^\s<>()[\]"'`]+/g)) {
      const url = normalizeLinkUrl(match[0].replace(/[.,;:!?]+$/, ''))
      if (!url || seen.has(url)) continue
      seen.add(url)
      if (links.length < maxLinks) links.push(url)
    }
    if (!excerpt) {
      const value = plain(raw)
      if (value) excerpt = clip(value)
    }
  }
  return { tasks: total ? { done, total } : null, next, links, linkCount: seen.size, excerpt }
}

export function linkHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}
