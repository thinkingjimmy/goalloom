/**
 * [INPUT]: 有效父子边与流程根（带唯一颜色的无上级条目）。
 * [OUTPUT]: 条目所属流程根的稳定去重列表；不读取存储、不修改状态。
 * [POS]: 流程归属的纯规则；renderer 着色/筛选与导入校验共用，事务层另行强制唯一与根约束。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
export interface FlowEdge { parentId: string; childId: string }

export function flowIndex(edges: FlowEdge[], rootIds: Iterable<string>): (itemId: string) => string[] {
  const roots = new Set(rootIds)
  const parents = new Map<string, string[]>()
  for (const edge of edges) parents.set(edge.childId, [...(parents.get(edge.childId) ?? []), edge.parentId])
  const memo = new Map<string, string[]>()
  // --- Iterative DFS keeps deep chains safe; the DAG guarantees termination. ---
  const resolve = (itemId: string): string[] => {
    const cached = memo.get(itemId)
    if (cached) return cached
    if (roots.has(itemId)) { memo.set(itemId, [itemId]); return [itemId] }
    const found: string[] = [], seen = new Set<string>([itemId]), stack = [...(parents.get(itemId) ?? [])].reverse()
    while (stack.length) {
      const id = stack.pop()!
      if (seen.has(id)) continue
      seen.add(id)
      if (roots.has(id)) { if (!found.includes(id)) found.push(id); continue }
      stack.push(...[...(parents.get(id) ?? [])].reverse())
    }
    memo.set(itemId, found)
    return found
  }
  return resolve
}
