/**
 * [INPUT]: Guarded development access, exact synthetic identity and private 0600 token manifest.
 * [OUTPUT]: Real Auth/RPC/Storage/Realtime evidence, with explicit pending legacy-token/socket drains.
 * [POS]: D1 transport acceptance only; no provider, model, production or personal workspace mutation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir,readFile,writeFile,rename,stat} from 'node:fs/promises'
import {randomUUID,randomBytes} from 'node:crypto'
import {createRequire} from 'node:module'
import {resolve} from 'node:path'
import {pathToFileURL} from 'node:url'
import {client,developmentUrl,developmentRef} from '../hosted-ai/client.mjs'
import {cleanupExactFixtures} from './cleanup-fixtures.mjs'
import {bytes,hash,opaqueOperation,tokenExpiry,transportProof} from './d1-transport-fixtures.mjs'

const directory='output/tests/billing/desktop/d1-backend'
const privateFile=`${directory}/.transport-private.json`,reportFile=`${directory}/transport-acceptance.json`,legacyFile=`${directory}/legacy-connection.json`
const require=createRequire(resolve('packages/sync/package.json'))
const {createClient}=require('@supabase/supabase-js')
const q=value=>`'${String(value).replaceAll("'","''")}'`
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))
const boundedFetch=(url,init={})=>fetch(url,{...init,signal:init.signal?AbortSignal.any([init.signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000),redirect:'error'})
async function saveLedger(value){await mkdir(directory,{recursive:true});await writeFile(`${privateFile}.tmp`,JSON.stringify(value)+'\n',{mode:0o600});await rename(`${privateFile}.tmp`,privateFile)}
async function loadLedger(){assert.equal((await stat(privateFile)).mode&0o077,0,'Private transport manifest must be owner-only');const ledger=JSON.parse(await readFile(privateFile,'utf8'));assert.equal(ledger.project,developmentRef);assert.match(ledger.user,/^[0-9a-f-]{36}$/);assert.equal(ledger.email,`billing-${ledger.user}@goalloom.test`);assert(ledger.objects.every(path=>path.startsWith(`workspaces/${ledger.workspace}/`)&&!path.includes('..')));return ledger}
async function previousReport(){try{return JSON.parse(await readFile(reportFile,'utf8'))}catch(error){if(error.code==='ENOENT')return {};throw error}}
const safeMessage=error=>String(error?.message??error?.reason??error??'').replace(/https?:\/\/[^\s"']+/gi,'[url]').replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,'[jwt]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').slice(0,240)
async function saveReport(value){await mkdir(directory,{recursive:true});await writeFile(reportFile,JSON.stringify(value,null,2)+'\n')}
async function context(){
 const db=await client(),keys=await db.request('/api-keys?reveal=true')
 const serviceKey=keys.find(x=>x.name==='service_role')?.api_key,anon=keys.find(x=>x.name==='anon')?.api_key
 assert(serviceKey&&anon,'Development API keys unavailable');db.hide(serviceKey);db.hide(anon)
 return {db,anon,serviceKey}
}
async function request(ctx,path,{method='GET',body,token=ctx.serviceKey,version,raw=false,headers={}}={}){
 const response=await boundedFetch(`${developmentUrl}${path}`,{method,headers:{apikey:token===ctx.serviceKey?ctx.serviceKey:ctx.anon,authorization:`Bearer ${token}`,
  ...(raw?{}:{'content-type':'application/json'}),...(version?{'x-goalloom-service-version':version}:{}),...headers},body:body===undefined?undefined:raw?body:JSON.stringify(body)})
 const data=Buffer.from(await response.arrayBuffer());assert(data.length<=3*1024*1024,'Response bound exceeded')
 let value=null;try{value=data.length?JSON.parse(data.toString('utf8')):null}catch{/* Legacy signer errors may be plain text. */}
 return {status:response.status,headers:response.headers,body:value,bytes:data}
}
const rpc=(ctx,token,name,args,version='1')=>request(ctx,`/rest/v1/rpc/${name}`,{method:'POST',token,version,body:args})
function good(result,label){assert(result.status>=200&&result.status<300,label);return result.body}
async function verifyIdentity(ctx,l){const found=await request(ctx,`/auth/v1/admin/users/${l.user}`);assert.equal(found.status,200,'Fixture identity unavailable');assert.equal(found.body.id,l.user);assert.equal(found.body.email,l.email,'Refuse non-fixture identity')}
async function refresh(ctx,l){
 for(const session of l.sessions){
  if(Date.parse(tokenExpiry(session.access_token))>Date.now()+90000)continue
  const next=good(await request(ctx,'/auth/v1/token?grant_type=refresh_token',{method:'POST',token:ctx.anon,body:{refresh_token:session.refresh_token}}),'Fixture session refresh failed')
  assert.equal(next.user.id,l.user);Object.assign(session,{access_token:next.access_token,refresh_token:next.refresh_token});ctx.db.hide(next.access_token);ctx.db.hide(next.refresh_token)
 }
 await saveLedger(l)
}
async function serverNow(ctx){return (await ctx.db.query('select clock_timestamp() as now'))[0].now}
async function setClock(ctx,l,time){await verifyIdentity(ctx,l);await ctx.db.query(`update public.billing_accounts set test_now=${q(time)} where environment='development' and user_id=${q(l.user)};`,false)}
const args=l=>({p_workspace:l.workspace,p_device:l.device,p_generation:l.generation})
async function push(ctx,l,key,token=l.sessions[0].access_token){
 if(!l[key]){l[key]=opaqueOperation();await saveLedger(l)}
 const result=await rpc(ctx,token,'push_ops',{...args(l),p_ops:[l[key]]})
 if(result.status===200){const receipt=result.body?.[0];assert(receipt&&receipt.op_id===l[key].op_id&&Number.isSafeInteger(Number(receipt.seq)),'Original push receipt missing');l.receipts??={};l.receipts[key]={op_id:receipt.op_id,payload_hash:l[key].payload_hash,seq:Number(receipt.seq)};await saveLedger(l)}
 return result
}
function signedExpiry(url,ttl,mintedAt){const parsed=new URL(url);assert.equal(parsed.origin,developmentUrl);assert(parsed.pathname.startsWith('/storage/v1/object/'));const token=parsed.searchParams.get('token');return token?tokenExpiry(token):new Date(Date.parse(mintedAt)+ttl*1000).toISOString()}

