/**
 * [INPUT]: Existing active sync tables and a caller-owned migration transaction.
 * [OUTPUT]: Additive initialization state, exact binding/epoch receipt guards and isolated retired evidence.
 * [POS]: Shared DDL only; desktop alone installs it and advances its schema version.
 */
export const bindingEpochDdl = `
CREATE TABLE IF NOT EXISTS sync_binding_epoch_receipts (
  requestId TEXT PRIMARY KEY, requestHash TEXT NOT NULL,
  bindingToken TEXT NOT NULL, fromEpoch INTEGER NOT NULL CHECK(fromEpoch>0),
  toEpoch INTEGER NOT NULL CHECK(toEpoch>fromEpoch),
  receipt TEXT NOT NULL CHECK(json_valid(receipt)), committedAt TEXT NOT NULL,
  UNIQUE(bindingToken,fromEpoch), UNIQUE(bindingToken,toEpoch)
) STRICT;
CREATE TRIGGER IF NOT EXISTS sync_binding_epoch_immutable BEFORE UPDATE ON sync_binding_epoch_receipts
BEGIN SELECT RAISE(ABORT,'binding_epoch_receipt_immutable'); END;
`

export const syncBaselineDdl = `
CREATE TABLE IF NOT EXISTS sync_seed_state (
  scope TEXT PRIMARY KEY CHECK(scope IN ('base','visible')),
  seedId TEXT NOT NULL, manifest TEXT NOT NULL CHECK(json_valid(manifest)),
  creatorDeviceId TEXT NOT NULL, beginOpId TEXT NOT NULL,
  phase TEXT NOT NULL CHECK(phase IN ('loading','complete')),
  nextChunk INTEGER NOT NULL CHECK(nextChunk>=0), lastKey TEXT,
  counts TEXT NOT NULL CHECK(json_valid(counts)), rowBytes INTEGER NOT NULL CHECK(rowBytes BETWEEN 0 AND 104857600),
  finalOpId TEXT, finalPayloadHash TEXT,
  CHECK((finalOpId IS NULL)=(finalPayloadHash IS NULL)),
  CHECK((phase='complete')=(finalOpId IS NOT NULL))
) STRICT;
CREATE TABLE IF NOT EXISTS sync_active_binding (
  id INTEGER PRIMARY KEY CHECK(id=1), identity TEXT NOT NULL CHECK(json_valid(identity)),
  transitionRequestId TEXT REFERENCES sync_binding_transitions(requestId) DEFERRABLE INITIALLY DEFERRED
) STRICT;
CREATE TABLE IF NOT EXISTS sync_binding_transitions (
  requestId TEXT PRIMARY KEY, requestHash TEXT NOT NULL,
  receipt TEXT NOT NULL CHECK(json_valid(receipt)), committedAt TEXT NOT NULL
) STRICT;
CREATE TABLE IF NOT EXISTS sync_retired_rows (
  requestId TEXT NOT NULL REFERENCES sync_binding_transitions(requestId) DEFERRABLE INITIALLY DEFERRED,
  kind TEXT NOT NULL CHECK(kind IN ('sync_op','canon_op','canon_change','conflict','sync_state','sync_setting','seed_state','active_binding','command_identity')),
  rowKey TEXT NOT NULL, value TEXT NOT NULL CHECK(json_valid(value)),
  PRIMARY KEY(requestId,kind,rowKey)
) STRICT;
CREATE INDEX IF NOT EXISTS sync_retired_identity ON sync_retired_rows(kind,rowKey);
CREATE TRIGGER IF NOT EXISTS sync_retired_immutable BEFORE UPDATE ON sync_retired_rows
BEGIN SELECT RAISE(ABORT,'retired_evidence_immutable'); END;
CREATE TRIGGER IF NOT EXISTS sync_transition_immutable BEFORE UPDATE ON sync_binding_transitions
BEGIN SELECT RAISE(ABORT,'transition_receipt_immutable'); END;
${bindingEpochDdl}
`
