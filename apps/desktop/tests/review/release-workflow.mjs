/**
 * [INPUT]: The manual release workflow and its production job graph.
 * [OUTPUT]: Repeatable preflight gating, secret isolation and cleanup contract evidence.
 * [POS]: Static workflow acceptance; CLI fixtures cover execution at synthetic Apple boundaries.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 * Failure cases are defined in docs/features/updates.md before implementation.
 */
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import yaml from 'js-yaml'

const evidence = resolve('output/tests/release-workflow')
await mkdir(evidence, { recursive: true })
const report = { ok: false, checks: [], scope: 'Static workflow graph; no hosted runner, credentials or Apple requests' }
try {
  const workflow = yaml.load(await readFile('../../.github/workflows/release.yml', 'utf8'))
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch'])
  assert.equal(workflow.on.workflow_dispatch.inputs.preflight_only.default, false)
  const preflight = workflow.jobs['preflight-mac']
  assert.equal(preflight.environment, 'release')
  assert.equal(preflight.permissions.contents, 'read')
  assert(!preflight.permissions.actions)
  const commands = preflight.steps.map(step => step.run ?? '').join('\n')
  assert.match(commands, /macos-signing\.sh prepare/)
  assert.match(commands, /macos-profile\.mjs/)
  assert.match(commands, /macos-signing\.sh unlock/)
  assert(!/pnpm install|notarize-dmg|package:|gh release/.test(commands))
  const cleanup = preflight.steps.find(step => step.run?.includes('macos-signing.sh cleanup'))
  assert.equal(cleanup.if, 'always()')
  assert(preflight.steps.some(step => step.if === 'always()' && step.run?.includes('GITHUB_STEP_SUMMARY')))
  assert(!preflight.steps.some(step => step.uses?.startsWith('actions/upload-artifact')))
  report.checks.push('Manual preflight imports existing credentials, validates profile/signing access, always cleans up and publishes status only')
  for (const name of ['test-mac', 'test-win']) {
    const job = workflow.jobs[name]
    assert.equal(job.needs, 'preflight-mac')
    assert.equal(job.if, '${{ !inputs.preflight_only }}')
    assert.equal(job.environment, undefined)
    assert(!/secrets\.(CSC_|APPLE_|GOALLOOM_MAC_PROVISIONING)/.test(JSON.stringify(job)))
  }
  assert(workflow.jobs['test-mac'].steps.some(step => step.run?.includes('tests/review/run.mjs package-report notarization session-profile release-workflow')))
  report.checks.push('Both test jobs require successful preflight and skip in preflight-only mode without signing secrets')
  for (const name of ['package-mac', 'package-win', 'draft']) assert(workflow.jobs[name].needs)
  const profile = workflow.jobs['package-mac'].steps.find(step => step.run === 'node .github/scripts/macos-profile.mjs')
  assert.equal(profile.env.GOALLOOM_CREATE_MAC_PROFILE, '0')
  assert.equal(workflow.jobs.draft.if, 'inputs.update_draft == true')
  report.checks.push('Packaging rechecks provisioning without new Apple writes; draft remains downstream of both package gates')
  report.ok = true
  console.log(`Release workflow contracts passed. Evidence: ${evidence}/report.json`)
} catch (error) { report.error = error.stack; throw error }
finally { await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2)) }
