/**
 * [INPUT]: Authenticated Apple requests, the imported Developer ID identity and explicit creation permission.
 * [OUTPUT]: A matching profile; optional creation uses only the fixed bundle ID and existing certificate.
 * [POS]: Release provisioning policy. Never creates/revokes certificates or retries an unknown mutation.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'

const identifier = 'com.goalloom.desktop', team = '947MAGH97Q'
async function list(api, path) {
  const data = [], included = []
  for (let page = 0; path && page < 10; page++) {
    const result = await api(path)
    data.push(...(result.data ?? [])); included.push(...(result.included ?? []))
    path = result.links?.next ?? null
  }
  assert(!path, 'Apple provisioning lookup exceeded its page limit')
  return { data, included }
}

export async function resolveAppleProfile(api, create = false) {
  const { CSC_KEYCHAIN: keychain, CSC_NAME: name } = process.env
  assert(keychain && name?.endsWith(`(${team})`), 'The prepared Developer ID signing identity is required')
  const identities = execFileSync('/usr/bin/security', ['find-identity', '-v', '-p', 'codesigning', keychain], { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] })
  const matches = [...identities.matchAll(/\b([A-Fa-f0-9]{40})\s+"([^"]+)"/g)]
    .filter(match => match[2] === `Developer ID Application: ${name}`)
  assert(matches.length === 1, 'The prepared keychain must contain exactly one matching Developer ID signing identity')
  const fingerprint = matches[0][1].toUpperCase()
  const certificates = await list(api, '/v1/certificates?limit=200')
  const certificate = certificates.data.find(row => {
    if (!['DEVELOPER_ID_APPLICATION', 'DEVELOPER_ID_APPLICATION_G2'].includes(row.attributes?.certificateType)
      || !(Date.parse(row.attributes.expirationDate) > Date.now()) || !row.attributes.certificateContent) return false
    return new X509Certificate(Buffer.from(row.attributes.certificateContent, 'base64')).fingerprint.replaceAll(':', '') === fingerprint
  })
  assert(certificate, 'Apple must expose the Developer ID certificate already imported for this release')
  const profiles = await list(api, '/v1/profiles?filter[profileType]=MAC_APP_DIRECT&filter[profileState]=ACTIVE&include=bundleId,certificates&limit=200')
  const bundles = new Set(profiles.included.filter(row => row.type === 'bundleIds' && row.attributes?.identifier === identifier).map(row => row.id))
  const candidates = profiles.data.filter(row => bundles.has(row.relationships?.bundleId?.data?.id)
    && row.relationships?.certificates?.data?.some(value => value.id === certificate.id)
    && row.attributes?.profileType === 'MAC_APP_DIRECT' && row.attributes.profileState === 'ACTIVE'
    && Date.parse(row.attributes.expirationDate) > Date.now())
  candidates.sort((a, b) => Date.parse(b.attributes.expirationDate) - Date.parse(a.attributes.expirationDate))
  if (candidates[0]?.attributes.profileContent) return candidates[0].attributes.profileContent
  assert(create, 'No matching Developer ID profile exists. Enable the one-time create_session_profile workflow option or supply GOALLOOM_MAC_PROVISIONING_PROFILE_B64.')

  const registered = await list(api, `/v1/bundleIds?filter[identifier]=${identifier}&limit=200`)
  let bundle = registered.data.find(row => row.attributes?.identifier === identifier)
  if (bundle) assert(['MAC_OS', 'UNIVERSAL'].includes(bundle.attributes.platform) && bundle.attributes.seedId === team, 'The existing bundle ID must support macOS and use the expected team prefix')
  else {
    bundle = (await api('/v1/bundleIds', { data: { type: 'bundleIds', attributes: { identifier, name: 'Goalloom Desktop', platform: 'MAC_OS', seedId: team } } })).data
    assert(bundle?.id, 'Apple did not confirm bundle ID creation; inspect the account before retrying')
  }
  const created = await api('/v1/profiles', { data: {
    type: 'profiles', attributes: { name: `Goalloom macOS session ${fingerprint.slice(0, 8)}`, profileType: 'MAC_APP_DIRECT' },
    relationships: { bundleId: { data: { type: 'bundleIds', id: bundle.id } }, certificates: { data: [{ type: 'certificates', id: certificate.id }] } },
  } })
  assert(created.data?.attributes?.profileContent, 'Apple did not return the created profile; inspect the account before retrying')
  console.log('Created the Goalloom Developer ID profile using the existing release certificate.')
  return created.data.attributes.profileContent
}
