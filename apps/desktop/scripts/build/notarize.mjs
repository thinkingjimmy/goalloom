/**
 * [INPUT]: Signed app/DMG, App Store Connect API-key environment and Xcode tools.
 * [OUTPUT]: Bounded notarization, validated stapled ticket and redacted diagnostics; throws on incomplete approval.
 * [POS]: Shared afterSign hook and DMG CLI; app notarization finishes before builder creates update archives.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const evidence = resolve(process.env.GOALLOOM_NOTARIZE_EVIDENCE_DIR ?? join(appRoot, 'output/tests/notarization'))
const credentials = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']
const secretNames = [...credentials, 'APPLE_API_KEY_P8', 'APPLE_TEAM_ID', 'CSC_LINK', 'CSC_KEY_PASSWORD']
const redact = text => secretNames.reduce((value, name) => process.env[name] ? value.replaceAll(process.env[name], '[REDACTED]') : value, text)
const json = value => { try { return JSON.parse(value) } catch { return undefined } }

function timeout(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_000_000_000) throw new Error(`${name} must be a positive timeout in milliseconds`)
  return value
}

function run(command, args, timeoutMs) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = '', stderr = '', timedOut = false
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, timeoutMs)
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.once('error', error => { clearTimeout(timer); reject(new Error(redact(error.message))) })
    child.once('close', code => {
      clearTimeout(timer)
      resolveRun({ code, stdout, stderr, timedOut })
    })
  })
}

const failure = (label, result) => redact(`${label} ${result.timedOut ? 'timed out' : `exited ${result.code}`}: ${result.stderr || result.stdout}`.trim())

async function notarize(target) {
  const missing = credentials.filter(name => !process.env[name])
  if (missing.length) throw new Error(`Missing notarization credentials: ${missing.join(', ')}`)
  await readFile(process.env.APPLE_API_KEY)
  const uploadTimeout = timeout('GOALLOOM_NOTARIZE_UPLOAD_TIMEOUT_MS', 5 * 60_000)
  const waitTimeout = timeout('GOALLOOM_NOTARIZE_WAIT_TIMEOUT_MS', 30 * 60_000)
  const commandTimeout = timeout('GOALLOOM_NOTARIZE_COMMAND_TIMEOUT_MS', 2 * 60_000)
  const app = target.endsWith('.app')
  if (!app && !target.endsWith('.dmg')) throw new Error('Notarization requires an .app or .dmg')
  const report = { artifact: basename(target), startedAt: new Date().toISOString(), stage: 'prepare', status: 'Not submitted' }
  const reportPath = join(evidence, app ? 'app.json' : 'dmg.json')
  const save = () => writeFile(reportPath, redact(JSON.stringify(report, null, 2)))
  const auth = ['--key', process.env.APPLE_API_KEY, '--key-id', process.env.APPLE_API_KEY_ID, '--issuer', process.env.APPLE_API_ISSUER]
  const notarytool = (args, limit = commandTimeout) => run('xcrun', ['notarytool', ...args, ...auth, '--output-format', 'json'], limit)
  await mkdir(evidence, { recursive: true })
  await save()
  let temporary
  try {
    let archive = target
    if (app) {
      temporary = await mkdtemp(join(tmpdir(), 'goalloom-notarize-'))
      archive = join(temporary, `${basename(target, '.app')}.zip`)
      const zipped = await run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', target, archive], commandTimeout)
      if (zipped.code !== 0) throw new Error(failure('Notarization ZIP creation', zipped))
    }
    report.stage = 'upload'
    await save()
    console.log(`Uploading ${report.artifact} for notarization (limit ${uploadTimeout / 60_000} minutes).`)
    const submitted = await notarytool(['submit', archive, '--no-wait'], uploadTimeout)
    const submission = json(submitted.stdout)
    if (typeof submission?.id === 'string' && /^[a-f0-9-]{36}$/i.test(submission.id)) report.submissionId = submission.id
    if (submitted.code !== 0 || !report.submissionId) throw new Error(failure('Notary upload (a submission ID is required)', submitted))
    report.status = submission.status ?? 'Submitted'
    report.stage = 'wait'
    await save()
    console.log(`Notarization submission ID: ${report.submissionId}. Waiting at most ${waitTimeout / 60_000} minutes for Apple.`)
    const waited = await notarytool(['wait', report.submissionId, '--timeout', `${Math.ceil(waitTimeout / 1000)}s`], waitTimeout + Math.min(30_000, waitTimeout))
    report.status = waited.code === 0 ? json(waited.stdout)?.status ?? 'Unknown' : 'Unknown'
    if (waited.code !== 0 || report.status !== 'Accepted') {
      report.waitError = failure('Notary wait', waited)
      const info = await notarytool(['info', report.submissionId])
      if (info.code === 0) report.status = json(info.stdout)?.status ?? report.status
      if (info.code !== 0) report.infoError = failure('Notary status', info)
    }
    const log = await notarytool(['log', report.submissionId])
    if (log.code === 0 && json(log.stdout)) report.log = json(log.stdout)
    else report.logError = failure('Notary log', log)
    await save()
    if (report.status !== 'Accepted') {
      const pending = ['In Progress', 'Submitted'].includes(report.status)
      throw new Error(pending
        ? `Apple is still processing submission ${report.submissionId}. It continues after this run stops. Check this ID with notarytool info; diagnostics: ${reportPath}`
        : `Notarization was not accepted (${report.status}), submission ${report.submissionId}. See ${reportPath} for Apple diagnostics.`)
    }
    report.stage = 'staple'
    await save()
    for (const action of ['staple', 'validate']) {
      const result = await run('xcrun', ['stapler', action, target], commandTimeout)
      if (result.code !== 0) throw new Error(failure(`Ticket ${action}`, result))
    }
    report.stage = 'complete'
    report.ticket = 'validated'
    console.log(`${app ? 'Application' : 'Disk image'} notarization successful; stapled ticket validated.`)
  } catch (error) {
    report.error = redact(error.message)
    throw new Error(report.error)
  } finally {
    report.finishedAt = new Date().toISOString()
    await save()
    if (temporary) await rm(temporary, { recursive: true, force: true })
  }
}

export default async function afterSign({ appOutDir, electronPlatformName, packager }) {
  if (electronPlatformName !== 'darwin') return
  if (!credentials.some(name => process.env[name]) && process.env.GOALLOOM_REQUIRE_NOTARIZATION !== '1') {
    console.log('Skipping notarization: no App Store Connect API key configured for this local build.')
    return
  }
  await notarize(join(appOutDir, `${packager.appInfo.productFilename}.app`))
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (!process.argv[2]) throw new Error('Usage: node notarize.mjs <signed.app|signed.dmg>')
    await notarize(resolve(process.argv[2]))
  } catch (error) {
    console.error(redact(error.message))
    process.exitCode = 1
  }
}
