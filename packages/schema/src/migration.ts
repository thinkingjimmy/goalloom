/**
 * [INPUT]: A current pre-focus database (desktop v15 / mobile v11) inside its host-owned transaction.
 * [OUTPUT]: Period focus tables/triggers, their base_ projection and canon_changes rebuilt with the focus dimension.
 * [POS]: The only shared in-place upgrade. Its text equals fresh DDL, so migrated and fresh sqlite_master rows match.
 */
import { focusDdl } from './business'
import { prefixShadowSql } from './shadow'
import { canonChangesBody } from './sync'

export function focusMigrationSql(): string {
  return `${focusDdl}
${prefixShadowSql(focusDdl)}
CREATE TABLE canon_changes_v16 ${canonChangesBody};
INSERT INTO canon_changes_v16 (seq,idx,itemId,dim,before,after) SELECT seq,idx,itemId,dim,before,after FROM canon_changes;
DROP TABLE canon_changes;
ALTER TABLE canon_changes_v16 RENAME TO canon_changes;
`
}
