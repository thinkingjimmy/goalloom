/**
 * [INPUT]: Developer ID profile, fixed app/team identity and electron-builder's macOS pack context.
 * [OUTPUT]: Validated profile and private keychain entitlements for the main executable only.
 * [POS]: Signed-package gate. Ad-hoc fixtures retain their separate, unrestricted entitlements.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const applicationId = '947MAGH97Q.com.goalloom.desktop'
export function validateSessionProfile(path) {
  let profile
  try {
    const xml = execFileSync('/usr/bin/security', ['cms', '-D', '-i', path], { encoding: 'utf8', timeout: 15_000, stdio: ['ignore', 'pipe', 'pipe'] })
    const extract = (key, format = 'json') => {
      try {
        const value = execFileSync('/usr/bin/plutil', ['-extract', key, format, '-o', '-', '-'], { input: xml, encoding: 'utf8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
        return format === 'json' ? JSON.parse(value) : value.trim()
      } catch { return null }
    }
    profile = Object.fromEntries(['Platform', 'TeamIdentifier', 'Entitlements'].map(key => [key, extract(key)]))
    profile.ProvisionsAllDevices = extract('ProvisionsAllDevices', 'raw') === 'true'
    profile.ExpirationDate = extract('ExpirationDate', 'raw')
  }
  catch { throw Error('Cannot decode the macOS Developer ID provisioning profile') }
  const permissions = profile.Entitlements ?? {}
  const allows = value => value === applicationId || value === '947MAGH97Q.*'
  assert(profile.Platform?.includes('OSX') && profile.ProvisionsAllDevices === true, 'A macOS Developer ID distribution profile is required')
  assert(profile.TeamIdentifier?.includes('947MAGH97Q'), 'Provisioning profile team must be 947MAGH97Q')
  assert(permissions['com.apple.application-identifier'] === applicationId, 'Provisioning profile must match com.goalloom.desktop')
  assert(permissions['keychain-access-groups']?.some(allows), 'Provisioning profile must permit the private keychain access group')
  assert(!permissions['get-task-allow'] && !permissions['com.apple.security.get-task-allow'], 'A development profile cannot sign this distribution')
  assert(new Date(profile.ExpirationDate).getTime() > Date.now(), 'The macOS provisioning profile has expired')
  return profile
}

export default async function configureSessionProfile(context) {
  if (context.electronPlatformName !== 'darwin') return
  const options = context.packager.platformSpecificBuildOptions
  const unsigned = options.identity === '-' || options.identity === null || process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false'
  if (unsigned) {
    assert(process.env.GOALLOOM_REQUIRE_NOTARIZATION !== '1', 'A production release cannot skip session provisioning')
    return
  }
  const path = process.env.GOALLOOM_MAC_PROVISIONING_PROFILE
  assert(path, 'Set GOALLOOM_MAC_PROVISIONING_PROFILE to the macOS Developer ID profile before packaging')
  validateSessionProfile(path)
  assert(context.packager.appInfo.id === 'com.goalloom.desktop', 'Provisioned session storage requires the stable Goalloom app ID')
  options.provisioningProfile = resolve(path)
  options.entitlements = resolve(dirname(fileURLToPath(import.meta.url)), '../../build/entitlements.mac.session.plist')
}
