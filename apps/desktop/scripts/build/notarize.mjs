/**
 * [INPUT]: Signed app/DMG, App Store Connect API-key environment and Xcode tools.
 * [OUTPUT]: One submission, bounded status polling and ticket connection-loss recovery, validated stapled ticket and redacted diagnostics; throws on incomplete approval.
 * [POS]: Shared afterSign hook, DMG CLI and final validation-only CLI; app notarization finishes before builder creates update archives.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { failure, redact, run, ticketAction, timeout } from './apple-tools.mjs'

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const evidence = resolve(process.env.GOALLOOM_NOTARIZE_EVIDENCE_DIR ?? join(appRoot, 'output/tests/notarization'))
const credentials = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']
const json = value => { try { return JSON.parse(value) } catch { return undefined } }

async function waitForCompletion(notarytool, submissionId, waitTimeout, commandTimeout, report, save) {
  const deadline = performance.now() + waitTimeout
  let consecutiveErrors = 0
  while (performance.now() < deadline) {
    const remaining = Math.max(1, Math.ceil(deadline - performance.now()))
    const info = await notarytool(['info', submissionId], Math.min(commandTimeout, remaining))
    const status = json(info.stdout)?.status
    if (info.code === 0 && !info.timedOut && typeof status === 'string') {
      consecutiveErrors = 0
      report.status = status
      ;(report.statusPolls ??= []).push({ checkedAt: new Date().toISOString(), status })
      await save()
      if (['Accepted', 'Invalid', 'Rejected'].includes(status)) return
    } else {
      ;(report.pollErrors ??= []).push({ checkedAt: new Date().toISOString(), error: failure('Notary status', info) })
      await save()
      if (++consecutiveErrors === 3) return
    }
    // Polls and backoff share the processing deadline, including the last interval.
    const delay = Math.min(consecutiveErrors ? 10_000 : 30_000, deadline - performance.now())
    if (delay > 0) await new Promise(resolveDelay => setTimeout(resolveDelay, delay))
  }
}

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

    console.log(`Uploading ${report.artifact} once for notarization (limit ${uploadTimeout / 60_000} minutes).`)
    const submitted = await notarytool(['submit', archive, '--no-wait'], uploadTimeout)
    const submission = json(submitted.stdout)
    if (typeof submission?.id === 'string' && /^[a-f0-9-]{36}$/i.test(submission.id)) report.submissionId = submission.id
    // An unknown upload outcome must not trigger another submission.
    if (submitted.code !== 0 || submitted.timedOut || !report.submissionId) throw new Error(failure('Notary upload (a submission ID is required)', submitted))
    report.status = submission.status ?? 'Submitted'
    report.stage = 'wait'
    await save()
    console.log(`Notarization submission ID: ${report.submissionId}. Polling Apple within the processing deadline.`)
    await waitForCompletion(notarytool, report.submissionId, waitTimeout, commandTimeout, report, save)

    // Fetch final log
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
    for (const action of ['staple', 'validate']) await ticketAction(action, target, commandTimeout, async attempt => {
      ;(report.ticketAttempts ??= []).push(attempt)
      await save()
    })
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

async function validateTicket(target) {
  const kind = target.endsWith('.app') ? 'app' : target.endsWith('.dmg') ? 'dmg' : undefined
  if (!kind) throw new Error('Ticket validation requires an .app or .dmg')
  const limit = timeout('GOALLOOM_NOTARIZE_COMMAND_TIMEOUT_MS', 2 * 60_000)
  const report = { artifact: basename(target), startedAt: new Date().toISOString(), ok: false, ticketAttempts: [] }
  await mkdir(evidence, { recursive: true })
  const save = () => writeFile(join(evidence, `verify-${kind}.json`), redact(JSON.stringify(report, null, 2)))
  try {
    await ticketAction('validate', target, limit, async attempt => { report.ticketAttempts.push(attempt); await save() })
    report.ok = true
    console.log(`Independent ${kind} ticket validation passed.`)
  } catch (error) {
    report.error = redact(error.message)
    throw error
  } finally {
    report.finishedAt = new Date().toISOString()
    await save()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const validationOnly = process.argv[2] === '--validate-ticket'
    const target = process.argv[validationOnly ? 3 : 2]
    if (!target) throw new Error('Usage: node notarize.mjs [--validate-ticket] <signed.app|signed.dmg>')
    if (validationOnly) await validateTicket(resolve(target))
    else await notarize(resolve(target))
  } catch (error) {
    console.error(redact(error.message))
    process.exitCode = 1
  }
}
