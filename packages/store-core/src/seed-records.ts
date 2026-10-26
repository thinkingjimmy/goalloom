/**
 * [INPUT]: Exact visible/base SQL rows and a deterministic calendar period materializer.
 * [OUTPUT]: Fully validated ordered seed records and bounded canonical byte digests, without text normalization.
 * [POS]: Shared initialization serialization; it does not read command history or credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { canonicalJson, parseSyncOp, type CalendarWire } from '@goalloom/contracts'
import { sha256Hex, utf8 } from '@goalloom/crypto'
import type { ApplyHost, SqlDriver, SqlValue } from './driver'
import { SeedIntegrityError, countSeedRecord, emptySeedCounts, seedAssert, seedByteLimit, seedHorizons, seedRecordKey, type ExactSeedSource, type SeedRecord, type SeedScope } from './seed-types'

type Row = Record<string, SqlValue>
const validationId = '00000000-0000-4000-8000-000000000001'
const validationAt = '2000-01-01T00:00:00.000Z'
const columns = {
  items: 'id,title,description,dueDate,status,completedAt,cancelledAt,archivedAt,deletedAt,deletedBy,createdAt,updatedAt,version,flowColor',
  item_placements: 'itemId,horizon,periodId,sortKey,version,holdPeriodId,nestingParentId',
  item_guidance: 'itemId,revision,value,updatedAt,operationId',
  planning_periods: 'id,horizon,startDate,endDate,startAt,endAt',
  rollover_policies: 'horizon,mode,version,effectiveFromPeriodId',
  item_relations: 'id,parentId,childId,invalidatedAt,invalidatedBy,reason,createdAt',
} as const
const limits = { items: 100_000, item_placements: 100_000, item_guidance: 100_000, planning_periods: 100_000, rollover_policies: 6, item_relations: 500_000 } as const

export function parseSeedRecord(input: unknown): SeedRecord {
  const op = parseSyncOp({ v: 1, opId: validationId, deviceId: 'seed-validator', at: validationAt,
    actions: [{ t: 'seed.rows', seedId: validationId, index: 0, records: [input] }] })
  const action = op.actions[0]!
  seedAssert(action.t === 'seed.rows', 'seed record type')
  return action.records[0]!
}
export function seedRecordBytes(record: SeedRecord): Uint8Array { return utf8(`${canonicalJson(record)}\n`) }

/** One bounded UTF-8 buffer avoids a workspace-sized JSON string and hash input ambiguity. */
export function describeSeedRecords(records: SeedRecord[]): ExactSeedSource {
  const counts = emptySeedCounts()
  let rowBytes = 0
  for (const record of records) {
    countSeedRecord(counts, record)
    rowBytes += seedRecordBytes(record).length
    seedAssert(rowBytes <= seedByteLimit, 'seed source exceeds byte limit')
  }
  const domain = utf8('goalloom/seed/v1|')
  const bytes = new Uint8Array(domain.length + rowBytes)
  bytes.set(domain)
  let offset = domain.length
  for (const record of records) { const part = seedRecordBytes(record); bytes.set(part, offset); offset += part.length }
  return { records, counts, rowBytes, digest: sha256Hex(bytes) }
}

export function captureSeedRecords(driver: SqlDriver, host: ApplyHost, scope: SeedScope = 'visible'): ExactSeedSource {
  try { return captureRecords(driver, host, scope) } catch (error) {
    if (error instanceof SeedIntegrityError) throw error
    throw new SeedIntegrityError(error instanceof Error ? error.message : 'invalid seed source')
  }
}

