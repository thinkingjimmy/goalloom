/**
 * [INPUT]: 新建或已由启动编排保护的受支持版本 SQLite 连接。
 * [OUTPUT]: 多父 DAG、唯一位置、流程颜色、原子历史与不可变操作回执的 schema v5（v3 标识 createPlan 与多 ID 回执语义；v4 为 workspace 增加界面风格列；v5 增加复选框样式列），以及 v1–v4→v5 单事务升级。
 * [POS]: 唯一生产 DDL；只负责原子 DDL 与版本变更。迁移前只读探测和保护副本由 startup.ts 编排，本文件不做备份。
 * [PROTOCOL]: 变更时更新此头部，然后检查 README.md
 */
import type { DatabaseSync } from 'node:sqlite'
import { randomUUID } from 'node:crypto'
import { transaction } from './database'
import { serverText } from '../../shared/i18n/server'

export const schemaVersion = 5
export const supportedVersions = [1, 2, 3, 4, 5]
export const upgradableVersions = [1, 2, 3, 4]
export const requiredTables = ['workspace', 'items', 'item_placements', 'planning_periods', 'item_relations', 'rollover_policies', 'operations', 'item_events', 'undo_effects', 'schema_migrations']
export function userVersion(db: DatabaseSync): number { return Number(db.prepare('PRAGMA user_version').get()?.user_version) }
export function migrate(db: DatabaseSync): void {
  const version = userVersion(db)
  if (version === schemaVersion) return
  if (upgradableVersions.includes(version)) {
    // Additive and atomic: every step up to v5 commits together, so an interrupted upgrade leaves the old file untouched.
    transaction(db, () => {
      if (version === 1) db.exec(`ALTER TABLE items ADD COLUMN flowColor INTEGER CHECK(flowColor IS NULL OR flowColor BETWEEN 0 AND 7);\n${flowDdl}`)
      if (version < 4) db.exec(`ALTER TABLE workspace ADD COLUMN ${styleColumn}`)
      db.exec(`ALTER TABLE workspace ADD COLUMN ${checkStyleColumn}`)
      db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(schemaVersion, new Date().toISOString())
      db.exec(`PRAGMA user_version = ${schemaVersion}`)
    })
    return
  }
  if (version !== 0 || db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().length) throw new Error(serverText().storage.unsupportedDatabase)
  transaction(db, () => {
    db.exec(ddl)
    db.prepare('INSERT INTO workspace (id, generation) VALUES (1, ?)').run(randomUUID())
    db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(schemaVersion, new Date().toISOString())
    db.exec(`PRAGMA user_version = ${schemaVersion}`)
  })
}

const styleColumn = "style TEXT NOT NULL DEFAULT 'paper' CHECK(style IN ('paper','minimal'))"
const checkStyleColumn = "checkStyle TEXT NOT NULL DEFAULT 'outline' CHECK(checkStyle IN ('outline','paper','tint'))"

// --- A flow root owns one colour among live items and never has an active parent. ---
const flowDdl = `
CREATE UNIQUE INDEX unique_flow_color ON items(flowColor) WHERE flowColor IS NOT NULL AND deletedAt IS NULL;
CREATE TRIGGER flow_root_color BEFORE UPDATE OF flowColor ON items WHEN NEW.flowColor IS NOT NULL BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM item_relations WHERE childId=NEW.id AND invalidatedAt IS NULL) THEN RAISE(ABORT,'flow root has parent') END;
END;
${['INSERT', 'UPDATE'].map(event => `CREATE TRIGGER flow_root_edge_${event.toLowerCase()} BEFORE ${event} ON item_relations WHEN NEW.invalidatedAt IS NULL BEGIN
  SELECT CASE WHEN (SELECT flowColor FROM items WHERE id=NEW.childId) IS NOT NULL THEN RAISE(ABORT,'flow root has parent') END;
END;`).join('\n')}
`

