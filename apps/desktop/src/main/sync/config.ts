/**
 * [INPUT]: GOALLOOM_SUPABASE_URL, GOALLOOM_SUPABASE_ANON_KEY, or an optional userData sync-config.json.
 * [OUTPUT]: The project URL and anon key. The anon key is not a default and is never logged.
 * [POS]: Desktop sync configuration. The dev project URL is the only built-in value.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const devSupabaseUrl = 'https://asqyvcnxdltzzfutbbqy.supabase.co'

export function readSyncConfig(userData: string): { url: string; anonKey: string | null } {
  let file: { url?: unknown; anonKey?: unknown } = {}
  try { file = JSON.parse(readFileSync(join(userData, 'sync-config.json'), 'utf8')) as { url?: unknown; anonKey?: unknown } }
  catch { file = {} }
  const url = firstString(process.env.GOALLOOM_SUPABASE_URL, file.url) ?? devSupabaseUrl
  const anonKey = firstString(process.env.GOALLOOM_SUPABASE_ANON_KEY, file.anonKey)
  return { url, anonKey }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}
