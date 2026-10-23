/**
 * [INPUT]: Explicit owner-confirmed production Secrets, verified Edge source and settled shared development budget.
 * [OUTPUT]: Development admissions frozen, remaining allocation enabled only in production, and redacted evidence.
 * [POS]: Manual cross-project activation; no inference, credential copying, cost reset or automatic write retry.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { build } from 'esbuild'
import { client, readFetch } from './client.mjs'
import { productionClient, productionRef, productionUrl } from '../deploy/client.mjs'
import { eszipOriginalSource } from '../deploy/edge-source.mjs'
import { migrationManifest, pendingMigrations } from '../deploy/schema.mjs'

const args = process.argv.slice(2), mode = args[0]
assert(['--plan', '--apply'].includes(mode), 'Use --plan or --apply --secrets-confirmed')
assert(args.length === (mode === '--apply' ? 2 : 1), 'Unexpected arguments')
assert(mode !== '--apply' || args[1] === '--secrets-confirmed', 'Owner must confirm production Secrets before activation')
const dev = await client(), prod = await productionClient()
const path = `output/tests/hosted-ai/production-activation${mode === '--plan' ? '-preview' : ''}.json`
const report = { ok: false, mode, project: productionRef, stages: [], ownerConfirmedSecrets: mode === '--apply',
  runtimeSecretsVerified: false, authenticatedProductionAcceptance: false, realModelCalls: 0,
  scope: 'Shared budget activation only. Production Secrets are owner-confirmed; runtime configuration and authenticated model use require client acceptance.' }
const save = async () => {
  await mkdir('output/tests/hosted-ai', { recursive: true })
  await writeFile(path, JSON.stringify(report, null, 2) + '\n')
}
const snapshot = async db => ({
  budget: await db.query('select id,limit_micro,spent_micro,environment,policy,blocked from public.ai_budget;', true),
  activity: (await db.query("select count(*)::int as total,count(*) filter(where status='running')::int as running,count(*) filter(where not confirmed)::int as unconfirmed from public.ai_actions;", true))[0],
})
const checkedDev = state => {
  assert.equal(state.budget.length, 1, 'Expected one development budget')
  const b = state.budget[0]
  assert(b.id === 'integration-shared' && b.environment === 'development', 'Unexpected development budget identity')
  assert(Number.isSafeInteger(b.spent_micro) && b.spent_micro >= 0 && b.spent_micro <= 10000000, 'Invalid preserved spend')
  assert.equal(state.activity.running, 0, 'Development requests are still running')
  assert.equal(state.activity.unconfirmed, 0, 'Development usage remains unsettled')
  assert(b.policy === 'authenticated' && b.limit_micro === 10000000 && !b.blocked || b.policy === 'disabled' && b.blocked && b.limit_micro === b.spent_micro, 'Unexpected development policy/allocation')
  return b
}
const checkedProd = (state, remaining) => {
  assert(state.budget.length <= 1, 'Unexpected production budgets')
  if (!state.budget.length) { assert.equal(state.activity.total, 0, 'Production actions exist without a budget'); return }
  const b = state.budget[0]
  assert(b.id === 'integration-shared' && b.environment === 'production' && b.policy === 'authenticated' && b.limit_micro === remaining, 'Existing production allocation differs; no automatic adjustment')
}
try {
  const manifest = await migrationManifest()
  assert(mode === '--plan', 'Legacy allocation activation is retired; use the reviewed content-rollout without adding credit')
  const history = await prod.query('select version,name,statements from supabase_migrations.schema_migrations order by version;', true)
  assert.equal(pendingMigrations(manifest, history, []).length, 0, 'Production migration history mismatch')
  const bundle = await build({ entryPoints: ['supabase/functions/hosted-ai/index.ts'], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022', external: ['node:*'], logLevel: 'silent' })
  const hash = value => createHash('sha256').update(value).digest('hex')
  const metadata = await prod.request('/functions/hosted-ai')
  assert(metadata.status === 'ACTIVE' && metadata.verify_jwt === true, 'Production Edge/JWT is not ready')
  const downloaded = await prod.request('/functions/hosted-ai/body', { binary: true })
  const source = downloaded.subarray(0, 8).toString() === 'ESZIP2.3' ? eszipOriginalSource(downloaded) : downloaded.toString('utf8')
  assert.equal(hash(source), hash(bundle.outputFiles[0].text), 'Production Edge source changed')
  report.sourceSha256 = hash(source)
  const unauthorized = await readFetch(`${productionUrl}/functions/v1/hosted-ai?status=1`, { signal: AbortSignal.timeout(15000), redirect: 'error' })
  assert.equal(unauthorized.status, 401, 'Unauthenticated production status is not rejected')
  report.before = { development: await snapshot(dev), production: await snapshot(prod) }
  let development = checkedDev(report.before.development)
  checkedProd(report.before.production, 10000000 - development.spent_micro)
  // A prior production allocation is valid only after development has already been frozen.
  assert(!report.before.production.budget.length || development.policy === 'disabled', 'Both environments have active allocations')
  report.stages.push('Migration history, identical source, JWT, HTTP 401 and settled allocation preconditions verified')
  await save()
  if (mode === '--apply') {
    await dev.query(`begin;
      do $$ declare b public.ai_budget; begin
        select * into strict b from public.ai_budget where id='integration-shared' for update;
        if b.environment<>'development' or b.spent_micro<>${development.spent_micro}
          or not ((b.policy='authenticated' and b.limit_micro=10000000 and not b.blocked)
            or (b.policy='disabled' and b.blocked and b.limit_micro=b.spent_micro))
          or exists(select 1 from public.ai_actions where status='running' or not confirmed)
          then raise exception 'Development changed or is unsettled; activation stopped'; end if;
        update public.ai_budget set policy='disabled',blocked=true,limit_micro=spent_micro where id=b.id;
      end $$;
      commit;`, false)
    report.frozenDevelopment = await snapshot(dev)
    development = checkedDev(report.frozenDevelopment)
    assert.equal(development.policy, 'disabled')
    report.stages.push('Development frozen transactionally; settled spend and receipts preserved')
    await save()
    const remaining = 10000000 - development.spent_micro
    await prod.query(`begin;
      do $$ declare b public.ai_budget; begin
        select * into b from public.ai_budget where id='integration-shared' for update;
        if found then
          if b.environment<>'production' or b.policy<>'authenticated' or b.limit_micro<>${remaining}
            then raise exception 'Existing production allocation differs'; end if;
        else
          if exists(select 1 from public.ai_actions) then raise exception 'Unexpected production receipts'; end if;
          insert into public.ai_budget(id,limit_micro,spent_micro,policy,environment,blocked)
            values('integration-shared',${remaining},0,'authenticated','production',false);
        end if;
      end $$;
      commit;`, false)
    report.after = { development: await snapshot(dev), production: await snapshot(prod) }
    const finalDev = checkedDev(report.after.development)
    assert.equal(finalDev.policy, 'disabled')
    checkedProd(report.after.production, remaining)
    assert.equal(finalDev.limit_micro + report.after.production.budget[0].limit_micro, 10000000)
    report.productionAllocationUsd = remaining / 1000000
    report.preservedDevelopmentSpendUsd = finalDev.spent_micro / 1000000
    report.productionBudgetEnabled = true
    report.stages.push('Production allocation enabled once; both ledger limits sum to original USD 10')
  }
  report.ok = true
} catch (error) {
  report.error = dev.safe(prod.safe(error.message))
  report.recovery = 'Inspect --plan before explicitly rerunning --apply. Writes are never automatically retried; development remains frozen after a partial transfer.'
  process.exitCode = 1
}
await save()
console.log(JSON.stringify(report, null, 2))
