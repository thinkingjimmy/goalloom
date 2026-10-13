import { expect, it } from 'vitest'
import { runLocalPrototype } from '@goalloom/sync'
import { openSync } from './fixture'
import { runHostedPrototype } from './phase0-hosted'

it('runs the six local prototype scenarios on two electron clients', () => {
  const rows = runLocalPrototype(() => {
    const opened = openSync()
    return { driver: opened.driver, host: opened.host, close: () => opened.db.close() }
  })
  for (const row of rows) {
    console.log(`${row.ok ? 'pass' : 'fail'}  ${row.name}  ${row.ms}ms${row.detail ? `  ${row.detail}` : ''}`)
    expect(row.ok, `${row.name} ${row.detail}`).toBe(true)
  }
  expect(rows.map(row => row.name)).toEqual([
    'offline edit', 'reorder', 'conflict reject', 'crash recovery', 'key rotation', 'snapshot join',
  ])
})

if (process.env.PHASE0_REQUIRE_HOSTED === '1') {
  it('runs the six scenarios against the hosted project', async () => {
    const url = process.env.SUPABASE_URL
    const anonKey = process.env.SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !anonKey || !serviceKey) {
      throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are required. See supabase/README.md.')
    }
    await runHostedPrototype({ url, anonKey, serviceKey })
  }, 90_000)
}
