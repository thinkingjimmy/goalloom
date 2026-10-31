/**
 * [INPUT]: Existing Apple API/signing credentials, optional profile bytes and explicit one-time creation permission.
 * [OUTPUT]: A validated private Developer ID profile path for the subsequent package step.
 * [POS]: Default read-only provisioning; explicitly enabled creation uses the existing certificate. Never prints credentials.
 */
import assert from 'node:assert/strict'
import { sign } from 'node:crypto'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateSessionProfile } from '../../apps/desktop/scripts/build/session-profile.mjs'
import { resolveAppleProfile } from './apple-profile.mjs'

const output = process.env.GOALLOOM_MAC_PROVISIONING_PROFILE ?? join(process.env.RUNNER_TEMP ?? '', 'goalloom.provisionprofile')
assert(process.env.RUNNER_TEMP || process.env.GOALLOOM_MAC_PROVISIONING_PROFILE, 'An explicit private output directory is required')
if (!process.env.GOALLOOM_MAC_PROVISIONING_PROFILE) {
  let bytes
  if (process.env.GOALLOOM_MAC_PROVISIONING_PROFILE_B64) bytes = Buffer.from(process.env.GOALLOOM_MAC_PROVISIONING_PROFILE_B64, 'base64')
  else {
    for (const name of ['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) assert(process.env[name], `Missing ${name}`)
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url'), now = Math.floor(Date.now() / 1000)
    const claims = `${encode({ alg: 'ES256', kid: process.env.APPLE_API_KEY_ID, typ: 'JWT' })}.${encode({ iss: process.env.APPLE_API_ISSUER, iat: now, exp: now + 600, aud: 'appstoreconnect-v1' })}`
    const signature = sign('sha256', Buffer.from(claims), { key: await readFile(process.env.APPLE_API_KEY), dsaEncoding: 'ieee-p1363' }).toString('base64url')
    const origin = 'https://api.appstoreconnect.apple.com'
    const api = async (path, data) => {
      const url = new URL(path, origin)
      assert(url.origin === origin, 'Unexpected provisioning API origin')
      const response = await fetch(url.href, { method: data ? 'POST' : 'GET', headers: { Authorization: `Bearer ${claims}.${signature}`, 'Content-Type': 'application/json' },
        ...(data ? { body: JSON.stringify(data) } : {}), redirect: 'error', signal: AbortSignal.timeout(30_000) })
      assert(response.ok, `Apple provisioning ${data ? 'POST' : 'GET'} ${url.pathname} failed (${response.status}); ${data && response.status === 403 ? 'read access does not grant creation permission; regenerate the existing profile in Apple Developer and rerun preflight_only, without creation' : 'check Certificates, Identifiers & Profiles access and account configuration; inspect an unknown write outcome before retrying'}`)
      return response.json()
    }
    bytes = Buffer.from(await resolveAppleProfile(api, process.env.GOALLOOM_CREATE_MAC_PROFILE === '1'), 'base64')
  }
  await writeFile(output, bytes, { mode: 0o600 })
}
validateSessionProfile(output)
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `GOALLOOM_MAC_PROVISIONING_PROFILE=${output}\n`)
console.log('Validated the macOS Developer ID profile for private, noninteractive session storage.')
