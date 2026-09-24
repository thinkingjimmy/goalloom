/**
 * [INPUT]: Ordered item events and fixed period boundaries.
 * [OUTPUT]: End-of-period membership, bounded later details and total counts; unknown on missing or reversed history.
 * [POS]: Streaming domain projection without storage access or inference from current state.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { compareInstants, type Period } from './calendar'
import type { BusinessState, ItemEvent } from '../shared/contracts/effects'

export function projectHistory(events: ItemEvent[], period: Period): { member: boolean; endState: BusinessState | null; later: ItemEvent[]; anomalous: boolean } {
  const { laterCount: _count, ...projection } = projectOrderedHistory([...events].sort((a, b) => a.seq - b.seq), period, Infinity)
  return projection
}

/** Consume a storage-ordered stream, retaining a bounded tail while checking every timestamp. */
export function projectOrderedHistory(events: Iterable<ItemEvent>, period: Period, limit: number): { member: boolean; endState: BusinessState | null; later: ItemEvent[]; laterCount: number; anomalous: boolean } {
  let member = false, anomalous = false, previous: string | null = null, endState: BusinessState | null = null, laterCount = 0
  const later: ItemEvent[] = []
  for (const event of events) {
    member ||= event.before?.periodId === period.id || event.after.periodId === period.id
    if (previous !== null && compareInstants(event.at, previous) < 0) anomalous = true
    previous = event.at
    if (compareInstants(event.at, period.endAt) < 0) endState = event.after
    else { laterCount++; later.push(event); if (later.length > limit) later.shift() }
  }
  return { member, endState: anomalous ? null : endState, later, laterCount, anomalous }
}
