/**
 * [INPUT]: Trusted projection prefix and placement table alias.
 * [OUTPUT]: SQL expression resolving a placement-local outline parent, independently of task ownership.
 * [POS]: Shared visible/base ordering rule for desktop transactions and canonical replay.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export function localParentSql(prefix = '', alias = 'p'): string {
  return `CASE WHEN EXISTS(SELECT 1 FROM ${prefix}item_placements outline_parent
    WHERE outline_parent.itemId=${alias}.nestingParentId AND outline_parent.horizon=${alias}.horizon
    AND outline_parent.periodId IS ${alias}.periodId) THEN ${alias}.nestingParentId ELSE NULL END`
}
