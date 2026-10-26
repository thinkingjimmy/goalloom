/**
 * [INPUT]: Authoritative checkpoint with Backend-verified retained-target ownership and the original Auth session return.
 * [OUTPUT]: Exact native input with optional retained-target fields or unchanged original-session adoption.
 * [POS]: D3 Backend/Desktop handoff. No Auth request, refresh, provider mutation or new session.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {pathToFileURL} from 'node:url'
import {resolve} from 'node:path'
import {loadPrivate,savePrivate} from '../../lifecycle/fixture-support.mjs'

const claims=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url'))
export function nativeInput(ctx,profile,observation,outputDirectory){
 const state=observation.publicState
 const sub=state.subscriptions.find(row=>row.cycle!==null&&!['canceled','incomplete_expired'].includes(row.status))??null
 return{journeyId:`D3_${ctx.journal.runId}_${profile.journey}`,scenarioId:`${profile.journey}_${profile.stage}`,sessionPath:ctx.privatePath,
  ownerId:ctx.fixture.ownerId,apiOrigin:ctx.apiOrigin,anonKey:ctx.lifecycle.anon,outputDirectory:resolve(outputDirectory),
  expected:Object.fromEntries(['status','eligible','grace','effectiveEnd'].map(key=>[key,state[key]])),
  expectedPeriod:sub?Object.fromEntries(['status','cycle','nextCycle','endsAt','cancelAtPeriodEnd'].map(key=>[key,sub[key]])):null,
  ...(observation.retainedTarget===undefined?{}:{retainedTarget:Object.fromEntries(['workspaceId','generation','retrieveUntil','retrievalWindowOpen'].map(key=>[key,observation.retainedTarget[key]]))}),
 }
}
export async function adoptNativeSession({fixture,journal,save},sessionPath){
 const document=await loadPrivate(resolve(sessionPath)),next=document.session??document
 assert(typeof next.access_token==='string'&&typeof next.refresh_token==='string')
 const before=claims(fixture.sessions[0].access_token),after=claims(next.access_token)
 assert.equal(after.iss,'https://asqyvcnxdltzzfutbbqy.supabase.co/auth/v1')
 assert.equal(after.role,'authenticated');assert.equal(after.sub,fixture.ownerId);assert.equal(after.session_id,before.session_id)
 assert.equal(before.sub,fixture.ownerId);assert(typeof after.exp==='number'&&after.exp>=before.exp)
 Object.assign(fixture.sessions[0],{access_token:next.access_token,refresh_token:next.refresh_token,sessionId:after.session_id})
 if(journal){journal.nativeReturns??=[];journal.nativeReturns.push({at:new Date().toISOString(),sessionPath:resolve(sessionPath),checkpoint:journal.nativePending??null});delete journal.nativePending}
 await save()
 return{originalOwnerPreserved:true,originalSessionPreserved:true,latestSessionSaved:true}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{
  assert(process.argv[2]==='--adopt'&&process.argv.length===5,'Use --adopt <original-fixture-journal> <session-result>')
  const path=resolve(process.argv[3]),journal=await loadPrivate(path)
  assert(journal.profile==='d3-current-d2'&&journal.project==='asqyvcnxdltzzfutbbqy'&&journal.fixtures.length===1)
  const result=await adoptNativeSession({fixture:journal.fixtures[0],journal,save:()=>savePrivate(path,journal)},process.argv[4])
  console.log(JSON.stringify({ok:true,...result}))
 }catch{console.error(JSON.stringify({ok:false,error:'d3_native_session_return_invalid'}));process.exitCode=1}
}
