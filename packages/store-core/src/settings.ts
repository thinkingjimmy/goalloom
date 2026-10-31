/**
 * [INPUT]: A validated pref.set and the sync_settings side table.
 * [OUTPUT]: Last-writer-wins comparison/rows, workspace-column projection and one local SyncOp.
 * [POS]: Settings log beside the board. v8 business tables are not altered. An API key is stored as a sha256 fingerprint. The key stays outside SQLite; desktop keeps any unknown-send retry payload in an OS-protected journal.
 */
import { canonicalJson, isSecretSettingKey, parseSetting, parseSyncOp, syncOpPayload, type SettingKey, type SyncOp } from '@goalloom/contracts'
import { sha256Hex } from '@goalloom/crypto'
import type { SqlDriver } from './driver'
import { persistedSecret, redactSyncOp } from './secrets'

export interface SettingRow { key: string; value: unknown; updatedAt: string; opId: string }

export function syncSettingsReady(driver: SqlDriver): boolean {
  return Boolean(driver.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_settings'").get())
}

export function isLaterSetting(at: string, opId: string, storedAt: string, storedOpId: string): boolean {
  const incoming = Date.parse(at)
  const stored = Date.parse(storedAt)
  if (Number.isFinite(incoming) && Number.isFinite(stored) && incoming !== stored) return incoming > stored
  if (at !== storedAt) return at > storedAt
  return opId > storedOpId
}

function encoded(value: unknown): string | null {
  return value === null || value === undefined ? null : canonicalJson(value)
}

/** Returns true when this writer replaces the stored value. Equal op ids are replays and do not write. Secret keys are stored as fingerprints. */
export function writeSetting(driver: SqlDriver, key: SettingKey, value: unknown, at: string, opId: string): boolean {
  const existing = driver.prepare('SELECT updatedAt, opId FROM sync_settings WHERE key=?').get(key)
  if (existing && !isLaterSetting(at, opId, String(existing.updatedAt), String(existing.opId))) return false
  const stored = isSecretSettingKey(key) ? persistedSecret(value) : value
  driver.prepare(`INSERT INTO sync_settings (key, value, updatedAt, opId) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updatedAt=excluded.updatedAt, opId=excluded.opId`)
    .run(key, encoded(stored), at, opId)
  return true
}

export function readSettings(driver: SqlDriver): SettingRow[] {
  if (!syncSettingsReady(driver)) return []
  return driver.prepare('SELECT key, value, updatedAt, opId FROM sync_settings ORDER BY key').all().map(row => ({
    key: String(row.key),
    value: row.value === null || row.value === undefined ? null : JSON.parse(String(row.value)) as unknown,
    updatedAt: String(row.updatedAt),
    opId: String(row.opId),
  }))
}

export function clearSyncSettings(driver: SqlDriver): void {
  if (syncSettingsReady(driver)) driver.exec('DELETE FROM sync_settings')
}

const workspaceColumns = { theme: 'theme', style: 'style', checkStyle: 'checkStyle' } as const

/** Copies winning workspace preferences onto the visible workspace row. Other device-local columns stay put. */
export function projectWorkspaceSettings(driver: SqlDriver): boolean {
  if (!syncSettingsReady(driver)) return false
  let changed = false
  for (const [key, column] of Object.entries(workspaceColumns) as [('theme' | 'style' | 'checkStyle'), string][]) {
    const row = driver.prepare('SELECT value FROM sync_settings WHERE key=?').get(key)
    if (!row || row.value === null || row.value === undefined) continue
    let value: string
    try {
      const parsed = parseSetting(key, JSON.parse(String(row.value))).value
      if (typeof parsed !== 'string') continue
      value = parsed
    } catch { continue }
    const current = driver.prepare(`SELECT ${column} AS value FROM workspace WHERE id=1`).get()
    if (!current || String(current.value) === value) continue
    driver.prepare(`UPDATE workspace SET ${column}=? WHERE id=1`).run(value)
    changed = true
  }
  const enabled = driver.prepare("SELECT value FROM sync_settings WHERE key='backup.enabled'").get()
  const retention = driver.prepare("SELECT value FROM sync_settings WHERE key='backup.retention'").get()
  if (enabled?.value !== null && enabled?.value !== undefined) {
    try {
      const parsed = parseSetting('backup.enabled', JSON.parse(String(enabled.value))).value
      const current = driver.prepare('SELECT backupEnabled AS value FROM workspace WHERE id=1').get()
      if (typeof parsed === 'boolean' && current && Boolean(current.value) !== parsed) {
        driver.prepare('UPDATE workspace SET backupEnabled=? WHERE id=1').run(parsed ? 1 : 0)
        changed = true
      }
    } catch { /* A malformed row stays out of the workspace. */ }
  }
  if (retention?.value !== null && retention?.value !== undefined) {
    try {
      const parsed = parseSetting('backup.retention', JSON.parse(String(retention.value))).value
      const current = driver.prepare('SELECT backupRetention AS value FROM workspace WHERE id=1').get()
      if (typeof parsed === 'number' && current && Number(current.value) !== parsed) {
        driver.prepare('UPDATE workspace SET backupRetention=? WHERE id=1').run(parsed)
        changed = true
      }
    } catch { /* A malformed row stays out of the workspace. */ }
  }
  return changed
}

export interface SettingEntry { key: string; value: unknown }

/** Writes one local pref.set op for the entries that should sync. Identical stored values are omitted. */
export function enqueueSettings(driver: SqlDriver, input: {
  opId: string
  deviceId: string
  at: string
  entries: SettingEntry[]
  onlyAbsent?: boolean
  force?: boolean
}): SyncOp | null {
  if (!syncSettingsReady(driver)) return null
  const actions: { t: 'pref.set'; key: SettingKey; value: unknown }[] = []
  for (const entry of input.entries) {
    const setting = parseSetting(entry.key, entry.value)
    const existing = driver.prepare('SELECT value FROM sync_settings WHERE key=?').get(setting.key)
    if (input.onlyAbsent && existing) continue
    const durable = isSecretSettingKey(setting.key) ? persistedSecret(setting.value) : setting.value
    const next = encoded(durable)
    const current = !existing || existing.value === null || existing.value === undefined ? null : String(existing.value)
    if (!input.force && existing && current === next) continue
    actions.push({ t: 'pref.set', key: setting.key, value: durable })
  }
  if (!actions.length) return null
  const op = parseSyncOp({ v: 1, opId: input.opId, deviceId: input.deviceId, at: input.at, actions })
  const payload = syncOpPayload(op)
  const order = Number(driver.prepare('SELECT COALESCE(MAX(localOrder),0) AS n FROM sync_ops').get()?.n ?? 0) + 1
  driver.prepare(`INSERT INTO sync_ops (opId, localOrder, origin, formatVersion, payload, payloadHash, deviceId, at, state, createdAt, updatedAt)
    VALUES (?, ?, 'local', 1, ?, ?, ?, ?, 'never_sent', ?, ?)`).run(op.opId, order, payload, sha256Hex(payload), op.deviceId, op.at, op.at, op.at)
  for (const action of actions) writeSetting(driver, action.key, action.value, op.at, op.opId)
  return op
}

/**
 * Replaces API-key plaintext left by an older build with fingerprints, then VACUUMs so the file bytes do not keep the key.
 * Returns true when a row changed. A database that already stores fingerprints is left alone.
 */
export function scrubSecretMaterial(driver: SqlDriver): boolean {
  if (!syncSettingsReady(driver)) return false
  const opsReady = Boolean(driver.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sync_ops'").get())
  let changed = false
  driver.exec('PRAGMA secure_delete = ON')
  try {
    for (const row of driver.prepare(`SELECT key, value FROM sync_settings WHERE key IN ('ai.key.openrouter', 'ai.key.vercel-gateway')`).all()) {
      if (row.value === null || row.value === undefined) continue
      let parsed: unknown
      try { parsed = JSON.parse(String(row.value)) } catch { continue }
      const durable = persistedSecret(parsed)
      if (durable === parsed) continue
      driver.prepare('UPDATE sync_settings SET value=? WHERE key=?').run(encoded(durable), String(row.key))
      changed = true
    }
    if (opsReady) {
      for (const row of driver.prepare(`SELECT opId, payload FROM sync_ops WHERE instr(payload, '"ai.key.') > 0`).all()) {
        let op: SyncOp
        try { op = parseSyncOp(JSON.parse(String(row.payload))) } catch { continue }
        const redacted = redactSyncOp(op)
        const payload = syncOpPayload(redacted)
        if (payload === String(row.payload)) continue
        driver.prepare('UPDATE sync_ops SET payload=?, payloadHash=? WHERE opId=?').run(payload, sha256Hex(payload), String(row.opId))
        changed = true
      }
    }
    if (changed) driver.exec('VACUUM')
  } finally {
    driver.exec('PRAGMA secure_delete = OFF')
  }
  return changed
}

/** One op that re-uploads the current settings after the op log is replaced. */
export function settingsBaselineOp(driver: SqlDriver, deviceId: string, at: string): SyncOp | null {
  const rows = readSettings(driver)
  if (!rows.length) return null
  return enqueueSettings(driver, {
    opId: globalThis.crypto.randomUUID(), deviceId, at, force: true,
    entries: rows.map(row => ({ key: row.key, value: row.value })),
  })
}
