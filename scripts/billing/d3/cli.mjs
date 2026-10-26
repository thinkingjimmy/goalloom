/**
 * [INPUT]: Explicit current-D2 profile, finite A–F stages, B initial-period or replacement A initial-switch selector.
 * [OUTPUT]: Credential-free plans, validated stage sequences or lease-checked dispatch before remote imports.
 * [POS]: Shared provider/grace entry boundary; legacy D0 mutation modes are historical.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const stages={
 A:['setup','renew','switch','transition','refund','cancel','expire','cleanup'],
 B:['setup','cancel','resume','renew','switch','transition','cleanup'],
 C:['setup','fail','grace','recover','after-cutoff','cleanup'],
 D:['setup','fail','grace','cutoff','cleanup'],
 E:['setup','dispute','resolve','cleanup'],
 F:['setup','dispute','resolve','cleanup'],
}
export const initialPeriodStages=['setup','partial-refund','cancel','expire','cleanup']
export const initialSwitchStages=['setup','switch','transition','refund','cancel','expire','cleanup']
export function stageSequence(profile){
 if(profile.initialPeriod!==undefined&&typeof profile.initialPeriod!=='boolean')throw Error('Invalid initial-period selector')
 if(profile.initialSwitch!==undefined&&typeof profile.initialSwitch!=='boolean')throw Error('Invalid initial-switch selector')
 if(profile.initialPeriod&&profile.initialSwitch)throw Error('Choose one explicit fixture branch')
 if(profile.initialPeriod&&profile.journey!=='B')throw Error('Initial-period branch belongs to planned B only')
 if(profile.initialSwitch&&profile.journey!=='A')throw Error('Initial-switch branch belongs to replacement A only')
 const sequence=profile.initialPeriod?initialPeriodStages:profile.initialSwitch?initialSwitchStages:stages[profile.journey]
 if(!sequence)throw Error('Invalid current-D2 journey')
 return sequence
}
export function parseProfile(args,family){
 const allowed=family==='grace'?['C','D']:['A','B','E','F']
 if(!args.length)return{profile:'current-d2',mode:'plan',journeys:allowed}
 if(args[0]!=='--current-d2')throw Error('Use --current-d2; legacy D0 mutation modes are historical')
 const options=new Map()
 for(let index=1;index<args.length;index++){
  const flag=args[index]
  if(!['--plan','--initial-period','--initial-switch','--stage','--journal','--lease','--output'].includes(flag)||options.has(flag))throw Error('Invalid current-D2 option')
  if(['--plan','--initial-period','--initial-switch'].includes(flag))options.set(flag,true)
  else{const value=args[++index];if(!value||value.startsWith('--'))throw Error('Missing current-D2 option value');options.set(flag,value)}
 }
 const initialPeriod=options.has('--initial-period'),initialSwitch=options.has('--initial-switch')
 if(initialPeriod&&initialSwitch)throw Error('Choose one explicit fixture branch')
 if((initialPeriod||initialSwitch)&&family!=='provider')throw Error('Explicit initial branch belongs to provider acceptance only')
 if(!options.size||options.has('--plan')||options.size===1&&(initialPeriod||initialSwitch)){
  if([...options.keys()].some(key=>!['--plan','--initial-period','--initial-switch'].includes(key)))throw Error('Planning does not accept execution options')
  return{profile:'current-d2',mode:'plan',journeys:initialPeriod?['B']:initialSwitch?['A']:allowed,initialPeriod,initialSwitch}
 }
 const [journey,stage,extra]=String(options.get('--stage')??'').split(':')
 if(extra||!allowed.includes(journey)||!stageSequence({journey,initialPeriod,initialSwitch}).includes(stage))throw Error('Invalid current-D2 journey or stage')
 if(!options.get('--journal')||!options.get('--lease'))throw Error('Explicit private journal and development lease required')
 return{profile:'current-d2',mode:'stage',journey,stage,initialPeriod,initialSwitch,journal:options.get('--journal'),lease:options.get('--lease'),output:options.get('--output')??'output/tests/billing/desktop/d3-provider'}
}
export function requireWindow(lease){
 if(process.env.D3_BILLING_WINDOW!=='development'||!lease||process.env.D3_BILLING_LEASE!==lease)throw Error('Exact active D3 development window required')
}
export async function runCurrentD2Cli(args,{family}){
 try{
  const profile=parseProfile(args,family)
  if(profile.mode==='plan'){
   console.log(JSON.stringify({...profile,remoteExecuted:false,identities:6,testClocks:4,ordinaryCustomers:2,sequential:true,stages:Object.fromEntries(profile.journeys.map(name=>[name,stageSequence({...profile,journey:name})]))},null,2))
   return
  }
  requireWindow(profile.lease)
  const {executeStage}=await import('./execute.mjs')
  console.log(JSON.stringify(await executeStage(profile),null,2))
 }catch(error){console.error(JSON.stringify({ok:false,error:error instanceof Error?error.message:'d3_acceptance_incomplete',...(error?.requestDiagnostic?{request:error.requestDiagnostic}:{})}));process.exitCode=1}
}
