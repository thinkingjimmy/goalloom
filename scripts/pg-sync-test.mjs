import { spawnSync } from 'node:child_process'

const psql = process.env.PSQL ?? 'psql'
const db = process.env.PGDATABASE ?? 'goalloom_sync_p0'
const user = process.env.PGUSER
const args = [...(user ? ['-U', user] : []), '-d', db, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/tests/harness.sql', '-f', 'supabase/migrations/0001_core.sql', '-f', 'supabase/tests/adversarial.sql']
const result = spawnSync(psql, args, { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)
console.log(`pg sync cases 1, 4, 16, 17 passed on ${db}`)
