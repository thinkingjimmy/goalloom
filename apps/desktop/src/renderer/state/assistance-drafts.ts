/**
 * [INPUT]: Generation-scoped, unsaved form values and the current help form.
 * [OUTPUT]: At most eight task drafts within 512 KiB, plus task adoption and replacement/forget cleanup.
 * [POS]: Session-only draft storage; never localStorage, SQLite, export or logs.
 */
export interface AssistanceDraft { choice?: number | null; text: string }
const entries = new Map<string, { itemId: string; value: AssistanceDraft; size: number }>()
let generation: string | null = null
export function clearAssistanceDrafts(itemId?: string): void {
  if (!itemId) entries.clear()
  else for (const [key, entry] of entries) if (entry.itemId === itemId) entries.delete(key)
}
export function syncAssistanceGeneration(next: string): void { if (next !== generation) { generation = next; clearAssistanceDrafts() } }
export function readAssistanceDraft(next: string, itemId: string): AssistanceDraft | null {
  syncAssistanceGeneration(next)
  const key = itemId, entry = entries.get(key)
  if (!entry) return null
  entries.delete(key); entries.set(key, entry)
  return entry.value
}
export function saveAssistanceDraft(next: string, itemId: string, value: AssistanceDraft | null): void {
  syncAssistanceGeneration(next)
  const key = itemId
  entries.delete(key)
  if (!value) return
  const size = new TextEncoder().encode(JSON.stringify(value)).length
  if (size > 512 * 1024) return
  entries.set(key, { itemId, value, size })
  while (entries.size > 8 || [...entries.values()].reduce((sum, row) => sum + row.size, 0) > 512 * 1024) entries.delete(entries.keys().next().value!)
}
