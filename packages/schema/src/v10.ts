/**
 * [INPUT]: A v8 or Phase 0 v9 business table prefix ('' or 'base_').
 * [OUTPUT]: DDL that adds two-level nesting and replaces the flow/relation triggers that must see it.
 * [POS]: v10 step on the v9 chain. v8Ddl stays the frozen pre-sync schema; shadows are updated by the caller.
 */

export function nestingMigrationSql(prefix: '' | 'base_'): string {
  const p = prefix
  return `
ALTER TABLE ${p}item_placements ADD COLUMN nestingParentId TEXT REFERENCES ${p}items(id);
CREATE INDEX ${p}placements_nesting ON ${p}item_placements(nestingParentId,sortKey,itemId);
DROP TRIGGER IF EXISTS ${p}flow_root_color;
DROP TRIGGER IF EXISTS ${p}flow_root_edge_insert;
DROP TRIGGER IF EXISTS ${p}flow_root_edge_update;
DROP TRIGGER IF EXISTS ${p}relation_guard_insert;
DROP TRIGGER IF EXISTS ${p}relation_guard_update;
DROP TRIGGER IF EXISTS ${p}nesting_guard_insert;
DROP TRIGGER IF EXISTS ${p}nesting_guard_update;
CREATE TRIGGER ${p}flow_root_color BEFORE UPDATE OF flowColor ON ${p}items WHEN NEW.flowColor IS NOT NULL BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ${p}item_placements WHERE itemId=NEW.id AND nestingParentId IS NOT NULL) THEN RAISE(ABORT,'nested task inherits color') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ${p}item_relations WHERE childId=NEW.id AND invalidatedAt IS NULL) THEN RAISE(ABORT,'flow root has parent') END;
END;
CREATE TRIGGER ${p}flow_root_edge_insert BEFORE INSERT ON ${p}item_relations WHEN NEW.invalidatedAt IS NULL BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ${p}item_placements WHERE itemId=NEW.childId AND nestingParentId IS NOT NULL) THEN RAISE(ABORT,'nested task inherits parents') END;
  SELECT CASE WHEN (SELECT flowColor FROM ${p}items WHERE id=NEW.childId) IS NOT NULL THEN RAISE(ABORT,'flow root has parent') END;
END;
CREATE TRIGGER ${p}flow_root_edge_update BEFORE UPDATE ON ${p}item_relations WHEN NEW.invalidatedAt IS NULL BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ${p}item_placements WHERE itemId=NEW.childId AND nestingParentId IS NOT NULL) THEN RAISE(ABORT,'nested task inherits parents') END;
  SELECT CASE WHEN (SELECT flowColor FROM ${p}items WHERE id=NEW.childId) IS NOT NULL THEN RAISE(ABORT,'flow root has parent') END;
END;
CREATE TRIGGER ${p}relation_guard_insert BEFORE INSERT ON ${p}item_relations WHEN NEW.invalidatedAt IS NULL BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ${p}items WHERE id IN (NEW.parentId,NEW.childId) AND deletedAt IS NOT NULL) THEN RAISE(ABORT,'deleted endpoint') END;
  SELECT CASE WHEN EXISTS(
    WITH RECURSIVE ancestors(id) AS (
      SELECT NEW.parentId UNION SELECT r.parentId FROM ${p}item_relations r JOIN ancestors a ON r.childId=a.id WHERE r.invalidatedAt IS NULL AND r.id!=NEW.id
      UNION SELECT pl.nestingParentId FROM ${p}item_placements pl JOIN ancestors a ON pl.itemId=a.id WHERE pl.nestingParentId IS NOT NULL
    ) SELECT 1 FROM ancestors WHERE id=NEW.childId
  ) THEN RAISE(ABORT,'relation cycle') END;
END;
CREATE TRIGGER ${p}relation_guard_update BEFORE UPDATE ON ${p}item_relations WHEN NEW.invalidatedAt IS NULL BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ${p}items WHERE id IN (NEW.parentId,NEW.childId) AND deletedAt IS NOT NULL) THEN RAISE(ABORT,'deleted endpoint') END;
  SELECT CASE WHEN EXISTS(
    WITH RECURSIVE ancestors(id) AS (
      SELECT NEW.parentId UNION SELECT r.parentId FROM ${p}item_relations r JOIN ancestors a ON r.childId=a.id WHERE r.invalidatedAt IS NULL AND r.id!=NEW.id
      UNION SELECT pl.nestingParentId FROM ${p}item_placements pl JOIN ancestors a ON pl.itemId=a.id WHERE pl.nestingParentId IS NOT NULL
    ) SELECT 1 FROM ancestors WHERE id=NEW.childId
  ) THEN RAISE(ABORT,'relation cycle') END;
END;
CREATE TRIGGER ${p}nesting_guard_insert BEFORE INSERT ON ${p}item_placements WHEN NEW.nestingParentId IS NOT NULL BEGIN
  SELECT CASE WHEN NEW.itemId=NEW.nestingParentId OR EXISTS(SELECT 1 FROM ${p}item_placements WHERE itemId=NEW.nestingParentId AND nestingParentId IS NOT NULL) OR EXISTS(SELECT 1 FROM ${p}item_placements pl JOIN ${p}items i ON i.id=pl.itemId WHERE pl.nestingParentId=NEW.itemId AND i.deletedAt IS NULL) THEN RAISE(ABORT,'only two outline levels') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ${p}items WHERE id=NEW.nestingParentId AND deletedAt IS NOT NULL) THEN RAISE(ABORT,'deleted nesting parent') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ${p}items WHERE id=NEW.itemId AND flowColor IS NOT NULL) OR EXISTS(SELECT 1 FROM ${p}item_relations WHERE childId=NEW.itemId AND invalidatedAt IS NULL) THEN RAISE(ABORT,'nested task owns incoming flow') END;
  SELECT CASE WHEN EXISTS(WITH RECURSIVE ancestors(id) AS (
    SELECT NEW.nestingParentId UNION SELECT r.parentId FROM ${p}item_relations r JOIN ancestors a ON r.childId=a.id WHERE r.invalidatedAt IS NULL
    UNION SELECT pl.nestingParentId FROM ${p}item_placements pl JOIN ancestors a ON pl.itemId=a.id WHERE pl.nestingParentId IS NOT NULL AND pl.itemId!=NEW.itemId
  ) SELECT 1 FROM ancestors WHERE id=NEW.itemId) THEN RAISE(ABORT,'outline goal cycle') END;
END;
CREATE TRIGGER ${p}nesting_guard_update BEFORE UPDATE ON ${p}item_placements WHEN NEW.nestingParentId IS NOT NULL BEGIN
  SELECT CASE WHEN NEW.itemId=NEW.nestingParentId OR EXISTS(SELECT 1 FROM ${p}item_placements WHERE itemId=NEW.nestingParentId AND nestingParentId IS NOT NULL) OR EXISTS(SELECT 1 FROM ${p}item_placements pl JOIN ${p}items i ON i.id=pl.itemId WHERE pl.nestingParentId=NEW.itemId AND i.deletedAt IS NULL) THEN RAISE(ABORT,'only two outline levels') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ${p}items WHERE id=NEW.nestingParentId AND deletedAt IS NOT NULL) THEN RAISE(ABORT,'deleted nesting parent') END;
  SELECT CASE WHEN EXISTS(SELECT 1 FROM ${p}items WHERE id=NEW.itemId AND flowColor IS NOT NULL) OR EXISTS(SELECT 1 FROM ${p}item_relations WHERE childId=NEW.itemId AND invalidatedAt IS NULL) THEN RAISE(ABORT,'nested task owns incoming flow') END;
  SELECT CASE WHEN EXISTS(WITH RECURSIVE ancestors(id) AS (
    SELECT NEW.nestingParentId UNION SELECT r.parentId FROM ${p}item_relations r JOIN ancestors a ON r.childId=a.id WHERE r.invalidatedAt IS NULL
    UNION SELECT pl.nestingParentId FROM ${p}item_placements pl JOIN ancestors a ON pl.itemId=a.id WHERE pl.nestingParentId IS NOT NULL AND pl.itemId!=NEW.itemId
  ) SELECT 1 FROM ancestors WHERE id=NEW.itemId) THEN RAISE(ABORT,'outline goal cycle') END;
END;
`
}
