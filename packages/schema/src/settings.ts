/** Additive sync side table. v8 business DDL does not include it. CREATE IF NOT EXISTS is safe to repeat. */
export const syncSettingsDdl = `
CREATE TABLE IF NOT EXISTS sync_settings (
  key TEXT PRIMARY KEY,
  value TEXT CHECK(value IS NULL OR json_valid(value)),
  updatedAt TEXT NOT NULL,
  opId TEXT NOT NULL
) STRICT;
`
