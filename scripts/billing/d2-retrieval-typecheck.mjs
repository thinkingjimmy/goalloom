/**
 * [INPUT]: Isolated retrieval TypeScript and the repository compiler.
 * [OUTPUT]: Strict source-only typecheck evidence without changing shared compiler configuration.
 * [POS]: D2 local validation command; no remote calls or desktop test expansion.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
const output = resolve('output/tests/billing/desktop/d2-retrieval')
await mkdir(output, { recursive: true })
await writeFile(`${output}/runtime.d.ts`, 'declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Promise<Response>): void };\n')
await writeFile(`${output}/tsconfig.json`, JSON.stringify({ compilerOptions: { strict: true, noEmit: true,
  target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', allowImportingTsExtensions: true,
  skipLibCheck: true, esModuleInterop: true, types: ['node'], lib: ['ES2023', 'DOM', 'DOM.Iterable'],
  paths: { '@goalloom/contracts': [resolve('packages/contracts/src/index.ts')], '@goalloom/crypto': [resolve('packages/crypto/src/index.ts')],
    '@goalloom/sync': [resolve('packages/sync/src/index.ts')] },
}, files: [resolve('supabase/functions/retained-retrieval/index.ts'), resolve('scripts/billing/d2-retrieval-fixture.ts'),
  resolve('scripts/billing/d2-retrieval-client-interop.ts'), `${output}/runtime.d.ts`] }, null, 2))
const result = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', `${output}/tsconfig.json`], { encoding: 'utf8' })
await writeFile(`${output}/typecheck.txt`, result.stdout + result.stderr)
console.log(result.stdout + result.stderr || 'Retrieval strict typecheck passed')
process.exitCode = result.status ?? 1
