/**
 * [INPUT]: Signed app/DMG, App Store Connect API-key environment and Xcode tools.
 * [OUTPUT]: One submission with retries, bounded ticket connection-loss recovery, validated stapled ticket and redacted diagnostics; throws on incomplete approval.
 * [POS]: Shared afterSign hook and DMG CLI; app notarization finishes before builder creates update archives.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 *
 * Notarization resilience (M2.1):
 * - Submit stage: 3 retries with exponential backoff on network errors
 * - Wait stage: polling-based with 30s intervals, tolerates transient network failures
 * - Staple stage: existing 3-retry logic with exit 68 detection (unchanged)
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

/**
 * Submit with retry on network errors.
 * CloudKit断线 (NSURLErrorDomain Code=-1005) 在 submit 阶段也可能发生,
 * 实施指数退避重试, 最多 3 次.
 */
async function submitWithRetry(notarytool, archive, uploadTimeout, report) {
  const maxAttempts = 3
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`Uploading ${report.artifact} for notarization (attempt ${attempt}/${maxAttempts}, limit ${uploadTimeout / 60_000} minutes).`)
    const submitted = await notarytool(['submit', archive, '--no-wait'], uploadTimeout)
    const submission = json(submitted.stdout)

    if (typeof submission?.id === 'string' && /^[a-f0-9-]{36}$/i.test(submission.id)) {
      report.submissionId = submission.id
    }

    if (submitted.code === 0 && report.submissionId) {
      report.status = submission.status ?? 'Submitted'
      report.submitAttempts = attempt
      return submission
    }

    // 检测网络错误特征
    const isNetworkError = submitted.code !== 0 && (
      /Error Domain=NSURLErrorDomain Code=-1005\b/.test(submitted.stderr + submitted.stdout) ||
      /network connection/i.test(submitted.stderr + submitted.stdout) ||
      /timed out/i.test(submitted.stderr + submitted.stdout)
    )

    ;(report.submitAttemptHistory ??= []).push({
      attempt,
      code: submitted.code,
      timedOut: submitted.timedOut,
      isNetworkError,
      error: failure('Notary submit', submitted),
    })

    if (attempt === maxAttempts || !isNetworkError) {
      throw new Error(failure('Notary upload (a submission ID is required)', submitted))
    }

    // 指数退避: 2s, 5s, 不再有第4次
    const backoff = attempt === 1 ? 2000 : 5000
    console.log(`Submit attempt ${attempt} failed with network error; retrying in ${backoff / 1000}s...`)
    await new Promise(resolve => setTimeout(resolve, backoff))
  }
}

/**
 * Wait for notarization with polling-based resilience.
 * 替代原 `notarytool wait`, 每 30 秒轮询一次状态,
 * 单次网络错误不中断, 仅超时或非临时错误才失败.
 */
async function waitForCompletion(notarytool, submissionId, waitTimeout, commandTimeout, report) {
  const pollInterval = 30_000  // 30秒轮询一次
  const started = performance.now()
  const deadline = started + waitTimeout
  let lastStatus = report.status
  let consecutiveErrors = 0
  const maxConsecutiveErrors = 3

  console.log(`Polling submission ${submissionId} every 30s (timeout ${waitTimeout / 60_000} minutes).`)

  while (performance.now() < deadline) {
    const remaining = Math.max(1000, deadline - performance.now())
    const pollTimeout = Math.min(commandTimeout, remaining)

    const info = await notarytool(['info', submissionId], pollTimeout)
    const infoData = json(info.stdout)

    if (info.code === 0 && infoData?.status) {
      consecutiveErrors = 0  // 重置错误计数
      lastStatus = infoData.status
      report.status = lastStatus
      ;(report.statusPolls ??= []).push({
        elapsed: Math.floor((performance.now() - started) / 1000),
        status: lastStatus,
      })

      console.log(`Status at ${Math.floor((performance.now() - started) / 1000)}s: ${lastStatus}`)

      // 终态检查
      if (lastStatus === 'Accepted') {
        console.log(`Notarization accepted after ${Math.floor((performance.now() - started) / 1000)}s.`)
        return { status: 'Accepted' }
      }

      if (lastStatus === 'Invalid' || lastStatus === 'Rejected') {
        throw new Error(`Notarization ${lastStatus.toLowerCase()} by Apple, submission ${submissionId}.`)
      }

      // 'In Progress' 或 'Submitted' 继续等待
      if (performance.now() + pollInterval < deadline) {
        await new Promise(resolve => setTimeout(resolve, pollInterval))
      }
    } else {
      // 网络错误或其他临时错误
      consecutiveErrors++
      ;(report.pollErrors ??= []).push({
        elapsed: Math.floor((performance.now() - started) / 1000),
        code: info.code,
        timedOut: info.timedOut,
        error: failure('Poll info', info),
      })

      console.warn(`Poll error ${consecutiveErrors}/${maxConsecutiveErrors}: ${failure('Poll info', info)}`)

      if (consecutiveErrors >= maxConsecutiveErrors) {
        throw new Error(`${maxConsecutiveErrors} consecutive poll errors. Last status: ${lastStatus}. Submission: ${submissionId}`)
      }

      // 临时错误，短暂退避后继续
      const backoff = Math.min(pollInterval, 10_000)
      if (performance.now() + backoff < deadline) {
        await new Promise(resolve => setTimeout(resolve, backoff))
      }
    }
  }

  // 超时但仍在处理中
  if (['In Progress', 'Submitted'].includes(lastStatus)) {
    throw new Error(`Apple is still processing submission ${submissionId} after ${waitTimeout / 60_000} minutes. It continues after this run stops. Check with: xcrun notarytool info ${submissionId}`)
  }

  throw new Error(`Wait timeout (${waitTimeout / 60_000} min). Last status: ${lastStatus}. Submission: ${submissionId}`)
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

    // M2.1: Submit with retry
    await submitWithRetry(notarytool, archive, uploadTimeout, report)
    await save()

    report.stage = 'wait'
    await save()
    console.log(`Notarization submission ID: ${report.submissionId}.`)

    // M2.1: Polling-based wait with resilience
    await waitForCompletion(notarytool, report.submissionId, waitTimeout, commandTimeout, report)

    // Fetch final log
    const log = await notarytool(['log', report.submissionId])
    if (log.code === 0 && json(log.stdout)) report.log = json(log.stdout)
    else report.logError = failure('Notary log', log)
    await save()
    report.stage = 'staple'
    await save()
    for (const action of ['staple', 'validate']) {
      const deadline = performance.now() + commandTimeout
      for (let attempt = 1; attempt <= 3; attempt++) {
        const result = await run('xcrun', ['stapler', action, target], Math.max(1, Math.ceil(deadline - performance.now())))
        const error = result.code !== 0 || result.timedOut ? failure(`Ticket ${action}`, result) : undefined
        ;(report.ticketAttempts ??= []).push({ action, attempt, code: result.code, timedOut: result.timedOut, ...(error ? { error } : {}) })
        await save()
        if (!error) break
        // Ticket delivery is idempotent; retry only Apple's explicit connection-loss error after acceptance.
        const delay = 250 * attempt
        if (attempt === 3 || result.timedOut || result.code !== 68
          || !/Error Domain=NSURLErrorDomain Code=-1005\b/.test(result.stderr + result.stdout)
          || deadline - performance.now() <= delay) throw new Error(error)
        console.log(`Ticket ${action} lost its network connection; retrying attempt ${attempt + 1}/3 within the command deadline.`)
        await new Promise(resolveDelay => setTimeout(resolveDelay, delay))
      }
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
