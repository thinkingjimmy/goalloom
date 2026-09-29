/**
 * [INPUT]: A saved Markdown description (untrusted text, at most 100,000 characters).
 * [OUTPUT]: `noteSignal`, a bounded digest for board rows — checklist progress and the first open item, up to three
 *           unique HTTP(S) links with their total, and a plain first-line excerpt — or null for blank text.
 * [POS]: Shared pure text helper; storage computes it per item summary so the board never receives description bodies.
 *        Code spans and fenced blocks never count as checklist items or links, matching the description editor.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { NoteSignal } from './contracts/entities'
import { normalizeLinkUrl } from './links'

const limit = 120, maxLinks = 3
const clip = (text: string) => text.length > limit ? `${text.slice(0, limit - 1)}…` : text
// Reading text only: link labels win over targets, bare URLs drop (the signal shows their host), emphasis and block markers drop, whitespace collapses.
const plain = (line: string) => line
  .replace(/!?\[([^\]]*)\]\(([^)\s]*)\)/g, (_, label: string, url: string) => label || url)
  .replace(/`([^`]*)`/g, '$1')
  .replace(/https?:\/\/\S+/g, '')
  .replace(/(\*\*|__|~~|\*|_)(\S(?:.*?\S)?)\1/g, '$2')
  .replace(/^\s*(#{1,6}\s+|>\s?|[-*+]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
  .replace(/\s+/g, ' ').trim()

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
      else if (next === null) next = clip(plain(task[2]!)) || null
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
