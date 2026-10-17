/**
 * [INPUT]: An explicit development database URL and both hosted pgTAP entry points.
 * [OUTPUT]: Rolled-back core/cost and recovery SQL acceptance through psql.
 * [POS]: Repository test runner; it does not start Docker or retrieve credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { spawnSync } from 'node:child_process'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('SUPABASE_DB_URL is required. See supabase/README.md. This script does not start Docker or install a signature oracle.')
  process.exit(1)
}
const psql = process.env.PSQL ?? 'psql'
for (const path of ['supabase/tests/0001_core.test.sql', 'supabase/tests/0002_sync_security.test.sql']) {
  const result = spawnSync(psql, [url, '-v', 'ON_ERROR_STOP=1', '-f', path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.status !== 0) process.exit(result.status ?? 1)
  if (/^\s*not ok\b/m.test(result.stdout)) process.exit(1)
}
console.log('Core/cost and sync security pgTAP scripts completed')
