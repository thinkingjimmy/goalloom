/**
 * [INPUT]: Consecutive authoritative snapshots from one workspace generation.
 * [OUTPUT]: Shared references for unchanged summaries, periods, topology, and flow roots.
 * [POS]: Renderer read-model reconciliation; never changes versions or business data.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { Snapshot } from '../../shared/contracts/queries'

function share<T>(before: T[], after: T[], identity: (row: T) => string): T[] {
  const previous = new Map(before.map(row => [identity(row), row]))
  const next = after.map(row => {
    const old = previous.get(identity(row))
    return old && JSON.stringify(old) === JSON.stringify(row) ? old : row
  })
  return before.length === next.length && next.every((row, index) => row === before[index]) ? before : next
}
export function shareSnapshot(previous: Snapshot | null, next: Snapshot): Snapshot {
  if (!previous || previous.workspace.generation !== next.workspace.generation) return next
  return { ...next,
    items: share(previous.items, next.items, row => row.id),
    periods: share(previous.periods, next.periods, row => row.id),
    relations: share(previous.relations, next.relations, row => row.id),
    flows: share(previous.flows, next.flows, row => row.id),
    policies: share(previous.policies, next.policies, row => row.horizon),
  }
}
