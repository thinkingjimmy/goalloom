/**
 * [INPUT]: Actual provider/grace CLI processes in an empty temporary workspace with network disabled.
 * [OUTPUT]: Repeatable credential-free planning and fail-before-dispatch evidence.
 * [POS]: D3 CLI boundary acceptance; no fixture, database or provider access.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {resolve,join} from 'node:path'
import {spawnSync} from 'node:child_process'
const directory=resolve('output/tests/billing/desktop/d3-local'),cwd=await mkdtemp(join(tmpdir(),'goalloom-d3-cli-'))
const checks=[],report={ok:false,realExternalCalls:0,checks}
const blocker='data:text/javascript,'+encodeURIComponent("globalThis.fetch=()=>{throw Error('NETWORK_FORBIDDEN')};")
try{
 for(const script of ['provider-acceptance.mjs','grace-acceptance.mjs']){
  const run=args=>spawnSync(process.execPath,['--import',blocker,resolve('scripts/billing',script),...args],{cwd,encoding:'utf8',env:{PATH:process.env.PATH,D3_BILLING_WINDOW:'',D3_BILLING_LEASE:''}})
  for(const args of [[],['--current-d2','--plan']]){const result=run(args);assert.equal(result.status,0,result.stderr);const plan=JSON.parse(result.stdout);assert.equal(plan.remoteExecuted,false);assert.equal(plan.profile,'current-d2')}
  if(script.startsWith('provider')){
   const ordinary=JSON.parse(run(['--current-d2','--plan']).stdout)
   assert.deepEqual(ordinary.stages.A,['setup','renew','switch','transition','refund','cancel','expire','cleanup'])
   const cancel=run(['--current-d2','--stage','A:cancel','--journal','missing.json','--lease','absent'])
   assert.notEqual(cancel.status,0);assert(cancel.stderr.includes('Exact active D3 development window required'))
   assert(!/Invalid current-D2 journey|NETWORK_FORBIDDEN|ENOENT|Credential/.test(cancel.stdout+cancel.stderr))
   const replacement=run(['--current-d2','--initial-switch','--plan']);assert.equal(replacement.status,0,replacement.stderr)
   const replacementPlan=JSON.parse(replacement.stdout);assert.equal(replacementPlan.initialSwitch,true);assert.deepEqual(replacementPlan.journeys,['A']);assert.deepEqual(replacementPlan.stages.A,['setup','switch','transition','refund','cancel','expire','cleanup']);assert(!replacementPlan.stages.A.includes('renew'))
   for(const extra of [['--stage','A:renew'],['--stage','B:setup'],['--initial-period','--plan']])assert.notEqual(run(['--current-d2','--initial-switch',...extra,'--journal','missing.json','--lease','absent']).status,0)
   const initial=run(['--current-d2','--initial-period','--plan']);assert.equal(initial.status,0,initial.stderr)
   const plan=JSON.parse(initial.stdout);assert.equal(plan.remoteExecuted,false);assert.equal(plan.initialPeriod,true);assert.deepEqual(plan.journeys,['B']);assert(plan.stages.B.includes('partial-refund')&&!plan.stages.B.includes('renew'))
   assert.notEqual(run(['--current-d2','--initial-period','--stage','B:renew','--journal','missing.json','--lease','absent']).status,0)
  }
  for(const args of [['--prepare'],['--current-d2','--stage','Z:setup'],['--current-d2','--stage',script.startsWith('grace')?'C:setup':'A:setup','--journal','missing.json','--lease','absent']]){
   const result=run(args);assert.notEqual(result.status,0);assert(!/NETWORK_FORBIDDEN|ENOENT|Credential/.test(result.stdout+result.stderr),'Dispatch occurred before CLI rejection')
  }
  checks.push(`${script}: default/explicit planning and invalid/unauthorized execution remain offline`)
 }
 report.ok=true
}catch(error){report.error={name:error.name,message:error.message};process.exitCode=1}
finally{await mkdir(directory,{recursive:true});await writeFile(`${directory}/cli-result.json`,JSON.stringify(report,null,2)+'\n');await rm(cwd,{recursive:true})}
console.log(JSON.stringify(report,null,2))
