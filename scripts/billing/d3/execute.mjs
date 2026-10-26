/**
 * [INPUT]: Validated D3 stage/branch, explicit development lease and an owned fixture context opener.
 * [OUTPUT]: One immutable attempt including context-open failures and cached RC diagnostics; unknown outcomes remain unpassed.
 * [POS]: D3 sequential orchestration. The planned B initial-period branch is independent of the A renewal pilot.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import {mkdir,writeFile} from 'node:fs/promises'
import {resolve} from 'node:path'
import {randomUUID} from 'node:crypto'
import {requireWindow,stageSequence} from './cli.mjs'
import {runJourneyStage} from './journeys.mjs'
import {nativeInput,adoptNativeSession} from './native.mjs'
import {fixtureErrorDetails} from '../../lifecycle/fixture-http.mjs'

export async function executeStage(profile,{openContext,observe}={}){
 requireWindow(profile.lease)
 const sequence=stageSequence(profile)
 assert(sequence.includes(profile.stage),'Invalid current-D2 journey or stage')
 const attempt=randomUUID(),startedAt=new Date().toISOString()
 const output=resolve(profile.output,`${profile.journey}-${profile.stage}-${attempt}.json`)
 const report={ok:false,profile:'current-d2',journey:profile.journey,stage:profile.stage,initialPeriod:profile.initialPeriod===true,initialSwitch:profile.initialSwitch===true,attempt,startedAt,phase:'context_open',scope:'Actual development Auth/backend/Stripe Test/RevenueCat observations; native evidence is separate.'}
 let ctx
 if(profile.directFixtureCleanup)report.cleanupMethod='direct-fixture'
 try{
  const open=openContext??(await import('./context.mjs')).openPilotContext
  ctx=await open(profile);report.phase=profile.stage==='cleanup'?'cleanup':'stage'
  assert.equal(ctx.fixture.journey,profile.journey)
  assert.equal(ctx.journal.initialPeriod===true,profile.initialPeriod===true,'Original fixture branch cannot change')
  assert.equal(ctx.journal.initialSwitch===true,profile.initialSwitch===true,'Original replacement branch cannot change')
  const previous=sequence.slice(0,sequence.indexOf(profile.stage))
  ctx.fixture.d3.completed??={}
  if(profile.stage!=='cleanup'){
   assert(previous.every(stage=>ctx.fixture.d3.completed[stage]),'Complete the preceding original stages first')
   if(ctx.fixture.d3.completed[profile.stage])throw Error('Original D3 stage already completed; read its existing report')
   if(!profile.initialPeriod&&(!['A','E','F'].includes(profile.journey)||profile.journey==='A'&&!['setup','renew'].includes(profile.stage))){
    assert(ctx.journal.pilot?.recognized===true,'Actual A renewal invoice and RevenueCat period recognition pilot required')
   }
   report.result=await runJourneyStage(ctx,profile.journey,profile.stage)
   report.observation=await ctx.checkpoint()
   if(profile.journey==='A'&&profile.stage==='renew'){
    assert(report.observation.rcPeriodMatches===true&&report.observation.invoice===report.result.invoice,'Exact pilot invoice and RC period required')
    ctx.journal.pilot={recognized:true,invoice:report.result.invoice,report:output,at:new Date().toISOString()}
   }
   const input=nativeInput(ctx,profile,report.observation,resolve(profile.output,`native-${profile.journey}-${profile.stage}-${attempt}`))
   report.nativeInput=resolve(profile.output,`.native-${profile.journey}-${profile.stage}-${attempt}.json`)
   await writeFile(report.nativeInput,JSON.stringify(input)+'\n',{flag:'wx',mode:0o600})
   if(observe||profile.stage==='setup'&&(profile.journey==='A'||profile.initialPeriod)){
    ctx.journal.nativePending={input:report.nativeInput,journey:profile.journey,stage:profile.stage,at:new Date().toISOString()};await ctx.save()
   }
   if(observe){
    report.phase='native'
    report.native=await observe(input)
    if(report.native.sessionPath)report.nativeSession=await adoptNativeSession(ctx,report.native.sessionPath)
    assert(report.native.ok===true&&report.nativeSession?.latestSessionSaved===true,'Native observation or latest-session return is incomplete')
   }
   ctx.fixture.d3.completed[profile.stage]={report:output,at:new Date().toISOString()};await ctx.save()
  }else{
   const {cleanupD3Fixture}=await import('../../lifecycle/provider-fixture.mjs')
   const graph=ctx.fixture.provider.customer?await ctx.captureGraph():undefined
   report.cleanup=await cleanupD3Fixture({ctx:ctx.lifecycle,fixture:ctx.fixture,stripe:ctx.stripe,graph,persist:()=>ctx.save()})
   assert(report.cleanup?.allScopedRowsAbsent===true&&report.cleanup.allScopedStorageAbsent===true&&report.cleanup.allAuthIndependentlyAbsent===true,'D3 cleanup remains unverified')
   ctx.fixture.d3.cleanupVerified=true;await ctx.save()
  }
  report.ok=true
  report.phase='complete'
 }catch(error){
  const details=fixtureErrorDetails(error)
  report.error={code:ctx&&error instanceof Error&&/^d3_pending:[a-z_]+$/.test(error.message)?error.message:'d3_stage_incomplete',type:details?.name??'unknown',cause:details}
  if(ctx&&error?.name==='AssertionError')report.error.assertion=error.message.slice(0,1000)
  if(ctx&&typeof error?.code==='string'&&/^[A-Za-z0-9_]+$/.test(error.code))report.error.providerCode=error.code
  if(ctx&&Number.isInteger(error?.statusCode)&&error.statusCode>=100&&error.statusCode<=599)report.error.providerStatus=error.statusCode
  if(ctx&&typeof error?.message==='string'&&/^[a-z][a-z0-9_]{0,119}$/.test(error.message))report.error.reason=error.message
  if(error?.requestDiagnostic)report.error.request=error.requestDiagnostic
  if(ctx&&profile.journey==='A'&&profile.stage==='renew'){
   const stripePending=['d3_pending:clock_advancing','d3_pending:automatic_invoice_creation','d3_pending:automatic_invoice_finalization','d3_pending:automatic_invoice_payment'].includes(report.error.code)
   ctx.journal.pilot={recognized:false,status:stripePending?'stripe_pending':'unverified',report:output,at:new Date().toISOString(),reason:report.error.code};await ctx.save()
  }
  process.exitCode=1
 }finally{
  if(typeof ctx?.recognitionDiagnostic==='function'){
   try{
    const diagnostic=ctx.recognitionDiagnostic()
    if(diagnostic!==null&&diagnostic!==undefined)report.recognitionDiagnostic=diagnostic
   }catch(error){report.recognitionDiagnostic={ok:false,reason:'cached_diagnostic_unavailable',errorType:fixtureErrorDetails(error)?.name??'unknown'}}
  }
  report.finishedAt=new Date().toISOString()
  await mkdir(resolve(profile.output),{recursive:true})
  await writeFile(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600})
  await ctx?.close?.()
 }
 return{...report,evidence:output}
}
