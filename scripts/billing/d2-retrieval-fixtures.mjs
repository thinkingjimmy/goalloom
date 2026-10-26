/**
 * [INPUT]: Synthetic identifiers and existing canonical JSON/Ed25519 algorithms.
 * [OUTPUT]: Rollback-only public control records and in-memory signing material.
 * [POS]: D2 SQL integration fixtures; no task content, saved seeds or provider identity.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {createHash,randomBytes,randomUUID} from 'node:crypto'
import {ed25519,x25519} from '@noble/curves/ed25519.js'
import {canonicalJson} from '../../packages/contracts/src/canonical.ts'
import {literal as q,json,bytea} from './d1-sync-fixtures.mjs'
export {q,json,bytea}
const hex=b=>Buffer.from(b).toString('hex')
export const sha=value=>createHash('sha256').update(value).digest('hex')
export function retrievalFixture(){
 const f=Object.fromEntries(['user','session','otherSession','device','workspace','generation','request','finalOp'].map(k=>[k,randomUUID()]))
 const deviceSeed=randomBytes(32),recoverySeed=randomBytes(32)
 f.signPub=hex(ed25519.getPublicKey(deviceSeed));f.boxPub=hex(x25519.getPublicKey(randomBytes(32)))
 f.recoverySignPub=hex(ed25519.getPublicKey(recoverySeed));f.recoveryBoxPub=hex(x25519.getPublicKey(randomBytes(32)))
 const sign=(body,domain,seed=deviceSeed)=>hex(ed25519.sign(Buffer.from(sha(`${domain}${canonicalJson(body)}`),'hex'),seed))
 f.roster={workspaceId:f.workspace,version:1,epoch:1,prevHash:null,devices:[{id:f.device,signPub:f.signPub,boxPub:f.boxPub}],recoverySignPub:f.recoverySignPub,recoveryBoxPub:f.recoveryBoxPub}
 f.rosterHash=sha(canonicalJson(f.roster));f.rosterSig=sign(f.roster,'goalloom/roster/v1|')
 f.extendedRosters=count=>{
  const result=[];let previous=f.rosterHash
  for(let version=2;version<=count;version++){
   const roster={...f.roster,version,prevHash:previous};previous=sha(canonicalJson(roster))
   result.push({version,roster,hash:previous,signature:sign(roster,'goalloom/roster/v1|')})
  }
  return result
 }
 f.checkpoint={workspaceId:f.workspace,cpVersion:1,rosterVersion:1,rosterHash:f.rosterHash,epoch:1,recoverySignPub:f.recoverySignPub,recoveryBoxPub:f.recoveryBoxPub,prevCpHash:null}
 f.devSig=sign(f.checkpoint,'goalloom/recovery-cp/v1|');f.recSig=sign(f.checkpoint,'goalloom/recovery-cp/v1|',recoverySeed)
 // SQL treats the encrypted recovery descriptor and operation bytes as opaque.
 // Actual descriptor/profile/decryption acceptance belongs to the HTTP/client journey.
 f.envelopeCiphertext=hex(Buffer.from(JSON.stringify({v:2,fixture:'opaque-retained-control'})))
 f.envelopeSig=hex(ed25519.sign(Buffer.from(f.envelopeCiphertext,'hex'),deviceSeed))
 f.operation={seq:1,opId:f.finalOp,payloadHash:sha(`canonical-plaintext-fixture:${f.finalOp}`),formatVersion:1,keyEpoch:1,deviceId:f.device}
 f.headHash=sha(canonicalJson({workspaceId:f.workspace,generation:f.generation,headSeq:1,entries:[[1,f.finalOp,f.operation.payloadHash,1,1]]}))
 f.emptyHeadHash=sha(canonicalJson({workspaceId:f.workspace,generation:f.generation,headSeq:0,entries:[]}))
 // libsodium's secret-key layout is seed || public key. Never serialize this object.
 f.sqlSecret=kind=>bytea(hex(kind==='device'?deviceSeed:recoverySeed)+(kind==='device'?f.signPub:f.recoverySignPub))
 return f
}
export function retrievalControlSql(f,serviceVersion=2){return `
insert into auth.users(id,email) values(${q(f.user)},${q(`billing-${f.user}@goalloom.test`)});
insert into auth.sessions(id,user_id) values(${q(f.session)},${q(f.user)}),(${q(f.otherSession)},${q(f.user)});
insert into public.devices(id,user_id,name,platform,sign_pub,box_pub,status,auth_session_id,protocol_version,service_version)
 values(${q(f.device)},${q(f.user)},'D2 retained SQL fixture','macos',${bytea(f.signPub)},${bytea(f.boxPub)},'authorized',${q(f.session)},1,${serviceVersion});
insert into public.workspaces(id,user_id,generation,head_seq,roster_version) values(${q(f.workspace)},${q(f.user)},${q(f.generation)},1,1);
insert into public.device_roster(workspace_id,version,roster,signer_type,signer_device,body_hash,signature)
 values(${q(f.workspace)},1,${json(f.roster)},'device',${q(f.device)},${q(f.rosterHash)},${bytea(f.rosterSig)});
insert into public.recovery_checkpoints(workspace_id,cp_version,body,rec_sig,dev_signer,dev_sig)
 values(${q(f.workspace)},1,${json(f.checkpoint)},${bytea(f.recSig)},${q(f.device)},${bytea(f.devSig)});
insert into public.key_envelopes(workspace_id,epoch,recipient,ciphertext,signer_type,signer_device,roster_version,signature)
 values(${q(f.workspace)},1,'recovery',${bytea(f.envelopeCiphertext)},'device',${q(f.device)},1,${bytea(f.envelopeSig)});
insert into public.ops(workspace_id,seq,op_id,device_id,payload_hash,format_version,key_epoch,ciphertext)
 values(${q(f.workspace)},1,${q(f.finalOp)},${q(f.device)},${q(f.operation.payloadHash)},1,1,decode('01020304','hex'));
insert into public.op_receipts(workspace_id,op_id,payload_hash,seq) values(${q(f.workspace)},${q(f.finalOp)},${q(f.operation.payloadHash)},1);`}
export function retrievalIdentitySql(f){return retrievalControlSql(f)+`
select service_private.ensure_live_subject('development',${q(f.user)});
insert into public.billing_accounts(environment,subject_id,test_now)
 select 'development',subject_id,'2030-01-02T00:00:00.123456Z' from service_private.account_lifecycle where environment='development' and user_id=${q(f.user)};
insert into service_private.workspace_lifecycle(environment,subject_id,workspace_id,generation,state,reason,access_ended_at,retrieve_until,online_delete_by,head_seq,min_retained_seq,key_epoch,roster_version,checkpoint_version,profile_verified,boundary_verified,seed_required)
 select 'development',subject_id,${q(f.workspace)},${q(f.generation)},'retained','ordinary_expiry','2030-01-01T00:00:00.123456Z','2030-01-31T00:00:00.123456Z','2030-02-07T00:00:00.123456Z',1,0,1,1,1,true,true,false
 from service_private.account_lifecycle where environment='development' and user_id=${q(f.user)};`}

/** Populates every D1 ownership family before re-keying, without a reserve/provider call. */
export function populatedD1FixtureSql(f){
 const tag=f.user.replaceAll('-',''),customer=`cus_D2${tag}`,subscription=`sub_D2${tag}`,invoice=`in_D2${tag}`
 const continuation={version:1,id:f.request,locale:'en',transport:'loopback',port:43123}
 return retrievalControlSql(f,1)+`
insert into public.billing_accounts(environment,user_id,test_now,paid_ever) values('development',${q(f.user)},'2030-01-02T00:00:00.123456Z',true);
insert into public.billing_customers(environment,user_id,customer_id) values('development',${q(f.user)},${q(customer)});
insert into public.billing_subscriptions(environment,user_id,subscription_id,customer_id,status,price_id,period_start,period_end,cancel_at_period_end,verified_at)
 select 'development',${q(f.user)},${q(subscription)},${q(customer)},'canceled',monthly_price,'2029-12-01T00:00:00Z','2030-01-01T00:00:00Z',true,clock_timestamp() from public.billing_sources where environment='development' and source='stripe';
insert into public.billing_transactions(environment,invoice_id,user_id,subscription_id,price_id,starts_at,ends_at,paid_at,amount_cents,refunded_cents,disposition,rc_verified,verified_at,financial_at)
 select 'development',${q(invoice)},${q(f.user)},${q(subscription)},price_id,period_start,period_end,period_start,899,0,'paid',true,clock_timestamp(),period_start from public.billing_subscriptions where environment='development' and subscription_id=${q(subscription)};
insert into public.billing_grace(environment,invoice_id,user_id,subscription_id,starts_at,ends_at,active)
 values('development',${q(invoice+'Grace')},${q(f.user)},${q(subscription)},'2029-12-29T00:00:00Z','2030-01-01T00:00:00Z',false);
insert into public.billing_operations(environment,user_id,request_id,action,cycle,status,provider_id,result,created_at)
 values('development',${q(f.user)},${q(f.request)},'checkout','monthly','pending',${q(`cs_test_D2${tag}`)},'{"fixture":true,"outcome":"unknown"}','2030-01-02T00:00:00.123456Z');
insert into public.billing_compensations(environment,user_id,invoice_id,reason) values('development',${q(f.user)},${q(invoice)},'refund');
insert into public.billing_inbox(environment,provider,event_id,event_type,user_id,object_id,occurred_at,status)
 values('development','stripe',${q(`evt_D2${tag}`)},'invoice.paid',${q(f.user)},${q(invoice)},clock_timestamp(),'pending');
insert into service_private.continuations(environment,user_id,request_id,session_id,continuation,created_at,expires_at)
 values('development',${q(f.user)},${q(f.request)},${q(f.session)},${json(continuation)},'2030-01-02T00:00:00.123456Z','2030-01-03T00:00:00.123456Z');
insert into service_private.operation_aliases(environment,user_id,request_id,action,cycle,continuation,canonical_request_id)
 values('development',${q(f.user)},${q(f.otherSession)},'checkout','monthly',${json({...continuation,id:f.otherSession,port:43124})},${q(f.request)});
insert into public.ai_actions(user_id,action_id,capability,environment,eligibility,status,model,rate_version,reserved_micro,charged_micro,provider_request_id,failure)
 values(${q(f.user)},${q(f.request)},'evaluate','development','authenticated','unknown','typesafe/jev-1.14','openrouter-2026-10-23-v1',500000,500000,${q(`D2Rollback${tag}`)},'outcome_unknown');
insert into public.ai_protection(user_id,blocked,reason) values(${q(f.user)},true,'manual_review');
insert into public.ai_limit_events(user_id,action_id,environment,reason) values(${q(f.user)},${q(f.request)},'development','account_budget');
do $populated$ begin if (select count(*) from public.billing_transactions where environment='development' and user_id=${q(f.user)})<>1 then raise exception 'populated_fixture_missing';end if;end $populated$;`
}
