import { expect, it } from 'vitest'
import { devSupabaseUrl, productionSupabaseUrl, resolveSyncConfig } from '../../src/main/sync/config'
import { syncBuildDefine } from '../../scripts/build/sync-define'

const key = (ref: string, role = 'anon') => `e30.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.fixture`
const dev = key('asqyvcnxdltzzfutbbqy')
const production = key('keqprrgvcefqdwnxaafv')

it('keeps unconfigured development local and rejects production inheritance', () => {
  expect(resolveSyncConfig({})).toEqual({ url: devSupabaseUrl, anonKey: null })
  expect(resolveSyncConfig({ envUrl: productionSupabaseUrl, envAnonKey: production })).toEqual({ url: devSupabaseUrl, anonKey: null })
})

it('resolves complete development pairs without mixing sources', () => {
  expect(resolveSyncConfig({ envAnonKey: dev, file: { url: devSupabaseUrl, anonKey: dev } }).anonKey).toBeNull()
  expect(resolveSyncConfig({ file: { url: devSupabaseUrl, anonKey: dev } })).toEqual({ url: devSupabaseUrl, anonKey: dev })
  expect(resolveSyncConfig({ envUrl: devSupabaseUrl, envAnonKey: production }).anonKey).toBeNull()
  expect(resolveSyncConfig({ envUrl: devSupabaseUrl, envAnonKey: key('asqyvcnxdltzzfutbbqy', 'service_role') }).anonKey).toBeNull()
})

it('pins packaged clients to matching baked production credentials', () => {
  const baked = { packaged: true, bakedUrl: productionSupabaseUrl, bakedAnonKey: production }
  expect(resolveSyncConfig({ ...baked, envUrl: devSupabaseUrl, envAnonKey: dev, file: { url: devSupabaseUrl, anonKey: dev } })).toEqual({ url: productionSupabaseUrl, anonKey: production })
  expect(resolveSyncConfig({ ...baked, bakedAnonKey: dev }).anonKey).toBeNull()
  expect(resolveSyncConfig({ packaged: true }).anonKey).toBeNull()
})

it('rejects incomplete production builds and embeds a complete pair', () => {
  expect(() => syncBuildDefine({ GOALLOOM_BUILD_ENV: 'production' })).toThrow()
  expect(() => syncBuildDefine({ GOALLOOM_BUILD_ENV: 'production', GOALLOOM_SUPABASE_URL: devSupabaseUrl, GOALLOOM_SUPABASE_ANON_KEY: dev })).toThrow()
  expect(syncBuildDefine({ GOALLOOM_BUILD_ENV: 'production', GOALLOOM_SUPABASE_URL: productionSupabaseUrl, GOALLOOM_SUPABASE_ANON_KEY: production })).toEqual({
    __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: JSON.stringify(production),
    __GOALLOOM_BAKED_SUPABASE_URL__: JSON.stringify(productionSupabaseUrl),
  })
})
