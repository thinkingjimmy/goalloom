/**
 * [INPUT]: Current business sqlite_master rows.
 * [OUTPUT]: The FK-ordered business table list and identical base_* projection tables, indexes and triggers.
 * [POS]: Shared canonical replay shadow factory; history tables are never cloned.
 */
// Foreign-key-safe insertion order; delete in reverse.
export const businessTables = ['workspace', 'planning_periods', 'items', 'item_placements', 'item_relations', 'rollover_policies', 'period_focus'] as const

const prefixIdents = [
  'item_placements', 'item_relations', 'planning_periods', 'rollover_policies',
  'unique_flow_color', 'unique_active_edge', 'placements_period_order', 'items_status_time', 'items_visibility',
  'relations_child', 'relations_parent', 'flow_root_edge_insert', 'flow_root_edge_update', 'flow_root_color',
  'placement_scale_insert', 'placement_scale_update', 'relation_guard_insert', 'relation_guard_update',
  'placements_nesting', 'nesting_guard_insert', 'nesting_guard_update', 'period_focus', 'focus_scale_insert', 'focus_scale_update',
  'workspace', 'items',
]

export function prefixShadowSql(sql: string): string {
  let out = sql
  for (const name of prefixIdents) out = out.replace(new RegExp(`\\b${name}\\b`, 'g'), `base_${name}`)
  return out
}

export interface MasterRow { type: string; name: string; tbl_name: string; sql: string | null }

export function shadowStatements(rows: MasterRow[]): string[] {
  const allowed = new Set<string>(businessTables)
  const order = (type: string) => type === 'table' ? 0 : type === 'index' ? 1 : 2
  return rows
    .filter(row => row.sql && allowed.has(row.tbl_name))
    .sort((left, right) => order(left.type) - order(right.type) || left.name.localeCompare(right.name))
    .map(row => prefixShadowSql(row.sql!))
}
