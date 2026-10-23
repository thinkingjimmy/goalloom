/**
 * [INPUT]: Verified production migration history, current bundled hosted handler and production-only credentials.
 * [OUTPUT]: Production Edge deployment with source/JWT smoke evidence; AI budget activation remains separate.
 * [POS]: Manual hosted-AI code rollout. No Secret, budget, billing, sync-setting or installer changes.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { productionClient, productionRef, productionUrl } from '../deploy/client.mjs'
import { migrationManifest, pendingMigrations } from '../deploy/schema.mjs'
import { eszipOriginalSource } from '../deploy/edge-source.mjs'

const args = process.argv.slice(2), mode = args[0] ?? '--plan'
assert(args.length <= 1 && ['--plan', '--apply'].includes(mode), 'Use --plan or --apply')
const bundle = await build({ entryPoints: ['supabase/functions/hosted-ai/index.ts'], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', external: ['node:*'], logLevel: 'silent' })
const source = bundle.outputFiles[0].text, hash = value => createHash('sha256').update(value).digest('hex')
const report = { ok: false, mode, project: productionRef, sha256: hash(source), stages: [], scope: 'Production hosted-AI Edge code and unauthorized smoke only. No inference, entitlement, Secret or budget activation.' }
let client
try {
  if (mode === '--apply') {
    client = await productionClient()
    const manifest = await migrationManifest()
    const history = await client.query('select version,name,statements from supabase_migrations.schema_migrations order by version;', true)
    assert(pendingMigrations(manifest, history, []).length === 0, 'Apply and verify production SQL with the guarded migration runner first')
    assert(history.some(row => row.version === '0013' && row.name === 'hosted_ai_assistance_revision'), 'Hosted assistance revision migration missing')
    report.budget = await client.query('select limit_micro,spent_micro,policy,environment,blocked from public.ai_budget;', true)
    assert(report.budget.every(row => row.environment === 'production' && row.limit_micro <= 10000000 && row.policy === 'disabled'), 'Unexpected production AI budget')
    const form = new FormData()
    form.set('metadata', JSON.stringify({ name: 'hosted-ai', entrypoint_path: 'index.ts', verify_jwt: true }))
    form.append('file', new Blob([source], { type: 'application/typescript' }), 'index.ts')
    await client.request('/functions/deploy?slug=hosted-ai', { method: 'POST', form })
    const metadata = await client.request('/functions/hosted-ai')
    assert(metadata.status === 'ACTIVE' && metadata.verify_jwt === true, 'Edge not active with JWT verification')
    const downloaded = await client.request('/functions/hosted-ai/body', { binary: true })
    const original = downloaded.subarray(0, 8).toString() === 'ESZIP2.3' ? eszipOriginalSource(downloaded) : downloaded.toString('utf8')
    assert(hash(original) === report.sha256, 'Production Edge original source differs from current bundle')
    report.stages.push('Production Edge active; JWT verification and downloaded original source hash matched')
    const smoke = await fetch(`${productionUrl}/functions/v1/hosted-ai`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(15000), redirect: 'error' })
    assert.equal(smoke.status, 401, 'Unauthenticated production call was not rejected')
    report.stages.push('Unauthenticated production request rejected with HTTP 401; no inference')
    report.activation = report.budget.length ? 'Existing budget preserved; authenticated eligibility not tested' : 'Inactive: no production budget configured; transfer the shared remaining allocation before use'
  }
  report.ok = true
} catch (error) { report.error = 'production_deployment_incomplete'; process.exitCode = 1 }
await mkdir('output/tests/hosted-ai', { recursive: true })
const path = `output/tests/hosted-ai/production-${mode === '--plan' ? 'plan' : 'deployment'}.json`
await writeFile(path, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report, null, 2))
