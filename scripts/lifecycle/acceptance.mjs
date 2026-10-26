/**
 * [INPUT]: Failure-first lifecycle cases, bundled runtime, loopback dependencies and real persistent SQLite.
 * [OUTPUT]: Repeatable HTTP/worker/independent-ledger evidence, explicitly separate from real PostgreSQL/Auth/Storage.
 * [POS]: D2 local integration acceptance. Never loads credentials or makes non-loopback network calls.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdir, writeFile, copyFile, readFile, readdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { build } from 'esbuild'
import { stripePath } from '../billing/build.mjs'
import { LocalSqliteLedger } from './ledger.mjs'
const directory=resolve('output/tests/billing/desktop/d2-lifecycle'),runDirectory=resolve(directory,`local-${Date.now()}-${randomUUID().slice(0,8)}`)
await mkdir(runDirectory,{recursive:true,mode:0o700})
const files=['lifecycle/handler.ts','lifecycle/ledger.ts','lifecycle/storage.ts','lifecycle/worker.ts','lifecycle/restore.ts','deletion-receipt/handler.ts','billing/service.ts','snapshot-url/handler.ts']
const boundSources=[...files.map(file=>`supabase/functions/${file}`),'supabase/functions/lifecycle/http.ts','supabase/functions/lifecycle/contract.ts','supabase/functions/lifecycle/index.ts',
 'supabase/functions/billing/providers.ts','supabase/functions/billing/config.ts','supabase/functions/billing/http.ts','supabase/functions/billing/presentation.ts','supabase/functions/billing/operation.ts',
 'supabase/functions/snapshot-url/index.ts','scripts/lifecycle/acceptance.mjs','scripts/lifecycle/ledger.mjs','scripts/billing/build.mjs','packages/contracts/src/canonical.ts',
 'supabase/migrations/0025_service_lifecycle.sql','supabase/migrations/0026_account_deletion.sql','supabase/migrations/0027_retained_retrieval.sql','supabase/migrations/0028_lifecycle_cleanup.sql']
const require=createRequire(import.meta.url),esbuildEntry=require.resolve('esbuild'),esbuildRequire=createRequire(esbuildEntry)
const sdkRoot=resolve(dirname(stripePath),'..')
const sdkFiles=(await readdir(sdkRoot,{recursive:true})).filter(file=>file.endsWith('.js')||file.endsWith('.json')).map(file=>resolve(sdkRoot,file))
const dependencies=[process.execPath,esbuildEntry,esbuildRequire.resolve(`@esbuild/${process.platform}-${process.arch}/bin/esbuild`),...sdkFiles]
const hashFiles=async files=>Object.fromEntries(await Promise.all(files.map(async file=>[file,createHash('sha256').update(await readFile(file)).digest('hex')])))
const before={sources:await hashFiles(boundSources),dependencies:await hashFiles(dependencies)}
await writeFile(`${runDirectory}/inputs-before.json`,JSON.stringify(before,null,2)+'\n',{mode:0o600})
const code=(await build({stdin:{contents:files.map(file=>`export * from ${JSON.stringify(resolve('supabase/functions',file))}`).join('\n'),resolveDir:process.cwd(),loader:'ts'},
 bundle:true,write:false,format:'esm',platform:'node',target:'es2022',alias:{stripe:resolve(dirname(stripePath),'../esm/stripe.esm.worker.js')},external:['node:*'],logLevel:'silent'})).outputFiles[0].text
await writeFile(`${runDirectory}/runtime.mjs`,code)
const {createLifecycleHandler,createDeletionReceiptHandler,createSnapshotHandler,httpLedger,eventDigest,projectStorage,projectAuth,createLifecycleWorker,workerScopeGuard,replayDeletionLedger,BillingService}=await import(pathToFileURL(`${runDirectory}/runtime.mjs`).href)
const checks=[],report={ok:false,scope:'Real loopback HTTP, actual bundled lifecycle/billing coordinator and persistent independent SQLite; controlled RPC/Auth/Storage/provider state. No PostgreSQL, hosted Auth/Storage/provider, desktop, scheduler or production acceptance.',externalNetworkCalls:0,checks,
 runtime:{node:process.version,sqlite:null,os:process.platform,arch:process.arch},sourceHashes:before.sources,inputFreeze:{capturedBeforeBundle:true,bundleSha256:createHash('sha256').update(code).digest('hex'),unchanged:false,dependenciesFile:'inputs-before.json'}}
const mark=(name,observed)=>checks.push({name,observed})
const ledgerPath=resolve(runDirectory,'independent-ledger.sqlite'),businessPath=resolve(runDirectory,'business.sqlite'),businessBackup=resolve(runDirectory,'business-before-delete.sqlite')
let ledger=new LocalSqliteLedger(ledgerPath),business=new DatabaseSync(businessPath)
business.exec('CREATE TABLE state(k TEXT PRIMARY KEY,v TEXT NOT NULL)');business.prepare('INSERT INTO state VALUES(?,?)').run('closed','false')
report.runtime.sqlite=business.prepare('SELECT sqlite_version() version').get().version
const getClosed=()=>JSON.parse(business.prepare('SELECT v FROM state WHERE k=?').get('closed').v)
const setClosed=value=>business.prepare('UPDATE state SET v=? WHERE k=?').run(JSON.stringify(value),'closed')
const owner=randomUUID(),session=randomUUID(),subject=randomUUID(),workspace=randomUUID(),generation=randomUUID(),requestId=randomUUID(),lease=randomUUID()
const secret=randomBytes(32).toString('hex'),receiptDigest=createHash('sha256').update(Buffer.from(secret,'hex')).digest('hex'),workerSecret=randomBytes(32).toString('hex'),ledgerToken=randomBytes(32).toString('hex')
const project='asqyvcnxdltzzfutbbqy',projectUrl=`https://${project}.supabase.co`,t='2026-10-23T00:00:00.000000Z'
const eventRecord={version:1,eventId:randomUUID(),environment:'development',projectRef:project,subjectId:subject,ownerTag:'a'.repeat(64),requestId,
 target:{workspaceId:workspace,generation},lifecycleVersion:2,reason:'explicit_cloud',kind:'intent',closedAt:t,retrieveUntil:null,onlineDeleteBy:'2026-10-30T00:00:00.000000Z',onlineDeletedAt:null,
 deletionReceipt:{scope:'cloud',receiptDigest,expectedRevision:1,preparedAt:'2026-10-22T23:59:00.000000Z',confirmedAt:t}}
const event={eventId:eventRecord.eventId,record:eventRecord,digest:await eventDigest(eventRecord)}
const root=`workspaces/${workspace}`,path=`${root}/${generation}/one.bin`,objects=new Map([[path,{id:randomUUID(),bytes:Buffer.from('synthetic')}]]),foreign=`workspaces/${randomUUID()}/foreign.bin`
objects.set(foreign,{id:randomUUID(),bytes:Buffer.from('foreign')})
const calls=[],state={auth:true,dropAuthDelete:false,dropAppend:false,wrongGet:false,missingPage:false,exported:false,inventory:false,deleted:false,absent:false,unknown:false,scan:false,content:false,
 offers:[],accounts:[],renewalFails:true,renewal:[],accountDone:[],rpc:[],statusExpiry:Date.now()+720*3600_000,finalSeq:null,finishCalls:0,restores:new Map(),tickets:[],snapshotCurrent:true,drainProved:false}
let apiHandler,receiptHandler,snapshotHandler,base,server
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}})
const serve=async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);const bytes=Buffer.concat(chunks)
  const url=new URL(req.url,base??'http://127.0.0.1'),body=bytes.length&&req.headers['content-type']?.startsWith('application/json')?JSON.parse(bytes.toString()):null
  if(url.pathname.startsWith('/ledger/')){
   assert.equal(req.headers.authorization,`Bearer ${ledgerToken}`)
   const action=url.pathname.split('/').at(-1)
   if(action==='append'){const value=await ledger.append(body.event);if(state.dropAppend){state.dropAppend=false;res.destroy();return}res.writeHead(200);res.end(JSON.stringify(value));return}
   if(action==='get'){let entry=await ledger.get(body.eventId);if(state.wrongGet&&entry)entry={...entry,eventId:randomUUID()};res.writeHead(200);res.end(JSON.stringify({storeId:ledger.storeId,entry}));return}
   if(action==='head'){res.writeHead(200);res.end(JSON.stringify(await ledger.head()));return}
   if(action==='read'){const value=await ledger.read(body.after,body.through,body.limit);if(state.missingPage){value.entries=[];value.done=false;value.nextAfter=body.after??'0'}res.writeHead(200);res.end(JSON.stringify(value));return}
  }
  if(url.pathname.startsWith('/upstream/')){
   const route=url.pathname.slice('/upstream'.length);calls.push({method:req.method,path:route})
   let value,status=200
   if(route==='/auth/v1/user'){value={id:owner};if(!state.auth)status=401}
   else if(route==='/rest/v1/rpc/snapshot_transfer_access'){status=state.snapshotCurrent?200:403;value=state.snapshotCurrent?[{object_path:path,sha256:createHash('sha256').update('synthetic').digest('hex'),size:9}]:{message:'service_revoked',code:'PT403'}}
   else if(route==='/rest/v1/rpc/lifecycle_transfer_begin'){
    assert.equal(body.p_producer,'c'.repeat(64));const ticket={ticketId:randomUUID(),method:body.p_method,state:'prepared'};state.tickets.push(ticket);value=ticket
    if(state.dropBegin){state.dropBegin=false;res.destroy();return}
   }else if(route==='/rest/v1/rpc/lifecycle_transfer_dispatch'){
    const ticket=state.tickets.find(item=>item.ticketId===body.p_ticket);const current=state.snapshotCurrent&&ticket?.state==='prepared';if(current)ticket.state='dispatched';value={ok:current,current}
   }else if(route==='/rest/v1/rpc/lifecycle_transfer_finish'){
    const ticket=state.tickets.find(item=>item.ticketId===body.p_ticket);assert(ticket);ticket.state=body.p_state;value={ok:true,current:state.snapshotCurrent}
   }else if(route===`/storage/v1/object/snapshots/${path}`&&req.method==='POST'){
    objects.set(path,{id:randomUUID(),bytes});value={};if(state.dropUpload){state.dropUpload=false;res.destroy();return}
   }
   else if(route===`/auth/v1/admin/users/${owner}`){
    if(req.method==='DELETE'){assert.equal(body.should_soft_delete,false);state.auth=false;if(state.dropAuthDelete){state.dropAuthDelete=false;res.destroy();return}}
    status=state.auth?200:404;value=state.auth?{id:owner}:{error:'not_found'}
   }else if(route==='/storage/v1/object/list/snapshots'){
    assert(body.prefix===root||body.prefix.startsWith(root+'/'));assert(body.limit<=50)
    const rows=new Map()
    for(const [key,item]of objects){if(!key.startsWith(body.prefix+'/'))continue;const relative=key.slice(body.prefix.length+1),name=relative.split('/')[0];rows.set(name,relative.includes('/')?{name,id:null,metadata:null}:{name,id:item.id,metadata:{size:item.bytes.length}})}
    value=[...rows.values()].sort((a,b)=>a.name.localeCompare(b.name)).slice(body.offset,body.offset+body.limit)
   }else if(route==='/storage/v1/object/snapshots'&&req.method==='DELETE'){
    assert.equal(body.prefixes.length,1);const key=body.prefixes[0];assert(key.startsWith(root+'/'));if(!state.unknown)objects.delete(key);value=[]
   }else if(route.startsWith('/storage/v1/object/info/snapshots/')){const key=route.slice('/storage/v1/object/info/snapshots/'.length).split('/').map(decodeURIComponent).join('/');status=objects.has(key)?200:404;value=objects.has(key)?{id:objects.get(key).id}:{code:'NoSuchKey'}}
   else throw Error('Unexpected controlled upstream route')
   res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));return
  }
  const request=new Request(url,{method:req.method,headers:req.headers,...(bytes.length?{body:bytes}:{})})
  const response=await(url.pathname==='/receipt'?receiptHandler:url.pathname==='/snapshot'?snapshotHandler:apiHandler)(request)
  res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()))
 }catch{res.writeHead(500);res.end('{}')}
}
server=createServer(serve);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base=`http://127.0.0.1:${server.address().port}`
const controlledFetch=async(url,init)=>{assert(String(url).startsWith(projectUrl+'/'),'Nonfixture network call rejected');return fetch(base+'/upstream'+String(url).slice(projectUrl.length),init)}
const config={url:projectUrl,serviceKey:'synthetic-service-key',environment:'development',workerSecret,fetch:controlledFetch}
const remoteLedger=httpLedger({url:base+'/ledger',token:ledgerToken,storeId:ledger.storeId,environment:'development'})
const allowedSubjects=new Set([subject])
const rpc=async(name,args)=>{
 state.rpc.push(name)
 if(name==='lifecycle_scope_check')return{ok:(!args.p_subject||allowedSubjects.has(args.p_subject))&&(!args.p_workspace||args.p_workspace===workspace)&&(!args.p_generation||args.p_generation===generation)&&(!args.p_owner||args.p_owner===owner),scoped:true}
 if(name==='lifecycle_take_work'){const value={exports:state.offers.splice(0,2),generations:state.deleted?[]:[{workspaceId:workspace,generation,subjectId:subject,revision:2,lease}],accounts:state.accounts.splice(0,2)};return value}
 if(name==='lifecycle_ack_export'){assert.equal(args.p_digest,event.digest);assert.equal(args.p_store,ledger.storeId);state.exported=true;setClosed(true);return{ok:true}}
 if(name==='lifecycle_retry_work')return null
 if(name==='lifecycle_prepare_job')return{ok:true,phase:state.exported?'inventory':'export_pending',revision:2,cursor:state.cursor??null,inventoryComplete:state.inventory}
 if(name==='lifecycle_inventory_page'){state.cursor=args.p_cursor;state.inventory=args.p_done;return{ok:true}}
 if(name==='lifecycle_reconcile_transfers'){
  for(const ticket of state.tickets.filter(item=>item.method==='upload'&&item.state==='prepared'))ticket.state='withdrawn'
  const unresolved=state.tickets.filter(item=>item.method==='upload'&&['dispatched','unknown'].includes(item.state))
  if(unresolved.length&&!state.drainProved)return{ok:true,phase:'awaiting_producer_evidence'}
  if(unresolved.length){for(const ticket of unresolved)ticket.state='drained';state.absent=false;state.scan=false}
  return{ok:true,phase:'ready'}
 }
 if(name==='lifecycle_delete_batch'){assert(state.exported&&state.inventory);state.content=true;return{ok:true,paths:state.absent?[]:[{bucket:'snapshots',path}],transfersPending:state.unknown||state.tickets.some(item=>item.method==='upload'&&['dispatched','unknown'].includes(item.state))}}
 if(name==='lifecycle_object_result'){state.absent=args.p_absent;return{ok:true}}
 if(name==='lifecycle_storage_scan_status')return{ok:true,verified:state.scan,cursor:state.scanCursor??null}
 if(name==='lifecycle_storage_scan_page'){assert.deepEqual(args.p_paths,[]);state.scanCursor=args.p_cursor;state.scan=args.p_done;return{ok:true}}
 if(name==='lifecycle_purge_content'){assert(state.exported&&state.inventory&&state.absent&&state.scan&&!state.unknown);state.deleted=true;return{ok:true,phase:'deleted'}}
 if(name==='lifecycle_account_ready')return{ready:state.deleted,ownerId:owner,requestId}
 if(name==='lifecycle_account_deleted'){assert(!state.auth);return{ok:true}}
 if(name==='lifecycle_account_work_done'){state.accountDone.push(args.p_subject);return{ok:true}}
 if(name==='lifecycle_status')return{version:1,query:args.p_request.query,accountRevision:1,entries:[]}
 if(name==='lifecycle_finish_initialization'){state.finishCalls++;return{version:1,completed:true}}
 if(name==='lifecycle_prepare_delete')return{version:1,requestId:args.p_request.requestId,accepted:false}
 if(name==='lifecycle_receipt_status'){assert.equal(args.p_digest,receiptDigest);return Date.now()<state.statusExpiry?{version:1,requestId,accepted:true,content:'pending',auth:'pending',renewal:'pending'}:{version:1,error:'deletion_receipt_unavailable'}}
 if(name==='lifecycle_restore_begin'){const runId=randomUUID(),run={ok:true,runId,environment:'development',keyDigest:args.p_key_digest,keyMatches:true,storeId:args.p_store,after:'0',through:args.p_through,phase:'capture',admissionBlocked:true};state.restores.set(runId,run);return{...run}}
 if(name==='lifecycle_restore_status')return{...state.restores.get(args.p_run)}
 if(name==='lifecycle_restore_capture'){const run=state.restores.get(args.p_run);assert.equal(run.after,args.p_after);for(const entry of args.p_entries){assert.equal(entry.digest,await eventDigest(entry.record));run.after=entry.cursor}if(run.after===run.through)run.phase='project';if(state.dropCapture){state.dropCapture=false;throw Error('Unknown capture ACK')}return{ok:true}}
 if(name==='lifecycle_restore_project'){setClosed(true);const run=state.restores.get(args.p_run);run.phase='replayed';return{ok:true}}
 throw Error(`Unexpected controlled RPC ${name}`)
}
const settle=async(id)=>{state.renewal.push(id);if(state.renewalFails)throw Error('Controlled provider failure')}
const worker=createLifecycleWorker({environment:'development',rpc,ledger:remoteLedger,storage:projectStorage(config),auth:projectAuth(config),settle,guard:workerScopeGuard(rpc,'development')})
apiHandler=createLifecycleHandler(config,{rpc:()=>rpc,worker});receiptHandler=createDeletionReceiptHandler(config,rpc)
snapshotHandler=createSnapshotHandler({...config,producerSha256:'c'.repeat(64)})
const jwt=()=>Buffer.from('{}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:owner,session_id:session,iss:projectUrl+'/auth/v1',role:'authenticated',exp:Date.now()/1000+600})).toString('base64url')+'.synthetic'
const call=async(route,body,headers={})=>{const response=await fetch(base+route,{method:'POST',headers:{authorization:'Bearer '+jwt(),'content-type':'application/json',...headers},body:JSON.stringify(body)});return{status:response.status,body:await response.json(),headers:response.headers}}
const tick=()=>call('/lifecycle/worker',{}, {authorization:'Bearer '+workerSecret})
try{
 await copyFile(businessPath,businessBackup)
 let value=await call('/lifecycle/status',{version:1,query:{kind:'discover',after:null}});assert.equal(value.status,200);assert.equal(value.headers.get('cache-control'),'no-store')
 assert.equal((await call('/lifecycle/status',{version:1,query:{kind:'discover',after:null},owner})).status,400)
 assert.equal((await call('/lifecycle/status',{version:1,query:{kind:'discover',after:null}},{origin:'https://invalid.invalid'})).status,400)
 const finish={version:1,requestId,target:{workspaceId:workspace,generation},creatorDeviceId:randomUUID(),finalOpId:randomUUID(),finalPayloadHash:'f'.repeat(64),finalSeq:1}
 assert.equal((await call('/lifecycle/finish-initialization',finish,{'x-goalloom-service-version':'1'})).status,409);assert.equal(state.finishCalls,0)
 assert.equal((await call('/lifecycle/finish-initialization',finish,{'x-goalloom-service-version':'2'})).status,200)
 assert.equal((await tick()).status,200);assert(!state.exported);assert(!state.content)
 mark('HTTP finite owner-free DTO and independent header-2 finish; missing durable export blocks destructive dispatch',{finishDispatches:state.finishCalls,destructiveBeforeExport:state.content})
 state.offers.push({...event,lease});state.dropAppend=true
 value=await tick();assert.equal(value.status,200);assert.equal(value.body.exported,1);assert(getClosed());assert.equal((await remoteLedger.get(event.eventId)).digest,event.digest)
 const head=await remoteLedger.head();assert.equal(head.cursor,'1')
 await remoteLedger.append(event);assert.equal((await remoteLedger.head()).cursor,'1')
 const conflicting={...event,record:{...event.record,lifecycleVersion:3}};conflicting.digest=await eventDigest(conflicting.record);await assert.rejects(()=>remoteLedger.append(conflicting))
 state.wrongGet=true;await assert.rejects(()=>remoteLedger.get(event.eventId));state.wrongGet=false
 state.missingPage=true;await assert.rejects(()=>remoteLedger.read('0','1',100));state.missingPage=false
 mark('Independent append lost ACK resolves by original event; identical replay is idempotent; conflict, wrong identity and missing prefix fail closed',{cursor:head.cursor,originalDigestUnchanged:true})
 for(let i=0;i<5&&!state.inventory;i++)await tick()
 assert(state.inventory)
 state.unknown=true;await tick();assert(!state.absent);assert(!state.deleted);assert(objects.has(path))
 state.unknown=false;await tick();assert(state.absent);assert(!objects.has(path));assert(objects.has(foreign))
 state.unknown=true;await tick();assert(!state.deleted);state.unknown=false
 for(let i=0;i<5&&!state.deleted;i++)await tick()
 assert(state.deleted);assert(objects.has(foreign));assert(calls.filter(row=>row.method==='DELETE'&&row.path==='/storage/v1/object/snapshots').length>=2)
 mark('Scoped Storage partial/unknown removal and unresolved transfer block completion; actual absence and final recursive scan precede purge',{closedWorkspaceDeleted:state.deleted,foreignObjectPreserved:objects.has(foreign)})
 const query=new URLSearchParams({v:'1',deviceId:randomUUID(),workspaceId:workspace,generation,seq:'1',path})
 const snapshotCall=(method='GET')=>fetch(`${base}/snapshot?${query}`,{method,headers:{authorization:'Bearer '+jwt(),'x-goalloom-service-version':'2',...(method==='PUT'?{'content-type':'application/octet-stream'}:{})},...(method==='PUT'?{body:Buffer.from('synthetic')}:{})})
 state.dropBegin=true;assert.equal((await snapshotCall()).status,503);assert.equal(state.tickets.at(-1).method,'download');assert.equal(state.tickets.at(-1).state,'prepared')
 state.deleted=false;state.scan=false;await tick();await tick();assert(state.deleted)
 mark('Actual snapshot handler lost begin ACK leaves a read-only ticket; it cannot block content progress',{downloadTicket:state.tickets.at(-1).state,contentDeleted:state.deleted})
 state.dropBegin=true;assert.equal((await snapshotCall('PUT')).status,503);assert.equal(state.tickets.at(-1).state,'prepared')
 state.deleted=false;state.scan=false;await tick();assert(!state.deleted);assert.equal(state.tickets.at(-1).state,'withdrawn')
 state.dropUpload=true;assert.equal((await snapshotCall('PUT')).status,503);assert.equal(state.tickets.at(-1).state,'unknown');assert(objects.has(path))
 await tick();assert(!state.deleted);state.drainProved=true
 for(let i=0;i<5&&!state.deleted;i++)await tick()
 assert(state.deleted);assert(!objects.has(path));assert(state.tickets.filter(item=>item.method==='upload').every(item=>['withdrawn','drained'].includes(item.state)));assert(objects.has(foreign))
 mark('Actual snapshot lost upload-begin/process and Storage-write ACK preserve pending tickets; explicit bounded controlled-producer proof drains then verifies deletion',{uploadStates:state.tickets.filter(item=>item.method==='upload').map(item=>item.state),lateObjectAbsent:!objects.has(path),foreignPreserved:objects.has(foreign)})
 state.accounts.push({subjectId:subject,lease});state.dropAuthDelete=true
 value=await tick();assert.equal(value.body.authDeleted,1);assert.equal(value.body.renewalPending,1);assert(!state.auth);assert.deepEqual(state.accountDone,[subject])
 const later=[randomUUID(),randomUUID(),randomUUID()];for(const id of later)allowedSubjects.add(id);state.accounts.push(...later.map(subjectId=>({subjectId,lease})))
 await tick();await tick();assert(later.every(id=>state.accountDone.includes(id)))
 mark('Auth DELETE lost ACK is verified through absence; renewal failure does not block Auth; account leases release across later queued subjects',{authRemoved:!state.auth,renewalAttempts:state.renewal.length,releasedAccounts:state.accountDone.length})
 const unauthorized=randomUUID(),beforeForeign={external:calls.length,renewal:state.renewal.length,done:state.accountDone.length}
 state.accounts.push({subjectId:unauthorized,lease});await tick()
 assert.equal(calls.length,beforeForeign.external);assert.equal(state.renewal.length,beforeForeign.renewal);assert.equal(state.accountDone.length,beforeForeign.done)
 await assert.rejects(()=>createLifecycleWorker({environment:'development',rpc,ledger:remoteLedger,storage:projectStorage(config),auth:projectAuth(config),settle})(),/worker_scope_required/)
 mark('Development worker requires manifest guard and refuses a foreign claimed subject before Auth, Storage, settlement or lease completion',{foreignExternalCalls:0,foreignSettlements:0,foreignLeaseCompletion:0})
 value=await call('/receipt',{version:1,environment:'development',requestId,secret},{authorization:''});assert.equal(value.status,200);assert.equal(value.body.requestId,requestId)
 assert.equal((await call('/receipt',{version:1,environment:'production',requestId,secret},{authorization:''})).status,404)
 state.statusExpiry=Date.now()-1;assert.equal((await call('/receipt',{version:1,environment:'development',requestId,secret},{authorization:''})).status,404)
 mark('Isolated receipt route survives removed Auth, hashes decoded secret and returns finite unavailable after original expiry',{authRequired:false,secretReturned:false})
 ledger.close();ledger=new LocalSqliteLedger(ledgerPath);assert.equal((await ledger.head()).cursor,'1')
 const restarted=spawnSync(process.execPath,['--input-type=module','-e',`import {LocalSqliteLedger} from ${JSON.stringify(pathToFileURL(resolve('scripts/lifecycle/ledger.mjs')).href)};const ledger=new LocalSqliteLedger(process.argv[1]);process.stdout.write(JSON.stringify(await ledger.head()));ledger.close()` ,ledgerPath],{encoding:'utf8'})
 assert.equal(restarted.status,0);assert.equal(JSON.parse(restarted.stdout).storeId,head.storeId)
 business.close();await copyFile(businessBackup,businessPath);business=new DatabaseSync(businessPath);assert(!getClosed());assert.equal((await remoteLedger.head()).cursor,'1')
 state.dropCapture=true
 const replay=await replayDeletionLedger({environment:'development',rpc,ledger:remoteLedger,keyDigest:'b'.repeat(64),runId:null,
  quarantine:{assertClosed:async()=>({closed:true,projectRef:project,gateId:'controlled-external-quarantine'})}})
 assert.equal(replay.phase,'replayed');assert.equal(replay.admissionBlocked,true);assert(getClosed())
 const resume={environment:'development',rpc,ledger:remoteLedger,keyDigest:'b'.repeat(64),runId:replay.runId,quarantine:{assertClosed:async()=>({closed:true,projectRef:project,gateId:'controlled-external-quarantine'})}}
 assert.equal((await replayDeletionLedger(resume)).phase,'replayed')
 await assert.rejects(()=>replayDeletionLedger({...resume,keyDigest:'d'.repeat(64)}))
 state.restores.get(replay.runId).admissionBlocked=false;await assert.rejects(()=>replayDeletionLedger(resume));state.restores.get(replay.runId).admissionBlocked=true
 await assert.rejects(()=>replayDeletionLedger({environment:'development',rpc,ledger:remoteLedger,keyDigest:'b'.repeat(64),runId:null,quarantine:{assertClosed:async()=>({closed:false,projectRef:project,gateId:'closed'})}}))
 mark('Real independent SQLite survives process restart and separate business-file restore; bounded replay resolves capture ACK loss and never opens quarantine',{independentCursor:(await ledger.head()).cursor,replayPhase:replay.phase,admissionBlocked:replay.admissionBlocked})
 let providerTerminal=false,lateScenario=false,lateFound=false,lateTerminal=false,lateCheckoutClosed=false,renewalStopped=0
 const lateRequest=randomUUID(),commits=[]
 const providerCalls=[],operations=new Map(),provider={verifyConfiguration:async()=>{},listSubscriptions:async()=>lateScenario?(lateFound?[{id:'sub_Late',status:lateTerminal?'canceled':'active',schedule:null}]:[]):[{id:'sub_Synthetic',status:providerTerminal?'canceled':'active',schedule:null}],
  stopForDeletion:async(subscription,key)=>{if(subscription.id==='sub_Late'){if(!lateTerminal)providerCalls.push({action:'stop',id:subscription.id,key});lateTerminal=true}else{if(!providerTerminal)providerCalls.push({action:'stop',id:subscription.id,key});providerTerminal=true}},stripe:{checkout:{sessions:{list:async()=>{if(lateScenario){lateFound=true;return{has_more:false,data:[{id:'cs_Late',customer:'cus_Synthetic',status:'complete',metadata:{request_id:lateRequest}}]}}return{has_more:false,data:[]}}}}},
  snapshot:async(...args)=>{assert.equal(args.at(-1),true);return{subscriptions:lateScenario?[{subscription_id:'sub_Late',status:lateTerminal?'canceled':'active',schedule_id:null}]:[],transactions:[],grace:[]}}}
 const billingRpc=async(name,args)=>{
  if(name==='billing_source')return{account_id:'acct_Synthetic',rc_project:'projd720c733',rc_app:'appSynthetic',monthly_price:'price_Month',annual_price:'price_Year'}
  if(name==='lifecycle_identity')return{subjectId:subject,mode:'settlement',providerUserId:owner,revision:2}
  if(name==='billing_lock')return{lease,customer:'cus_Synthetic',operations:lateScenario&&!lateCheckoutClosed?[{request_id:lateRequest,action:'checkout',cycle:'monthly',provider_id:'cs_Late',status:'pending',created_at:new Date().toISOString()}]:[],mode:'settlement',providerUserId:owner}
  if(name==='billing_unlock')return null
  if(name==='lifecycle_settlement_operation'){if(!operations.has(args.p_provider))operations.set(args.p_provider,{request_id:randomUUID(),created_at:new Date().toISOString(),status:'pending'});return{...operations.get(args.p_provider)}}
  if(name==='billing_operation'){assert.equal(args.p_lease,lease);if(args.p_provider==='cs_Late')lateCheckoutClosed=true;else operations.get(args.p_provider).status='complete';return{}}
  if(name==='billing_prior_facts')return[]
  if(name==='billing_commit'){assert.deepEqual(args.p_grace,[]);commits.push(args.p_subscriptions);return{version:1,status:'revoked',eligible:false}}
  if(name==='lifecycle_renewal_result'){assert.equal(args.p_lease,lease);assert.equal(args.p_state,'stopped');renewalStopped++;return null}
  if(name==='billing_status')return{version:1,status:'revoked',eligible:false}
  throw Error('Unexpected billing fixture RPC')
 }
 const billing=new BillingService({environment:'development',account:'acct_Synthetic',rcProject:'projd720c733',rcApp:'appSynthetic',prices:{monthly:'price_Month',annual:'price_Year'}},billingRpc,provider)
 assert.equal((await billing.reconcile(subject)).eligible,false);await billing.reconcile(subject);assert.equal(providerCalls.length,1);assert.equal(operations.size,1)
 mark('Deleted subject reuses original BillingService, lease and stable deletion operation; retries do not create a new renewal mutation or qualification',{providerMutations:providerCalls.length,durableOperations:operations.size})
 lateScenario=true;const stoppedBefore=renewalStopped
 await assert.rejects(()=>billing.reconcile(subject),/billing_pending/);assert.equal(renewalStopped,stoppedBefore);assert.equal(commits.at(-1)[0].status,'active');assert(!lateTerminal)
 assert.equal((await billing.reconcile(subject)).eligible,false);assert(lateTerminal&&lateCheckoutClosed);assert.equal(renewalStopped,stoppedBefore+1);assert.equal(commits.at(-1)[0].status,'canceled')
 mark('Checkout completes after the first subscription scan: active financial facts persist without stopped status; original coordinator retries and cancels the late subscription',{prematureStopped:false,lateSubscriptionCanceled:lateTerminal,originalCheckoutClosed:lateCheckoutClosed})
 report.ok=true
}finally{
 business.close();ledger.close();await new Promise(resolve=>server.close(resolve))
 const after={sources:await hashFiles(boundSources),dependencies:await hashFiles(dependencies)}
 report.inputFreeze.unchanged=JSON.stringify(before)===JSON.stringify(after)
 if(!report.inputFreeze.unchanged)report.ok=false
 await writeFile(`${runDirectory}/inputs-after.json`,JSON.stringify(after,null,2)+'\n',{mode:0o600})
 await writeFile(`${runDirectory}/report.json`,JSON.stringify(report,null,2)+'\n',{mode:0o600});await writeFile(`${directory}/latest-local.json`,JSON.stringify({directory:runDirectory,ok:report.ok,checks:checks.length},null,2)+'\n')
 console.log(JSON.stringify({ok:report.ok,checks:checks.length,report:`${runDirectory}/report.json`,scope:report.scope},null,2))
 if(!report.inputFreeze.unchanged)throw Error('Source or runtime dependencies changed during acceptance')
}
