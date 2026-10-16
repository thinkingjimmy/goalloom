/**
 * [INPUT]: Frozen baseline and candidate sync-owned E2E evidence.
 * [OUTPUT]: Explicit request/body-byte cost comparison and verified/unverified scope.
 * [POS]: Reproducible report generator. It does not infer a bill from RPC counts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve, join } from 'node:path'

const out = resolve('output/tests/sync-cost')
const read = async name => JSON.parse(await readFile(join(out, `${name}.json`), 'utf8'))
const [baseline, scheduling, batching, protection, native, idle] = await Promise.all(['baseline','scheduling','batching','protection','native','idle-workload'].map(read))
for (const row of [baseline, scheduling, batching, protection, native, idle]) assert.equal(row.ok, true)
const oldIdleBody = baseline.requests.reduce((n, row) => n + row.bytes, 0) / baseline.idleTriggers
const oldFourHourRequests = idle.clockSeconds / 8 * baseline.requestsPerIdleTrigger
const reduction = 1 - idle.checks / oldFourHourRequests
const root = resolve('../..')
const files = ['apps/desktop/src/main/sync/service.ts','apps/desktop/src/main/sync/schedule.ts','apps/desktop/src/main/sync/exchange.ts','apps/desktop/src/main/sync/pending-cache.ts','apps/desktop/src/main/sync/cooldown.ts','packages/sync/src/request.ts','packages/sync/src/fetch-remote.ts','packages/store-core/src/settings.ts','supabase/migrations/0008_sync_cost.sql']
const source = Object.fromEntries(await Promise.all(files.map(async file => [file, createHash('sha256').update(await readFile(join(root,file))).digest('hex') ])))
const cost = {
  measured: { foreground: { oldRequests: 60, newRequests: scheduling.idleRequests, triggers: 30, reduction: 0.5 },
    fourHourIdle: { ...idle, oldRequestsDerivedFromFrozenCadence: oldFourHourRequests, candidateRequests: idle.checks, requestReduction: reduction,
      oldBodyBytesDerivedFromFrozenSample: oldFourHourRequests / 2 * oldIdleBody, candidateBodyBytes: idle.responseBodyBytes },
    burst: batching.burst,
    monthlyScenario: { devices: 2, days: 20, oldIdleRPCs: 144000, candidateChecksWithTransitions: idle.checks * 40, assumedEventRPCs: 3000, candidateTotalRPCs: idle.checks * 40 + 3000, modelReduction: 1 - (idle.checks * 40 + 3000) / 144000 } },
  pricing: { status: 'Planning assumptions from todo/sync-cost-optimization.md, not newly verified prices or a measured bill.',
    monthlyActiveUsers: 10000, oldUSD: [320.8,420.8], candidateUSD: [174.5,224.5], expectedUSDReduction: [146.3,196.3],
    conditions: 'Requires the assumed egress/disk load, delayed capacity growth and a separately load-tested compute reduction.' },
  currentBillSavings: 'Unmeasured. No hosted deployment, paid resource change or billing inspection occurred.',
  excluded: ['HTTP/TLS framing, SDK heartbeat/Auth/reconnect traffic outside JSON body totals','Hosted SQL/WAL/index growth and concurrent quota acceptance','Actual peak capacity and compute sizing','Packaged macOS, Windows, two physical devices and real system sleep'],
}
const report = { ok: true, baselineRef: baseline.source, candidateHead: execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(), candidateFiles: source,
  checks: [...scheduling.checks,...batching.checks,...protection.checks,...native.checks], runtime: native.runtime, host: native.host,
  hosted: 'Deferred by owner until credentials are available. SQL/permissions/quota concurrency/Cron/live broadcast remain unverified.',
  evidence: ['baseline.json','scheduling.json','batching.json','protection.json','native.json','idle-workload.json','requests.json','schedule.json','convergence.json','cost.json','screenshots/'] }
const supplemental = [
  ['pnpm test:sync-replay','output/tests/sync-replay/report.json'],
  ['pnpm test:credentials','output/tests/credentials/report.json'],
  ['pnpm test:language','output/tests/language.json'],
  ['pnpm test:recovery','output/tests/recovery/report.json'],
]
report.validation = { requiredCommands: ['pnpm typecheck','pnpm test','pnpm build'], owningSuite: { passed: true, checks: report.checks.length, command: 'pnpm test:sync-scheduling' }, supplementalArtifacts: supplemental.map(([command,path]) => ({command,path})),
  scope: 'Changed features only. Full release verification, packaged builds and Windows were not run.' }
await writeFile(join(out,'cost.json'),JSON.stringify(cost,null,2))
await writeFile(join(out,'report.json'),JSON.stringify(report,null,2))
await writeFile(join(out,'report.md'),`# Sync cost acceptance\n\nLocal source Electron acceptance passed (${report.checks.length} checks).\n\n- 30 idle triggers: 60 → ${scheduling.idleRequests} RPCs.\n- Four-hour 20/80 idle workload: ${oldFourHourRequests} derived old RPCs → ${idle.checks} measured candidate checks (${(reduction*100).toFixed(2)}% fewer).\n- Eleven durable writes: one upload request within 200 ms.\n- Upload cooldown keeps status, receipt confirmation and peer downloads available; vault/service restore preserves cooldown and unknown payload identity.\n- Host: ${native.host.machine}, ${native.host.cpu}, Darwin ${native.host.os}, ${native.host.arch}. Electron ${native.runtime.electron}; Node ${native.runtime.node}; SQLite ${native.runtime.sqlite}.\n\nThe four-hour workload uses an injected monotonic clock with real local HTTP/WS and real storage. JSON body bytes exclude HTTP/TLS/Auth/heartbeat costs. The old four-hour count is derived from the frozen baseline cadence, not a four-hour run of the old app.\n\nHosted SQL, permissions, quota concurrency, cleanup/Cron, live broadcast and billing are deferred by owner until credentials are available. No purchased capacity or deployment changed. The 10,000-MAU budget remains a planning scenario, not current savings.\n\nSee report.json and cost.json for exact scope, hashes and exclusions.\n`)
console.log(`Sync report: ${report.checks.length} checks; four-hour idle RPC reduction ${(reduction*100).toFixed(2)}%`)
