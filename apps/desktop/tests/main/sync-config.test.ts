import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { devSupabaseUrl, readSyncConfig, resolveSyncConfig } from '../../src/main/sync/config'
import { syncBuildDefine } from '../../scripts/build/sync-define'

const directories: string[] = []
const envKeys = ['GOALLOOM_SUPABASE_ANON_KEY', 'GOALLOOM_SUPABASE_URL'] as const
const previous = new Map<string, string | undefined>(envKeys.map(key => [key, process.env[key]]))

afterEach(() => {
  for (const key of envKeys) {
    const value = previous.get(key)
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

it('没有环境变量、文件和内嵌值时，同步未配置，URL 用开发项目', () => {
  delete process.env.GOALLOOM_SUPABASE_ANON_KEY
  delete process.env.GOALLOOM_SUPABASE_URL
  const userData = temp()
  expect(readSyncConfig(userData)).toEqual({ url: devSupabaseUrl, anonKey: null })
  expect(resolveSyncConfig({})).toEqual({ url: devSupabaseUrl, anonKey: null })
})

it('运行时 anon key 按环境变量、sync-config.json、内嵌值的顺序取值', () => {
  const baked = { bakedUrl: 'https://baked.example', bakedAnonKey: 'baked-anon' }
  expect(resolveSyncConfig(baked)).toEqual({ url: 'https://baked.example', anonKey: 'baked-anon' })
  expect(resolveSyncConfig({ ...baked, file: { url: 'https://file.example', anonKey: 'file-anon' } })).toEqual({ url: 'https://file.example', anonKey: 'file-anon' })
  expect(resolveSyncConfig({
    ...baked,
    file: { url: 'https://file.example', anonKey: 'file-anon' },
    envUrl: 'https://env.example',
    envAnonKey: 'env-anon',
  })).toEqual({ url: 'https://env.example', anonKey: 'env-anon' })
})

it('空白的环境变量和内嵌值让位给下一层，损坏的 sync-config.json 被忽略', () => {
  expect(resolveSyncConfig({
    envAnonKey: '  ',
    envUrl: '',
    file: { anonKey: '  file-anon  ', url: 12 },
    bakedAnonKey: 'baked-anon',
    bakedUrl: 'https://baked.example',
  })).toEqual({ url: 'https://baked.example', anonKey: 'file-anon' })
  expect(resolveSyncConfig({ envAnonKey: ' ', bakedAnonKey: '\t', file: { anonKey: 4 } })).toEqual({ url: devSupabaseUrl, anonKey: null })

  delete process.env.GOALLOOM_SUPABASE_ANON_KEY
  delete process.env.GOALLOOM_SUPABASE_URL
  const userData = temp()
  writeFileSync(join(userData, 'sync-config.json'), '{')
  expect(readSyncConfig(userData)).toEqual({ url: devSupabaseUrl, anonKey: null })
  writeFileSync(join(userData, 'sync-config.json'), JSON.stringify({ anonKey: 'from-file', url: 'https://file.example' }))
  process.env.GOALLOOM_SUPABASE_ANON_KEY = 'from-env'
  expect(readSyncConfig(userData)).toEqual({ url: 'https://file.example', anonKey: 'from-env' })
})

it('缺少构建密钥时 define 仍是空字符串，不会写入一把默认 key', () => {
  expect(syncBuildDefine({})).toEqual({
    __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: '""',
    __GOALLOOM_BAKED_SUPABASE_URL__: '""',
  })
  expect(syncBuildDefine({ GOALLOOM_SUPABASE_ANON_KEY: '  ', GOALLOOM_SUPABASE_URL: '  https://custom.example  ' })).toEqual({
    __GOALLOOM_BAKED_SUPABASE_ANON_KEY__: '""',
    __GOALLOOM_BAKED_SUPABASE_URL__: '"https://custom.example"',
  })
  const defined = syncBuildDefine({ GOALLOOM_SUPABASE_ANON_KEY: 'anon"key' })
  expect(defined.__GOALLOOM_BAKED_SUPABASE_ANON_KEY__).toBe('"anon\\"key"')
  expect(defined.__GOALLOOM_BAKED_SUPABASE_ANON_KEY__).not.toContain('GOALLOOM_SUPABASE_ANON_KEY')
})

function temp(): string {
  const directory = mkdtempSync(join(tmpdir(), 'goalloom-sync-config-'))
  directories.push(directory)
  return directory
}
