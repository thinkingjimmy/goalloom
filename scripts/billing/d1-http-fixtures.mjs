/**
 * [INPUT]: Synthetic identities, finite HTTP scenarios and controlled provider fixtures.
 * [OUTPUT]: Stateful Auth/RPC/Storage adapters for the real D1 HTTP handlers without remote calls.
 * [POS]: Contract E2E fixture only; not PostgreSQL, RLS, provider or concurrency evidence.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {randomUUID,createHash} from 'node:crypto'
import {isDeepStrictEqual} from 'node:util'
import {providerFixture} from './fixtures.mjs'
export const projectUrl='https://asqyvcnxdltzzfutbbqy.supabase.co'
export const identity=()=>({user:randomUUID(),session:randomUUID()})
export const jwt=({user,session})=>`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user,session_id:session,role:'authenticated',iss:`${projectUrl}/auth/v1`,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.fixture-verified`
export const config=()=>({environment:'development',url:projectUrl,serviceKey:'controlled-service-key',account:'acct_1QvwdlITpGuR8ZMB',rcProject:'projd720c733',rcApp:'appfixture',prices:{monthly:'price_FixtureMonth',annual:'price_FixtureYear'},portalConfiguration:'bpc_Fixture',returnUrl:'https://www.goalloom.com/billing/return/',cancelUrl:'https://www.goalloom.com/billing/continue/',webOrigin:'https://www.goalloom.com',stripeKey:'rk_test_controlled',stripeWebhookSecret:randomUUID(),rcPublicKey:'sandbox_controlled',rcSecretKey:'sk_controlled',rcWebhookSecret:randomUUID(),workerSecret:randomUUID(),automaticTax:false,taxRegistrationVerified:false})
export function authFetch(identities){return async(target,init)=>{
 if(String(target)!==`${projectUrl}/auth/v1/user`)throw Error('Unexpected external request')
 const auth=init.headers.authorization??'',payload=auth.split('.')[1]
 if(!auth.endsWith('.fixture-verified'))return Response.json({}, {status:401})
 const claims=JSON.parse(Buffer.from(payload,'base64url'))
 return identities.some(x=>x.user===claims.sub&&x.session===claims.session_id)?Response.json({id:claims.sub}):Response.json({}, {status:401})
}}
export function billingFixture(cfg,owner){
 const state={operations:new Map(),continuations:new Map(),customer:null,locked:false,status:{version:1,status:'none',eligible:false,serverNow:new Date().toISOString(),subscriptions:[]}}
 const provider=providerFixture(cfg);provider.state.owner=owner.user
 const create=provider.stripe.checkout.sessions.create
 provider.stripe.checkout.sessions.create=async(args,options)=>{try{return await create(args,options)}finally{provider.state.sessions.forEach((session,index)=>{if(session.id==='cs_test_Fixture')session.id=`cs_test_D1Fixture${index+1}`})}}
 const copy=value=>structuredClone(value)
 const aliases=new Map()
 const rpc=async(name,args)=>{
  if(name==='service_reject_operation'){
   const blocker=state.operations.get(args.p_blocking)
   if(state.operations.has(args.p_requested)||aliases.has(args.p_requested)||blocker?.status!=='pending'||blocker.action==='checkout'&&args.p_action==='checkout'&&blocker.cycle===args.p_cycle)throw Error('billing_request_conflict')
   const op={request_id:args.p_requested,action:args.p_action,cycle:args.p_cycle,provider_id:null,result:{error:'billing_request_conflict'},status:'closed',created_at:new Date().toISOString()}
   state.operations.set(op.request_id,op)
   if(['checkout','portal'].includes(op.action))state.continuations.set(op.request_id,{value:copy(args.p_continuation),session:args.p_session,expiresAt:new Date(Date.parse(op.created_at)+86400000).toISOString()})
   return copy(op)
  }
  if(name==='service_operation_alias'){
   const saved=aliases.get(args.p_requested)
   if(saved){if(saved.action!==args.p_action||saved.cycle!==args.p_cycle||!isDeepStrictEqual(saved.continuation,args.p_continuation))throw Error('billing_request_conflict');if(args.p_candidate&&saved.target!==args.p_candidate)throw Error('billing_request_conflict');return {operation:copy(state.operations.get(saved.target))}}
   if(!args.p_candidate){const original=state.operations.get(args.p_requested);return original?{operation:copy(original)}:null}
   const target=state.operations.get(args.p_candidate)
   if(state.operations.has(args.p_requested)||target?.status!=='pending'||target.action!=='checkout'||args.p_action!=='checkout'||target.cycle!==args.p_cycle)throw Error('billing_request_conflict')
   aliases.set(args.p_requested,{target:args.p_candidate,action:args.p_action,cycle:args.p_cycle,continuation:copy(args.p_continuation)});return {operation:copy(target)}
  }
  if(name==='service_resolve_operation'){
   const result=await rpc('service_operation_alias',{...args,p_candidate:null})
   if(!result)return null
   const op=result.operation
   if(op.action!==args.p_action||op.cycle!==args.p_cycle)throw Error('billing_request_conflict')
   const saved=state.continuations.get(args.p_requested)
   if(saved&&!isDeepStrictEqual(saved.value,args.p_continuation))throw Error('billing_request_conflict')
   if(!saved&&op.status==='closed'&&!aliases.has(args.p_requested))throw Error('billing_request_conflict')
   return result
  }
  if(name==='billing_source')return {account_id:cfg.account,rc_project:cfg.rcProject,rc_app:cfg.rcApp,monthly_price:cfg.prices.monthly,annual_price:cfg.prices.annual}
  if(name==='billing_status')return {...copy(state.status),...(state.projectPendingCheckout&&[...state.operations.values()].some(op=>op.action==='checkout'&&op.status==='pending')?{status:'verification_pending'}:{})}
  if(name==='billing_lock'){if(state.locked)return {error:'billing_pending'};state.locked=true;return {lease:randomUUID(),customer:state.customer,operations:copy([...state.operations.values()].filter(op=>op.status==='pending'||Date.parse(op.created_at)>Date.now()-86400000))}}
  if(name==='billing_unlock'){state.locked=false;return null}
  if(name==='billing_bind_customer'){state.customer=args.p_customer;return null}
  if(['billing_prior_facts','billing_closeouts'].includes(name))return []
  if(name==='billing_commit')return rpc('billing_status',{})
  if(name==='billing_operation'){
   let op=state.operations.get(args.p_request)
   if(op&&(op.action!==args.p_action||op.cycle!==args.p_cycle))throw Error('billing_request_conflict')
   if(op&&['closed','complete'].includes(op.status))return copy(op)
   op={request_id:args.p_request,action:args.p_action,cycle:args.p_cycle,provider_id:args.p_provider??op?.provider_id??null,result:args.p_result??op?.result??null,status:args.p_status,created_at:op?.created_at??new Date().toISOString()};state.operations.set(op.request_id,op);return copy(op)
  }
  if(name==='service_continuation'){
   let saved=state.continuations.get(args.p_request),op=state.operations.get(args.p_request)
   if(saved&&args.p_requested===args.p_request&&!isDeepStrictEqual(saved.value,args.p_continuation))throw Error('billing_request_conflict')
   if(!saved){if(op.status==='complete'&&op.action==='checkout')return {continuation:null,expiresAt:new Date(Date.parse(op.created_at)+86400000).toISOString(),returnToThisDevice:false};if(op.provider_id)throw Error('billing_review_required');saved={value:copy(args.p_continuation),session:args.p_session,expiresAt:new Date(Date.parse(op.created_at)+86400000).toISOString()};state.continuations.set(args.p_request,saved)}
   if(op.status!=='closed'&&!(op.status==='complete'&&op.action==='checkout')&&Date.parse(saved.expiresAt)<=Date.now())throw Error('continuation_expired')
   return {continuation:copy(saved.value),expiresAt:saved.expiresAt,returnToThisDevice:args.p_requested===args.p_request&&args.p_session===saved.session&&isDeepStrictEqual(saved.value,args.p_continuation)}
  }
  throw Error(`Unexpected controlled RPC: ${name}`)
 }
 return {state,provider,rpc}
}
export function snapshotFixture(owner){
 const workspace=randomUUID(),generation=randomUUID(),device=randomUUID(),bytes=Buffer.from(`encrypted-fixture-${randomUUID()}`)
 const state={workspace,generation,device,path:`workspaces/${workspace}/${generation}/1.bin`,bytes,hash:createHash('sha256').update(bytes).digest('hex'),object:null,error:null,authStatus:200,afterRead:null,afterUpload:null,storageReads:0,storageWrites:0,accessCalls:0}
 const authenticate=authFetch([owner])
 const http=async(target,init={})=>{
  const url=new URL(target)
  if(url.pathname==='/auth/v1/user')return state.authStatus===200?authenticate(target,init):Response.json({}, {status:state.authStatus})
  if(url.pathname==='/rest/v1/rpc/snapshot_transfer_access'){
   state.accessCalls++;const args=JSON.parse(init.body)
   if(state.error)return Response.json({code:state.error==='billing_configuration'?'PT503':'PT403',message:state.error,details:JSON.stringify({billingStatus:'expired',minServiceVersion:1})},{status:state.error==='billing_configuration'?503:403})
   if(args.p_workspace!==state.workspace||args.p_generation!==state.generation||args.p_device!==state.device||args.p_path!==state.path)return Response.json({code:'PT409',message:'snapshot_conflict'},{status:409})
   return Response.json([{object_path:state.path,sha256:state.hash,size:state.bytes.length}])
  }
  if(url.pathname.startsWith('/storage/v1/object/snapshots/')){
   if(init.headers.authorization!=='Bearer controlled-service-key')throw Error('Missing private Storage credential')
   if(init.method==='POST'){state.storageWrites++;if(state.object)return Response.json({error:'already exists'},{status:409});state.object=new Uint8Array(init.body);state.afterUpload?.();return Response.json({ok:true},{status:201})}
   state.storageReads++;if(!state.object)return Response.json({}, {status:404});state.afterRead?.();return new Response(new Uint8Array(state.object).buffer)
  }
  throw Error('Unexpected snapshot external request')
 }
 return {state,http,query:()=>new URLSearchParams({v:'1',deviceId:state.device,workspaceId:state.workspace,generation:state.generation,seq:'1',path:state.path}).toString()}
}
