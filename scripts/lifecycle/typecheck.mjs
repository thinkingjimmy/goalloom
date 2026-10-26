/**
 * [INPUT]: Owned D2 backend source and the repository TypeScript compiler.
 * [OUTPUT]: Strict source-only diagnostics under ignored lifecycle evidence.
 * [POS]: Local validation; no credential load, network or runtime activation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { stripePath } from '../billing/build.mjs'
const output=resolve('output/tests/billing/desktop/d2-lifecycle')
await mkdir(output,{recursive:true})
await writeFile(`${output}/runtime.d.ts`,'declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };\n')
await writeFile(`${output}/tsconfig.json`,JSON.stringify({compilerOptions:{strict:true,noEmit:true,target:'ES2022',module:'ESNext',moduleResolution:'Bundler',allowImportingTsExtensions:true,skipLibCheck:true,types:['node'],lib:['ES2023','DOM','DOM.Iterable'],paths:{stripe:[resolve(dirname(stripePath),'stripe.cjs.node.d.ts')]}},files:[
 'supabase/functions/lifecycle/index.ts','supabase/functions/lifecycle/restore.ts','supabase/functions/deletion-receipt/index.ts',
].map(file=>resolve(file)).concat(`${output}/runtime.d.ts`)},null,2))
const run=spawnSync(process.execPath,['node_modules/typescript/bin/tsc','-p',`${output}/tsconfig.json`],{encoding:'utf8'})
await writeFile(`${output}/typecheck.txt`,run.stdout+run.stderr)
console.log(run.stdout+run.stderr||'Lifecycle strict source typecheck passed')
process.exitCode=run.status??1