export async function prepareLegacy(){
 const ctx=await context()
 assert(!(await ctx.db.query("select to_regclass('service_private.policy') is not null as installed"))[0].installed,'Prepare legacy credentials before D1 migration')
 try{const old=await loadLedger();if(old.stage==='prepared'&&!old.cleaned){await verifyIdentity(ctx,old);const report=await previousReport();assert(report.prepared,'Prepared fixture evidence unavailable');return report}assert(old.cleaned,'An unfinished fixture already exists; use --cleanup')}catch(error){if(error.code!=='ENOENT')throw error}
 const user=randomUUID(),workspace=randomUUID(),generation=randomUUID(),body=bytes()
 const l={project:developmentRef,user,email:`billing-${user}@goalloom.test`,password:`${randomBytes(24).toString('base64url')}aA!`,workspace,generation,objects:[`workspaces/${workspace}/1.bin`,`workspaces/${workspace}/${generation}/2.bin`],sessions:[],stage:'planned',createdAt:await serverNow(ctx),cleaned:false}
 await saveLedger(l)
 const report={ok:false,mode:'--prepare-legacy',project:developmentRef,fixture:{user,workspace},checks:[],scope:'Real development Auth, ordinary legacy RPC and private Storage fixture; no payment/model calls',platform:{node:process.version,os:process.platform,arch:process.arch}}
 try{
  report.stage='auth-create';const made=good(await request(ctx,'/auth/v1/admin/users',{method:'POST',body:{id:user,email:l.email,password:l.password,email_confirm:true}}),'Synthetic Auth creation failed');assert.equal(made.id,user)
  for(let n=0;n<2;n++){const session=good(await request(ctx,'/auth/v1/token?grant_type=password',{method:'POST',token:ctx.anon,body:{email:l.email,password:l.password}}),'Synthetic Auth sign-in failed');assert.equal(session.user.id,user);ctx.db.hide(session.access_token);ctx.db.hide(session.refresh_token);l.sessions.push({access_token:session.access_token,refresh_token:session.refresh_token});await saveLedger(l)}
  assert.notEqual(l.sessions[0].access_token,l.sessions[1].access_token)
  report.stage='trial';l.trial=good(await request(ctx,'/functions/v1/billing',{method:'POST',token:l.sessions[0].access_token,body:{action:'claim_trial',requestId:randomUUID()}}),'Real account trial unavailable');assert.equal(l.trial.status,'trialing');assert(l.trial.eligible)
  await ctx.db.query(`update public.billing_accounts set reconcile_at=clock_timestamp()+interval '1 day' where environment='development' and user_id=${q(user)};`,false)
  const proof=transportProof(workspace,generation)
  report.stage='register';l.device=good(await rpc(ctx,l.sessions[0].access_token,'register_device',{p_name:'D1 synthetic transport',p_platform:'macos',p_sign_pub:`\\x${proof.keys.signPub}`,p_box_pub:`\\x${proof.keys.boxPub}`,p_protocol:1}),'Real device registration failed');assert.match(l.device,/^[0-9a-f-]{36}$/);await saveLedger(l)
  report.stage='bootstrap';good(await rpc(ctx,l.sessions[0].access_token,'bootstrap_workspace',proof.workspaceArguments(l.device)),'Signed workspace bootstrap failed')
  report.stage='push';good(await push(ctx,l,'originalOp'),'Original opaque push failed')
  await ctx.db.query(`insert into public.snapshots(workspace_id,upto_seq,format_version,key_epoch,object_path,sha256,size,state,created_by) values
   (${q(workspace)},1,1,1,${q(l.objects[0])},${q(hash(body))},${body.length},'published',${q(l.device)}),
   (${q(workspace)},2,1,1,${q(l.objects[1])},${q(hash(body))},${body.length},'uploading',${q(l.device)});`,false)
  good(await request(ctx,`/storage/v1/object/snapshots/${l.objects[0]}`,{method:'POST',body,raw:true,headers:{'content-type':'application/octet-stream','x-upsert':'false'}}),'Legacy fixture upload failed')
  l.legacy={authToken:l.sessions[0].access_token,authExpiresAt:tokenExpiry(l.sessions[0].access_token)}
  for(const method of ['download','upload']){report.stage=`legacy-${method}`
   const minted=await request(ctx,'/functions/v1/snapshot-url',{method:'POST',token:l.sessions[0].access_token,body:{deviceId:l.device,workspaceId:workspace,seq:1,path:l.objects[0],method}})
   const value=good(minted,'Old deployed signer unavailable');assert.equal(value.method,method);assert.equal(value.path,l.objects[0]);assert.equal(value.expiresIn,method==='upload'?7200:60);assert.equal(typeof value.signedUrl,'string')
   const mintedAt=minted.headers.get('date')?new Date(minted.headers.get('date')).toISOString():await serverNow(ctx)
   l.legacy[method]={url:value.signedUrl,mintedAt,expiresAt:signedExpiry(value.signedUrl,value.expiresIn,mintedAt),initialUsable:false};ctx.db.hide(value.signedUrl);await saveLedger(l)
   const response=await boundedFetch(value.signedUrl,{method:method==='download'?'GET':'PUT',...(method==='upload'?{headers:{'content-type':'application/octet-stream','x-upsert':'true'},body}:{})})
   assert(response.ok,'Real old signed credential not usable at preparation');if(method==='download')assert.equal(hash(Buffer.from(await response.arrayBuffer())),hash(body));else await response.arrayBuffer()
   l.legacy[method].initialUsable=true;await saveLedger(l)
  }
  l.stage='prepared';report.stage='prepared';delete l.password;await saveLedger(l)
  report.prepared=true;report.checks=['two real independent Auth sessions','actual register/bootstrap with signed roster/checkpoint','ordinary ciphertext push and original hash receipt','approved private snapshot object','real legacy signed download and upload both initially usable'];report.legacy={downloadExpiresAt:l.legacy.download.expiresAt,uploadExpiresAt:l.legacy.upload.expiresAt,authExpiresAt:l.legacy.authExpiresAt,liveSocket:'requires startLegacyConnection coordinator'}
 }catch(error){report.error='legacy_transport_preparation_incomplete';report.diagnostic={type:error.name,message:safeMessage(error)};throw Error(report.error)}finally{await saveReport(report)}
 return report
}

