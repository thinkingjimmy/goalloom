/**
 * Failure cases: incomplete credentials; upload failure, timeout or missing ID;
 * Apple rejection, pending review or unavailable status; failed staple/validation;
 * duplicate submissions; secrets in diagnostics; ZIP creation before app stapling.
 * Runs the real notarization CLI/hook with synthetic Apple command responses.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import yaml from 'js-yaml'

const evidence = resolve('output/tests/notarization-fixture')
await mkdir(evidence, { recursive: true })
if (process.platform === 'win32') {
  await writeFile(join(evidence, 'report.json'), JSON.stringify({ scope: 'macOS-only tool fixture', skipped: 'POSIX command shims require macOS or Linux' }, null, 2))
  console.log('Skipped macOS notarization command fixture on Windows.')
  process.exit(0)
}
const fixture = await mkdtemp(join(evidence, 'commands-'))
const script = resolve('scripts/build/notarize.mjs')
const config = yaml.load(await readFile('electron-builder.yml', 'utf8'))
assert.equal(config.mac.notarize, false, 'Only the bounded hook may notarize')
assert.equal(resolve(config.afterSign), script)
const checks = []
const id = '00112233-4455-6677-8899-aabbccddeeff'
const shim = String.raw`#!/usr/bin/env node
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
const tool = basename(process.argv[1]), args = process.argv.slice(2)
const action = tool === 'ditto' ? 'zip' : args[1], scenario = process.env.FIXTURE_SCENARIO
appendFileSync(process.env.FIXTURE_CALLS, JSON.stringify({tool, action, args}) + '\n')
const out = value => console.log(JSON.stringify(value))
const fail = message => { console.error(message); process.exit(1) }
const hang = () => setInterval(() => {}, 1000)
if (action === 'zip') {
  if (scenario === 'zip-failure') fail('ZIP creation failed')
  writeFileSync(args.at(-1), 'Synthetic notarization archive')
} else if (args[0] === 'notarytool') {
  if (args.includes('--team-id')) fail('API-key credentials must not receive a team ID')
  if (action === 'submit') {
    if (!args.includes('--no-wait') || args.includes('--wait')) fail('Upload must finish before waiting')
    if (scenario === 'upload-timeout') hang()
    else if (scenario === 'upload-failure') fail('Upload rejected: ' + process.env.APPLE_API_KEY_ID)
    else if (scenario === 'missing-id') out({status:'In Progress'})
    else out({id:'${id}', status:'In Progress'})
  } else if (action === 'wait') {
    const report = JSON.parse(readFileSync(join(process.env.GOALLOOM_NOTARIZE_EVIDENCE_DIR, process.env.FIXTURE_REPORT), 'utf8'))
    if (report.submissionId !== '${id}' || report.stage !== 'wait') fail('Submission ID was not persisted before waiting')
    if (!args.includes('--timeout')) fail('Processing requires a timeout')
    if (scenario === 'wait-timeout') hang()
    else if (['pending', 'status-unavailable', 'failed-status-accepted', 'recovered'].includes(scenario)) fail('Wait stopped: ' + process.env.APPLE_API_KEY_ID)
    else out({id:'${id}', status: scenario === 'rejected' ? 'Invalid' : 'Accepted'})
  } else if (action === 'info') {
    if (scenario === 'status-unavailable') fail('Status unavailable: ' + process.env.APPLE_API_ISSUER)
    out({id:'${id}', status: ['pending', 'wait-timeout'].includes(scenario) ? 'In Progress' : scenario === 'rejected' ? 'Invalid' : 'Accepted'})
    if (scenario === 'failed-status-accepted') process.exit(1)
  } else if (action === 'log') {
    if (['pending', 'wait-timeout', 'log-unavailable'].includes(scenario)) fail('Log not available')
    out({jobId:'${id}', status:scenario === 'rejected' ? 'Invalid' : 'Accepted', issues:[{message:'Synthetic diagnostic ' + process.env.APPLE_TEAM_ID}]})
  } else fail('Unexpected notarytool command')
} else if (args[0] === 'stapler') {
  if (scenario === action + '-failure') fail('Ticket ' + action + ' failed')
} else fail('Unexpected tool')
`

try {
  const bin = join(fixture, 'bin')
  await mkdir(bin)
  for (const command of ['xcrun', 'ditto']) await writeFile(join(bin, command), shim, { mode: 0o755 })
  const key = join(fixture, 'AuthKey.p8')
  await writeFile(key, 'Synthetic private key; not a credential')
  const hookDriver = join(fixture, 'hook.mjs')
  await writeFile(hookDriver, String.raw`
import { appendFileSync } from 'node:fs'
import { resolveFunction } from 'app-builder-lib/out/util/resolve.js'
const hook = await resolveFunction('module', ${JSON.stringify(config.afterSign)}, 'afterSign', ${JSON.stringify(resolve('../..'))})
await hook({appOutDir:process.env.FIXTURE_APP_DIR,electronPlatformName:process.env.FIXTURE_PLATFORM,packager:{appInfo:{productFilename:'Fixture'}}})
appendFileSync(process.env.FIXTURE_CALLS,JSON.stringify({action:'archives-created'})+'\n')
`)

  async function check(scenario, { app = false, platform = 'darwin', missing = false, optional = false, partial = false } = {}) {
    const root = join(evidence, scenario)
    await mkdir(root, { recursive: true })
    await rm(join(root, 'diagnostics'), { recursive: true, force: true })
    const target = join(root, app ? 'Fixture.app' : 'Fixture.dmg')
    if (app) await mkdir(target, { recursive: true })
    else await writeFile(target, 'Synthetic signed disk image')
    const callsPath = join(root, 'calls.jsonl')
    await writeFile(callsPath, '')
    const env = {
      ...process.env, PATH: `${bin}:${process.env.PATH}`,
      APPLE_API_KEY: missing ? '' : key,
      APPLE_API_KEY_ID: missing || partial ? '' : 'synthetic-secret-key-id',
      APPLE_API_ISSUER: missing ? '' : 'synthetic-secret-issuer',
      APPLE_TEAM_ID: 'synthetic-secret-team',
      APPLE_API_KEY_P8: '', CSC_LINK: '', CSC_KEY_PASSWORD: '',
      GOALLOOM_REQUIRE_NOTARIZATION: optional ? '' : '1',
      GOALLOOM_NOTARIZE_EVIDENCE_DIR: join(root, 'diagnostics'),
      GOALLOOM_NOTARIZE_UPLOAD_TIMEOUT_MS: '300',
      GOALLOOM_NOTARIZE_WAIT_TIMEOUT_MS: '300',
      GOALLOOM_NOTARIZE_COMMAND_TIMEOUT_MS: '3000',
      FIXTURE_SCENARIO: scenario, FIXTURE_CALLS: callsPath,
      FIXTURE_REPORT: app ? 'app.json' : 'dmg.json', FIXTURE_APP_DIR: root, FIXTURE_PLATFORM: platform,
    }
    const result = spawnSync(process.execPath, app ? [hookDriver] : [script, target], { env, encoding: 'utf8', timeout: 15_000 })
    assert.ifError(result.error)
    const output = result.stdout + result.stderr
    await writeFile(join(root, 'console.txt'), output)
    const calls = (await readFile(callsPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    const report = await readFile(join(root, 'diagnostics', env.FIXTURE_REPORT), 'utf8').then(text => JSON.parse(text)).catch(() => undefined)
    const skipped = platform !== 'darwin' || optional && missing
    const accepted = ['accepted-app', 'accepted-dmg', 'recovered', 'log-unavailable'].includes(scenario)
    assert.equal(result.status, accepted || skipped ? 0 : 1, output)
    assert(calls.filter(call => call.action === 'submit').length <= 1, 'Do not resubmit a pending upload')
    if (skipped) assert.equal(calls.filter(call => call.action !== 'archives-created').length, 0)
    else if (accepted) {
      assert.equal(report?.stage, 'complete', output)
      assert.equal(report.status, 'Accepted')
      assert.equal(report.ticket, 'validated')
      assert(calls.findIndex(call => call.action === 'wait') > calls.findIndex(call => call.action === 'submit'))
      assert(calls.findIndex(call => call.action === 'staple') > calls.findIndex(call => call.action === 'wait'))
      if (app) assert(calls.findIndex(call => call.action === 'archives-created') > calls.findIndex(call => call.action === 'validate'))
    } else {
      assert.notEqual(report?.stage, 'complete')
      assert(!calls.some(call => call.action === 'archives-created'))
      if (!['staple-failure', 'validate-failure'].includes(scenario)) assert(!calls.some(call => call.action === 'staple'))
      if (['pending', 'wait-timeout'].includes(scenario)) {
        assert.equal(report.submissionId, id)
        assert.equal(report.status, 'In Progress')
        assert.match(output, /continues after this run stops/)
      }
    }
    for (const secret of [key, 'synthetic-secret-key-id', 'synthetic-secret-issuer', 'synthetic-secret-team']) {
      assert(!output.includes(secret), 'Console must redact credentials')
      assert(!(JSON.stringify(report) ?? '').includes(secret), 'Artifacts must redact credentials')
    }
    checks.push({ scenario, exitCode: result.status, stage: report?.stage, status: report?.status, calls: calls.map(call => call.action) })
  }

  await check('accepted-app', { app: true })
  await check('accepted-dmg')
  for (const scenario of ['upload-failure', 'upload-timeout', 'missing-id', 'rejected', 'pending', 'wait-timeout', 'status-unavailable', 'failed-status-accepted', 'recovered', 'log-unavailable', 'staple-failure', 'validate-failure']) await check(scenario)
  await check('zip-failure', { app: true })
  await check('missing-credentials', { app: true, missing: true })
  await check('partial-credentials', { app: true, partial: true })
  await check('local-skip', { app: true, missing: true, optional: true })
  await check('windows-skip', { app: true, platform: 'win32' })
  await writeFile(join(evidence, 'report.json'), JSON.stringify({ scope: 'Real CLI/hook with synthetic Apple tools; not Apple notarization or installer acceptance', node: process.version, platform: process.platform, arch: process.arch, checks }, null, 2))
  console.log(`Notarization CLI/hook: ${checks.length} scenarios passed. Evidence: ${join(evidence, 'report.json')}`)
} finally {
  await rm(fixture, { recursive: true, force: true })
}
