/** Additive sync side table. v8 business DDL does not include it. CREATE is safe to repeat. */
export const syncSettingsDdl = `
CREATE TABLE sync_settings (
  key TEXT PRIMARY KEY,
  value TEXT CHECK(value IS NULL OR json_valid(value)),
  updatedAt TEXT NOT NULL,
  opId TEXT NOT NULL
) STRICT;
`
