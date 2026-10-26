/**
 * [INPUT]: Local immutable D1 migrations and current owned D2 SQL, without credentials.
 * [OUTPUT]: Immutable source snapshots/hashes and a reviewable rollback upgrade plan.
 * [POS]: Source-only preparation. It cannot connect to or mutate a hosted project.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { readFile, mkdir, writeFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
const hash=bytes=>createHash('sha256').update(bytes).digest('hex')
const names=['0025_service_lifecycle.sql','0026_account_deletion.sql']
const sources=await Promise.all(names.map(async file=>({file,bytes:await readFile(`supabase/migrations/${file}`)})))
const batch=hash(Buffer.concat(sources.map(x=>Buffer.concat([Buffer.from(x.file+'\n'),x.bytes]))))
const directory=join('output/tests/billing/desktop/d2-lifecycle/staging',batch.slice(0,16))
await mkdir(directory,{recursive:true})
for(const source of sources){const path=join(directory,source.file);try{await access(path);if(hash(await readFile(path))!==hash(source.bytes))throw Error('Immutable staged source changed')}catch(error){if(error.code!=='ENOENT')throw error;await writeFile(path,source.bytes,{flag:'wx',mode:0o600})}}
const d1=[]
for(let i=1;i<=24;i++){
 const {readdir}=await import('node:fs/promises')
 const file=(await readdir('supabase/migrations')).find(name=>name.startsWith(`${String(i).padStart(4,'0')}_`))
 if(!file)throw Error(`Missing applied migration ${i}`)
 d1.push({file,sha256:hash(await readFile(`supabase/migrations/${file}`))})
}
const report={version:1,sourceOnly:true,networkRequests:0,project:'asqyvcnxdltzzfutbbqy',directory,batch,
 sources:sources.map(({file,bytes})=>({file,path:join(directory,file),sha256:hash(bytes),bytes:bytes.length})),
 immutableD1:d1,requiresBeforeExecution:'Explicit Root development lease after the actual D1 credential drain',databaseParsed:false,
 rollbackOrder:['begin; bounded statement/lock timeouts','Capture catalog/function/ACL and hash-only business/source/budget/protection/readiness fingerprints',
  'Insert a manifest-owned populated D1 fixture: Auth/sessions/devices/workspace/control/ops/receipts plus customer/subscription/transactions/inbox/unknown operation/compensation and AI receipt/protection/event',
  'Pause sync admission inside this rollback transaction only; take AI budget lock without changing any budget/policy/fee',
  'Apply reviewed exact staged 0025 then 0026; independently reviewed 0027 follows only its matching hash; do not guess a missing migration',
  'Assert subject PK/FK re-key and original immutable financial/provider/AI/operation identities/counts, including populated deferred RI validation',
  'Run selected failure-first SQL assertions and actual independent-ledger dev readiness setup, clearly separated from final 0028/worker integration',
  'ROLLBACK on success or failure; reconcile unknown Management API response by fresh catalog/state inspection before any resume',
  'Compare D1 catalog/functions/grants, all baseline data counts/fact fingerprints and exact original AI budget/protection/source policies/readiness/history'],
 persistedDeployment:'Not part of this snapshot. Requires final 0025/0026/0027/0028 reviewed hashes, matching source/HTTP/worker evidence, captured original policy and explicit Root lease. Pause admissions, drain accepted writers, one transactional migration batch, source readback, default readiness closed. Never reset/drop an original database or edit 0018–0024.',
 recovery:'Unknown apply/HTTP outcomes are inspected through exact installed migration/function fingerprints and original operation receipts. Resume only matching original IDs. Rollback never attempts to resurrect physically deleted content or lower fences. No automatic permissive/AI-budget reset.',
 exclusions:['No remote query or deploy executed','No provider/model call','No production activation','No full verify/stress','No supplier backup guarantee']}
await writeFile(join(directory,'manifest.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600})
console.log(JSON.stringify({sourceOnly:true,directory,sources:report.sources,databaseParsed:false},null,2))
