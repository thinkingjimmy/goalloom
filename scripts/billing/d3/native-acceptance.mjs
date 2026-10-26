/**
 * [INPUT]: Actual local session-adoption CLI and disposable owner-only files with controlled JWT claims.
 * [OUTPUT]: Repeatable original-session and optional target-transfer CLI evidence; no Auth or network calls.
 * [POS]: D3 handoff CLI E2E; does not establish token authenticity or native app acceptance.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {mkdtemp,writeFile,readFile,chmod,mkdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
import {nativeInput} from './native.mjs'
const temporary=await mkdtemp(join(tmpdir(),'goalloom-d3-native-')),journal=join(temporary,'journal.json'),returned=join(temporary,'session.json')
const script=resolve('scripts/billing/d3/native.mjs'),owner=randomUUID(),session=randomUUID(),origin='https://asqyvcnxdltzzfutbbqy.supabase.co/auth/v1'
const token=values=>`fixture.${Buffer.from(JSON.stringify({iss:origin,role:'authenticated',sub:owner,email:`billing-${owner}@goalloom.test`,session_id:session,exp:100,...values})).toString('base64url')}.fixture`
const original={profile:'d3-current-d2',project:'asqyvcnxdltzzfutbbqy',fixtures:[{ownerId:owner,sessions:[{access_token:token({}),refresh_token:'fixture-original'}]}],nativePending:{stage:'setup'}}
const checks=[],report={ok:false,scope:'Actual local CLI and protected files with controlled JWT claims; no Auth signature, network, provider or native-app claim.',checks,realExternalCalls:0}
try{
 const run=()=>spawnSync(process.execPath,[script,'--adopt',journal,returned],{encoding:'utf8'})
 const reset=async()=>{await writeFile(journal,JSON.stringify(original),{mode:0o600});await writeFile(returned,JSON.stringify({access_token:token({exp:200}),refresh_token:'fixture-rotated'}),{mode:0o600});await chmod(returned,0o600)}
 await reset();let result=run();assert.equal(result.status,0,result.stderr)
 let actual=JSON.parse(await readFile(journal,'utf8'));assert.equal(actual.fixtures[0].sessions[0].refresh_token,'fixture-rotated');assert(!actual.nativePending);assert.equal(actual.nativeReturns.length,1)
 checks.push('Latest same-owner/session return is saved to the original journal and clears the paused checkpoint')
 for(const claims of [{sub:randomUUID()},{session_id:randomUUID()},{iss:'https://foreign.invalid/auth/v1'},{exp:99}]){
  await reset();await writeFile(returned,JSON.stringify({access_token:token(claims),refresh_token:'fixture-foreign'}));const before=await readFile(journal,'utf8')
  result=run();assert.notEqual(result.status,0);assert.equal(await readFile(journal,'utf8'),before)
 }
 checks.push('Foreign owner/session/issuer and older return leave the original journal unchanged')
 await reset();await chmod(returned,0o644);const before=await readFile(journal,'utf8');result=run();assert.notEqual(result.status,0);assert.equal(await readFile(journal,'utf8'),before)
 checks.push('Public-permission return is refused without altering the journal')
 await reset()
 const inputPath=join(temporary,'checkpoint.json'),observer=resolve('apps/desktop/tests/billing-provider.mjs')
 const ctx={journal:{runId:'local-handoff'},fixture:original.fixtures[0],privatePath:journal,apiOrigin:origin.replace('/auth/v1',''),lifecycle:{anon:'fixture-local-public-anon-key'}}
 const publicState={status:'expired',eligible:false,grace:false,effectiveEnd:null,subscriptions:[]}
 const target={workspaceId:randomUUID(),generation:randomUUID(),retrieveUntil:'2026-11-24T00:00:00.123456Z',retrievalWindowOpen:false}
 for(const retainedTarget of [undefined,{...target,metadata:'not-forwarded'}]){
  const input=nativeInput(ctx,{journey:'A',stage:'expire'},{publicState,...(retainedTarget===undefined?{}:{retainedTarget})},join(temporary,'unused-output'))
  if(retainedTarget===undefined)assert(!Object.hasOwn(input,'retainedTarget'))
  else assert.deepEqual(input.retainedTarget,target)
  await writeFile(inputPath,JSON.stringify(input),{mode:0o600})
  result=spawnSync(process.execPath,[observer,'--observe','--input',inputPath,'--validate'],{encoding:'utf8',env:{...process.env,BILLING_RUNTIME:'/nonexistent-d3-native-handoff-no-provider'}})
  assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{ok:true,validated:true})
 }
 checks.push('Actual Desktop validation accepts absent or exact whitelisted retained targets without fabricated deadlines, extra metadata or native execution')
 report.ok=true
}catch(error){report.error={name:error.name,message:error.message};process.exitCode=1}
finally{const directory=resolve('output/tests/billing/desktop/d3-local');await mkdir(directory,{recursive:true});await writeFile(join(directory,'native-handoff-result.json'),JSON.stringify(report,null,2)+'\n');await rm(temporary,{recursive:true})}
console.log(JSON.stringify(report,null,2))
