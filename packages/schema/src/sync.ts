/**
 * [INPUT]: An empty SQLite database inside its host-owned transaction.
 * [OUTPUT]: Current sync tables, indexes and integrity triggers; canonical changes include the period focus dimension.
 * [POS]: Shared launch baseline DDL; no historical upgrades or database access.
 */
// The quoted name matches the text SQLite writes when the v16 migration renames its rebuilt copy.
export const canonChangesBody = `(
  seq INTEGER NOT NULL REFERENCES canon_ops(seq), idx INTEGER NOT NULL, itemId TEXT,
  dim TEXT NOT NULL CHECK(dim IN ('create','delete','restore','title','description','dueDate','flowColor','status','archive','placement','relation','policy','calendar','focus')),
  before TEXT, after TEXT, PRIMARY KEY(seq,idx)
) STRICT`

export const syncDdl = `
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
CREATE TABLE "canon_changes" ${canonChangesBody};
`
