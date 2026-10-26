/**
 * [INPUT]: Independently verified public releases for each desktop platform.
 * [OUTPUT]: REPO, RELEASES_URL, Platform, RELEASE and downloadUrl.
 * [POS]: Public download snapshot; platform versions do not imply shared Plus availability.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const REPO = 'https://github.com/thinkingjimmy/goalloom'
export const RELEASES_URL = `${REPO}/releases`
export type Platform = 'mac' | 'windows'

// Update only the platform whose reviewed installer has been published.
export const RELEASE = {
  mac: { published: true, version: '1.10.0', asset: 'Goalloom-1.10.0-mac-arm64.dmg' },
  windows: { published: true, version: '1.9.10', asset: 'Goalloom-1.9.10-win-x64.exe' },
} satisfies Record<Platform, { published: boolean; version: string; asset: string }>

export function downloadUrl(platform: Platform): string {
  const release = RELEASE[platform]
  if (!release.published) return RELEASES_URL
  return `${RELEASES_URL}/download/v${release.version}/${release.asset}`
}
