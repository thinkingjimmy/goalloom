/**
 * [INPUT]: Explicit operator billing authorization and a provider key from the environment.
 * [OUTPUT]: A skipped record without authorization, or bounded live comparison artifacts.
 * [POS]: Offline-by-default quality runner; never reads real tasks or prints credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import electron from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const output = resolve('output/eval/assistance')
await mkdir(output, { recursive: true })
const dataset = JSON.parse(await readFile('scripts/eval/assistance/samples.json', 'utf8'))
if (dataset.samples.length < 60 || dataset.samples.filter(value => value.locale !== 'zh').length < 15) throw Error('Evaluation sample coverage is incomplete')
if (process.env.GOALLOOM_ASSISTANCE_EVAL_AUTHORIZED !== '1') {
  const report = { status: 'skipped', reason: 'Explicit live-provider and billing authorization is required', sampleVersion: dataset.version, samples: dataset.samples.length, nonChineseOutputCases: dataset.samples.filter(value => value.locale !== 'zh').length, calls: 0, manualQualityAcceptance: 'unverified' }
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report)); process.exit(0)
}
await build({ entryPoints: ['scripts/eval/assistance/live.ts'], outfile: `${output}/live.mjs`, bundle: true, platform: 'node', format: 'esm', external: ['node:*', 'electron'] })
await new Promise((resolve, reject) => {
  const child = spawn(electron, [`${output}/live.mjs`], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: 'inherit' })
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(Error(`Evaluation exited ${code}`)))
})
