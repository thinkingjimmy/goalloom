/**
 * [INPUT]: GOALLOOM_SUPABASE_URL, GOALLOOM_SUPABASE_ANON_KEY, optional userData sync-config.json, and the build-time baked values.
 * [OUTPUT]: The project URL and anon key. The anon key is not a default and is never logged.
 * [POS]: Desktop sync configuration. Precedence is environment, then sync-config.json, then the value embedded at build time.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

declare const __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: string | undefined
declare const __GOALLOOM_BAKED_SUPABASE_URL__: string | undefined

export const devSupabaseUrl = 'https://asqyvcnxdltzzfutbbqy.supabase.co'

export type SyncConfigSources = {
  envUrl?: unknown
  envAnonKey?: unknown
  file?: { url?: unknown; anonKey?: unknown }
  bakedUrl?: unknown
  bakedAnonKey?: unknown
}

export function readSyncConfig(userData: string): { url: string; anonKey: string | null } {
  return resolveSyncConfig({
    envUrl: process.env['GOALLOOM_SUPABASE_URL'],
    envAnonKey: process.env['GOALLOOM_SUPABASE_ANON_KEY'],
    file: readSyncFile(userData),
    bakedUrl: typeof __GOALLOOM_BAKED_SUPABASE_URL__ === 'string' ? __GOALLOOM_BAKED_SUPABASE_URL__ : '',
    bakedAnonKey: typeof __GOALLOOM_BAKED_SUPABASE_ANON_KEY__ === 'string' ? __GOALLOOM_BAKED_SUPABASE_ANON_KEY__ : '',
  })
}

export function resolveSyncConfig(sources: SyncConfigSources): { url: string; anonKey: string | null } {
  const file = sources.file ?? {}
  return {
    url: firstString(sources.envUrl, file.url, sources.bakedUrl) ?? devSupabaseUrl,
    anonKey: firstString(sources.envAnonKey, file.anonKey, sources.bakedAnonKey),
  }
}

function readSyncFile(userData: string): { url?: unknown; anonKey?: unknown } {
  try { return JSON.parse(readFileSync(join(userData, 'sync-config.json'), 'utf8')) as { url?: unknown; anonKey?: unknown } }
  catch { return {} }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}
