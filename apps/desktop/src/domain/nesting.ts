/**
 * [INPUT]: Explicit goal edges, independent placements, live nesting links and an injected stable virtual-ID factory.
 * [OUTPUT]: Effective goal edges, cycle-safe leaf/group targets and stable mixed/separated two-level rows.
 * [POS]: Shared outline rules; nesting never changes task lifecycle or creates a goal edge to its container.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import type { ItemSummary, Relation } from '../shared/contracts/entities'

export interface NestingLink { parentId: string; childId: string }
export function nestingTargets(itemId: string, edges: readonly NestingLink[], nesting: readonly NestingLink[]): (parentId: string) => boolean {
  const children = new Map<string, string[]>()
  for (const edge of combinedTopology(edges, nesting)) {
    const group = children.get(edge.parentId) ?? []; group.push(edge.childId); children.set(edge.parentId, group)
  }
  const blocked = new Set<string>(), pending = [itemId]
  while (pending.length) { const id = pending.pop()!; if (blocked.has(id)) continue; blocked.add(id); pending.push(...children.get(id) ?? []) }
  const nested = new Set(nesting.map(link => link.childId))
  return parentId => !blocked.has(parentId) && !nested.has(parentId)
}
export function effectiveRelations(edges: readonly Relation[], nesting: readonly NestingLink[], virtualId: (relationId: string, childId: string) => string): Relation[] {
  const parents = new Map<string, Relation[]>()
  for (const edge of edges) if (!edge.invalidatedAt) {
    const list = parents.get(edge.childId) ?? []; list.push(edge); parents.set(edge.childId, list)
  }
  const nested = new Set(nesting.map(link => link.childId))
  const used = new Set(edges.map(edge => edge.id))
  const inherited = nesting.flatMap(link => (parents.get(link.parentId) ?? []).map(edge => {
    let attempt = 0, id = virtualId(edge.id, link.childId)
    while (used.has(id)) id = virtualId(`${edge.id}\u0000${++attempt}`, link.childId)
    used.add(id)
    return { ...edge, id, childId: link.childId, inheritedFrom: { rootId: link.parentId, relationId: edge.id } }
  }))
  return [...edges.filter(edge => !nested.has(edge.childId)), ...inherited]
}
export function combinedTopology<T extends NestingLink>(edges: readonly T[], nesting: readonly NestingLink[]): NestingLink[] {
  return [...edges, ...nesting]
}
export function outlineRows<T extends Pick<ItemSummary, 'id' | 'placement'>>(items: readonly T[], compare?: (a: string, b: string) => number, contexts: readonly T[] = []): T[] {
  const byId = new Map([...contexts, ...items].map(item => [item.id, item])), children = new Map<string, T[]>(), roots = new Map<string, T>()
  const visible = new Set(items.map(item => item.id))
  for (const item of items) {
    const parent = item.placement.nestingParentId
    if (parent && byId.has(parent)) {
      const list = children.get(parent) ?? []; list.push(item); children.set(parent, list); roots.set(parent, byId.get(parent)!)
    } else roots.set(item.id, item)
  }
  const manual = (a: T, b: T) => a.placement.sortKey - b.placement.sortKey || a.id.localeCompare(b.id, 'en')
  return [...roots.values()].sort(compare ? (a, b) => compare(a.id, b.id) : manual)
    .flatMap(root => [...visible.has(root.id) ? [root] : [], ...(children.get(root.id) ?? []).sort(manual)])
}
export function outlineSections(items: ItemSummary[], contexts: ItemSummary[] = []): { rows: ItemSummary[]; todo: ItemSummary[]; done: ItemSummary[] } {
  const visible = new Map(items.map(item => [item.id, item]))
  const context = new Map(contexts.map(item => [item.id, item]))
  const groups = new Map<string, ItemSummary[]>()
  for (const item of items) {
    const root = item.placement.nestingParentId ?? item.id
    const group = groups.get(root) ?? []; group.push(item); groups.set(root, group)
  }
  const rows: ItemSummary[] = [], todo: ItemSummary[] = [], done: ItemSummary[] = []
  for (const [rootId, members] of groups) {
    const root = visible.get(rootId) ?? context.get(rootId)
    const groupRows = outlineRows(root && !visible.has(rootId) ? [root, ...members] : members)
    rows.push(...groupRows)
    ;(members.some(item => item.status === 'todo') ? todo : done).push(...groupRows)
  }
  return { rows, todo, done }
}
