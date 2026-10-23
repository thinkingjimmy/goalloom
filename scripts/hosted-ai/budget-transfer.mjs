/**
 * [INPUT]: Paused ledgers, terminal full-reservation holds past cutoff and an explicit transfer mode.
 * [OUTPUT]: Debit-first transfer within the original USD 10, preserving charges and exact-state recovery.
 * [POS]: Manual allocation tooling; never enables admission or resets costs/receipts.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises'
import { client } from './client.mjs'

const [mode, direction, roundFlag, round=''] = process.argv.slice(2)
assert([4,6].includes(process.argv.length) && ['--plan','--apply'].includes(mode) && ['development','return'].includes(direction) && (roundFlag===undefined || roundFlag==='--round' && /^[a-z0-9-]{1,40}$/.test(round)), 'Use --plan|--apply development|return [--round name]')
const out = 'output/tests/hosted-ai/content-minimization'
await mkdir(out, { recursive: true })
const file = `${out}/budget-transfer-${direction}${round?`-${round}`:""}.json`
const dev = await client(), prod = await client('.env.deploy.production.local','production')
const clients = { development: dev, production: prod }
const terminalHold = environment => environment === 'development'
  ? "status='failed' and created_at<clock_timestamp()-interval '10 minutes' and reserved_micro>0 and charged_micro>=reserved_micro"
  : 'false'
const snapshot = async () => Object.fromEntries(await Promise.all(Object.entries(clients).map(async ([environment, db]) => {
  const closedHold=terminalHold(environment)
  const rows = await db.query(`select limit_micro,spent_micro,policy,environment,blocked,
    (select count(*)::int from public.ai_actions where status='running' or not confirmed and not (${closedHold})) as unsettled,
    (select coalesce(sum(charged_micro),0)::bigint from public.ai_actions where not confirmed and (${closedHold})) as preserved_unknown_micro
    from public.ai_budget where id='integration-shared';`)
  assert(rows.length === 1 && rows[0].environment === environment, 'Unexpected budget identity')
  const b = rows[0]
  assert(b.policy === 'disabled' && b.unsettled === 0, 'Pause/drain both environments; unknown fees require a closed full-reservation hold')
  assert(Number.isSafeInteger(b.limit_micro) && Number.isSafeInteger(b.spent_micro) && b.spent_micro >= 0 && b.limit_micro >= b.spent_micro, 'Invalid ledger amounts')
  assert(Number.isSafeInteger(b.preserved_unknown_micro) && b.preserved_unknown_micro>=0 && b.preserved_unknown_micro<=b.spent_micro,'Unknown reservation exceeds preserved spend')
  return [environment, b]
})))
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b)
const sum = state => state.development.limit_micro + state.production.limit_micro
let journal
try { journal = JSON.parse(await readFile(file,'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
const save = async () => {
  await writeFile(`${file}.tmp`,JSON.stringify(journal,null,2)+'\n',{ mode: 0o600 })
  await rename(`${file}.tmp`,file)
}
try {
  let current = await snapshot()
  assert(sum(current) <= 10000000, 'Combined allocation exceeds original USD 10')
  if (!journal) {
    assert(sum(current) === 10000000, 'Unjournaled partial transfer requires inspection')
    const source = direction === 'development' ? 'production' : 'development'
    const destination = direction === 'development' ? 'development' : 'production'
    if(direction==='return')assert(!current.production.blocked,'Do not clear an existing production protection')
    const amount = direction === 'development' ? 2500000 : current.development.limit_micro-current.development.spent_micro
    assert(amount > 0 && current[source].limit_micro-current[source].spent_micro >= amount, 'No transferable unused allocation')
    if(direction === 'development') assert(current.development.limit_micro === current.development.spent_micro && current.development.blocked, 'Development already has an allocation')
    const afterDebit = structuredClone(current)
    afterDebit[source].limit_micro -= amount
    afterDebit[source].blocked = afterDebit[source].limit_micro === afterDebit[source].spent_micro
    const after = structuredClone(afterDebit)
    after[destination].limit_micro += amount
    after[destination].blocked = false
    journal = { version:1,direction,...(round?{round}:{}),source,destination,amountMicro:amount,before:current,afterDebit,after,stage:'prepared',createdAt:new Date().toISOString(),ok:false }
    if(mode === '--apply') await writeFile(file,JSON.stringify(journal,null,2)+'\n',{flag:'wx',mode:0o600})
  }
  assert(journal.version === 1 && journal.direction === direction && (journal.round??'')===round && sum(journal.before) === 10000000 && sum(journal.after) === 10000000, 'Unexpected transfer journal')
  assert([journal.before,journal.afterDebit,journal.after].some(state => equal(current,state)), 'Ledger changed outside the saved transfer')
  if(mode === '--apply') {
    for(const [environment,expected,next,stage] of [
      [journal.source,journal.before,journal.afterDebit,'source_debited'],
      [journal.destination,journal.afterDebit,journal.after,'destination_credited'],
    ]) {
      current = await snapshot()
      if(equal(current,journal.after) || !equal(current,expected) && equal(current,next)) continue
      assert(equal(current,expected), 'Inspect an uncertain prior transfer before continuing')
      const b = expected[environment], n = next[environment]
      const closedHold=terminalHold(environment)
      journal.submitting = stage; await save()
      await clients[environment].query(`begin;
do $transfer$ declare b public.ai_budget; begin
select * into strict b from public.ai_budget where id='integration-shared' for update;
if b.environment<>'${environment}' or b.policy<>'disabled' or b.limit_micro<>${b.limit_micro} or b.spent_micro<>${b.spent_micro}
or b.blocked is distinct from ${b.blocked} or exists(select 1 from public.ai_actions where status='running' or not confirmed and not (${closedHold}))
then raise exception 'Transfer guard changed'; end if;
update public.ai_budget set limit_micro=${n.limit_micro},blocked=${n.blocked} where id='integration-shared';
end $transfer$; commit;`,false)
      assert(equal(await snapshot(),next), 'Transfer readback differs; inspect without adding credit')
      journal.stage = stage; delete journal.submitting; await save()
    }
    assert(equal(await snapshot(),journal.after), 'Final allocation mismatch')
    journal.stage = 'complete'; journal.ok = true; journal.completedAt = new Date().toISOString(); await save()
  }
  console.log(JSON.stringify({ok:true,mode,direction,stage:journal.stage,amountMicro:journal.amountMicro,before:journal.before,after:journal.after,combinedLimitMicro:sum(journal.after),realProviderCalls:0},null,2))
} catch {
  if(journal && mode === '--apply') {journal.ok=false;journal.error='transfer_incomplete_inspect_exact_remote_state';await save()}
  console.error('Transfer stopped; inspect the saved journal and both paused ledgers. No automatic write retry.');process.exitCode=1
}
