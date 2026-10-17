/**
 * [INPUT]: Existing App Store Connect API credentials or an explicit provisioning-profile path/base64.
 * [OUTPUT]: A validated private Developer ID profile path for the subsequent package step.
 * [POS]: Read-only release provisioning. Never creates certificates/profiles or prints credentials.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { sign } from 'node:crypto'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { validateSessionProfile } from '../../apps/desktop/scripts/build/session-profile.mjs'

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
    let next = `${origin}/v1/profiles?filter[profileType]=MAC_APP_DIRECT&filter[profileState]=ACTIVE&include=bundleId&limit=200`
    const candidates = []
    for (let page = 0; next && page < 10; page++) {
      assert(new URL(next).origin === origin, 'Unexpected provisioning API origin')
      const response = await fetch(next, { headers: { Authorization: `Bearer ${claims}.${signature}` }, redirect: 'error', signal: AbortSignal.timeout(30_000) })
      assert(response.ok, `Apple profile lookup failed (${response.status}); the API key needs Certificates, Identifiers & Profiles access`)
      const result = await response.json()
      const ids = new Set((result.included ?? []).filter(row => row.type === 'bundleIds' && row.attributes?.identifier === 'com.goalloom.desktop').map(row => row.id))
      for (const row of result.data ?? []) if (ids.has(row.relationships?.bundleId?.data?.id) && row.attributes?.profileType === 'MAC_APP_DIRECT'
        && row.attributes.profileState === 'ACTIVE' && new Date(row.attributes.expirationDate).getTime() > Date.now()) candidates.push(row.attributes)
      next = result.links?.next ?? null
    }
    candidates.sort((a, b) => Date.parse(b.expirationDate) - Date.parse(a.expirationDate))
    assert(candidates[0]?.profileContent, 'Create a macOS Developer ID provisioning profile for com.goalloom.desktop in Apple Developer, then retry. Signing/notarization credentials alone do not supply this profile.')
    bytes = Buffer.from(candidates[0].profileContent, 'base64')
  }
  await writeFile(output, bytes, { mode: 0o600 })
}
validateSessionProfile(output)
if (process.env.GITHUB_ENV) await appendFile(process.env.GITHUB_ENV, `GOALLOOM_MAC_PROVISIONING_PROFILE=${output}\n`)
console.log('Validated the macOS Developer ID profile for private, noninteractive session storage.')
