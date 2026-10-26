/**
 * [INPUT]: D0 migration sources and read-only development catalog metadata.
 * [OUTPUT]: Ordered pending billing deltas and byte-exact final RPC source verification.
 * [POS]: Billing deployment guard; does not baseline or replay unrelated development migrations.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
export async function billingMigrations(db){
  const markers=(await db.query(`select to_regclass('public.billing_policy') is not null as core,
    to_regclass('public.billing_compensations') is not null as compensation,
    to_regprocedure('public.billing_closeouts(text,uuid)') is not null as closeout,
    coalesce((select position('trial_conversion_v2' in prosrc)>0 from pg_proc where pronamespace='public'::regnamespace and proname='billing_commit'),false) as conversion`))[0]
  const names=['0014_billing.sql','0015_billing_compensation.sql','0016_billing_closeout.sql','0017_billing_trial_conversion.sql']
  const states=[markers.core,markers.compensation,markers.closeout,markers.conversion]
  assert(states.every((value,index)=>!value||states.slice(0,index).every(Boolean)),'Partial/out-of-order billing schema')
  return Promise.all(names.map(async(file,index)=>{const sql=await readFile(`supabase/migrations/${file}`,'utf8');return {file,sql,installed:states[index],sha256:createHash('sha256').update(sql).digest('hex')}}))
}
export async function assertBillingSource(db,migrations){
  const expected=new Map()
  for(const migration of migrations)for(const match of migration.sql.matchAll(/create (?:or replace )?function public\.([a-z_]+)\([\s\S]*?\) returns [\s\S]*?as \$\$([\s\S]*?)\$\$;/g))expected.set(match[1],match[2])
  assert(expected.size>=16,'No billing RPC source contracts parsed')
  const rows=await db.query("select proname,prosrc from pg_proc where pronamespace='public'::regnamespace and proname like 'billing_%'")
  assert.equal(rows.length,expected.size,'Unexpected billing RPC count')
  for(const row of rows)assert.equal(row.prosrc,expected.get(row.proname),`Installed RPC drift: ${row.proname}`)
}
