/**
 * [INPUT]: Local repository source, saved read-only production observation and pinned Stripe22.6.0/esbuild.
 * [OUTPUT]: Ordered migration/source/dependency fingerprints and observed metadata without credentials.
 * [POS]: Static inventory for the offline production package; bundles are built in memory, never executed.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {readFile,readdir,realpath} from 'node:fs/promises'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {resolve,relative,dirname} from 'node:path'
export const ROOT=resolve(new URL('../../../',import.meta.url).pathname)
export const sha=value=>createHash('sha256').update(value).digest('hex')
export const OBSERVATION='output/tests/billing/desktop/bill29-readiness-2026-10-25/production-readback-host.json'
const read=path=>readFile(resolve(ROOT,path))
export async function inventory(){
 const {build,version}=await import('esbuild'),require=createRequire('/private/tmp/goalloom-billing-runtime/package.json'),stripePath=require.resolve('stripe'),sdkRoot=resolve(dirname(stripePath),'..'),sdk=JSON.parse(await readFile(resolve(sdkRoot,'package.json'),'utf8'))
 if(sdk.name!=='stripe'||sdk.version!=='22.6.0')throw Error('pinned_stripe_sdk_required')
 const state=await read('scripts/billing/d2-deploy-state.mjs'),modes=[...state.toString().matchAll(/\{slug:'([^']+)',verifyJwt:(true|false),authentication:'([^']+)'\}/g)].map(([,slug,jwt])=>({slug,verifyJwt:jwt==='true'}))
 if(modes.map(x=>x.slug).join(',')!=='billing,hosted-ai,snapshot-url,lifecycle,deletion-receipt,retained-retrieval')throw Error('edge_mode_contract_changed')
 const migrations=[];for(const file of (await readdir(resolve(ROOT,'supabase/migrations'))).filter(x=>/^00(?:1[4-9]|2[0-9]|3[0-2])_.*\.sql$/.test(x)).sort()){const path='supabase/migrations/'+file;migrations.push({version:file.slice(0,4),path,sha256:sha(await read(path))})}
 if(migrations.length!==19||migrations.some((x,i)=>Number(x.version)!==14+i))throw Error('migration_set_incomplete')
 const dependency=async path=>{
  const absolute=await realpath(resolve(ROOT,path)),bytes=await readFile(absolute)
  if(absolute.startsWith(ROOT+'/')&&!absolute.includes('/node_modules/'))return{path:relative(ROOT,absolute),sha256:sha(bytes)}
  let cursor=dirname(absolute);for(let depth=0;depth<15;depth++){
   try{const pkg=JSON.parse(await readFile(resolve(cursor,'package.json'),'utf8'));if(pkg.name&&pkg.version)return{path:`dependency/${pkg.name}@${pkg.version}/${relative(cursor,absolute)}`,sha256:sha(bytes)}}catch(error){if(error.code!=='ENOENT'&&!(error instanceof SyntaxError))throw error}
   const parent=dirname(cursor);if(parent===cursor)break;cursor=parent
  }throw Error('dependency_identity_missing')
 }
 const edges=[];for(const mode of modes){const entry=`supabase/functions/${mode.slug}/index.ts`,result=await build({absWorkingDir:ROOT,entryPoints:[entry],bundle:true,write:false,metafile:true,format:'esm',platform:'node',target:'es2022',alias:{stripe:resolve(dirname(stripePath),'../esm/stripe.esm.worker.js')},external:['node:*'],logLevel:'silent'}),dependencies=await Promise.all(Object.keys(result.metafile.inputs).map(dependency));dependencies.sort((a,b)=>a.path.localeCompare(b.path,'en'));if(new Set(dependencies.map(d=>d.path)).size!==dependencies.length)throw Error('duplicate_dependency_identity');edges.push({...mode,entry,entrySha256:sha(await read(entry)),bundleSha256:sha(result.outputFiles[0].contents),bundleBytes:result.outputFiles[0].contents.length,dependencies})}
 const providerFiles=['supabase/functions/billing/providers.ts','supabase/functions/billing/service.ts','supabase/functions/billing/handler.ts'],calls=new Map()
 for(const path of providerFiles){const source=(await read(path)).toString();for(const [,call] of source.matchAll(/stripe\.([A-Za-z]+(?:\.[A-Za-z]+)+)\(/g)){const method=call.split('.').at(-1),access=['retrieve','list','search','listLineItems'].includes(method)?'read':['create','update','cancel','release','expire','voidInvoice','del'].includes(method)?'write':null;if(!access)throw Error('provider_call_contract_changed');const entry=calls.get(call)??{sdkCall:call,access,sourcePaths:[]};if(!entry.sourcePaths.includes(path))entry.sourcePaths.push(path);calls.set(call,entry)}}
 const handler=(await read('supabase/functions/billing/handler.ts')).toString(),notification=(await read('scripts/billing/prepare-notifications.mjs')).toString()
 const literalList=value=>[...value.matchAll(/'([^']+)'/g)].map(([,v])=>v)
 const stripeEvents=literalList(handler.match(/const stripeTypes = new Set\(\[([\s\S]*?)\]\)/)?.[1]??'')
 const rcStripeEvents=literalList(notification.match(/name:'stripeToRc'[\s\S]*?events:\[([^\]]+)\]/)?.[1]??'')
 const {STRIPE_EVENTS,RC_STRIPE_EVENTS}=await import('./policy.mjs')
 if(JSON.stringify(stripeEvents)!==JSON.stringify(STRIPE_EVENTS)||JSON.stringify(rcStripeEvents)!==JSON.stringify(RC_STRIPE_EVENTS))throw Error('webhook_event_contract_changed')
 const credentialCallCoverage=[...calls.values()].sort((a,b)=>a.sdkCall.localeCompare(b.sdkCall,'en'))
 const extra=['supabase/functions/lifecycle/restore.ts','scripts/billing/d2-deploy-state.mjs','scripts/billing/build.mjs','scripts/billing/prepare-notifications.mjs','package.json','pnpm-lock.yaml',...['cli','package','policy','bindings','inventory'].map(name=>'scripts/billing/production/'+name+'.mjs')];const contracts=await Promise.all(extra.map(async path=>({path,sha256:sha(await read(path))})))
 const observedBytes=await read(OBSERVATION),observed=JSON.parse(observedBytes),r=observed.results
 if(observed.project!=='keqprrgvcefqdwnxaafv'||!r.catalog.ok||!r.functions.ok||!r.secretNames.ok||!r.project.ok)throw Error('invalid_saved_observation')
 const rows=r.catalog.data;if(rows.length!==1||rows[0].migration_versions.join(',')!==Array.from({length:13},(_,i)=>String(i+1).padStart(4,'0')).join(','))throw Error('saved_observation_contract_changed')
 return{credentialCallCoverage,webhookEventAudit:{stripeHandlerMatches:true,stripeToRevenueCatReferenceMatches:true,revenueCatTypeAllowlist:false},build:{esbuild:version,stripe:sdk.version,apiVersion:'2026-08-26.dahlia',format:'esm',platform:'node',target:'es2022',bundlesExecuted:false},migrations,edges,contracts,observation:{source:OBSERVATION,sha256:sha(observedBytes),observedAt:observed.observedAt??observed.at??observed.timestamp??null,refreshedByThisCommand:false,project:r.project.data,migrationVersions:rows[0].migration_versions,edges:r.functions.data,configuredNames:r.secretNames.data,jobs:rows[0].jobs}}
}