const ddl = `
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, appliedAt TEXT NOT NULL) STRICT;
CREATE TABLE workspace (
  id INTEGER PRIMARY KEY CHECK(id=1), generation TEXT NOT NULL UNIQUE, calendar TEXT CHECK(calendar IS NULL OR json_valid(calendar)),
  setupConfirmedAt TEXT, pausedAfterRestore INTEGER NOT NULL DEFAULT 0 CHECK(pausedAfterRestore IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0), lastObservedAt TEXT, clockAnomaly INTEGER NOT NULL DEFAULT 0 CHECK(clockAnomaly IN (0,1)),
  theme TEXT NOT NULL DEFAULT 'system' CHECK(theme IN ('system','light','dark')), ${styleColumn}, ${checkStyleColumn},
  backupEnabled INTEGER NOT NULL DEFAULT 1 CHECK(backupEnabled IN (0,1)), backupRetention INTEGER NOT NULL DEFAULT 7 CHECK(backupRetention BETWEEN 1 AND 100),
  CHECK ((calendar IS NULL) = (setupConfirmedAt IS NULL))
) STRICT;
CREATE TABLE planning_periods (
  id TEXT PRIMARY KEY, horizon TEXT NOT NULL CHECK(horizon IN ('cycle','month','week','day')),
  startDate TEXT NOT NULL, endDate TEXT NOT NULL, startAt TEXT NOT NULL, endAt TEXT NOT NULL,
  CHECK(startDate < endDate), CHECK(julianday(endAt) > julianday(startAt)), UNIQUE(horizon,startAt)
) STRICT;
CREATE TABLE items (
  id TEXT PRIMARY KEY, title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 500), description TEXT NOT NULL,
  dueDate TEXT CHECK(dueDate IS NULL OR (length(dueDate)=10 AND date(dueDate)=dueDate)),
  status TEXT NOT NULL CHECK(status IN ('todo','done','cancelled')), completedAt TEXT, cancelledAt TEXT,
  archivedAt TEXT, deletedAt TEXT, deletedBy TEXT,
  createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, version INTEGER NOT NULL CHECK(version>0),
  flowColor INTEGER CHECK(flowColor IS NULL OR flowColor BETWEEN 0 AND 7),
  CHECK ((deletedAt IS NULL) = (deletedBy IS NULL)),
  CHECK ((status='todo' AND completedAt IS NULL AND cancelledAt IS NULL)
    OR (status='done' AND cancelledAt IS NULL) OR (status='cancelled' AND completedAt IS NULL))
) STRICT;
CREATE TABLE item_placements (
  itemId TEXT PRIMARY KEY REFERENCES items(id), horizon TEXT NOT NULL CHECK(horizon IN ('later','cycle','month','week','day')),
  periodId TEXT REFERENCES planning_periods(id), sortKey REAL NOT NULL, version INTEGER NOT NULL CHECK(version>0),
  holdPeriodId TEXT REFERENCES planning_periods(id), CHECK ((horizon='later') = (periodId IS NULL))
) STRICT;
CREATE INDEX placements_period_order ON item_placements(periodId,sortKey,itemId);
CREATE INDEX items_status_time ON items(status,completedAt,cancelledAt,id);
CREATE INDEX items_visibility ON items(deletedAt,archivedAt,id);
CREATE TABLE item_relations (
  id TEXT PRIMARY KEY, parentId TEXT NOT NULL REFERENCES items(id), childId TEXT NOT NULL REFERENCES items(id),
  invalidatedAt TEXT, invalidatedBy TEXT, reason TEXT CHECK(reason IS NULL OR reason IN ('unlink','delete')), createdAt TEXT NOT NULL,
  CHECK(parentId != childId), CHECK((invalidatedAt IS NULL) = (invalidatedBy IS NULL)), CHECK((invalidatedAt IS NULL) = (reason IS NULL))
) STRICT;
CREATE INDEX relations_child ON item_relations(childId,invalidatedAt);
CREATE UNIQUE INDEX unique_active_edge ON item_relations(parentId,childId) WHERE invalidatedAt IS NULL;
CREATE INDEX relations_parent ON item_relations(parentId,invalidatedAt);
CREATE TABLE rollover_policies (
  horizon TEXT PRIMARY KEY CHECK(horizon IN ('cycle','month','week','day')), mode TEXT NOT NULL CHECK(mode IN ('auto','manual')),
  version INTEGER NOT NULL CHECK(version>0), effectiveFromPeriodId TEXT NOT NULL REFERENCES planning_periods(id), CHECK(horizon!='cycle' OR mode='manual')
) STRICT;
CREATE TABLE operations (
  id TEXT PRIMARY KEY, generation TEXT NOT NULL, requestHash TEXT NOT NULL, kind TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('user','system')), at TEXT NOT NULL, effectsVersion INTEGER NOT NULL CHECK(effectsVersion=1),
  effects TEXT NOT NULL CHECK(json_valid(effects)), result TEXT NOT NULL CHECK(json_valid(result))
) STRICT;
CREATE INDEX operations_recent ON operations(at,id);
CREATE TABLE item_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, operationId TEXT NOT NULL REFERENCES operations(id) DEFERRABLE INITIALLY DEFERRED,
  eventIndex INTEGER NOT NULL, itemId TEXT NOT NULL REFERENCES items(id), at TEXT NOT NULL, type TEXT NOT NULL,
  beforeState TEXT CHECK(beforeState IS NULL OR json_valid(beforeState)), afterState TEXT NOT NULL CHECK(json_valid(afterState)),
  fromPeriodId TEXT REFERENCES planning_periods(id), toPeriodId TEXT REFERENCES planning_periods(id), undoOf TEXT REFERENCES operations(id), UNIQUE(operationId,eventIndex)
) STRICT;
CREATE INDEX events_item_seq ON item_events(itemId,seq);
CREATE INDEX events_from_period ON item_events(fromPeriodId,itemId,seq);
CREATE INDEX events_to_period ON item_events(toPeriodId,itemId,seq);
CREATE TABLE undo_effects (
  originalId TEXT NOT NULL REFERENCES operations(id), effectIndex INTEGER NOT NULL, undoId TEXT NOT NULL REFERENCES operations(id),
  PRIMARY KEY(originalId,effectIndex)
) STRICT;
CREATE TRIGGER placement_scale_insert BEFORE INSERT ON item_placements WHEN NEW.periodId IS NOT NULL BEGIN
  SELECT CASE WHEN (SELECT horizon FROM planning_periods WHERE id=NEW.periodId) != NEW.horizon THEN RAISE(ABORT,'period scale mismatch') END;
END;
CREATE TRIGGER placement_scale_update BEFORE UPDATE OF periodId,horizon ON item_placements WHEN NEW.periodId IS NOT NULL BEGIN
  SELECT CASE WHEN (SELECT horizon FROM planning_periods WHERE id=NEW.periodId) != NEW.horizon THEN RAISE(ABORT,'period scale mismatch') END;
END;
${['INSERT', 'UPDATE'].map(event => `CREATE TRIGGER relation_guard_${event.toLowerCase()} BEFORE ${event} ON item_relations WHEN NEW.invalidatedAt IS NULL BEGIN
  SELECT CASE WHEN EXISTS(SELECT 1 FROM items WHERE id IN (NEW.parentId,NEW.childId) AND deletedAt IS NOT NULL) THEN RAISE(ABORT,'deleted endpoint') END;
  SELECT CASE WHEN EXISTS(
    WITH RECURSIVE ancestors(id) AS (
      SELECT NEW.parentId UNION SELECT r.parentId FROM item_relations r JOIN ancestors a ON r.childId=a.id WHERE r.invalidatedAt IS NULL AND r.id!=NEW.id
    ) SELECT 1 FROM ancestors WHERE id=NEW.childId
  ) THEN RAISE(ABORT,'relation cycle') END;
END;`).join('\n')}
${flowDdl}`
