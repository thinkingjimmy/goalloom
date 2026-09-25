/**
 * [INPUT]: Has no runtime dependencies
 * [OUTPUT]: Exports REPO, RELEASES_URL, Platform, RELEASE and downloadUrl
 * [POS]: The single source of truth for the public repository and the build every download control points at
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */

export const REPO = 'https://github.com/thinkingjimmy/goalloom'
export const RELEASES_URL = `${REPO}/releases`

export type Platform = 'mac' | 'windows'

// Asset names carry the version (electron-builder artifactName), so GitHub's /releases/latest/download/<name>
// shortcut cannot be used. Update this snapshot with every published release; `published: false` falls back to the
// Releases page while a new version is not yet uploaded.
export const RELEASE = {
  published: true,
  version: '1.0.0',
  assets: { mac: 'Goalloom-1.0.0-mac-arm64.dmg', windows: 'Goalloom-1.0.0-win-x64.exe' },
} satisfies { published: boolean; version: string; assets: Record<Platform, string> }

export function downloadUrl(platform: Platform): string {
  if (!RELEASE.published) return RELEASES_URL
  return `${RELEASES_URL}/download/v${RELEASE.version}/${RELEASE.assets[platform]}`
}
