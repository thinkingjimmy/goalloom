/**
 * [INPUT]: Packaged-build flag, OS app-data directory and optional explicit profile path.
 * [OUTPUT]: Stable production identity or isolated development identity and user-data path.
 * [POS]: Startup identity boundary; Electron also uses the application name for macOS Safe Storage.
 */
import { join, resolve } from 'node:path'

export function applicationIdentity(packaged: boolean, appData: string, profile: string) {
  const name = packaged ? 'Goalloom' : 'Goalloom Development'
  return {
    name,
    appUserModelId: packaged ? 'com.goalloom.desktop' : 'com.goalloom.desktop.development',
    userData: profile ? resolve(profile) : join(appData, name),
  }
}
