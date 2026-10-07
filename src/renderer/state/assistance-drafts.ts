/**
 * [INPUT]: Generation-scoped, unsaved form values and explicit help/guidance/schedule entry intent.
 * [OUTPUT]: At most eight separate entry drafts within 512 KiB, plus task adoption and replacement/forget cleanup.
 * [POS]: Session-only draft storage; never localStorage, SQLite, export or logs.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { GuidanceValue } from '../../shared/contracts/assistance'
export interface AssistanceDraft { text: string; answer: string; adjustment: string; guidance: GuidanceValue | null; manual: boolean; horizon: string | null; date: string; source: boolean }
export type AssistanceEntry = 'help' | 'guidance' | 'schedule'
const entries = new Map<string, { itemId: string; value: AssistanceDraft; size: number }>()
let generation: string | null = null
export function clearAssistanceDrafts(itemId?: string): void {
  if (!itemId) entries.clear()
  else for (const [key, entry] of entries) if (entry.itemId === itemId) entries.delete(key)
}
export function syncAssistanceGeneration(next: string): void { if (next !== generation) { generation = next; clearAssistanceDrafts() } }
export function readAssistanceDraft(next: string, itemId: string, intent: AssistanceEntry = 'help'): AssistanceDraft | null {
  syncAssistanceGeneration(next)
  const key = JSON.stringify([itemId, intent]), entry = entries.get(key)
  if (!entry) return null
  entries.delete(key); entries.set(key, entry)
  return entry.value
}
export function saveAssistanceDraft(next: string, itemId: string, value: AssistanceDraft | null, intent: AssistanceEntry = 'help'): void {
  syncAssistanceGeneration(next)
  const key = JSON.stringify([itemId, intent])
  entries.delete(key)
  if (!value) return
  const size = new TextEncoder().encode(JSON.stringify(value)).length
  if (size > 512 * 1024) return
  entries.set(key, { itemId, value, size })
  while (entries.size > 8 || [...entries.values()].reduce((sum, row) => sum + row.size, 0) > 512 * 1024) entries.delete(entries.keys().next().value!)
}
