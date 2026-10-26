/**
 * [INPUT]: Explicit local --out/--verify directory and optional metadata-only JSON binding file.
 * [OUTPUT]: A new deterministic package/checklist pair or finite local verification result.
 * [POS]: BILL-29 offline entry. It never imports a provider/deployment client, dotenv loader or remote runner.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import {readFile,writeFile,mkdir,lstat,realpath} from 'node:fs/promises'
import {resolve,dirname,basename} from 'node:path'
const root=resolve(new URL('../../../',import.meta.url).pathname),base=resolve(root,'output/tests/billing/desktop/bill29-config')
const finite=new Set(['invalid_arguments','invalid_output_directory','invalid_binding_file','invalid_declared_bindings','output_exists','package_mismatch','pinned_stripe_sdk_required','edge_mode_contract_changed','migration_set_incomplete','invalid_saved_observation','saved_observation_contract_changed'])
try{
 const args=process.argv.slice(2);if(args.length===1&&args[0]==='--help'){console.log('Offline production package: [--out directory | --verify directory] [--bindings metadata.json]. No apply or remote actions.');process.exit(0)}
 let out=resolve(base,'package-v3'),verify=false,bindings=null;const seen=new Set()
 for(let i=0;i<args.length;i+=2){const flag=args[i],value=args[i+1];if(!['--out','--verify','--bindings'].includes(flag)||!value||value.startsWith('--')||seen.has(flag))throw Error('invalid_arguments');seen.add(flag);if(flag==='--bindings')bindings=resolve(value);else{out=resolve(value);verify=flag==='--verify'}}
 if(seen.has('--out')&&seen.has('--verify'))throw Error('invalid_arguments')
 if(dirname(out)!==base||!/^[-A-Za-z0-9_.]+$/.test(basename(out))||['.','..'].includes(basename(out)))throw Error('invalid_output_directory')
 let input=null;if(bindings){const info=await lstat(bindings);if(!info.isFile()||info.isSymbolicLink()||info.size>65536||!bindings.endsWith('.json'))throw Error('invalid_binding_file');try{input=JSON.parse(await readFile(bindings,'utf8'))}catch{throw Error('invalid_binding_file')}}
 // A child-local build helper must not select a binary or runtime from deployment environment variables.
 delete process.env.ESBUILD_BINARY_PATH
 const {compose,json,checklist}=await import('./package.mjs'),doc=await compose(input),contents=json(doc),markdown=checklist(doc)
 if(verify){
  const info=await lstat(out);if(!info.isDirectory()||info.isSymbolicLink()||await realpath(out)!==out)throw Error('invalid_output_directory')
  for(const [name,expected] of [['package.json',contents],['checklist.md',markdown]]){const file=resolve(out,name),stat=await lstat(file);if(!stat.isFile()||stat.isSymbolicLink()||await readFile(file,'utf8')!==expected)throw Error('package_mismatch')}
 }else{
  await mkdir(base,{recursive:true});if(await realpath(base)!==base)throw Error('invalid_output_directory')
  try{await mkdir(out,{mode:0o700})}catch(error){if(error.code==='EEXIST')throw Error('output_exists');throw error}
  await writeFile(resolve(out,'package.json'),contents,{mode:0o600,flag:'wx'});await writeFile(resolve(out,'checklist.md'),markdown,{mode:0o600,flag:'wx'})
 }
 console.log(JSON.stringify({ok:true,mode:verify?'verify':'generate',schemaVersion:1,declaredBindingsComplete:doc.readiness.declaredBindingsComplete,deploymentReady:false,launchReady:false,blockers:doc.readiness.blockers.length,migrations:doc.installation.migrations.length,edges:doc.installation.edges.length,remoteRequests:0,credentialReads:0}))
}catch(error){console.log(JSON.stringify({ok:false,error:finite.has(error.message)?error.message:'offline_package_failed',remoteRequests:0,credentialReads:0}));process.exitCode=1}
