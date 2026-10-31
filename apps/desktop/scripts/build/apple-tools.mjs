/**
 * [INPUT]: Native Apple tool arguments, positive deadlines and credential environment values.
 * [OUTPUT]: Bounded command results and redacted, bounded ticket delivery/validation attempts.
 * [POS]: Shared process boundary for notarization and final independent release validation.
 */
import { spawn } from 'node:child_process'

const secretNames = ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'APPLE_API_KEY_P8', 'APPLE_TEAM_ID', 'CSC_LINK', 'CSC_KEY_PASSWORD']
export const redact = text => secretNames.reduce((value, name) => process.env[name] ? value.replaceAll(process.env[name], '[REDACTED]') : value, text)

export function timeout(name, fallback) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || value <= 0 || value > 2_000_000_000) throw new Error(`${name} must be a positive timeout in milliseconds`)
  return value
}

export function run(command, args, timeoutMs) {
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

export const failure = (label, result) => redact(`${label} ${result.timedOut ? 'timed out' : `exited ${result.code}`}: ${result.stderr || result.stdout}`.trim())

export async function ticketAction(action, target, limit, record) {
  const deadline = performance.now() + limit
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = performance.now()
    const result = await run('xcrun', ['stapler', action, target], Math.max(1, Math.ceil(deadline - started)))
    const valid = result.code === 0 && !result.timedOut && (action !== 'validate' || result.stdout.includes('The validate action worked'))
    const error = valid ? undefined : result.code === 0 && !result.timedOut
      ? `Ticket ${action} did not confirm success` : failure(`Ticket ${action}`, result)
    await record({ action, attempt, elapsedMs: performance.now() - started, code: result.code, timedOut: result.timedOut, ...(error ? { error } : {}) })
    if (valid) return
    const delay = 250 * attempt
    // Only a known connection loss is safe to retry. All attempts share one deadline.
    if (attempt === 3 || result.timedOut || result.code !== 68
      || !/Error Domain=NSURLErrorDomain Code=-1005\b/.test(result.stderr + result.stdout)
      || deadline - performance.now() <= delay) throw new Error(error)
    console.log(`Ticket ${action} lost its network connection; retrying attempt ${attempt + 1}/3 within the command deadline.`)
    await new Promise(resolveDelay => setTimeout(resolveDelay, delay))
  }
}