function captureRecords(driver: SqlDriver, host: ApplyHost, scope: SeedScope): ExactSeedSource {
  const prefix = scope === 'base' ? 'base_' : ''
  for (const table of Object.keys(columns) as (keyof typeof columns)[]) {
    const count = Number(driver.prepare(`SELECT count(*) AS n FROM ${prefix}${table}`).get()?.n ?? 0)
    seedAssert(count <= limits[table], `seed ${table} count`)
    // SQLite measures raw fields before they can allocate an oversized JS value.
    const oversized = columns[table].split(',').map(name => `length(CAST(${name} AS BLOB))>1048536`).join(' OR ')
    seedAssert(!driver.prepare(`SELECT 1 FROM ${prefix}${table} WHERE ${oversized} LIMIT 1`).get(), `seed ${table} field size`)
  }
  seedAssert(!driver.prepare(`SELECT 1 FROM ${prefix}items i WHERE NOT EXISTS (SELECT 1 FROM ${prefix}item_placements p WHERE p.itemId=i.id) LIMIT 1`).get()
    && !driver.prepare(`SELECT 1 FROM ${prefix}item_placements p WHERE NOT EXISTS (SELECT 1 FROM ${prefix}items i WHERE i.id=p.itemId) LIMIT 1`).get(), 'seed placement membership')
  seedAssert(!driver.prepare(`SELECT 1 FROM ${prefix}item_guidance g WHERE NOT EXISTS (SELECT 1 FROM ${prefix}items i WHERE i.id=g.itemId) LIMIT 1`).get(), 'seed orphan guidance')
  seedAssert(!driver.prepare(`SELECT 1 FROM ${prefix}workspace WHERE length(CAST(calendar AS BLOB))>1048536 OR length(CAST(setupConfirmedAt AS BLOB))>1048536 LIMIT 1`).get(), 'seed workspace field size')
  const workspace = driver.prepare(`SELECT calendar,setupConfirmedAt FROM ${prefix}workspace WHERE id=1`).get()
  seedAssert(workspace, 'seed workspace missing')
  const records: SeedRecord[] = []
  let rowBytes = 0
  const append = (input: unknown) => {
    const record = parseSeedRecord(input)
    rowBytes += seedRecordBytes(record).length
    seedAssert(rowBytes <= seedByteLimit, 'seed source exceeds byte limit')
    records.push(record)
  }
  const page = (table: 'planning_periods' | 'item_relations' | 'items', consume: (row: Row) => void, nested?: boolean) => {
    let after: string | null = null
    const outline = nested === undefined ? '' : `EXISTS (SELECT 1 FROM ${prefix}item_placements p WHERE p.itemId=t.id AND p.nestingParentId IS ${nested ? 'NOT ' : ''}NULL)`
    const selected = columns[table].split(',').map(name => `t.${name}`).join(',')
    for (;;) {
      const predicates: string[] = [after === null ? '' : 't.id>?', outline].filter(Boolean)
      const where: string = predicates.length ? `WHERE ${predicates.join(' AND ')}` : ''
      const rows: Row[] = driver.prepare(`SELECT ${selected} FROM ${prefix}${table} t ${where} ORDER BY t.id LIMIT 16`).all(...(after === null ? [] : [after]))
      if (!rows.length) break
      for (const row of rows) { consume(row); after = String(row.id) }
    }
  }
  append({ kind: 'workspace', ...workspace })
  page('planning_periods', row => append({ kind: 'period', row }))
  for (const horizon of seedHorizons) {
    const row = driver.prepare(`SELECT ${columns.rollover_policies} FROM ${prefix}rollover_policies WHERE horizon=?`).get(horizon)
    if (row) append({ kind: 'policy', row })
  }
  const item = (row: Row) => append({ kind: 'item', row,
    placement: driver.prepare(`SELECT ${columns.item_placements} FROM ${prefix}item_placements WHERE itemId=?`).get(row.id!),
    guidance: driver.prepare(`SELECT ${columns.item_guidance} FROM ${prefix}item_guidance WHERE itemId=?`).get(row.id!) ?? null,
  })
  page('items', item, false)
  page('items', item, true)
  page('item_relations', row => append({ kind: 'relation', row }))
  validateSeedRecords(records, host)
  return describeSeedRecords(records)
}

