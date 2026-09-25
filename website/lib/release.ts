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
// shortcut cannot be used. Update this snapshot when a release is published; until then downloads open the
// Releases page instead of a file that does not exist yet.
export const RELEASE = {
  published: false,
  version: '0.1.0',
  assets: { mac: 'Goalloom-0.1.0-mac-arm64.zip', windows: 'Goalloom-0.1.0-win-x64.exe' },
} satisfies { published: boolean; version: string; assets: Record<Platform, string> }

export function downloadUrl(platform: Platform): string {
  if (!RELEASE.published) return RELEASES_URL
  return `${RELEASES_URL}/download/v${RELEASE.version}/${RELEASE.assets[platform]}`
}
