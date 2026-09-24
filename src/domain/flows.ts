/**
 * [INPUT]: Active parent edges and uniquely colored flow roots.
 * [OUTPUT]: Stable, deduplicated root memberships with shared ancestor memoization.
 * [POS]: Pure flow resolution used by renderer projections; storage enforces root and color constraints.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export interface FlowEdge { parentId: string; childId: string }

export function flowIndex(edges: FlowEdge[], rootIds: Iterable<string>): (itemId: string) => string[] {
  const roots = new Set(rootIds)
  const parents = new Map<string, string[]>()
  for (const edge of edges) {
    const list = parents.get(edge.childId) ?? []
    list.push(edge.parentId); parents.set(edge.childId, list)
  }
  const memo = new Map<string, string[]>([...roots].map(id => [id, [id]]))
  // Resolve ancestors once in dependency order, retaining the original parent order.
  const resolve = (itemId: string): string[] => {
    const stack = [{ id: itemId, next: 0 }]
    while (stack.length) {
      const frame = stack.at(-1)!
      if (memo.has(frame.id)) { stack.pop(); continue }
      const ancestors = parents.get(frame.id) ?? []
      const parent = ancestors[frame.next++]
      if (parent !== undefined) { if (!memo.has(parent)) stack.push({ id: parent, next: 0 }); continue }
      memo.set(frame.id, [...new Set(ancestors.flatMap(id => memo.get(id)!))])
      stack.pop()
    }
    return memo.get(itemId)!
  }
  return resolve
}
