/**
 * [INPUT]: Exact original legacy fixture JWT; initial setup requires an exclusive fixture-clock window.
 * [OUTPUT]: Separate cached-service-expiry and original JWT Auth401 evidence; read-only resume opens no socket.
 * [POS]: Compensating transport evidence; it cannot establish natural expiry of the actively closed old socket.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {readFile,writeFile} from 'node:fs/promises'
import {startCompensatingJwtConnection,observeOriginalJwtDrain} from './d1-transport-acceptance.mjs'
const file='output/tests/billing/desktop/d1-backend/jwt-watch.json'
const readOnly=process.argv[2]==='--read-only'
const prior=readOnly?JSON.parse(await readFile(file,'utf8')):{}
const report={...prior,ok:false,pending:true,pid:process.pid,scope:'Original-token Auth observation; socket natural expiry is unobserved. Initial cached service-expiry proof remains separate.',realProviderCalls:0,modelCalls:0,clockWritesComplete:readOnly&&prior.clockWritesComplete===true,naturalChannelExpiryObserved:false}
delete report.error
const save=()=>writeFile(file,JSON.stringify(report,null,2)+'\n')
let watcher,stopping=false
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true})
try{
 if(readOnly){if(!report.clockWritesComplete||!report.initial?.originalJwtPinned)throw Error('Existing cached proof required');report.previousObservation=prior.observation;report.observationMode='read-only original JWT Auth; no new socket or fixture write'}
 else{await save();watcher=await startCompensatingJwtConnection();report.initial=watcher.initial;report.clockWritesComplete=true}
 await save()
 console.log(JSON.stringify({ready:true,pid:process.pid,clockWritesComplete:true,readOnly,expiresAt:report.initial.expiresAt,evidence:file}))
 while(!stopping){
  const notBefore=new Date(Date.parse(report.initial.expiresAt)+5000).toISOString()
  report.observation=readOnly&&Date.now()<Date.parse(notBefore)?{status:'pending',notBefore,mode:'Local scheduling only; authoritative clock/Auth check runs after this boundary'}:
   await(readOnly?observeOriginalJwtDrain():watcher.sample())
  report.pending=report.observation.status==='pending';await save()
  if(!report.pending){report.ok=report.observation.status==='verified'&&report.initial.cachedAcrossServiceExpiry;break}
  await new Promise(resolve=>setTimeout(resolve,5000))
 }
 if(stopping){report.pending=false;report.error='watch_interrupted';process.exitCode=1}
 else if(!report.ok){report.error='compensating_jwt_observation_incomplete';process.exitCode=1}
}catch(error){report.pending=false;report.error={type:error.name,code:'jwt_watch_incomplete'};process.exitCode=1}
finally{await watcher?.close();await save();console.log(JSON.stringify({ok:report.ok,pending:report.pending,evidence:file}))}
