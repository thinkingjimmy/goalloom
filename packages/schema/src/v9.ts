/** History tables must not reference projection rows. Guidance source ids are not required to exist in operations. */
export const v9HistoryRewrite = `
CREATE TABLE item_guidance_v9 (
  itemId TEXT PRIMARY KEY REFERENCES items(id), revision INTEGER NOT NULL CHECK(revision>0),
  value TEXT CHECK(value IS NULL OR json_valid(value)), updatedAt TEXT NOT NULL,
  operationId TEXT NOT NULL
) STRICT;
INSERT INTO item_guidance_v9 SELECT itemId, revision, value, updatedAt, operationId FROM item_guidance;
DROP TABLE item_guidance;
ALTER TABLE item_guidance_v9 RENAME TO item_guidance;

CREATE TABLE item_events_v9 (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, operationId TEXT NOT NULL REFERENCES operations(id) DEFERRABLE INITIALLY DEFERRED,
  eventIndex INTEGER NOT NULL, itemId TEXT NOT NULL, at TEXT NOT NULL, type TEXT NOT NULL,
  beforeState TEXT CHECK(beforeState IS NULL OR json_valid(beforeState)), afterState TEXT NOT NULL CHECK(json_valid(afterState)),
  fromPeriodId TEXT, toPeriodId TEXT, undoOf TEXT REFERENCES operations(id), UNIQUE(operationId,eventIndex)
) STRICT;
INSERT INTO item_events_v9 (seq,id,operationId,eventIndex,itemId,at,type,beforeState,afterState,fromPeriodId,toPeriodId,undoOf)
  SELECT seq,id,operationId,eventIndex,itemId,at,type,beforeState,afterState,fromPeriodId,toPeriodId,undoOf FROM item_events;
DROP TABLE item_events;
ALTER TABLE item_events_v9 RENAME TO item_events;
CREATE INDEX events_item_seq ON item_events(itemId,seq);
CREATE INDEX events_from_period ON item_events(fromPeriodId,itemId,seq);
CREATE INDEX events_to_period ON item_events(toPeriodId,itemId,seq);
`

export const v9SyncDdl = `
CREATE TABLE sync_ops (
  opId TEXT PRIMARY KEY,
  localOrder INTEGER UNIQUE,
  origin TEXT NOT NULL CHECK(origin IN ('local','remote')),
  formatVersion INTEGER NOT NULL,
  payload TEXT NOT NULL CHECK(json_valid(payload)),
  payloadHash TEXT NOT NULL,
  deviceId TEXT NOT NULL, at TEXT NOT NULL,
  keyEpoch INTEGER,
  state TEXT NOT NULL CHECK(state IN ('never_sent','send_unknown','accepted','applied','reverted_local','quarantined')),
  outcome TEXT CHECK(outcome IN ('applied','rejected')),
  sendAttemptId TEXT,
  seq INTEGER UNIQUE,
  errorCode TEXT, errorDetail TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
) STRICT;
CREATE INDEX sync_ops_pending ON sync_ops(state, localOrder);
CREATE TRIGGER sync_ops_sticky BEFORE UPDATE OF state ON sync_ops
WHEN NEW.state IN ('never_sent','reverted_local') AND OLD.state <> 'never_sent'
BEGIN SELECT RAISE(ABORT,'send_state_irreversible'); END;
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY CHECK(id=1), workspaceId TEXT, deviceId TEXT,
  lastAppliedSeq INTEGER NOT NULL DEFAULT 0,
  lastUploadedSeq INTEGER NOT NULL DEFAULT 0,
  protocolVersion INTEGER NOT NULL, paused TEXT,
  keyEpoch INTEGER, updatedAt TEXT NOT NULL
) STRICT;
CREATE TABLE sync_conflicts (
  opId TEXT PRIMARY KEY REFERENCES sync_ops(opId), seq INTEGER, code TEXT NOT NULL, itemId TEXT, detail TEXT,
  at TEXT NOT NULL, seenAt TEXT
) STRICT;
CREATE TABLE canon_ops (
  seq INTEGER PRIMARY KEY, opId TEXT NOT NULL UNIQUE, deviceId TEXT NOT NULL, at TEXT NOT NULL,
  kind TEXT NOT NULL, outcome TEXT NOT NULL CHECK(outcome IN ('applied','rejected','partial')), errorCode TEXT
) STRICT;
CREATE TABLE canon_changes (
  seq INTEGER NOT NULL REFERENCES canon_ops(seq), idx INTEGER NOT NULL, itemId TEXT,
  dim TEXT NOT NULL CHECK(dim IN ('create','delete','restore','title','description','dueDate','flowColor','status','archive','placement','relation','guidance','policy','calendar')),
  before TEXT, after TEXT, PRIMARY KEY(seq,idx)
) STRICT;
`

export const businessTables = ['workspace', 'planning_periods', 'items', 'item_placements', 'item_relations', 'rollover_policies', 'item_guidance'] as const

const prefixIdents = [
  'item_placements', 'item_relations', 'item_guidance', 'planning_periods', 'rollover_policies',
  'unique_flow_color', 'unique_active_edge', 'placements_period_order', 'items_status_time', 'items_visibility',
  'relations_child', 'relations_parent', 'flow_root_edge_insert', 'flow_root_edge_update', 'flow_root_color',
  'placement_scale_insert', 'placement_scale_update', 'relation_guard_insert', 'relation_guard_update',
  'placements_nesting', 'nesting_guard_insert', 'nesting_guard_update',
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
