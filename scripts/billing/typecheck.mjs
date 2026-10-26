/**
 * [INPUT]: Billing TypeScript, repository compiler and pinned temporary Stripe runtime.
 * [OUTPUT]: Strict backend-only type check; desktop scope is unchanged.
 * [POS]: D0 validation command without a dependency or root-config mutation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { spawnSync } from 'node:child_process'
import { stripePath } from './build.mjs'
const d1 = process.argv.includes('--d1')
const output = resolve(d1 ? 'output/tests/billing/desktop/d1-backend' : 'output/tests/billing/desktop')
await mkdir(output, { recursive: true })
await writeFile(`${output}/runtime.d.ts`, 'declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };\n')
await writeFile(`${output}/tsconfig.json`, JSON.stringify({ compilerOptions: {
  strict: true, noEmit: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', allowImportingTsExtensions: true,
  skipLibCheck: true, esModuleInterop: true, types: ['node'], lib: ['ES2023','DOM','DOM.Iterable'],
  paths: { stripe: [resolve(dirname(stripePath), 'stripe.cjs.node.d.ts')] },
}, files: [...(d1 ? ['supabase/functions/billing/index.ts','supabase/functions/hosted-ai/index.ts','supabase/functions/snapshot-url/index.ts','scripts/billing/d1-fixture-cleanup.ts'] : ['supabase/functions/billing/index.ts']).map(file=>resolve(file)), `${output}/runtime.d.ts`] }, null, 2))
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', `${output}/tsconfig.json`], { encoding: 'utf8' })
await writeFile(`${output}/typecheck.txt`, result.stdout + result.stderr)
console.log(result.stdout + result.stderr || 'Billing strict typecheck passed')
process.exitCode = result.status ?? 1