export function validateSeedRecords(records: SeedRecord[], host: ApplyHost): void {
  const workspace = records[0]
  seedAssert(workspace?.kind === 'workspace', 'seed workspace order')
  seedAssert((workspace.calendar === null) === (workspace.setupConfirmedAt === null), 'seed calendar confirmation')
  let calendar: CalendarWire | null = null
  if (workspace.calendar !== null) {
    const parsed = parseSyncOp({ v: 1, opId: validationId, deviceId: 'seed-validator', at: validationAt,
      actions: [{ t: 'calendar.setup', calendar: JSON.parse(workspace.calendar), confirmedAt: workspace.setupConfirmedAt }] }).actions[0]!
    seedAssert(parsed.t === 'calendar.setup', 'seed calendar shape')
    calendar = parsed.calendar
    new Intl.DateTimeFormat('en', { timeZone: calendar.timezone }).format(0)
    seedAssert(calendar.mode !== 'natural' || calendar.cycleAnchor.endsWith('-01-01'), 'seed natural anchor')
  }
  const periods = new Map<string, Extract<SeedRecord, { kind: 'period' }>['row']>()
  const items = new Map<string, Extract<SeedRecord, { kind: 'item' }>>()
  const policies = new Map<string, Extract<SeedRecord, { kind: 'policy' }>['row']>()
  const relations: Extract<SeedRecord, { kind: 'relation' }>['row'][] = []
  let last = ''
  for (const record of records) {
    const key = seedRecordKey(record)
    seedAssert(key > last, 'seed duplicate or unordered record'); last = key
    if (record.kind === 'period') {
      seedAssert(calendar, 'seed period without calendar')
      const expected = host.materializePeriod(record.row.horizon, record.row.startDate, workspace.calendar!)
      seedAssert(canonicalJson(expected) === canonicalJson(record.row), 'seed period identity/boundary')
      periods.set(record.row.id, record.row)
    } else if (record.kind === 'policy') policies.set(record.row.horizon, record.row)
    else if (record.kind === 'item') items.set(record.row.id, record)
    else if (record.kind === 'relation') relations.push(record.row)
  }
  seedAssert(calendar || records.length === 1, 'seed unconfirmed data')
  seedAssert(!calendar || policies.size === seedHorizons.length && seedHorizons.every(h => policies.has(h)), 'seed missing policies')
  for (const policy of policies.values()) seedAssert(periods.get(policy.effectiveFromPeriodId)?.horizon === policy.horizon, 'seed policy period')
  const colours = new Set<number>(), pairs = new Set<string>()
  const arcs = new Map<string, string[]>(), degrees = new Map([...items.keys()].map(id => [id, 0]))
  const edge = (parent: string, child: string) => {
    seedAssert(items.has(parent) && items.has(child) && parent !== child, 'seed graph endpoint')
    const children = arcs.get(parent) ?? []; children.push(child); arcs.set(parent, children)
    degrees.set(child, degrees.get(child)! + 1)
  }
  const incoming = new Set(relations.filter(row => row.invalidatedAt === null).map(row => row.childId))
  for (const item of items.values()) {
    const { row, placement, guidance } = item
    seedAssert(placement.itemId === row.id && (!guidance || guidance.itemId === row.id), 'seed item ownership')
    seedAssert((row.deletedAt === null) === (row.deletedBy === null), 'seed deletion provenance')
    seedAssert(row.status === 'todo' ? row.completedAt === null && row.cancelledAt === null : row.status === 'done' ? row.cancelledAt === null : row.completedAt === null, 'seed status timestamps')
    seedAssert(placement.horizon === 'later' ? placement.periodId === null : periods.get(placement.periodId!)?.horizon === placement.horizon, 'seed placement period')
    if (placement.holdPeriodId !== null) {
      const hold = periods.get(placement.holdPeriodId), current = periods.get(placement.periodId!)
      seedAssert(hold && current && hold.horizon === placement.horizon && Date.parse(current.endAt) <= Date.parse(hold.startAt), 'seed hold period')
    }
    seedAssert(placement.horizon !== 'later' || row.flowColor === null, 'seed Later colour')
    if (row.flowColor !== null && row.deletedAt === null) { seedAssert(!colours.has(row.flowColor), 'seed duplicate colour'); colours.add(row.flowColor) }
    if (guidance?.value !== null && guidance) {
      parseSyncOp({ v: 1, opId: validationId, deviceId: 'seed-validator', at: validationAt,
        actions: [{ t: 'guidance.set', itemId: row.id, baseRevision: guidance.revision, value: JSON.parse(guidance.value!) }] })
    }
    if (placement.nestingParentId !== null) {
      const parent = items.get(placement.nestingParentId)
      seedAssert(parent && parent.placement.nestingParentId === null && parent.row.deletedAt === null
        && (parent.placement.horizon === 'later') === (placement.horizon === 'later') && row.flowColor === null && !incoming.has(row.id), 'seed outline ownership')
      edge(parent.row.id, row.id)
    }
  }
  for (const relation of relations) {
    seedAssert(items.has(relation.parentId) && items.has(relation.childId) && relation.parentId !== relation.childId, 'seed relation endpoints')
    seedAssert((relation.invalidatedAt === null) === (relation.invalidatedBy === null) && (relation.invalidatedAt === null) === (relation.reason === null), 'seed relation provenance')
    if (relation.invalidatedAt !== null) continue
    const parent = items.get(relation.parentId)!, child = items.get(relation.childId)!
    const pair = `${relation.parentId}|${relation.childId}`
    seedAssert(!pairs.has(pair) && parent.row.deletedAt === null && child.row.deletedAt === null && child.row.flowColor === null && child.placement.nestingParentId === null, 'seed active relation')
    pairs.add(pair); edge(parent.row.id, child.row.id)
  }
  const ready = [...degrees].filter(([, count]) => count === 0).map(([id]) => id)
  for (let index = 0; index < ready.length; index++) for (const child of arcs.get(ready[index]!) ?? []) {
    const degree = degrees.get(child)! - 1; degrees.set(child, degree); if (degree === 0) ready.push(child)
  }
  seedAssert(ready.length === items.size, 'seed graph cycle')
}

export function insertSeedRecord(driver: SqlDriver, scope: SeedScope, record: SeedRecord): void {
  const prefix = scope === 'base' ? 'base_' : ''
  const insert = (table: keyof typeof columns, row: object) => {
    const names = columns[table].split(','), values = row as Row
    driver.prepare(`INSERT INTO ${prefix}${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...names.map(name => values[name]!))
  }
  if (record.kind === 'workspace') driver.prepare(`UPDATE ${prefix}workspace SET calendar=?,setupConfirmedAt=? WHERE id=1`).run(record.calendar, record.setupConfirmedAt)
  else if (record.kind === 'period') insert('planning_periods', record.row)
  else if (record.kind === 'policy') insert('rollover_policies', record.row)
  else if (record.kind === 'relation') insert('item_relations', record.row)
  else { insert('items', record.row); insert('item_placements', record.placement); if (record.guidance) insert('item_guidance', record.guidance) }
}
