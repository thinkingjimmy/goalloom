/**
 * [INPUT]: GOALLOOM_SUPABASE_ANON_KEY and optional GOALLOOM_SUPABASE_URL from the build environment.
 * [OUTPUT]: Validated build-time pairs; production requires matching anon-role credentials.
 * [POS]: Build-time sync boundary, shared by local and hosted release builds.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { resolveSyncConfig } from '../../src/main/sync/config'

export function syncBuildDefine(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const packaged = env.GOALLOOM_BUILD_ENV === 'production'
  const config = resolveSyncConfig({ packaged,
    bakedUrl: env.GOALLOOM_SUPABASE_URL, bakedAnonKey: env.GOALLOOM_SUPABASE_ANON_KEY,
  })
  if (packaged && !config.anonKey) throw Error('Production build requires a matching production URL and anon-role JWT')
  return {
    __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: JSON.stringify(config.anonKey ?? ''),
    __GOALLOOM_BAKED_SUPABASE_URL__: JSON.stringify(config.anonKey ? config.url : ''),
  }
}
