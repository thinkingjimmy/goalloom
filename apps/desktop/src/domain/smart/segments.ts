/**
 * [INPUT]: 用户原文（不做语义理解）。
 * [OUTPUT]: segmentSlots：换行/分号/列表标记为强边界、括号与引号外的逗号句号为弱边界的无损候选槽位（带原文偏移）；plainLater 普通模式单条标题/说明。
 * [POS]: 智能输入的片段枚举层，只保留原文位置，不断定片段是否为任务；超过槽位上限时返回 null 要求分批。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
export interface Slot { id: string; text: string; start: number; end: number }
export const slotLimit = 8
export const titleLimit = 500

const listMarker = /^\s*(?:[-*•·]|\d{1,2}[.)、．]|[（(]\d{1,2}[）)])\s*/
const opening = '（(《「『【“‘[', closing = '）)》」』】”’]'
function pieces(text: string, offset: number, boundary: RegExp, nested = false): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = []
  // A comma inside brackets or quotes belongs to that phrase, e.g. 「网站（碎碎念，学习笔记）」 stays one slot.
  const depth = (index: number) => { let level = 0; for (const char of text.slice(0, index)) { if (opening.includes(char)) level++; else if (closing.includes(char)) level = Math.max(0, level - 1) } return level }
  let cursor = 0
  for (const match of text.matchAll(boundary)) {
    if (nested && depth(match.index!) > 0) continue
    out.push({ text: text.slice(cursor, match.index), start: offset + cursor })
    cursor = match.index! + match[0].length
  }
  out.push({ text: text.slice(cursor), start: offset + cursor })
  return out
}
function trimmed(piece: { text: string; start: number }, marker = false): { text: string; start: number } | null {
  const stripped = marker ? piece.text.replace(listMarker, '') : piece.text
  const lead = piece.text.length - stripped.length + (stripped.length - stripped.trimStart().length)
  const text = stripped.trim()
  return text ? { text, start: piece.start + lead } : null
}

export function segmentSlots(text: string): Slot[] | null {
  const strong = pieces(text, 0, /\r?\n|[；;]/g).map(piece => trimmed(piece, true)).filter(piece => piece !== null)
  if (!strong.length) return []
  if (strong.length > slotLimit) return null
  // --- Weak boundaries only refine a strong segment while the total stays within the slot budget. ---
  const slots: { text: string; start: number }[] = []
  strong.forEach((segment, index) => {
    const weak = pieces(segment.text, segment.start, /[，,。]/g, true).map(piece => trimmed(piece)).filter(piece => piece !== null)
    const remaining = strong.length - index - 1
    if (weak.length > 1 && slots.length + weak.length + remaining <= slotLimit) slots.push(...weak)
    else slots.push(segment)
  })
  return slots.map((slot, index) => ({ id: `s${index + 1}`, text: slot.text, start: slot.start, end: slot.start + slot.text.length }))
}

// Plain mode never splits: first non-empty line becomes the title, the full original text stays in the description.
export function plainLater(text: string): { title: string; description: string } | null {
  const first = text.split(/\r?\n/).map(line => line.trim()).find(Boolean)
  if (!first) return null
  const title = first.length > titleLimit ? first.slice(0, titleLimit) : first
  return { title, description: text.trim() === title ? '' : text.trim() }
}