async function channel(ctx,token,topic,{events=[],presence=false}={}){
 // Supabase's Realtime callback is authoritative on connect/heartbeat. Keep this
 // socket pinned to the exact supplied token instead of falling back to anon.
 const sdk=createClient(developmentUrl,ctx.anon,{accessToken:async()=>token,auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:boundedFetch},realtime:{timeout:10000}})
 await sdk.realtime.setAuth(token)
 const statuses=[]
 const value=sdk.channel(topic,{config:{private:true,broadcast:{ack:true,self:true},...(presence?{presence:{key:randomUUID()}}:{})}})
 value.on('broadcast',{event:'head'},message=>events.push({event:'head',head:message.payload?.head,at:Date.now()}))
 value.on('broadcast',{event:'d1-client-probe'},()=>events.push({event:'d1-client-probe',at:Date.now()}))
 let finish
 const ready=new Promise(resolve=>{finish=resolve})
 const timer=setTimeout(()=>finish({status:'TIMEOUT',reason:'timeout'}),12000)
 value.subscribe((status,error)=>{
  const reason=/permission|unauthori[sz]ed|not authorized|forbidden/i.test(String(error?.message??error??''))?'policy_denied':status==='TIMED_OUT'?'timeout':error?'transport_error':null
  statuses.push({status,reason,at:Date.now(),...(error?{boundedErrorMessage:safeMessage(error)}:{})})
  if(['SUBSCRIBED','CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){clearTimeout(timer);finish({status,reason})}
 })
 const outcome=await ready
 return {sdk,value,events,statuses,outcome,async close(){clearTimeout(timer);await sdk.removeAllChannels();await sdk.realtime.disconnect()}}
}
async function awaitHead(connection,head){const end=Date.now()+10000;while(Date.now()<end){if(connection.events.some(event=>event.event==='head'&&event.head===head))return;await wait(100)}throw Error('server_head_not_received')}
async function rejectJoin(ctx,l,topic){const connection=await channel(ctx,l.sessions[0].access_token,topic);try{assert.equal(connection.outcome.status,'CHANNEL_ERROR','Realtime denial was not explicit');assert.equal(connection.outcome.reason,'policy_denied','Realtime network failure cannot prove policy denial');return {status:'denied'}}finally{await connection.close()}}

export async function startLegacyConnection({onReady}={}){
 const ctx=await context(),l=await loadLedger();assert.equal(l.stage,'prepared');assert(l.legacy?.authToken,'Missing original legacy JWT');await verifyIdentity(ctx,l)
 const connection=await channel(ctx,l.legacy.authToken,`ws:${l.workspace}`)
 const evidence={ok:false,pending:true,project:developmentRef,user:l.user,workspace:l.workspace,authExpiresAt:l.legacy.authExpiresAt,startedAt:await serverNow(ctx),oldTopicInitiallySubscribed:connection.outcome.status==='SUBSCRIBED',initialOutcome:connection.outcome,statuses:connection.statuses,checks:[],jwtDrain:{status:'pending'}}
 await writeFile(legacyFile,JSON.stringify(evidence,null,2)+'\n')
 if(!evidence.oldTopicInitiallySubscribed){await connection.close();throw Error('legacy_subscription_failed')}
 try{await onReady?.({user:l.user,workspace:l.workspace,authExpiresAt:l.legacy.authExpiresAt})}catch(error){await connection.close();throw error}
 return {authExpiresAt:l.legacy.authExpiresAt,
  async verifyAfterDeployment({phase='cutover',waitMs=1500}={}){
   assert(['cutover','jwt-expiry'].includes(phase));assert(Number.isInteger(waitMs)&&waitMs>=500&&waitMs<=10000)
   if(phase==='cutover'){
    const initialCount=connection.events.length,wasContinuous=connection.statuses.filter(x=>x.status==='SUBSCRIBED').length===1&&connection.statuses.at(-1)?.status==='SUBSCRIBED'
    const current=await loadLedger();await refresh(ctx,current)
    const pushed=good(await push(ctx,current,'cutoverOp'),'New-version owner push failed at cutover')
    await wait(waitMs);assert.equal(connection.events.length,initialCount,'New server head leaked to old topic')
    evidence.cutover={serverNow:await serverNow(ctx),continuousOriginalSocket:wasContinuous,newOwnerPushSeq:Number(pushed[0].seq),newHeadAbsentOnOldTopic:true};evidence.checks.push('actual owner push emits no old-topic head after cutover')
   }else{
    const now=await serverNow(ctx)
    if(Date.parse(now)<Date.parse(l.legacy.authExpiresAt)+5000)evidence.jwtDrain={status:'pending',serverNow:now,notBefore:new Date(Date.parse(l.legacy.authExpiresAt)+5000).toISOString()}
    else{await wait(waitMs);const connected=connection.value.state==='joined';evidence.jwtDrain={status:connected?'unverified':'verified',serverNow:now,originalSocketJoined:connected,lastStatus:connection.statuses.at(-1)?.status??null};assert(!connected,'Original legacy socket still joined after real JWT expiry')}
   }
   evidence.pending=evidence.jwtDrain.status==='pending'
   evidence.ok=evidence.cutover?.continuousOriginalSocket===true&&evidence.jwtDrain.status==='verified';evidence.statuses=connection.statuses
   await writeFile(legacyFile,JSON.stringify(evidence,null,2)+'\n');return evidence
  },async close(){await connection.close()}}
}

export async function startCompensatingJwtConnection(){
 const ctx=await context(),l=await loadLedger();assert.equal(l.stage,'prepared');assert(!l.cleaned);await verifyIdentity(ctx,l)
 const token=l.legacy.authToken,expiresAt=tokenExpiry(token),startedAt=await serverNow(ctx)
 assert(Date.parse(startedAt)<Date.parse(expiresAt),'Original legacy JWT already expired; cannot mint replacement proof')
 await setClock(ctx,l,new Date(Date.parse(l.trial.trialStartedAt)+3600000).toISOString())
 const connection=await channel(ctx,token,`cloud:v1:ws:${l.workspace}`)
 try{
  assert.equal(connection.outcome.status,'SUBSCRIBED','Original pinned JWT could not join the new topic')
  const activeKey=`jwt_${randomUUID().replaceAll('-','')}`;l.jwtProofs??=[];l.jwtProofs.push(activeKey);await saveLedger(l)
  good(await push(ctx,l,activeKey,token),'Pinned original JWT active push failed');await awaitHead(connection,l.receipts[activeKey].seq)
  await setClock(ctx,l,l.trial.trialEndsAt)
  const count=connection.events.length,deniedKey=`jwt_denied_${randomUUID().replaceAll('-','')}`
  const denied=await push(ctx,l,deniedKey,token);assert.equal(denied.status,403);assert.equal(denied.body.code,'PT403');assert.equal(denied.body.message,'service_expired')
  await wait(1500);assert.equal(connection.events.length,count,'Expired ordinary write emitted a head')
  const initial={startedAt,expiresAt,initialActiveHeadReceived:true,headSeq:l.receipts[activeKey].seq,exactFixtureTrialEnd:l.trial.trialEndsAt,
   expiryError:'service_expired',noHeadAfterDeniedWrite:true,cachedAcrossServiceExpiry:connection.value.state==='joined',originalJwtPinned:true,
   originalOldSocket:'actively closed by coordinator; natural JWT expiry was not observed',compensation:'same original JWT on a separately established new-topic connection'}
  return {initial,
   async sample(){
    const now=await serverNow(ctx),due=Date.parse(now)>=Date.parse(expiresAt)+5000
    if(!due)return {status:'pending',serverNow:now,notBefore:new Date(Date.parse(expiresAt)+5000).toISOString(),channelState:connection.value.state}
    const auth=await request(ctx,'/auth/v1/user',{token}),joined=connection.value.state==='joined'
    const rejected=[401,403].includes(auth.status)
    const status=!joined&&rejected?'verified':Date.parse(now)>Date.parse(expiresAt)+60000?'unverified':'pending'
    return {status,serverNow:now,channelState:connection.value.state,originalTokenAuthStatus:auth.status,
     originalTokenRejected:rejected,naturalNewTopicChannelExpiryObserved:false,
     channelExpiryObservation:'Token rejection and channel state are separate; natural channel expiry was not established',
     statuses:connection.statuses,originalOldSocketNaturalExpiryObserved:false}
   },async close(){await connection.close()}}
 }catch(error){await connection.close();throw error}
}

async function legacyDrain(ctx,l){
 const now=await serverNow(ctx),result={serverNow:now,status:'verified',credentials:{}}
 result.originalObjectPresent=Number((await ctx.db.query(`select count(*) as n from storage.objects where bucket_id='snapshots' and name=${q(l.objects[0])}`))[0].n)===1
 for(const method of ['download','upload']){
  const credential=l.legacy[method]
  if(!credential){result.credentials[method]={status:'not-issued'};continue}
  const due=Date.parse(now)>=Date.parse(credential.expiresAt)+5000
  if(!due){result.status='pending';result.credentials[method]={status:'pending',expiresAt:credential.expiresAt};continue}
  const response=await boundedFetch(credential.url,{method:method==='download'?'GET':'PUT',...(method==='upload'?{headers:{'content-type':'application/octet-stream','x-upsert':'true'},body:bytes()}:{})})
  const text=await response.text();let error;try{error=JSON.parse(text)}catch{/* Never persist a raw signed-response body. */}
  const expClaim=error?.error==='InvalidJWT'&&error?.message==='"exp" claim timestamp check failed'
  const expired=credential.initialUsable===true&&[400,401,403].includes(response.status)&&(expClaim||/expir|invalid.*token|jwt.*invalid/i.test(String(error?.message??error?.error??'')))
  result.credentials[method]={status:expired?'verified':'unverified',httpStatus:response.status,expiresAt:credential.expiresAt,initiallyUsable:credential.initialUsable,...(expClaim?{expiryEvidence:'exp_claim_timestamp_failed'}:{})}
  if(!expired)result.status='unverified'
 }
 const states=Object.values(result.credentials).map(value=>value.status)
 result.status=!result.originalObjectPresent||states.includes('unverified')?'unverified':states.includes('pending')?'pending':'verified'
 return result
}

async function collectDrains(ctx,l,report){
 report.legacyTokenDrain=await legacyDrain(ctx,l)
 const deployment=JSON.parse(await readFile(`${directory}/deployment.json`,'utf8')),now=Date.parse(await serverNow(ctx)),bounds=deployment.legacyDrain
 report.systemDrain={status:bounds&&now>=Date.parse(bounds.storageNotBefore)&&now>=Date.parse(bounds.realtimeNotBefore)?'verified':'pending',storageNotBefore:bounds?.storageNotBefore??null,realtimeNotBefore:bounds?.realtimeNotBefore??null,serverNow:new Date(now).toISOString()}
 try{report.legacySocket=JSON.parse(await readFile(legacyFile,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error;report.legacySocket={ok:false,error:'coordinator_required'}}
 report.originalJwtDrain=await originalJwtDrain(ctx,l)
 let cached
 try{cached=JSON.parse(await readFile(`${directory}/jwt-watch.json`,'utf8')).initial}catch(error){if(error.code!=='ENOENT')throw error}
 const cutover=report.legacySocket.cutover
 const combined=report.legacySocket.oldTopicInitiallySubscribed===true&&cutover?.continuousOriginalSocket===true&&cutover.newHeadAbsentOnOldTopic===true&&
  report.oldTopicNewJoin?.status==='denied'&&cached?.originalJwtPinned===true&&cached.initialActiveHeadReceived===true&&cached.cachedAcrossServiceExpiry===true&&cached.noHeadAfterDeniedWrite===true
 report.legacyRetirement={status:combined&&report.originalJwtDrain.status==='verified'&&report.systemDrain.status==='verified'?'verified':'pending',
  method:'Joint cutover, service-expiry, actual original-token rejection and conservative system TTL evidence',
  cutoverAndCachedServiceExpiryVerified:combined,naturalOldSocketExpiryObserved:false,naturalNewSocketExpiryObserved:false,
  limitation:'Original old socket was actively closed; compensating new socket disconnected before JWT expiry. Neither natural socket expiry was observed.'}
 report.ok=report.transportVerified===true&&report.legacyTokenDrain.status==='verified'&&report.legacyRetirement.status==='verified'
 report.pending=[]
 if(report.legacyTokenDrain.status!=='verified')report.pending.push('real legacy signed-token TTL drain')
 if(report.originalJwtDrain.status!=='verified')report.pending.push('actual original JWT structured bad_jwt/expired-claims rejection after real expiry')
 if(!combined)report.pending.push('joint old-topic cutover and cached service-expiry evidence')
 if(report.systemDrain.status!=='verified')report.pending.push('conservative system credential/channel drain')
 report.drainsObservedAt=new Date(now).toISOString()
}

async function originalJwtDrain(ctx,l){
 const now=await serverNow(ctx),expiresAt=l.legacy.authExpiresAt
 if(Date.parse(now)<Date.parse(expiresAt)+5000)return {status:'pending',serverNow:now,expiresAt}
 await verifyIdentity(ctx,l)
 const auth=await request(ctx,'/auth/v1/user',{token:l.legacy.authToken})
 const errorCode=auth.body?.error_code??auth.body?.code,message=auth.body?.msg??auth.body?.message
 const expired=errorCode==='bad_jwt'&&message==='invalid JWT: unable to parse or verify signature, token has invalid claims: token is expired'
 return {status:[401,403].includes(auth.status)&&expired?'verified':'unverified',serverNow:now,expiresAt,originalTokenAuthStatus:auth.status,
  fixtureIdentityPresent:true,errorCode:errorCode==='bad_jwt'?'bad_jwt':'unrecognized',expiryEvidence:expired?'exact_expired_claims_reason':null,
  naturalChannelExpiryObserved:false,scope:'Original JWT Auth request only; no token refresh, channel, fixture or clock write'}
}

export async function observeOriginalJwtDrain(){
 const ctx=await context(),l=await loadLedger();assert(!l.cleaned);await verifyIdentity(ctx,l)
 return originalJwtDrain(ctx,l)
}

async function markFixtureCompatible(ctx,l){
 const session=JSON.parse(Buffer.from(l.sessions[0].access_token.split('.')[1],'base64url').toString('utf8')).session_id
 assert.match(session,/^[0-9a-f-]{36}$/)
 const identity=`select d.id,d.user_id,d.auth_session_id,d.status,d.protocol_version,encode(d.sign_pub,'hex') as sign_pub,encode(d.box_pub,'hex') as box_pub,d.service_version,
  exists(select 1 from public.device_roster r where r.workspace_id=${q(l.workspace)} and r.version=1 and r.signer_device=d.id
   and r.roster->'devices' @> jsonb_build_array(jsonb_build_object('id',d.id,'signPub',encode(d.sign_pub,'hex'),'boxPub',encode(d.box_pub,'hex')))) as pinned
  from public.devices d join auth.users u on u.id=d.user_id join auth.sessions s on s.id=d.auth_session_id and s.user_id=d.user_id
  where d.id=${q(l.device)} and d.user_id=${q(l.user)} and u.email=${q(l.email)} and d.auth_session_id=${q(session)} and d.status='authorized' and d.protocol_version=1;`
 const before=(await ctx.db.query(identity))[0];assert(before?.pinned,'Pre-cutover fixture device/session/pinned keys changed')
 assert([0,1].includes(before.service_version))
 if(before.service_version===0)await ctx.db.query(`update public.devices set service_version=1 where id=${q(l.device)} and user_id=${q(l.user)} and auth_session_id=${q(session)} and status='authorized' and protocol_version=1 and service_version=0;`,false)
 const after=(await ctx.db.query(identity))[0];assert.equal(after?.service_version,1)
 const {service_version:oldVersion,...oldIdentity}=before,{service_version:newVersion,...newIdentity}=after;assert.deepEqual(newIdentity,oldIdentity,'Fixture compatibility update changed authentication or key ownership')
 return {originalServiceVersion:oldVersion,currentServiceVersion:newVersion,fixtureOnlyCompatibilityUpdate:oldVersion===0,
  authenticationAndPinnedKeysUnchanged:true,provenance:'Pre-cutover fixture proved keys through real signed bootstrap. Its signing seed was discarded. Only synthetic device compatibility metadata was marked; this is not signed client upgrade acceptance. Actual signed rebind is covered by rollback SQL; new registration marker is covered by hosted phase0.'}
}

export async function refreshTransportDrains(){
 const ctx=await context(),l=await loadLedger(),report=await previousReport()
 assert(report.transportVerified,'Run real transport core acceptance first');assert(!l.cleaned);await verifyIdentity(ctx,l)
 await collectDrains(ctx,l,report);delete report.error;delete report.diagnostic;await saveReport(report);return report
}

export async function verifyTransport(){
 const ctx=await context(),l=await loadLedger();assert.equal(l.stage,'prepared');assert(!l.cleaned);await verifyIdentity(ctx,l);await refresh(ctx,l)
 const old=await previousReport(),report={...old,ok:false,mode:'--verify',verifiedAt:await serverNow(ctx),checks:[],scope:'Real development Auth/RPC/Storage/Realtime, synthetic ciphertext. Legacy token and live-socket drain are separate measured gates; no model/payment/provider calls'}
 delete report.error
 delete report.diagnostic
 let live,observer
 try{
  report.stage='service-configuration';const version=(await ctx.db.query("select enabled from service_private.policy where id=1"))[0];assert(version?.enabled,'D1 service not activated')
  const active=new Date(Date.parse(l.trial.trialStartedAt)+3600000).toISOString();await setClock(ctx,l,active)
  report.fixtureCompatibility=await markFixtureCompatible(ctx,l)
  const token=l.sessions[0].access_token
  const query=new URLSearchParams({v:'1',deviceId:l.device,workspaceId:l.workspace,generation:l.generation,seq:'2',path:l.objects[1]})
  const proxy=(method,body)=>request(ctx,`/functions/v1/snapshot-url?${query}`,{method,token,version:'1',raw:true,body,headers:method==='PUT'?{'content-type':'application/octet-stream'}:{}})
  report.stage='snapshot-proxy';const uploaded=await proxy('PUT',bytes());assert.equal(uploaded.status,200,'Authenticated snapshot PUT failed');assert.equal(uploaded.body.sha256,hash(bytes()));assert.equal(uploaded.body.size,bytes().length);assert.equal(uploaded.body.method,'upload')
  const repeated=await proxy('PUT',bytes());assert.equal(repeated.status,200,'Same tuple retry failed')
  const changed=await proxy('PUT',Buffer.from('different-fixture'));assert.equal(changed.status,409);assert.equal(changed.body.error,'snapshot_conflict')
  await ctx.db.query(`update public.snapshots set state='published' where workspace_id=${q(l.workspace)} and upto_seq=2 and object_path=${q(l.objects[1])};`,false)
  const downloaded=await proxy('GET');assert.equal(downloaded.status,200);assert.equal(hash(downloaded.bytes),hash(bytes()));assert.equal(downloaded.headers.get('x-goalloom-content-sha256'),hash(bytes()));assert.equal(downloaded.headers.get('cache-control'),'no-store')
  report.checks.push('authenticated snapshot bytes, approved hash, create-only retry and changed-body conflict')
  const direct=await request(ctx,`/storage/v1/object/snapshots/${l.objects[1]}`,{token,raw:true});assert([400,401,403,404].includes(direct.status),'Direct Storage denial was not definitive')
  const noVersion=await request(ctx,`/functions/v1/snapshot-url?${query}`,{token,raw:true});assert.equal(noVersion.status,409);assert.equal(noVersion.body.error,'upgrade_required')
  const oldSigner=await request(ctx,'/functions/v1/snapshot-url',{method:'POST',token,version:'1',body:{deviceId:l.device,workspaceId:l.workspace,seq:1,path:l.objects[0]}});assert.equal(oldSigner.status,409);assert.equal(oldSigner.body.error,'upgrade_required')
  report.checks.push('no direct Storage read and no newly issued signed credential')
  report.stage='new-topic-subscribe';live=await channel(ctx,token,`cloud:v1:ws:${l.workspace}`);report.liveInitial={outcome:live.outcome,statuses:live.statuses};assert.equal(live.outcome.status,'SUBSCRIBED')
  observer=await channel(ctx,token,`cloud:v1:ws:${l.workspace}`);report.observerInitial={outcome:observer.outcome,statuses:observer.statuses};assert.equal(observer.outcome.status,'SUBSCRIBED')
  // Each verification needs a fresh accepted write: replaying the original
  // accepted op deliberately emits no new head and cannot prove delivery.
  const activeKey=`active_${randomUUID().replaceAll('-','')}`;l.activeProofs??=[];l.activeProofs.push(activeKey);await saveLedger(l)
  good(await push(ctx,l,activeKey),'Active ordinary push failed');await awaitHead(live,l.receipts[activeKey].seq)
  report.activeHead={seq:l.receipts[activeKey].seq,received:true}
  report.checks.push('real actual-owner push delivers new-topic head before expiry')
  report.stage='client-publish';const publish=await live.value.send({type:'broadcast',event:'d1-client-probe',payload:{fixture:true}});report.clientWrites={broadcast:publish}
  await wait(1000);assert.equal(publish,'error','Client Broadcast did not return explicit rejection');assert(!observer.events.some(event=>event.event==='d1-client-probe'),'Client Broadcast reached another socket')
  report.stage='client-presence';const presence=await live.value.track({fixture:true});report.clientWrites.presence=presence;assert.equal(presence,'error','Presence write did not return explicit rejection')
  report.clientWrites={broadcast:publish,presence};report.checks.push('new-topic client Broadcast and Presence explicitly rejected')
  report.stage='legacy-new-join';report.oldTopicNewJoin=await rejectJoin(ctx,l,`ws:${l.workspace}`)
  await setClock(ctx,l,l.trial.trialEndsAt)
  report.stage='expired-transport';const before=live.events.length,denied=await push(ctx,l,'expiredOp');assert.equal(denied.status,403);assert.equal(denied.body.message,'service_expired');assert.equal(denied.body.code,'PT403')
  await wait(1500);assert.equal(live.events.length,before,'Denied expired push emitted a new head')
  const deniedGet=await proxy('GET'),deniedPut=await proxy('PUT',bytes());for(const result of [deniedGet,deniedPut]){assert.equal(result.status,403);assert.equal(result.body.error,'service_expired');assert(!result.body.signedUrl);assert(!result.headers.has('x-goalloom-content-sha256'));assert.match(result.headers.get('content-type')??'',/application\/json/)}
  const receipts=good(await rpc(ctx,token,'receipts_for',{p_workspace:l.workspace,p_device:l.device,p_op_ids:[l.originalOp.op_id],p_payload_hashes:[l.originalOp.payload_hash]}),'Original receipt recovery failed');assert.equal(receipts.length,1);assert.equal(receipts[0].payload_hash,l.originalOp.payload_hash);assert.equal(Number(receipts[0].seq),l.receipts.originalOp.seq)
  const wrong=good(await rpc(ctx,token,'receipts_for',{p_workspace:l.workspace,p_device:l.device,p_op_ids:[l.originalOp.op_id],p_payload_hashes:['f'.repeat(64)]}),'Altered receipt query failed');assert.equal(wrong.length,0)
  report.expiredTopicNewJoin=await rejectJoin(ctx,l,`cloud:v1:ws:${l.workspace}`)
  report.checks.push('already-live channel receives no head from denied expired push; typed transfer denial and original hash receipt remain independent')
  report.stage='drain';report.transportVerified=true;await collectDrains(ctx,l,report)
  report.stage='verified-core'
 }catch(error){report.error='d1_transport_verification_incomplete';report.diagnostic={type:error.name,message:safeMessage(error)};throw Error(report.error)}finally{await Promise.allSettled([live?.close(),observer?.close()].filter(Boolean));await saveReport(report)}
 return report
}

export async function cleanupTransport(){
 const ctx=await context(),l=await loadLedger(),report=await previousReport()
 const identity=await request(ctx,`/auth/v1/admin/users/${l.user}`)
 assert([200,404].includes(identity.status));if(identity.status===200){assert.equal(identity.body.email,l.email);assert.equal(identity.body.id,l.user)}
 const owners=await ctx.db.query(`select user_id from public.workspaces where id=${q(l.workspace)}`);assert(owners.every(row=>row.user_id===l.user),'Refuse foreign workspace cleanup')
 if(l.legacy){
  const drain=await legacyDrain(ctx,l);assert.equal(drain.status,'verified','Keep original object until real signed credential expiry is proven')
  let deployment;try{deployment=JSON.parse(await readFile(`${directory}/deployment.json`,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
  if(deployment?.legacyDrain){const now=Date.parse(await serverNow(ctx));assert(now>=Date.parse(deployment.legacyDrain.storageNotBefore)&&now>=Date.parse(deployment.legacyDrain.realtimeNotBefore),'Conservative system drain remains pending')}
  if(l.stage==='prepared'){await collectDrains(ctx,l,report);await saveReport(report);assert.equal(report.legacyRetirement.status,'verified','Joint legacy transport retirement remains unverified')}
 }
 const service=createClient(developmentUrl,ctx.serviceKey,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}})
 const removed=await service.storage.from('snapshots').remove(l.objects);assert(!removed.error,'Exact fixture Storage cleanup failed')
 if(l.device)await ctx.db.query(`begin;delete from public.rpc_buckets where device_id=${q(l.device)};delete from public.control_events where device_id=${q(l.device)};commit;`,false)
 const result=await cleanupExactFixtures(ctx.db,[l.user]);assert(result.ok,'Fixture account cleanup incomplete')
 const remaining=await ctx.db.query(`select (select count(*) from public.workspaces where id=${q(l.workspace)})+(select count(*) from public.devices where user_id=${q(l.user)})+(select count(*) from public.billing_accounts where user_id=${q(l.user)})+(select count(*) from public.billing_inbox where user_id=${q(l.user)} and status in ('pending','processing'))+(select count(*) from storage.objects where bucket_id='snapshots' and name=any(array[${l.objects.map(q).join(',')}])) as remaining;`)
 assert.equal(Number(remaining[0].remaining),0,'Fixture data remains')
 l.cleaned=true;l.stage='cleaned';l.cleanedAt=await serverNow(ctx);delete l.sessions;delete l.password;delete l.legacy;await saveLedger(l)
 report.cleanup={ok:true,remaining:0,objects:l.objects.length,at:l.cleanedAt};await saveReport(report);return report
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 try{
  const mode=process.argv[2];assert(['--prepare-legacy','--verify','--cleanup'].includes(mode),'Use --prepare-legacy, --verify or --cleanup')
  const result=await(mode==='--prepare-legacy'?prepareLegacy():mode==='--verify'?verifyTransport():cleanupTransport())
  console.log(JSON.stringify({ok:result.ok??false,prepared:result.prepared??false,transportVerified:result.transportVerified??false,pending:result.pending??[],cleanup:result.cleanup??null,evidence:reportFile},null,2))
 }catch{console.error(JSON.stringify({ok:false,error:'d1_transport_stage_failed',evidence:reportFile}));process.exitCode=1}
}
