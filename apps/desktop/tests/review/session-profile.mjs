/**
 * [INPUT]: The real provisioning CLI with synthetic Apple HTTP, CMS and signing-identity boundaries.
 * [OUTPUT]: Repeatable profile reuse/creation and failure evidence, including malformed CMS payload rejection.
 * [POS]: Release CLI acceptance; no Apple account, real credential or user keychain is accessed.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
// Failure cases are frozen in docs/development.md before the creation implementation.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { generateKeyPairSync, X509Certificate } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

if (process.platform !== 'darwin') { console.log('macOS provisioning CLI fixture skipped on this platform'); process.exit(0) }
const out = resolve('output/tests/session-profile'), directory = await mkdtemp(join(tmpdir(), 'goalloom-profile-cli-'))
await mkdir(out, { recursive: true })
const report = { ok: false, checks: [], scope: 'Real Node CLI and Python plist parser; synthetic Apple HTTP/CMS/signing identity. No signed native or live Apple acceptance.' }
try {
  const cert = join(directory, 'certificate.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=Fixture', '-days', '1', '-keyout', join(directory, 'certificate.key'), '-out', cert], { stdio: 'pipe' })
  const certificate = new X509Certificate(await readFile(cert)), fingerprint = certificate.fingerprint.replaceAll(':', '')
  const keyPath = join(directory, 'api.p8')
  await writeFile(keyPath, generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 })
  const expires = new Date(Date.now() + 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const xml = `<?xml version="1.0"?><plist version="1.0"><dict><key>Platform</key><array><string>OSX</string></array><key>ProvisionsAllDevices</key><true/><key>TeamIdentifier</key><array><string>947MAGH97Q</string></array><key>ExpirationDate</key><date>${expires}</date><key>Entitlements</key><dict><key>com.apple.application-identifier</key><string>947MAGH97Q.com.goalloom.desktop</string><key>keychain-access-groups</key><array><string>947MAGH97Q.com.goalloom.desktop</string></array></dict></dict></plist>`
  const fixture = join(directory, 'fixture.mjs')
  await writeFile(fixture, `
import assert from 'node:assert/strict';
import child from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const mode = process.env.PROFILE_CASE, xml = ${JSON.stringify(xml)}, fingerprint = ${JSON.stringify(fingerprint)};
const original = child.execFileSync;
child.execFileSync = (command, args, options) => {
  if (command === '/usr/bin/security' && args[0] === 'find-identity') return '  1) ' + fingerprint + ' "Developer ID Application: ziming wang (947MAGH97Q)"\\n' + (mode === 'ambiguous' ? '  2) ' + 'A'.repeat(40) + ' "Developer ID Application: ziming wang (947MAGH97Q)"\\n' : '');
  if (command === '/usr/bin/security' && args[0] === 'cms') return mode === 'malformed-plist' ? '<invalid>' : mode === 'invalid-profile' ? xml.replaceAll('947MAGH97Q.com.goalloom.desktop', '947MAGH97Q.invalid') : xml;
  return original(command, args, options);
};
syncBuiltinESMExports();
const bundle = { type: 'bundleIds', id: 'bundle', attributes: { identifier: 'com.goalloom.desktop', platform: 'MAC_OS', seedId: '947MAGH97Q' } };
const certificate = { type: 'certificates', id: 'certificate', attributes: { certificateType: mode === 'wrong-certificate' ? 'DEVELOPMENT' : 'DEVELOPER_ID_APPLICATION_G2', certificateContent: ${JSON.stringify(certificate.raw.toString('base64'))}, expirationDate: new Date(Date.now() + 86400000).toISOString() } };
const profile = { type: 'profiles', id: 'profile', attributes: { profileType: 'MAC_APP_DIRECT', profileState: 'ACTIVE', expirationDate: new Date(Date.now() + 86400000).toISOString(), profileContent: Buffer.from(xml).toString('base64') }, relationships: { bundleId: { data: { type: 'bundleIds', id: 'bundle' } }, certificates: { data: [{ type: 'certificates', id: mode === 'stale-certificate' ? 'old-certificate' : 'certificate' }] } } };
globalThis.fetch = async (url, options = {}) => {
  const parsed = new URL(url); assert.equal(parsed.origin, 'https://api.appstoreconnect.apple.com');
  const method = options.method ?? 'GET', body = options.body ? JSON.parse(options.body) : null;
  appendFileSync(process.env.PROFILE_REQUESTS, JSON.stringify({ path: parsed.pathname, method, body }) + '\\n');
  if (mode === 'denied') return new Response(JSON.stringify({ errors: [{ code: 'FORBIDDEN' }] }), { status: 403 });
  if (method === 'POST') {
    assert.equal(process.env.GOALLOOM_CREATE_MAC_PROFILE, '1');
    if (parsed.pathname === '/v1/bundleIds') { assert.equal(body.data.attributes.identifier, 'com.goalloom.desktop'); assert.equal(body.data.attributes.platform, 'MAC_OS'); return Response.json({ data: bundle }); }
    assert.equal(parsed.pathname, '/v1/profiles'); assert.equal(body.data.attributes.profileType, 'MAC_APP_DIRECT');
    assert.equal(body.data.relationships.bundleId.data.id, 'bundle'); assert.deepEqual(body.data.relationships.certificates.data, [{ type: 'certificates', id: 'certificate' }]);
    if (mode === 'unknown-post') throw Error('Synthetic lost response');
    return Response.json({ data: profile });
  }
  if (parsed.pathname === '/v1/certificates') return Response.json({ data: [certificate], links: {} });
  if (parsed.pathname === '/v1/bundleIds') return Response.json({ data: mode === 'new-bundle' ? [] : [bundle], links: {} });
  assert.equal(parsed.pathname, '/v1/profiles');
  return Response.json({ data: ['existing', 'stale-certificate', 'invalid-profile', 'malformed-plist'].includes(mode) ? [profile] : [], included: [bundle, certificate], links: mode === 'foreign-pagination' ? { next: 'https://example.invalid/steal' } : {} });
};
`)
  for (const [mode, create, success, posts] of [
    ['existing', false, true, []], ['missing', false, false, []], ['create', true, true, ['/v1/profiles']],
    ['new-bundle', true, true, ['/v1/bundleIds', '/v1/profiles']], ['ambiguous', true, false, []],
    ['wrong-certificate', true, false, []], ['stale-certificate', true, true, ['/v1/profiles']],
    ['invalid-profile', false, false, []], ['malformed-plist', false, false, []], ['denied', true, false, []], ['foreign-pagination', true, false, []],
    ['unknown-post', true, false, ['/v1/profiles']],
  ]) {
    const runDirectory = join(directory, mode); await mkdir(runDirectory)
    const requests = join(runDirectory, 'requests.jsonl'); await writeFile(requests, '')
    const env = { ...process.env, RUNNER_TEMP: runDirectory, APPLE_API_KEY: keyPath, APPLE_API_KEY_ID: 'fixture-id', APPLE_API_ISSUER: 'fixture-issuer', CSC_KEYCHAIN: join(directory, 'synthetic.keychain'), CSC_NAME: 'ziming wang (947MAGH97Q)', GOALLOOM_CREATE_MAC_PROFILE: create ? '1' : '0', PROFILE_CASE: mode, PROFILE_REQUESTS: requests }
    for (const key of ['GOALLOOM_MAC_PROVISIONING_PROFILE', 'GOALLOOM_MAC_PROVISIONING_PROFILE_B64', 'GITHUB_ENV', 'NODE_OPTIONS']) delete env[key]
    const result = spawnSync(process.execPath, ['--import', fixture, resolve('../../.github/scripts/macos-profile.mjs')], { env, encoding: 'utf8', timeout: 30000 })
    const calls = (await readFile(requests, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
    assert.equal(result.status === 0, success, `${mode}: ${result.stderr}`)
    assert.deepEqual(calls.filter(row => row.method === 'POST').map(row => row.path), posts, mode)
    assert(!result.stdout.includes('PRIVATE KEY')); assert(!result.stderr.includes('PRIVATE KEY'))
    if (success) assert((await readFile(join(runDirectory, 'goalloom.provisionprofile'))).length > 0)
    report.checks.push({ mode, success, calls: calls.map(({ path, method }) => ({ path, method })) })
    console.log(`PASS ${mode}`)
  }
  report.ok = true
} catch (error) { report.error = error.stack; throw error }
finally { await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2)); await rm(directory, { recursive: true, force: true }) }
