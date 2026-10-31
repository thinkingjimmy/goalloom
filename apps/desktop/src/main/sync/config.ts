/**
 * [INPUT]: Complete environment/profile/build pairs and the packaged identity.
 * [OUTPUT]: An environment-bound URL/anon pair, or local-only unconfigured state.
 * [POS]: Sync configuration boundary. Production ignores runtime overrides; development never targets production.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

declare const __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: string | undefined
declare const __GOALLOOM_BAKED_SUPABASE_URL__: string | undefined

export const devSupabaseUrl = 'https://asqyvcnxdltzzfutbbqy.supabase.co'
export const productionRef = 'keqprrgvcefqdwnxaafv'
export const productionSupabaseUrl = `https://${productionRef}.supabase.co`

export type SyncConfigSources = {
  packaged?: boolean
  envUrl?: unknown
  envAnonKey?: unknown
  file?: { url?: unknown; anonKey?: unknown }
  bakedUrl?: unknown
  bakedAnonKey?: unknown
}

export function readSyncConfig(userData: string, packaged = false): { url: string; anonKey: string | null } {
  return resolveSyncConfig({
    packaged,
    envUrl: process.env['GOALLOOM_SUPABASE_URL'],
    envAnonKey: process.env['GOALLOOM_SUPABASE_ANON_KEY'],
    file: readSyncFile(userData),
    bakedUrl: typeof __GOALLOOM_BAKED_SUPABASE_URL__ === 'string' ? __GOALLOOM_BAKED_SUPABASE_URL__ : '',
    bakedAnonKey: typeof __GOALLOOM_BAKED_SUPABASE_ANON_KEY__ === 'string' ? __GOALLOOM_BAKED_SUPABASE_ANON_KEY__ : '',
  })
}

export function resolveSyncConfig(sources: SyncConfigSources): { url: string; anonKey: string | null } {
  const target = sources.packaged ? productionSupabaseUrl : devSupabaseUrl
  const pairs = sources.packaged ? [[sources.bakedUrl, sources.bakedAnonKey]] : [
    [sources.envUrl, sources.envAnonKey], [sources.file?.url, sources.file?.anonKey], [sources.bakedUrl, sources.bakedAnonKey],
  ]
  for (const pair of pairs) {
    const [url, anonKey] = pair.map(value => typeof value === 'string' ? value.trim() : '')
    if (!url && !anonKey) continue
    if (url && anonKey && validPair(url, anonKey, target, !sources.packaged)) return { url, anonKey }
    return { url: target, anonKey: null }
  }
  return { url: target, anonKey: null }
}

function validPair(url: string, key: string, target: string, development: boolean): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') return false
    if (development && ((parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname)) || parsed.hostname.endsWith('.invalid'))) return !key.startsWith('sb_secret_')
    if (url !== target) return false
    const payload = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()) as { role?: string; ref?: string }
    return payload.role === 'anon' && payload.ref === parsed.hostname.split('.')[0]
  } catch { return false }
}

function readSyncFile(userData: string): { url?: unknown; anonKey?: unknown } {
  try { return JSON.parse(readFileSync(join(userData, 'sync-config.json'), 'utf8')) as { url?: unknown; anonKey?: unknown } }
  catch { return {} }
}
