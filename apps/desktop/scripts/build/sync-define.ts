/**
 * [INPUT]: GOALLOOM_SUPABASE_ANON_KEY and optional GOALLOOM_SUPABASE_URL from the build environment.
 * [OUTPUT]: electron-vite define entries. Blank or missing variables become empty strings. No key is written to the repo.
 * [POS]: Build-time embedding for the desktop sync client. Runtime precedence stays in main/sync/config.ts.
 */

export function syncBuildDefine(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return {
    __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: JSON.stringify(trimmed(env.GOALLOOM_SUPABASE_ANON_KEY)),
    __GOALLOOM_BAKED_SUPABASE_URL__: JSON.stringify(trimmed(env.GOALLOOM_SUPABASE_URL)),
  }
}

function trimmed(value: string | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}
