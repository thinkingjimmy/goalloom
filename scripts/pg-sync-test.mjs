import { spawnSync } from 'node:child_process'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL is required. See supabase/README.md. This script does not start Docker or install a signature oracle.')
  process.exit(1)
}
const psql = process.env.PSQL ?? 'psql'
const result = spawnSync(psql, [url, '-v', 'ON_ERROR_STOP=1', '-f', 'supabase/tests/0001_core.test.sql'], { stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status ?? 1)
console.log('pgTAP cases 1, 4, 16, 17 passed')
